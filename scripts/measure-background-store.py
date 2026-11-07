"""Compare synchronous and background WAL calls; records desktop host costs only."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import sqlite3
import statistics
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def measure(args):
    with tempfile.TemporaryDirectory(prefix="background-measure-", dir=args.scratch) as temp:
        work = Path(temp).resolve()
        project = work / "project"
        project.mkdir()
        with zipfile.ZipFile(args.addon) as archive:
            for name in archive.namelist():
                assert name.startswith("addons/hollow_wake_save/") and ".." not in PurePosixPath(name).parts
                assert "\\" not in name and ":" not in name
            archive.extractall(project)
        (project / "project.godot").write_text("config_version=5\n")
        env = dict(os.environ, APPDATA=str(work), LOCALAPPDATA=str(work), HOME=str(work),
                   XDG_CONFIG_HOME=str(work), XDG_DATA_HOME=str(work), XDG_CACHE_HOME=str(work),
                   TEMP=str(work), TMP=str(work), TMPDIR=str(work), HWE_BACKGROUND_DB=str(work / "test.db"))

        def launch(extra):
            result = subprocess.run([args.editor, "--headless", "--path", project, *extra], cwd=project,
                                    env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                    encoding="utf-8", errors="replace", timeout=240,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            errors = [line for line in result.stdout.splitlines() if ("ERROR:" in line or "ObjectDB instances leaked" in line)
                      and "Failed to read the root certificate store." not in line]
            assert result.returncode == 0 and not errors, result.stdout[-4000:]
            return result.stdout

        launch(["--editor", "--import", "--frame-delay", "1000"])
        output = launch(["--script", ROOT / "test/godot-inventory/background-performance.gd"])
        marker = "HWE_BACKGROUND_MEASURE "
        result = json.loads(next(line[len(marker):] for line in output.splitlines() if line.startswith(marker)))
        assert result["passed"] and len(result["rows"]) == 768 and len(result["warmup"]) == 192 and result["slots"] == 12
        with closing(sqlite3.connect(work / "test.db")) as db:
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            records = db.execute("SELECT slot,revision,crafting,stash FROM slots ORDER BY slot").fetchall()
            assert len(records) == 12
            for slot, revision, crafting, stash in records:
                assert revision == 80 and crafting == stash == "9" * [2048, 65536, 524288][(slot-1)//4]
        summaries = []
        for size in [2048, 65536, 524288]:
            for background in [False, True]:
                rows = [row for row in result["rows"] if row["documentBytes"] == size and row["background"] == background]
                assert len(rows) == 128
                summaries.append(dict(documentBytes=size, background=background, samples=len(rows),
                                      **{key: dict(median=statistics.median(row[key] for row in rows),
                                                   p95=sorted(row[key] for row in rows)[121], maximum=max(row[key] for row in rows))
                                         for key in ["mainUs", "maxBlockingUs", "completionUs"]}))
        return dict(passed=True, platform=os.name, measured="native store calls; excludes gameplay, serialization, reads and rendering",
                    host=dict(system=platform.system(),release=platform.release(),machine=platform.machine(),
                              processor=platform.processor(),python=platform.python_version(),sqliteObserver=sqlite3.sqlite_version),
                    method=dict(repeats=4,warmupsPerRepeat=8,samplesPerRepeat=32,frameCap=120,order="alternating within and between repeats"),
                    addonSha256=hashlib.sha256(args.addon.read_bytes()).hexdigest(),
                    editorSha256=hashlib.sha256(Path(args.editor).read_bytes()).hexdigest(), summaries=summaries,
                    sources={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in
                             ["scripts/measure-background-store.py", "test/godot-inventory/background-performance.gd"]},
                    observations=result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("editor")
    for name in ["addon", "scratch", "output"]:
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    assert __debug__ and not args.output.exists()
    result = measure(args)
    args.output.write_text(json.dumps(result, indent=2)+"\n")
    print(json.dumps({"passed":True, "output":str(args.output), "summaries":result["summaries"]}))
