"""Verify the actual optional UPM package in Unity, including process recovery."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import runpy
import shutil
import sqlite3
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = (ROOT / ".artifacts").resolve()


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def check_log(log, code, marker=None):
    text = log.read_text(encoding="utf-8", errors="replace") if log.exists() else ""
    errors = [line for line in text.splitlines() if "error CS" in line or
              any(token in line for token in ("Exception:", "Aborting batchmode due to failure", "BuildFailed", "Error building Player"))]
    if code or errors or (marker and marker not in text):
        raise RuntimeError(f"{log.name}: exit {code}; expected {marker}: " + "\n".join(errors[-12:]))


def launch(exe, args, work, env, log, marker=None, graphics=False):
    display = ["-screen-width","960","-screen-height","600","-screen-fullscreen","0"] if graphics else ["-batchmode","-nographics"]
    result = subprocess.run([str(exe), *display, "-logFile", str(log), *map(str,args)],
                            cwd=work, env=env, timeout=420, creationflags=subprocess.CREATE_NO_WINDOW)
    check_log(log, result.returncode, marker)


def inspect(file, expected, large=False):
    with closing(sqlite3.connect(file)) as db:
        assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        row = db.execute("SELECT revision,crafting,stash FROM slots WHERE slot=1").fetchone()
        assert row == expected, (file.name, row)
        if large:
            assert db.execute("SELECT revision,length(crafting),stash FROM slots WHERE slot=3").fetchone() == (1,524288,"[]")


def verify(args, scratch):
    course_sources=["scripts/verify-unity-storage.py","test/unity-storage/StorageReplay.cs",
                    "test/unity-storage/Editor/StorageChecks.cs"]
    if args.gameplay:
        course_sources.extend(["test/unity-workshop-storage/DurableWorkshopReplay.cs",
                               "test/unity-workshop-storage/DurableSampleReplay.cs",
                               "test/unity-workshop-storage/Editor/DurableSampleChecks.cs"])
    if args.fault_controls:
        course_sources.append("test/unity-workshop-storage/fault-controls.py")
    initial_sources={file:digest(ROOT/file) for file in course_sources}
    project, work = scratch / "project", scratch / "course"
    work.mkdir()
    for rel in ("Assets/Editor", "Packages", "ProjectSettings"):
        (project / rel).mkdir(parents=True, exist_ok=True)
    pack = json.loads((args.package / "package-receipt.json").read_text())
    archive = args.package / pack["file"]
    assert archive.parent == args.package and digest(archive) == pack["sha256"]
    for file, value in pack["sources"].items():
        assert digest(ROOT / file) == value, file
    for file, value in pack["nativeSources"].items():
        assert digest(ROOT / file) == value, file
    local = pack["sha256"][:16] + "-" + archive.name
    shutil.copyfile(archive, project / "Packages" / local)
    dependencies = {
        "com.unity.modules.jsonserialize":"1.0.0", "com.unity.modules.imgui":"1.0.0",
        "com.unity.modules.imageconversion":"1.0.0", "com.unity.modules.screencapture":"1.0.0", pack["name"]:"file:"+local
    }
    gameplay = None
    if args.gameplay:
        gameplay = json.loads((args.gameplay / "package-receipt.json").read_text())
        source = args.gameplay / gameplay["file"]
        assert source.parent == args.gameplay and digest(source) == gameplay["sha256"]
        # Test the frozen published binary, not a locally rebuilt gameplay package.
        assert gameplay["sha256"] == "ea56ce53d14a5c0b669ba1dcc05e96e90ea768994ac682e6ec54c5fd38577c76"
        name = gameplay["sha256"][:16] + "-" + source.name
        shutil.copyfile(source, project / "Packages" / name)
        dependencies[gameplay["name"]] = "file:" + name
        shutil.copyfile(ROOT / "test/unity-workshop-storage/DurableWorkshopReplay.cs",
                        project / "Assets/DurableWorkshopReplay.cs")
    (project / "Packages/manifest.json").write_text(json.dumps({"dependencies":dependencies}), encoding="utf-8")
    (project / "ProjectSettings/ProjectVersion.txt").write_text("m_EditorVersion: 2021.3.6f1\n",encoding="ascii")
    for file in ("StorageReplay.cs", "Editor/StorageChecks.cs"):
        shutil.copyfile(ROOT / "test/unity-storage" / file, project / "Assets" / file)
    profile = json.dumps({"__proto__":{"preserved":True},"constructor":7,"uid":9007199254740991,
                          "fraction":0.125,"text":"café 🎒","rng":123456789}, ensure_ascii=False, separators=(",",":"))
    stash = json.dumps({"items":[{"uid":4294967296}],"stash":{"雪":1}},ensure_ascii=False,separators=(",",":"))
    (work / "profile.txt").write_text(profile,encoding="utf-8")
    (work / "stash.txt").write_text(stash,encoding="utf-8")
    for folder in ("temp", "cache"):
        (scratch / folder).mkdir()
    run_id = uuid.uuid4().hex
    env = dict(os.environ, TEMP=str(scratch/"temp"), TMP=str(scratch/"temp"), TMPDIR=str(scratch/"temp"),
               UPM_CACHE_ROOT=str(scratch/"cache"), HWE_STORAGE_WORK=str(work), HWE_STORAGE_RUN=run_id,
               HWE_STORAGE_GAMEPLAY="1" if gameplay else "0")
    launch(args.editor, ["-quit","-projectPath",project,"-executeMethod","StorageChecks.ImportSample"],
           work,env,work/"sample-import.log","HWE_STORAGE_SAMPLE_IMPORTED")
    if gameplay:
        for file in ("DurableSampleReplay.cs","Editor/DurableSampleChecks.cs"):
            shutil.copyfile(ROOT / "test/unity-workshop-storage" / file, project / "Assets" / file)
    launch(args.editor, ["-quit","-projectPath",project,"-buildTarget","Win64","-executeMethod","StorageChecks.VerifyAndBuild"],
           work,env,work/"build.log","HWE_STORAGE_BUILT")
    launch(args.editor, ["-projectPath",project,"-executeMethod","StorageChecks.VerifyPlayExit"],
           work,env,work/"play-exit.log","HWE_STORAGE_PLAY_EXIT")
    launch(args.editor, ["-projectPath",project,"-executeMethod","StorageChecks.VerifyReload"],
           work,env,work/"reload.log","HWE_STORAGE_RELOAD")
    built, relocated = work / "Built", work / "Relocated"
    assert built.parent == relocated.parent == work and work.is_relative_to(ARTIFACTS)
    built.rename(relocated)
    dlls = list(relocated.rglob("hwe_save.dll"))
    assert len(dlls) == 1 and digest(dlls[0]) == pack["nativeSha256"]
    player = relocated / "Storage.exe"
    launch(player, [], work, {**env,"HWE_STORAGE_MODE":"contracts"}, work/"player.log")
    inspect(work/"editor-contracts.db",(2,profile+" ",stash+"\n"),True)
    inspect(work/"player-contracts.db",(2,profile+" ",stash+"\n"),True)
    for file in ("quit.db", "play-exit-0.db", "play-exit-1.db", "reload.db"):
        inspect(work/file,None)
    inspect(work/"recovery.db",(1,profile,stash))
    interrupt_log = work/"interrupt.log"
    process = subprocess.Popen([str(player),"-batchmode","-nographics","-logFile",str(interrupt_log)],cwd=work,
                               env={**env,"HWE_STORAGE_MODE":"interrupt"},creationflags=subprocess.CREATE_NO_WINDOW)
    ready = None
    try:
        deadline = time.monotonic()+60
        while time.monotonic()<deadline:
            assert process.poll() is None, "Interrupted player exited before staging"
            try:
                ready=json.loads((work/"interrupt-ready.json").read_text())
                break
            except (FileNotFoundError,json.JSONDecodeError):
                time.sleep(0.05)
        assert ready and ready["passed"] and ready["run"]==run_id
        assert process.poll() is None
        # Kill only this verifier's player after observing its staged transaction.
        process.kill()
        process.wait(timeout=30)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=30)
    inspect(work/"recovery.db",(1,profile,stash))
    for mode in ("recover","confirm"):
        launch(player,[],work,{**env,"HWE_STORAGE_MODE":mode},work/(mode+".log"))
        inspect(work/"recovery.db",(2,profile+" ",stash+"\n"))
    sample_results={}
    if gameplay:
        launch(args.editor,["-quit","-projectPath",project,"-buildTarget","Win64","-executeMethod","DurableSampleChecks.Build"],
               work,env,work/"sample-build.log","HWE_STORAGE_SAMPLE_BUILT")
        source, relocated_sample = work/"SampleBuilt",work/"SampleRelocated"
        assert source.parent==relocated_sample.parent==work and work.is_relative_to(ARTIFACTS)
        source.rename(relocated_sample)
        for filename,expected_hash in (("hwe_save.dll",pack["nativeSha256"]),("hwe_embedded.dll",gameplay["nativeSha256"])):
            files=list(relocated_sample.rglob(filename))
            assert len(files)==1 and digest(files[0])==expected_hash
        for mode,expected_file in (("sample-create","sample-current.expected"),("sample-reopen","sample-next.expected")):
            screenshot=work/"sample.png" if args.screenshot and mode=="sample-reopen" else None
            launch(relocated_sample/"Workshop.exe",[],work,
                   {**env,"HWE_STORAGE_MODE":mode,"HWE_STORAGE_SCREENSHOT":str(screenshot) if screenshot else ""},
                   work/(mode+".log"),graphics=bool(screenshot))
            result=json.loads((work/(mode+".json")).read_text(encoding="utf-8-sig"))
            assert result["passed"] and result["run"]==run_id and result["importedSample"] and result["committedView"]
            expected=(work/expected_file).read_text(encoding="utf-8-sig")
            inspect(work/"inventory.db",(result["revision"],expected,'{"version":1,"items":[]}'))
            sample_results[mode]=result
        assert sample_results["sample-create"]["busyRecovery"] and sample_results["sample-create"]["staleRecovery"]
        assert sample_results["sample-reopen"]["restartContinuation"] and sample_results["sample-reopen"]["lastUid"]==4
        if args.screenshot:
            assert (work/"sample.png").stat().st_size>10000
            shutil.copyfile(work/"sample.png",args.screenshot)
    results={}
    for name in ("editor","player","quit-cleanup","play-exit","before-reload","after-reload","interrupt-ready","recover","confirm"):
        result=json.loads((work/(name+".json")).read_text(encoding="utf-8-sig"))
        assert result["run"]==run_id and result["passed"] and result["unity"]=="2021.3.6f1", name
        results[name]=result
    for name in ("editor","player"):
        assert all(results[name][key] for key in ("paired","stale","rollback","asyncOwnership","exactText","bounds","disposal"))
    assert all(results[name]["closed"] for name in ("quit-cleanup","play-exit","before-reload"))
    assert results["play-exit"]["revision"]==2
    sources=["scripts/verify-unity-storage.py","test/unity-storage/StorageReplay.cs","test/unity-storage/Editor/StorageChecks.cs"]
    workshop_results = {}
    lifecycle_results = {}
    if gameplay:
        sources.append("test/unity-workshop-storage/DurableWorkshopReplay.cs")
        sources.extend(["test/unity-workshop-storage/DurableSampleReplay.cs","test/unity-workshop-storage/Editor/DurableSampleChecks.cs"])
        for stage in ("quit","reload","play-entry-0","play-entry-1","play-exit-0","play-exit-1"):
            value=json.loads((work/(stage+"-workshop-lifetime.json")).read_text(encoding="utf-8-sig"))
            assert value["passed"] and value["closed"] and value["run"]==run_id
            with closing(sqlite3.connect(work/(stage+"-workshop-lifetime.db"))) as db:
                assert db.execute("PRAGMA integrity_check").fetchone()==("ok",)
                revision,body,stash=db.execute("SELECT revision,crafting,stash FROM slots WHERE slot=1").fetchone()
                assert revision in (1,2)
                expected=(work/(stage+"-workshop-lifetime."+("previous" if revision==1 else "proposed"))).read_text(encoding="utf-8-sig")
                assert body==expected
                assert stash==(work/"editor-workshop-stash.expected").read_text(encoding="utf-8-sig")
                value["durableRevision"]=revision
            lifecycle_results[stage]=value
        for stage in ("editor", "player"):
            value=json.loads((work/(stage+"-workshop.json")).read_text(encoding="utf-8-sig"))
            assert value["passed"] and value["run"]==run_id and value["unity"]=="2021.3.6f1"
            assert all(value[key] for key in ("initialPublication","commitPublication","busyRecovery","staleRecovery",
                       "payloadRecovery","noOpNoWrite","refusedCommand","invalidReload","exactContinuation","closed"))
            assert value["firstUid"]==4294967297 and value["peakBytes"]<=32*1024*1024
            assert value["finalLiveBytes"]==value["finalLiveBlocks"]==0
            expected=(work/(stage+"-workshop.expected")).read_text(encoding="utf-8-sig")
            expected_stash=(work/(stage+"-workshop-stash.expected")).read_text(encoding="utf-8-sig")
            inspect(work/(stage+"-workshop.db"),(value["revision"],expected,expected_stash))
            workshop_results[stage]=value
    faults=None
    if args.fault_controls:
        file="test/unity-workshop-storage/fault-controls.py"
        sources.append(file)
        faults=runpy.run_path(str(ROOT/file))["controls"](ROOT,archive,project,work,env,args.editor)
    assert set(sources)==set(initial_sources)
    assert all(digest(ROOT/file)==value for file,value in initial_sources.items()), "Verification sources changed during the run"
    return dict(passed=True,packageSha256=pack["sha256"],nativeSha256=pack["nativeSha256"],run=run_id,
                package=pack,results=results,processKillRecovery=True,independentSqliteInspection=True,
                gameplayPackageSha256=gameplay["sha256"] if gameplay else None,workshop=workshop_results,
                workshopLifecycle=lifecycle_results,sample=sample_results,
                faultControls=faults,
                screenshotSha256=digest(args.screenshot) if args.screenshot else None,
                relocatedPlayer=True,gameplayPackageRequired=False,physicalPowerLossClaim=False,devicePerformanceClaim=False,
                sources=initial_sources,
                logHashes={file.name:digest(file) for file in work.glob("*.log")})


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--editor",type=Path,required=True)
    parser.add_argument("--package",type=Path,required=True)
    parser.add_argument("--gameplay",type=Path)
    parser.add_argument("--screenshot",type=Path)
    parser.add_argument("--fault-controls",action="store_true")
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    assert not args.fault_controls or args.gameplay
    args.editor=args.editor.resolve()
    args.package=args.package.resolve()
    if args.gameplay:
        args.gameplay=args.gameplay.resolve()
    if args.screenshot:
        args.screenshot=args.screenshot.resolve()
        assert args.gameplay and not args.screenshot.exists()
    args.output=args.output.resolve()
    assert os.name=="nt" and not args.output.exists()
    with tempfile.TemporaryDirectory(prefix="unity-storage-verify-",dir=ARTIFACTS) as temp:
        scratch=Path(temp).resolve()
        assert scratch.parent==ARTIFACTS
        report=verify(args,scratch)
        args.output.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
        print(json.dumps({"passed":True,"output":str(args.output),"processKillRecovery":True,"reloadCleanup":True}))
