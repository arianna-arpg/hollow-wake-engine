"""Verify the compiled slot store and refresh the accepted Godot workshop packages."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import runpy
import shutil
import sqlite3
import subprocess
import tempfile
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "inventory-workshop/"
STORE = "addons/hollow_wake_save/"


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def publish_release(release, output):
    if output.exists():
        raise FileExistsError(output)
    # Windows TemporaryDirectory uses an owner-only ACL. Stage beside the
    # destination with its inherited permissions so users can read the delivery.
    staged = output.with_name("." + output.name + "-staging-" + uuid.uuid4().hex)
    staged.mkdir()
    try:
        for source in release.iterdir():
            if not source.is_file() or source.is_symlink():
                raise ValueError("Expected a regular release file: " + source.name)
            shutil.copyfile(source, staged / source.name)
        staged.rename(output)
    finally:
        if staged.exists():
            shutil.rmtree(staged)


def extract(archive, destination):
    with zipfile.ZipFile(archive) as source:
        for name in source.namelist():
            assert name.startswith(PREFIX) and ".." not in PurePosixPath(name).parts
            assert "\\" not in name and ":" not in name
        source.extractall(destination)


def patch_archive(prior, output, replacements):
    with zipfile.ZipFile(prior) as source, zipfile.ZipFile(output, "x") as target:
        assert set(replacements) <= set(source.namelist())
        for member in source.infolist():
            data = replacements.get(member.filename)
            target.writestr(member, source.read(member) if data is None else data,
                            compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)


def verify(args, work, release):
    platform = "windows" if os.name == "nt" else "linux"
    proof = json.loads((args.donors / ("godot-" + platform + ".json")).read_text())
    for name, expected in proof["checksums"].items():
        assert digest(args.donors / name) == expected
    project_name = "hollow-wake-workshop-" + platform + "-x64.zip"
    player_name = "hollow-wake-inventory-" + platform + "-x64.zip"
    library_name = "hwe_slot_store.dll" if os.name == "nt" else "libhwe_slot_store.so"
    native = json.loads(args.library_proof.read_text())
    assert native["librarySha256"] == digest(args.library)
    for name, expected in native["sources"].items():
        assert digest(ROOT / name) == expected, name
    native_bytes = args.library.read_bytes()
    replacements = {PREFIX + STORE + "bin/" + library_name: native_bytes,
                    PREFIX + STORE + "README.md": (ROOT / "adapters/godot/local-save/README.md").read_bytes()}
    patch_archive(args.donors / project_name, release / project_name, replacements)
    patch_archive(args.donors / player_name, release / player_name,
                  {PREFIX + library_name: native_bytes,
                   PREFIX + "notices/SQLite-and-save-adapter.md": replacements[PREFIX + STORE + "README.md"]})
    addon_name = "hollow-wake-local-save-0.2.0-" + platform + "-x64.zip"
    with zipfile.ZipFile(release / project_name) as source, zipfile.ZipFile(release / addon_name, "x") as target:
        for member in source.infolist():
            if member.filename.startswith(PREFIX + STORE):
                name = member.filename[len(PREFIX):]
                target.writestr(name, source.read(member), compress_type=zipfile.ZIP_DEFLATED)

    extract(release / project_name, work / "source")
    extract(release / player_name, work / "player")
    project = work / "source/inventory-workshop"
    player_root = work / "player/inventory-workshop"
    player = player_root / ("Inventory.exe" if os.name == "nt" else "Inventory.x86_64")
    if os.name != "nt":
        player.chmod(0o755)
    cache = project / ".godot"
    cache.mkdir()
    extensions = sorted("res://" + f.relative_to(project).as_posix() for f in project.rglob("*.gdextension"))
    (cache / "extension_list.cfg").write_text("\n".join(extensions) + "\n", encoding="utf-8")
    settings = work / "settings"
    settings.mkdir()
    (settings / ".vestige-test-owner").write_text("owned verification")
    (work / ".owner").write_text("owned verification")
    env = dict(os.environ, APPDATA=str(settings), LOCALAPPDATA=str(settings), HOME=str(settings),
               XDG_CONFIG_HOME=str(settings), XDG_DATA_HOME=str(settings), XDG_CACHE_HOME=str(settings),
               HWE_VESTIGE_TEST_ROOT=str(settings), HWE_WAL_ROOT=work.as_posix(),
               TEMP=str(work), TMP=str(work), TMPDIR=str(work))

    def launch(executable, arguments, prefix, extra=None):
        result = subprocess.run([executable, "--headless", *arguments], cwd=project, env={**env, **(extra or {})},
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                encoding="utf-8", errors="replace", timeout=180,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        errors = [line for line in result.stdout.splitlines() if ("ERROR:" in line or "SCRIPT ERROR" in line)
                  and "Failed to read the root certificate store." not in line]
        assert result.returncode == 0 and not errors, result.stdout[-2400:]
        line = next(line for line in result.stdout.splitlines() if line.startswith(prefix))
        return json.loads(line[len(prefix):])

    def run(mode, name, **options):
        print("Checking", mode, name, flush=True)
        return launch(args.editor, ["--path", project, "--script", ROOT / "test/godot-inventory/wal-storage.gd"],
                      "HWE_WAL_OK ", {"HWE_DB": (work / name).as_posix(), "HWE_WAL_CASE": mode,
                                     "HWE_WAL_POLICY": "", **options})

    native_checks = runpy.run_path(str(ROOT / "scripts/check-slot-addon.py"))["verify_store"](run, work)

    # Exercise the actual distributed player, including its second-process restore.
    player_runs = [launch(player, ["--", "--verify-inlays", "--vestige-sample", *resume], "HWE_VESTIGE_OK ")
                   for resume in [[], ["--resume-inlay"]]]
    assert [row["resumed"] for row in player_runs] == [False, True]
    assert all(row["revision"] == 5 and row["sockets"] == ["thal", "sylph"] for row in player_runs)
    saved = Path(player_runs[1]["database"])
    assert saved.resolve().is_relative_to(settings.resolve())
    with closing(sqlite3.connect(saved)) as db:
        assert db.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    measurement = None
    if not args.correctness_only:
        measurement = launch(player, ["--", "--measure-vestiges"], "HWE_INLAY_MEASURE ")
        assert measurement["ok"] and measurement["reopened"] and measurement["measured"] == 32
    return dict(passed=True, platform=platform, sdkSha256=proof["sdkSha256"], native=native, **native_checks,
                player=player_runs, measurement=measurement, correctnessOnly=args.correctness_only,
                archives={name: digest(release / name) for name in [project_name, player_name, addon_name]})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["editor", "library", "library_proof", "donors", "scratch", "output"]:
        parser.add_argument(name, type=Path)
    parser.add_argument("--correctness-only", action="store_true")
    args = parser.parse_args()
    if not __debug__:
        raise RuntimeError("Assertions required")
    assert not args.output.exists(), "Choose a fresh release directory"
    with tempfile.TemporaryDirectory(prefix="wal-verify-", dir=args.scratch) as temp:
        work = Path(temp).resolve()
        release = work / "release"
        release.mkdir()
        report = verify(args, work, release)
        (release / "verification.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        publish_release(release, args.output)
    print(json.dumps({"passed": True, "output": str(args.output)}))
