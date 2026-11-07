"""Install and verify the background SQLite store in an empty Godot project."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import runpy
import sqlite3
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def verify(args):
    proof = json.loads(args.native_proof.read_text())
    assert proof["passed"]
    library = Path(proof["library"])
    assert hashlib.sha256(library.read_bytes()).hexdigest() == proof["librarySha256"]
    for name, expected in proof["sources"].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
    with tempfile.TemporaryDirectory(prefix="background-store-", dir=args.scratch) as temp:
        work = Path(temp).resolve()
        project = work / "project"
        project.mkdir()
        with zipfile.ZipFile(args.addon) as archive:
            for name in archive.namelist():
                assert name.startswith("addons/hollow_wake_save/") and ".." not in PurePosixPath(name).parts
                assert "\\" not in name and ":" not in name
            archive.extractall(project)
        target = project / "addons/hollow_wake_save/bin" / library.name
        target.write_bytes(library.read_bytes())
        (project / "project.godot").write_text("config_version=5\n", encoding="utf-8")
        settings = work / "settings"
        settings.mkdir()
        env = dict(os.environ, APPDATA=str(settings), LOCALAPPDATA=str(settings), HOME=str(settings),
                   XDG_CONFIG_HOME=str(settings), XDG_DATA_HOME=str(settings), XDG_CACHE_HOME=str(settings),
                   TEMP=str(work), TMP=str(work), TMPDIR=str(work))

        def launch(arguments, extra=None):
            result = subprocess.run([args.editor, "--headless", "--path", project, *arguments], cwd=project,
                                    env={**env, **(extra or {})}, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, encoding="utf-8", errors="replace", timeout=90,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            errors = [line for line in result.stdout.splitlines()
                      if any(token in line for token in ("ERROR:", "SCRIPT ERROR", "ObjectDB instances leaked"))
                      and "Failed to read the root certificate store." not in line]
            assert result.returncode == 0 and not errors, result.stdout[-5000:]
            return result.stdout

        launch(["--editor", "--import", "--frame-delay", "1000"])

        def run(case, name):
            text = launch(["--script", ROOT / "test/godot-inventory/background-storage.gd"],
                          {"HWE_BACKGROUND_CASE": case, "HWE_BACKGROUND_DB": str(work / name)})
            line = next(line for line in text.splitlines() if line.startswith("HWE_BACKGROUND_OK "))
            result = json.loads(line[len("HWE_BACKGROUND_OK "):])
            assert result["passed"]
            return result

        regular = run("contracts", "contracts.db")
        with closing(sqlite3.connect(work / "contracts.db")) as db:
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert db.execute("SELECT revision,crafting,stash FROM slots WHERE slot=1").fetchone() == (regular["revision"], "reopened", "[]")
            assert db.execute("SELECT length(crafting),length(stash) FROM slots WHERE slot=2").fetchone() == (524288, 524288)
        legacy = work / "reader.db"
        runpy.run_path(str(ROOT / "scripts/check-slot-addon.py"))["seed"](legacy)
        with closing(sqlite3.connect(legacy)) as reader:
            reader.execute("BEGIN")
            assert reader.execute("SELECT revision FROM slots").fetchone()[0] == 7
            held = run("reader", legacy.name)
            reader.commit()
            assert reader.execute("SELECT * FROM slots").fetchone() == (1, 7, "7", "[]")
            assert reader.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        return dict(passed=True, platform=proof["platform"], librarySha256=proof["librarySha256"],
                    editorImport=True, contracts=regular, heldReader=held)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["editor", "native_proof", "addon", "scratch", "output"]:
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    assert __debug__ and not args.output.exists()
    report = verify(args)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": True, "output": str(args.output)}))
