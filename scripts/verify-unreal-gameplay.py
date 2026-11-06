"""Build and run a disposable Win64 Unreal 5.0.3 consumer and verify its installed plugin."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / ".artifacts"
FIXTURE = ROOT / "test/unreal-gameplay"
PACKAGE = runpy.run_path(str(ROOT / "scripts/package-unreal-gameplay.py"))
COMPARE = runpy.run_path(str(ROOT / "scripts/verify-unity-gameplay.py"))["check_replays"]
PLUGIN = "HollowWakeGameplay"
VERSION = "5.0.3-20979098+++UE5+Release-5.0"
ARCHIVE = "hollow-wake-gameplay-unreal-5.0.3-win64.zip"
BLUEPRINT = "/Game/HollowWakeTest/BP_TrainingTarget.BP_TrainingTarget_C"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args, env, cwd, log, timeout=1200):
    with log.open("wb") as stream:
        with subprocess.Popen([str(a) for a in args], cwd=cwd, env=env, stdout=stream, stderr=subprocess.STDOUT,
                              creationflags=subprocess.CREATE_NO_WINDOW) as process:
            try:
                status = process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                subprocess.run(["taskkill.exe", "/pid", str(process.pid), "/t", "/f"],
                               stdout=stream, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
                raise
    if status:
        tail = log.read_text(errors="replace").splitlines()[-12:]
        raise RuntimeError(f"{log.name} exited {status}\n" + "\n".join(tail))


def check_stage(course, stage, run_id):
    result = json.loads((course / (stage + ".json")).read_bytes())
    if result["run"] != run_id or result["stage"] != stage or result["engine"] != VERSION:
        raise ValueError("Unexpected engine or replay receipt")
    if not (result["world"] and result["pouch"] and result["replay"] and not result["error"] and
            result["sampleClass"] == BLUEPRINT and result["sampleHit"] == result["restoredHit"] > 0 and result["timedDamage"] > 0 and
            result["singleStepsToCast"] == result["singleRequests"] > result["catchUpRequests"] == 1 and
            result["singleWireBytes"] > result["catchUpWireBytes"] > 0 and
            0 < result["combatVmPeakBytes"] <= 64 << 20 and 0 < result["pouchVmPeakBytes"] <= 12 << 20):
        raise ValueError(result)
    COMPARE(course, stage)
    return {k: v for k, v in result.items() if k not in ("run", "error")}


def verify(args, work):
    engine = args.engine.resolve()
    editor = engine / "Binaries/Win64/UnrealEditor-Cmd.exe"
    dotnet = engine / "Binaries/ThirdParty/DotNet/Windows/dotnet.exe"
    ubt = engine / "Binaries/DotNET/UnrealBuildTool/UnrealBuildTool.dll"
    uat = engine / "Binaries/DotNET/AutomationTool/AutomationTool.dll"
    game = work / "Game"
    project = game / "HweProbe.uproject"
    plugin = game / "Plugins" / PLUGIN
    course = work / "course"
    logs = work / "logs"
    for folder in (course, logs, work / "tmp", work / "local", work / "roaming", work / "ddc"):
        folder.mkdir(exist_ok=True)
    run_id = uuid.uuid4().hex
    env = dict(os.environ, TEMP=str(work / "tmp"), TMP=str(work / "tmp"), TMPDIR=str(work / "tmp"),
               APPDATA=str(work / "roaming"), LOCALAPPDATA=str(work / "local"), DOTNET_CLI_HOME=str(work / "local"),
               DOTNET_ROOT=str(dotnet.parent), DOTNET_CLI_TELEMETRY_OPTOUT="1", DOTNET_MULTILEVEL_LOOKUP="0",
               DOTNET_SKIP_FIRST_TIME_EXPERIENCE="1", HWE_UNREAL_COURSE=str(course), HWE_UNREAL_RUN=run_id,
               uebp_LogFolder=str(logs / "uat"), uebp_FinalLogFolder=str(logs / "uat"),
               uebp_EngineSavedFolder=str(work / "local/EngineSaved"))
    env.update({"UE-LocalDataCachePath": str(work / "ddc"), "UE-SharedDataCachePath": "None"})
    shutil.copytree(FIXTURE / "Consumer", game, dirs_exist_ok=True)
    files = PACKAGE["files_for_package"](args.unity)
    for rel, data in files.items():
        dest = plugin / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.is_file() or dest.read_bytes() != data:
            dest.write_bytes(data)
    (course / "pouch-data.json").write_bytes(files["Resources/SDK/PouchesContent.bin"])
    run(["node", ROOT / "scripts/prepare-unity-replay.mjs", course, args.release.resolve()], env, ROOT, logs / "prepare.log")
    for target in ("HweProbeEditor", "HweProbe"):
        run([dotnet, ubt, target, "Win64", "Development", f"-Project={project}", "-Compiler=VisualStudio2022",
             "-MaxParallelActions=2", "-NoXGE", "-NoHotReloadFromIDE", f"-Log={logs}/{target}-build.log"],
            env, game, logs / (target + ".log"))
    args.output.mkdir(parents=True, exist_ok=True)
    candidate = work / (run_id + "-" + ARCHIVE)
    files = PACKAGE["files_for_package"](args.unity, plugin / "Binaries/Win64")
    PACKAGE["archive"](files, candidate)
    # All package inputs and the built module must match the bytes that enter the consumer tests.
    with zipfile.ZipFile(candidate) as packed:
        if set(packed.namelist()) != {PLUGIN + "/" + rel for rel in files}:
            raise ValueError("Unexpected archive member")
        for rel, data in files.items():
            if packed.read(PLUGIN + "/" + rel) != (plugin / rel).read_bytes():
                raise ValueError("Package mismatch: " + rel)
    common = ["-nosplash", "-nosound", "-unattended", "-NoLiveCoding", "-NoP4", "-NoCrashDialog", "-NoAnalytics"]
    blueprint = work / ("Blueprint-" + run_id[:8])
    bp_project = blueprint / "Install.uproject"
    blueprint.mkdir()
    bp_project.write_text(json.dumps({"FileVersion": 3, "EngineAssociation": "5.0", "Plugins": [
        {"Name": PLUGIN, "Enabled": True}, {"Name": "PythonScriptPlugin", "Enabled": True},
        {"Name": "EditorScriptingUtilities", "Enabled": True}]}))
    with zipfile.ZipFile(candidate) as packed:
        packed.extractall(blueprint / "Plugins")
    scripts = blueprint / "Content/Python"
    scripts.mkdir(parents=True)
    shutil.copyfile(FIXTURE / "blueprint_install.py", scripts / "blueprint_install.py")
    run([editor, bp_project, "-run=pythonscript", "-script=blueprint_install.py", "-nullrhi", *common, f"-abslog={logs}/blueprint.log"],
        env, blueprint, logs / "blueprint-process.log")
    bp = json.loads((course / "blueprint.json").read_bytes())
    if bp["run"] != run_id or bp["classes"][-1] != BLUEPRINT:
        raise ValueError("Packaged module failed Blueprint authoring")
    assets = game / "Content/HollowWakeTest"
    assets.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(blueprint / "Content/HollowWakeTest/BP_TrainingTarget.uasset", assets / "BP_TrainingTarget.uasset")
    run([editor, project, "/Engine/Maps/Entry", "-game", "-nullrhi", *common, f"-abslog={logs}/editor.log"],
        dict(env, HWE_UNREAL_STAGE="editor"), game, logs / "editor-process.log")
    results = {"editor": check_stage(course, "editor", run_id)}
    stage = work / "stage"
    run([dotnet, uat, "BuildCookRun", f"-project={project}", "-nop4", "-unattended", "-nocompile",
         "-nocompileeditor", "-skipbuild", "-cook", "-stage", "-pak", "-platform=Win64", "-clientconfig=Development",
         "-map=/Engine/Maps/Entry", "-iterate", "-SkipCookingEditorContent", f"-stagingdirectory={stage}",
         "-AdditionalCookerOptions=-nullrhi -NoP4 -NoAnalytics", "-utf8output"], env, game, logs / "packaging.log")
    deployed = work / ("Standalone-" + run_id[:8])
    (stage / "Windows").rename(deployed)
    runtime = deployed / "HweProbe/Plugins" / PLUGIN
    for rel, data in files.items():
        if rel.startswith(("Resources/SDK/", "ThirdParty/Win64/")) and (runtime / rel).read_bytes() != data:
            raise ValueError("Staged resource mismatch: " + rel)
    # NullRHI on this monolithic UE 5.0.3 build crashes in Nanite's process-exit destructor.
    # Exercise the standard D3D11 shutdown path, including the render-device teardown.
    player = [deployed / "HweProbe/Binaries/Win64/HweProbe.exe", "-d3d11", "-RenderOffScreen", "-windowed",
              "-ResX=320", "-ResY=180", *common]
    player_env = dict(env, HWE_UNREAL_STAGE="player")
    pouch_file = runtime / "Resources/SDK/PouchesContent.bin"
    original = pouch_file.read_bytes()
    try:
        pouch_file.write_bytes(original[:-1] + bytes([original[-1] ^ 1]))
        run([*player, "-HweDamagedPouchTest", f"-abslog={logs}/integrity.log"],
            player_env, deployed, logs / "integrity-process.log")
        integrity = json.loads((course / "integrity.json").read_bytes())
        if (integrity["run"] != run_id or not integrity["refusedDamagedPouches"] or not integrity["combatAvailable"] or
                integrity["refusal"] != "Missing, oversized or mismatched SDK file: PouchesContent.bin"):
            raise ValueError("Modified pouch content was accepted or affected combat")
    finally:
        pouch_file.write_bytes(original)
    run([*player, f"-abslog={logs}/player.log"], player_env, deployed, logs / "player-process.log")
    results["player"] = check_stage(course, "player", run_id)
    for stage_name in ("editor", "player", "integrity"):
        if "Hollow Wake runtime did not release all tracked memory" in (logs / (stage_name + ".log")).read_text(errors="replace"):
            raise ValueError("Runtime teardown failed in " + stage_name)
    receipt = {"package": {"file": ARCHIVE, "bytes": candidate.stat().st_size, "sha256": digest(candidate),
                          "inputSha256": digest(args.unity), "editorBuildId": "19505902"},
               "combatCasesPerHost": 60, "pouchCasesPerHost": 2334, "blueprintClasses": bp["classes"],
               "playerRendering": "Direct3D 11 offscreen", "integrity": {k: v for k, v in integrity.items() if k != "run"},
               **results}
    # A verified package can be reproduced under a fresh destination without replacing an earlier build.
    target = args.output / ARCHIVE
    if target.exists() and digest(target) != digest(candidate):
        raise FileExistsError(f"Different verified package already exists: {target}")
    if not target.exists():
        shutil.copyfile(candidate, target)
    (args.output / "verification-windows.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("engine", type=Path, help="Installed UE_5.0/Engine folder with a Win64 C++ toolchain")
    parser.add_argument("unity", type=Path, help="Verified package carrying the SDK native library and rules")
    parser.add_argument("release", type=Path, help="Accepted 0.57 workshop directory containing verification-dotnet-windows.json")
    parser.add_argument("output", type=Path, help="Directory for the verified plugin and receipt")
    options = parser.parse_args()
    if not __debug__:
        raise RuntimeError("Verification requires Python assertions")
    ARTIFACTS.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="unreal-gameplay-", dir=ARTIFACTS) as temp:
        print(json.dumps(verify(options, Path(temp)), indent=2))
