"""Exercise a shipped inventory game and its matched test export in the Valve player."""
import hashlib
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import zipfile


def require(ok, detail):
    if not ok:
        raise RuntimeError(detail)


def digest(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    bundle, out = [Path(p).resolve() for p in sys.argv[1:]]
    manifest = json.loads((bundle / "inputs.json").read_bytes())
    require(sys.platform == "linux" and Path("/usr/lib/os-release").read_text().find(
        'com.valvesoftware.steamruntime.platform-amd64_i386-steamrt4') >= 0, "Valve Platform required")
    require(digest(bundle / "game.zip") == manifest["gameSha256"], "changed game archive")
    require(digest(bundle / "source.json") == manifest["fixtureSha256"], "changed original checkpoint")
    for file, expected in manifest["proofFiles"].items():
        require(Path(file).name == file and digest(bundle / "proof" / file) == expected, "changed test export")
    original = json.loads((bundle / "source.json").read_bytes())
    report = {"passed": False, "gameSha256": manifest["gameSha256"], "checks": []}
    with tempfile.TemporaryDirectory() as temp:
        work = Path(temp)
        with zipfile.ZipFile(bundle / "game.zip") as archive:
            for entry in archive.infolist():
                target = work / entry.filename
                require(entry.filename.startswith("inventory-workshop/") and target.resolve().is_relative_to(work), "unsafe archive")
                archive.extract(entry, work)
                if entry.filename.endswith(".x86_64"):
                    require((entry.external_attr >> 16) & 0o111, "missing executable permissions")
                    target.chmod(0o755)
        game = work / "inventory-workshop" / "Inventory.x86_64"
        proof = bundle / "proof" / "inventory-proof.x86_64"
        env = os.environ.copy()
        for key in ("LD_LIBRARY_PATH", "LD_AUDIT", "LD_PRELOAD", "LD_DEBUG", "LD_DEBUG_OUTPUT"):
            env.pop(key, None)
        for key in ("HOME", "XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME"):
            env[key] = str(work / key)
            (work / key).mkdir()
        db = Path(env["XDG_DATA_HOME"]) / "hollow-wake-inventory-workshop" / "inventory.sqlite3"
        def run(exe, label, **settings):
            log = out / (label + ".txt")
            opts = {**env, **settings, "HWE_DB": str(db)}
            if exe == game:
                opts.update(LD_DEBUG="libs", LD_DEBUG_OUTPUT=str(out / (label + "-loader")))
            with log.open("xb") as stream:
                viewport = ["--resolution", "960x600"] if settings.get("HWE_CASE") == "ui" else []
                proc = subprocess.Popen([str(exe), "--headless", *viewport, "--quit-after", "120", "--log-file", str(out / (label + "-engine.log"))],
                                        env=opts, cwd=exe.parent, stdout=stream, stderr=subprocess.STDOUT)
                try:
                    if "HWE_MARKER" in settings:
                        marker = Path(settings["HWE_MARKER"])
                        deadline = time.monotonic() + 60
                        while not (marker.exists() and marker.read_text() == "after-stage"):
                            require(proc.poll() is None and time.monotonic() < deadline, "transaction barrier missed")
                            time.sleep(.02)
                        size = Path(str(db) + "-journal").stat().st_size
                        require(size > 0, "no staged SQLite journal")
                        proc.kill()
                        require(proc.wait(15) == -signal.SIGKILL, "writer survived")
                        report["journalBytes"] = size
                    else:
                        require(proc.wait(90) == 0, label + " exited unsuccessfully")
                finally:
                    if proc.poll() is None:
                        proc.kill()
                        proc.wait()
            text = log.read_text()
            require("ERROR:" not in text and "SCRIPT ERROR" not in text, label + " engine diagnostic")
            if exe == proof and "HWE_MARKER" not in settings:
                require("HWE_PASS " + settings["HWE_CASE"] in text, label + " did not finish")
            if exe == game:
                trace = Path(opts["LD_DEBUG_OUTPUT"] + "." + str(proc.pid)).read_text()
                libs = sorted(line.split("calling init:", 1)[1].strip() for line in trace.splitlines()
                              if "calling init:" in line and "/libhwe_" in line)
                expected = sorted(str(game.parent / name) for name in ("libhwe_embedded.so","libhwe_godot.so","libhwe_slot_store.so"))
                require(libs == expected, "incorrect runtime libraries")
                report["loadedLibraries"] = [Path(f).name for f in libs]
            report["checks"].append(label)

        def read_owners():
            # Open only after a fresh shipping game has had a chance to recover the journal.
            with sqlite3.connect(db.as_uri() + "?mode=ro", uri=True) as conn:
                require(conn.execute("PRAGMA integrity_check").fetchone() == ("ok",), "integrity check")
                revision, source, stash = conn.execute("SELECT revision,crafting,stash FROM slots WHERE slot=1").fetchone()
            return revision, json.loads(source), json.loads(stash)

        db.parent.mkdir(parents=True)
        run(proof, "seed", HWE_CASE="seed")
        run(proof, "interrupt", HWE_CASE="transfer", HWE_PHASE="after-stage", HWE_MARKER=str(work / "marker"))
        run(game, "shipping-recovery")
        observed = work / "restored.json"
        run(proof, "inspect-uncommitted", HWE_CASE="inspect", HWE_RESULT=str(observed))
        require(json.loads(observed.read_bytes()) == {"revision":1,"source":original,"stash":[]}, "recovered game view differs")
        require(read_owners() == (1,original,[]), "uncommitted move escaped")
        run(proof, "transfer", HWE_CASE="transfer")
        run(game, "shipping-reopen")
        moved = original["state"]["overflow"].pop()
        run(proof, "inspect-committed", HWE_CASE="inspect", HWE_RESULT=str(observed))
        require(json.loads(observed.read_bytes()) == {"revision":2,"source":original,"stash":[moved]}, "committed game view differs")
        require(read_owners() == (2,original,[moved]), "committed item did not have one owner")
        # Exercise the real scene against an independent first-run save in the
        # player image. Its driver compares original cards and tests scrolling.
        card_data = work / "equipment-cards"
        card_data.mkdir()
        run(proof, "equipment-cards", HWE_CASE="ui", XDG_DATA_HOME=str(card_data))
        metrics_file = card_data / "hollow-wake-inventory-workshop/inspection-metrics.json"
        card_run = json.loads(metrics_file.read_bytes())
        metrics = card_run["heap"]
        require(metrics["closed"] and not metrics["poisoned"] and not metrics["delivery_failed"],
                "inspection host failed")
        require(0 < metrics["peak_bytes"] <= 32 * 1024 * 1024 and metrics["live_bytes"] == 0
                and metrics["live_blocks"] == 0, "inspection heap exceeded budget or retained allocations")
        require(card_run["keyboardScroll"] or card_run["scrollMax"] <= card_run["scrollPage"],
                "overflowing card could not be scrolled")
        report["inspection"] = card_run
        report["uid"] = moved["uid"]
        report["passed"] = True
        (out / "platform.json").write_text(json.dumps(report, indent=2) + "\n")
        print("Shipping game recovered both durable owners in Steam Runtime Platform.")


if __name__ == "__main__":
    main()
