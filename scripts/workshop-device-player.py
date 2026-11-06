"""Assemble and exercise portable workshop players with the pinned game runtime."""
import hashlib
import json
import os
from pathlib import Path
import stat
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import zipfile


def pack(prior, pck, output, platform=None):
    root = Path(__file__).resolve().parents[1]
    expected = "46b709fa8d6410336c0ca73462923db975668a50011281e4dff55ea9c0890ec3"
    if platform == "windows":
        expected = "47ab0fcfd54ce112b47418ba74ccebb2a9264e5090592dc9e36cd5fa11f7b285"
    assert platform in (None, "linux", "windows")
    with open(prior, "rb") as stream:
        assert hashlib.file_digest(stream, "sha256").hexdigest() == expected
    guide = ("Hollow Wake inventory benchmark for Linux x86_64\n\n"
             "Extract this ZIP and run ./measure.sh in Desktop Mode. No editor or network is required.\n"
             "The test saves and reopens an isolated four-item profile and a 128-item profile with 3,929 lore entries.\n"
             "It prints 32 measured actions per profile plus the CPU, median, 95th percentile and embedded VM peak.\n"
             "To retain the result, use ./measure.sh > workshop-measurement.txt.\n"
             "Save files live briefly under XDG_DATA_HOME (normally ~/.local/share). Choose a directory on the\n"
             "disk you want to measure. The launcher removes its test profiles on exit.\n")
    with zipfile.ZipFile(prior) as source, zipfile.ZipFile(output, "x") as target:
        for member in source.infolist():
            name = member.filename.removeprefix("inventory-workshop/")
            if name == "Inventory.pck":
                data = Path(pck).read_bytes()
            elif name == "README.md":
                data = guide.encode() if platform is None else (root / "examples/godot-inventory/README.md").read_bytes()
            else:
                data = source.read(member)
            target.writestr(member, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
        if platform is None:
            launcher = zipfile.ZipInfo("inventory-workshop/measure.sh")
            launcher.create_system = 3
            launcher.external_attr = (stat.S_IFREG | 0o755) << 16
            target.writestr(launcher, (root / "examples/godot-inventory/measure-linux.sh").read_bytes().replace(b"\r\n", b"\n"))


def unpack(archive, work):
    with zipfile.ZipFile(archive) as source:
        for member in source.infolist():
            target = (work / member.filename).resolve()
            assert target.is_relative_to(work / "inventory-workshop") and not stat.S_ISLNK(member.external_attr >> 16)
            source.extract(member, work)
            if target.name in ("measure.sh", "Inventory.x86_64"):
                target.chmod(0o755)


def test_player(archive):
    with tempfile.TemporaryDirectory() as scratch:
        work = Path(scratch)
        unpack(archive, work)
        env = dict(os.environ, XDG_DATA_HOME=str(work / "storage"))
        result = subprocess.run([work / "inventory-workshop/measure.sh"], env=env, capture_output=True, text=True, timeout=180)
        if result.returncode or "ERROR:" in result.stderr:
            raise RuntimeError((result.stdout + result.stderr)[-2000:])
        row = next(s for s in result.stdout.splitlines() if s.startswith("HWE_BENCH "))
        assert not list((work / "storage").iterdir()), "benchmark left temporary save data"
        print(json.dumps(json.loads(row[10:])))


def test_game(archive, probe, expected_save, recall_save):
    with tempfile.TemporaryDirectory() as scratch:
        work = Path(scratch).resolve()
        unpack(archive, work)
        folder = work / "inventory-workshop"
        win = sys.platform == "win32"
        exe = folder / ("Inventory.exe" if win else "Inventory.x86_64")
        data = work / "data"
        data.mkdir()
        env = dict(os.environ, APPDATA=str(data), LOCALAPPDATA=str(data), XDG_DATA_HOME=str(data),
                   XDG_CONFIG_HOME=str(work / "config"), XDG_CACHE_HOME=str(work / "cache"))

        def play(*args):
            result = subprocess.run([exe, "--headless", "--quit-after", "120", "--", *args], env=env,
                                    capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=90,
                                    creationflags=subprocess.CREATE_NO_WINDOW if win else 0)
            log = result.stdout + result.stderr
            errors = [s for s in log.splitlines() if "ERROR:" in s and not (win and s == "ERROR: Failed to read the root certificate store.")]
            if result.returncode or errors:
                raise RuntimeError(log[-2500:])
            return log

        def read_slot(name):
            database = data / "hollow-wake-inventory-workshop" / name
            assert database.exists()
            db = sqlite3.connect(database.as_uri()+"?mode=ro", uri=True)
            try:
                assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
                return db.execute("SELECT revision,crafting,stash FROM slots WHERE slot=1").fetchone()
            finally:
                db.close()

        measured = play("--measure-supports")
        measurement = json.loads(next(s for s in measured.splitlines() if s.startswith("HWE_SUPPORT_MEASURE ")).removeprefix("HWE_SUPPORT_MEASURE "))
        assert measurement["ok"] and measurement["queries"] == 65 and measurement["releasedBytes"] == 0
        measured_recall = play("--measure-recall")
        recall_measurement = json.loads(next(s.removeprefix("HWE_RECALL_MEASURE ") for s in measured_recall.splitlines() if s.startswith("HWE_RECALL_MEASURE ")))
        assert recall_measurement["ok"] and recall_measurement["queries"] == 66 and recall_measurement["releasedBytes"] == 0
        assert not list(data.rglob("*.sqlite3")), "measurement opened a game save"
        play()
        normal = read_slot("inventory.sqlite3")
        assert normal[0] == 1 and len(json.loads(normal[1])["state"]["items"]) == 4
        play("--support-sample")
        sample = read_slot("inventory-support-sample.sqlite3")
        seed = json.loads(sample[1])["state"]["items"][2]
        assert sample[0] == 1 and seed["locked"] and seed["gem"]["supportId"] == "teeming_vein"
        # Re-export the identical project with its test scene as the entry.
        # The same executable, extensions, data and ordinary UI paths run it.
        shutil.copyfile(probe, folder / "Inventory.pck")
        log = play("--cargo-sample")
        marker = next(s for s in log.splitlines() if s.startswith("HWE_SUPPORT "))
        observed = json.loads(marker[12:])
        final = read_slot("inventory-support-sample.sqlite3")
        assert final[0] == observed["revision"] and hashlib.sha256(final[1].encode()).hexdigest() == expected_save
        assert read_slot("inventory.sqlite3") == normal
        recall = read_slot("recall-course.sqlite3")
        assert recall[0] == observed["pouch"]["revision"] == 4
        assert hashlib.sha256(recall[1].encode()).hexdigest() == recall_save
        tag, saved, meta = json.loads(recall[1])
        assert tag == "inventory-workshop/recall-v1" and saved["state"]["account"]["ledger"]["gemdrops_total"] == 2
        assert meta["seatLedger"]["memory_recall_lived"] == 1 and json.loads(recall[2]) == []
        print(json.dumps(dict(shippingBoot=True, shippingSample=True, exportedSceneQueries=observed["cases"],
                              revision=final[0], saveSha256=expected_save, gatePeakBytes=observed["metrics"]["heap"]["peak_bytes"],
                              recallSaveSha256=recall_save, originalRecallActions=observed["pouch"]["cases"],
                              measurement=measurement, recallMeasurement=recall_measurement)))


if __name__ == "__main__":
    if sys.argv[1] in ("pack", "pack-game"):
        pack(*sys.argv[2:])
    elif sys.argv[1] == "test":
        test_player(sys.argv[2])
    elif sys.argv[1] == "test-game":
        test_game(*sys.argv[2:])
    else:
        raise ValueError("expected pack or test")
