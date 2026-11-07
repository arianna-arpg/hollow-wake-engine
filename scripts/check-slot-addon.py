"""Verify the standalone Godot save addon with independent SQLite observations."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sqlite3
import statistics
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def seed(file, mode="delete"):
    with closing(sqlite3.connect(file)) as db:
        assert db.execute("PRAGMA journal_mode=" + mode).fetchone()[0] == mode
        db.executescript("""
            CREATE TABLE slots(slot INTEGER PRIMARY KEY,revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
                               crafting TEXT NOT NULL,stash TEXT NOT NULL) STRICT;
            PRAGMA application_id=0x48575331;
            PRAGMA user_version=1;
            INSERT INTO slots VALUES(1,7,'7','[]');
        """)


def verify_store(run, work):
    contracts = run("contracts", "contracts.db")
    invalid = run("open", "invalid.db", HWE_WAL_POLICY="unknown")
    assert invalid["reason"] == "invalid-journal-policy" and not (work / "invalid.db").exists()
    rejected = []
    for name, sql in [("foreign.db", "CREATE TABLE unrelated(value); INSERT INTO unrelated VALUES('keep');"),
                      ("future.db", "PRAGMA application_id=0x48575331; PRAGMA user_version=99;")]:
        file = work / name
        with closing(sqlite3.connect(file)) as db:
            db.executescript(sql)
        before = digest(file)
        assert run("open", name)["reason"] == "incompatible-database"
        assert digest(file) == before
        rejected.append(name)
    legacy = work / "legacy.db"
    seed(legacy)
    with closing(sqlite3.connect(legacy)) as reader:
        reader.execute("BEGIN")
        assert reader.execute("SELECT revision FROM slots").fetchone()[0] == 7
        assert run("open", legacy.name)["reason"] == "busy"
        reader.commit()
    assert run("open", legacy.name)["journal"] == "wal"
    with closing(sqlite3.connect(legacy)) as db:
        assert db.execute("SELECT * FROM slots").fetchone() == (1, 7, "7", "[]")
    steady = run("writes", "steady.db", HWE_WAL_COUNT="1100")
    assert steady["checkpoint"]["complete"] and steady["checkpoint"]["frames"] < 1000
    assert steady["walBytes"] < 5 * 1024 * 1024
    reader_file = work / "reader.db"
    seed(reader_file, "wal")
    with closing(sqlite3.connect(reader_file)) as reader:
        reader.execute("BEGIN")
        assert reader.execute("SELECT revision FROM slots").fetchone()[0] == 7
        held = run("writes", reader_file.name, HWE_WAL_COUNT="1100")
        assert not held["checkpoint"]["complete"] and held["checkpoint"]["frames"] >= 1100
        assert reader.execute("SELECT revision FROM slots").fetchone()[0] == 7
        reader.commit()
        released = run("checkpoint", reader_file.name)
        assert released["checkpoint"]["complete"]
        assert reader.execute("SELECT revision FROM slots").fetchone()[0] == 1107
    assert not (work / "reader.db-wal").exists()
    for row in (steady, held):
        row["medianUs"] = statistics.median(row["samplesUs"])
        row["p95Us"] = sorted(row["samplesUs"])[1044]
        row["maxUs"] = max(row["samplesUs"])
    return dict(contracts=contracts, rejected=rejected, legacyMigration=True, steady=steady,
                heldReader=held, releasedReader=released)


def standalone(args, work):
    project = work / "project"
    project.mkdir()
    with zipfile.ZipFile(args.addon) as source:
        for member in source.infolist():
            path = PurePosixPath(member.filename)
            assert member.filename.startswith("addons/hollow_wake_save/") and ".." not in path.parts
            assert "\\" not in member.filename and ":" not in member.filename
        source.extractall(project)
    (project / "project.godot").write_text("config_version=5\n", encoding="utf-8")
    (work / ".owner").write_text("standalone addon verification")
    settings = work / "settings"
    settings.mkdir()
    env = dict(os.environ, APPDATA=str(settings), LOCALAPPDATA=str(settings), HOME=str(settings),
               XDG_CONFIG_HOME=str(settings), XDG_DATA_HOME=str(settings), XDG_CACHE_HOME=str(settings),
               HWE_WAL_ROOT=work.as_posix(), TEMP=str(work), TMP=str(work), TMPDIR=str(work))
    imported = subprocess.run([args.editor, "--headless", "--editor", "--import", "--frame-delay", "1000", "--path", project],
                              cwd=project, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              encoding="utf-8", errors="replace", timeout=90,
                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    import_errors = [line for line in imported.stdout.splitlines() if ("ERROR:" in line or "SCRIPT ERROR" in line)
                     and "Failed to read the root certificate store." not in line]
    assert imported.returncode == 0 and not import_errors, imported.stdout[-2400:]
    assert "res://addons/hollow_wake_save/store.gdextension" in (project / ".godot/extension_list.cfg").read_text()

    def run(mode, name, **options):
        print("Checking standalone", mode, name, flush=True)
        extra = dict(HWE_DB=(work / name).as_posix(), HWE_WAL_CASE=mode, HWE_WAL_POLICY="")
        result = subprocess.run([args.editor, "--headless", "--path", project, "--script",
                                 ROOT / "test/godot-inventory/wal-storage.gd"],
                                cwd=project, env={**env, **extra, **options}, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, encoding="utf-8",
                                errors="replace", timeout=180, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        errors = [line for line in result.stdout.splitlines() if ("ERROR:" in line or "SCRIPT ERROR" in line)
                  and "Failed to read the root certificate store." not in line]
        assert result.returncode == 0 and not errors, result.stdout[-2400:]
        line = next(line for line in result.stdout.splitlines() if line.startswith("HWE_WAL_OK "))
        return json.loads(line[len("HWE_WAL_OK "):])

    result = verify_store(run, work)
    return dict(passed=True, platform=os.name, editorImport=True, timingQualification="diagnostic observations",
                addonSha256=digest(args.addon),
                editorSha256=digest(args.editor), **result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["editor", "addon", "scratch", "output"]:
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    if not __debug__:
        raise RuntimeError("Assertions required")
    assert not args.output.exists(), "Choose a fresh output file"
    with tempfile.TemporaryDirectory(prefix="slot-addon-", dir=args.scratch) as temp:
        report = standalone(args, Path(temp).resolve())
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(report, output, indent=2)
        output.write("\n")
    print(json.dumps({"passed": True, "output": str(args.output)}))
