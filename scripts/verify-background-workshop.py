"""Build and exercise the background-saving inventory project and relocated player."""
import argparse
from contextlib import closing, contextmanager
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import runpy
import shutil
import sqlite3
import subprocess
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "inventory-workshop/"


@contextmanager
def working_directory(parent):
    """Retry transient Windows release delays; never suppress a cleanup failure."""
    folder = Path(tempfile.mkdtemp(prefix="background-workshop-", dir=parent)).resolve()
    # Godot's generated editor names can exceed Win32 MAX_PATH even when the
    # fixture root is short. Use extended absolute paths only for deletion.
    cleanup = str(folder)
    if os.name == "nt" and not cleanup.startswith("\\\\?\\"):
        cleanup = "\\\\?\\UNC\\" + cleanup[2:] if cleanup.startswith("\\\\") else "\\\\?\\" + cleanup
    try:
        yield folder
    finally:
        for attempt in range(9):
            try:
                shutil.rmtree(cleanup)
                assert not Path(cleanup).exists(), "Temporary fixture was not removed: " + str(folder)
                break
            except FileNotFoundError:
                # A missing child is not proof that the root was removed.
                if Path(cleanup).exists():
                    raise
                break
            except OSError as error:
                if attempt == 8 or getattr(error, "winerror", None) not in (5, 32, 145):
                    raise
                time.sleep(0.25)


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def cold_import(project, launch):
    """Require the editor to discover every extension in a cache-free project."""
    cache = project / ".godot"
    assert not cache.exists(), "Cold import requires a fresh project without .godot"
    expected = sorted("res://" + file.relative_to(project).as_posix() for file in project.rglob("*.gdextension"))
    assert expected, "No native extensions to qualify"
    output = launch()
    registry = cache / "extension_list.cfg"
    assert registry.is_file(), "Editor did not create the extension registry"
    actual = sorted(registry.read_text().splitlines())
    assert actual == expected, ("Editor did not discover the complete addon", expected, actual)
    return dict(cacheInitiallyAbsent=True, extensions=actual, logSha256=hashlib.sha256(output.encode()).hexdigest(), output=output)


def archive_tree(folder, output, prefix):
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file in sorted(folder.rglob("*")):
            if file.is_file() and ".godot" not in file.relative_to(folder).parts:
                archive.write(file, prefix + file.relative_to(folder).as_posix())


def verify(args, work, delivery):
    native = json.loads(args.native_proof.read_text())
    tools = json.loads(args.tools.read_text())
    platform = "windows" if native["platform"] == "win32" else "linux"
    pin = json.loads((ROOT / "experiments/godot-native/toolchain-lock.json").read_text())["platforms"][native["platform"]]
    assert digest(Path(tools["editor"])) == pin["editor"]["executableSha256"]
    for name, key in [("exportRelease", "release"), ("exportDebug", "debug")]:
        assert digest(Path(tools[name])) == pin["templates"]["files"][pin["templates"][key]]
    assert native["passed"] and digest(Path(native["library"])) == native["librarySha256"]
    for name, expected in native["sources"].items():
        assert digest(ROOT / name) == expected, name
    donor = json.loads((args.donors / "verification.json").read_text())
    project_name = "hollow-wake-workshop-" + platform + "-x64.zip"
    player_name = "hollow-wake-inventory-" + platform + "-x64.zip"
    for name in (project_name, player_name):
        assert digest(args.donors / name) == donor["archives"][name]
    with zipfile.ZipFile(args.donors / project_name) as archive:
        for name in archive.namelist():
            assert name.startswith(PREFIX) and ".." not in PurePosixPath(name).parts
            assert "\\" not in name and ":" not in name
        archive.extractall(work)
    project = work / "inventory-workshop"
    source_files = ["profile.gd", "inventory.gd", "verify_inlays.gd", "verify_background.gd", "workshop_start.gd", "README.md"]
    for name in source_files:
        shutil.copyfile(ROOT / "examples/godot-inventory" / name, project / name)
    crafting_hashes = {}
    if args.crafting_addon:
        overlay = json.loads((args.crafting_addon / "overlay.json").read_text())
        assert overlay["passed"] and overlay["capability"] == "crafting-view/v1"
        for name, expected in overlay["sources"].items():
            file = (ROOT / name).resolve()
            assert file.is_relative_to(ROOT.resolve()) and digest(file) == expected, name
        manifest_file = project / "addons/hollow_wake/crafting/manifest.json"
        manifest = json.loads(manifest_file.read_text())
        for name, expected in manifest["files"].items():
            assert digest(manifest_file.parent / name) == expected, name
        for name in ["bundle.txt", "crafting.gd", "README.md"]:
            assert digest(args.crafting_addon / name) == overlay["files"][name]
            shutil.copyfile(args.crafting_addon / name, project / "addons/hollow_wake/crafting" / name)
            crafting_hashes[name] = digest(args.crafting_addon / name)
            manifest["files"][name] = crafting_hashes[name]
        manifest["sdkArchiveSha256"] = overlay["sdkArchiveSha256"]
        manifest["optional"].append(overlay["capability"])
        manifest["readViewSources"] = overlay["sources"]
        manifest_file.write_text(json.dumps(manifest, indent=2) + "\n")
        crafting_hashes["manifest.json"] = digest(manifest_file)
    store = project / "addons/hollow_wake_save"
    shutil.copyfile(native["library"], store / "bin" / Path(native["library"]).name)
    shutil.copyfile(ROOT / "adapters/godot/local-save/README.md", store / "README.md")
    archive_tree(project, delivery / project_name, PREFIX)
    addon_name = "hollow-wake-local-save-0.3.0-" + platform + "-x64.zip"
    archive_tree(store, delivery / addon_name, "addons/hollow_wake_save/")
    preset = project / "export_presets.cfg"
    preset.write_text(preset.read_text() + "\ncustom_template/debug=" + json.dumps(tools["exportDebug"].replace("\\", "/")) +
                      "\ncustom_template/release=" + json.dumps(tools["exportRelease"].replace("\\", "/")) + "\n")

    def environment(name):
        settings = work / name
        settings.mkdir()
        for marker in (".background-save-owner", ".vestige-test-owner"):
            (settings / marker).write_text("owned background save verification")
        return dict(os.environ, APPDATA=str(settings), LOCALAPPDATA=str(settings), HOME=str(settings),
                    XDG_CONFIG_HOME=str(settings), XDG_DATA_HOME=str(settings), XDG_CACHE_HOME=str(settings),
                    TEMP=str(settings), TMP=str(settings), TMPDIR=str(settings),
                    HWE_BACKGROUND_TEST_ROOT=str(settings), HWE_VESTIGE_TEST_ROOT=str(settings)), settings

    editor_env, editor_settings = environment("editor-settings")

    def launch(label, executable, arguments, env):
        print("Checking", label, flush=True)
        try:
            result = subprocess.run([executable, "--headless", *arguments], cwd=project, env=env,
                                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                    encoding="utf-8", errors="replace", timeout=120,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except subprocess.TimeoutExpired as error:
            raise AssertionError(str(error.stdout)[-5000:]) from error
        errors = [line for line in result.stdout.splitlines()
                  if any(text in line for text in ("ERROR:", "SCRIPT ERROR", "ObjectDB instances leaked"))
                  and "Failed to read the root certificate store." not in line]
        assert result.returncode == 0 and not errors, label + "\n" + result.stdout[-5000:]
        return result.stdout

    imported = None
    if args.direct_registration:
        cache = project / ".godot"
        cache.mkdir()
        entries = sorted("res://" + file.relative_to(project).as_posix() for file in project.rglob("*.gdextension"))
        (cache / "extension_list.cfg").write_text("\n".join(entries) + "\n")
    else:
        imported = cold_import(project, lambda: launch("editor import", tools["editor"],
            ["--editor", "--import", "--frame-delay", "1000", "--path", project], editor_env))

    def observations(label, executable, args, env, prefix):
        text = launch(label, executable, args, env)
        line = next(line for line in text.splitlines() if line.startswith(prefix))
        return json.loads(line[len(prefix):])

    def course(label, executable, arguments, env, settings):
        first = observations(label, executable, [*arguments, "--", "--verify-background"], env, "HWE_BACKGROUND_PLAYER ")
        assert not first["resumed"] and first["queuedViewUnchanged"] and first["busyRecovered"] and first["staleRecovered"] and first["closeWaited"]
        file = Path(first["database"])
        assert file.resolve().is_relative_to(settings.resolve())
        with closing(sqlite3.connect(file)) as db:
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            rev, source = db.execute("SELECT revision,crafting FROM slots WHERE slot=1").fetchone()
            assert rev == first["revision"] and hashlib.sha256(source.encode()).hexdigest() == first["saveSha256"]
        resumed = observations(label + " reopened", executable, [*arguments, "--", "--verify-background", "--resume-background"],
                               {**env, "HWE_BACKGROUND_EXPECTED_SHA": first["saveSha256"]}, "HWE_BACKGROUND_PLAYER ")
        assert resumed["resumed"] and resumed["revision"] == rev and resumed["saveSha256"] == first["saveSha256"]
        return [first, resumed]

    editor = course("editor actions", tools["editor"], ["--path", project], editor_env, editor_settings)
    player = work / "player"
    player.mkdir()
    executable = player / ("Inventory.exe" if platform == "windows" else "Inventory.x86_64")
    launch("export", tools["editor"], ["--path", project, "--export-release", "Windows Desktop" if platform == "windows" else "Linux", executable], editor_env)
    assert digest(player / Path(native["library"]).name) == native["librarySha256"]
    # Retain the accepted platform's runtime and dependency notices.
    with zipfile.ZipFile(args.donors / player_name) as prior:
        for member in prior.infolist():
            if member.filename.startswith(PREFIX + "notices/"):
                relative = PurePosixPath(member.filename[len(PREFIX):])
                assert ".." not in relative.parts
                target = player / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(prior.read(member))
    shutil.copyfile(store / "README.md", player / "notices/SQLite-and-save-adapter.md")
    shutil.copyfile(project / "README.md", player / "README.md")
    archive_tree(player, delivery / player_name, PREFIX)
    # Exercise a fresh extraction of the exact archive that will be delivered.
    relocated = work / "relocated"
    with zipfile.ZipFile(delivery / player_name) as archive:
        archive.extractall(relocated)
    runnable = relocated / PREFIX / executable.name
    if platform == "linux":
        runnable.chmod(0o755)
    player_env, player_settings = environment("player-settings")
    shipped = course("relocated player", runnable, [], player_env, player_settings)
    vestiges = []
    for extra in [[], ["--resume-inlay"]]:
        vestiges.append(observations("relocated inlays", runnable, ["--", "--verify-inlays", "--vestige-sample", *extra],
                                     player_env, "HWE_VESTIGE_OK "))
    assert [row["resumed"] for row in vestiges] == [False, True] and all(row["revision"] == 5 for row in vestiges)
    return dict(passed=True, platform=platform, native=native, editorImport=not args.direct_registration, coldImport=imported, craftingAddonHashes=crafting_hashes,
                donorArchives={name: donor["archives"][name] for name in (project_name, player_name)},
                sources={str((Path("examples/godot-inventory") / name).as_posix()): digest(ROOT / "examples/godot-inventory" / name) for name in source_files},
                editor=editor, player=shipped, vestiges=vestiges,
                archives={name: digest(delivery / name) for name in (project_name, player_name, addon_name)})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["tools", "native_proof", "donors", "scratch", "output"]:
        parser.add_argument(name, type=Path)
    parser.add_argument("--direct-registration", action="store_true")
    parser.add_argument("--crafting-addon", type=Path)
    args = parser.parse_args()
    assert __debug__ and not args.output.exists()
    with working_directory(args.scratch) as temp:
        work = Path(temp).resolve()
        delivery = work / "delivery"
        delivery.mkdir()
        report = verify(args, work, delivery)
        (delivery / "verification.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        runpy.run_path(str(ROOT / "scripts/verify-wal-store.py"))["publish_release"](delivery, args.output)
    print(json.dumps({"passed": True, "output": str(args.output)}))
