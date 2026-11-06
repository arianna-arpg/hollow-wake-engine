"""Assemble and exercise the portable Linux benchmark with the pinned game runtime."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import zipfile


def pack(prior, pck, output):
    root = Path(__file__).resolve().parents[1]
    expected = "46b709fa8d6410336c0ca73462923db975668a50011281e4dff55ea9c0890ec3"
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
                data = guide.encode()
            else:
                data = source.read(member)
            target.writestr(member, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
        launcher = zipfile.ZipInfo("inventory-workshop/measure.sh")
        launcher.create_system = 3
        launcher.external_attr = (stat.S_IFREG | 0o755) << 16
        target.writestr(launcher, (root / "examples/godot-inventory/measure-linux.sh").read_bytes().replace(b"\r\n", b"\n"))


def test_player(archive):
    with tempfile.TemporaryDirectory() as scratch:
        work = Path(scratch)
        with zipfile.ZipFile(archive) as source:
            for member in source.infolist():
                target = (work / member.filename).resolve()
                assert target.is_relative_to(work / "inventory-workshop") and not stat.S_ISLNK(member.external_attr >> 16)
                source.extract(member, work)
                if target.name in ("measure.sh", "Inventory.x86_64"):
                    target.chmod(0o755)
        env = dict(os.environ, XDG_DATA_HOME=str(work / "storage"))
        result = subprocess.run([work / "inventory-workshop/measure.sh"], env=env, capture_output=True, text=True, timeout=180)
        if result.returncode or "ERROR:" in result.stderr:
            raise RuntimeError((result.stdout + result.stderr)[-2000:])
        row = next(s for s in result.stdout.splitlines() if s.startswith("HWE_BENCH "))
        assert not list((work / "storage").iterdir()), "benchmark left temporary save data"
        print(json.dumps(json.loads(row[10:])))


if __name__ == "__main__":
    if sys.argv[1] == "pack":
        pack(*sys.argv[2:])
    elif sys.argv[1] == "test":
        test_player(sys.argv[2])
    else:
        raise ValueError("expected pack or test")
