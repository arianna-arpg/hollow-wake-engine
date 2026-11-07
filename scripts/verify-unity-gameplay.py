"""Install the actual UPM tarball, exercise its editor sample, build and run a relocated player."""
import argparse
import io
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import uuid


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = (ROOT / ".artifacts").resolve()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_engine(exe, args, cwd, env, log, marker=None, graphics=False):
    display = ["-screen-width", "960", "-screen-height", "600", "-screen-fullscreen", "0"] if graphics else ["-nographics"]
    mode = [] if graphics else ["-batchmode"]
    result = subprocess.run([exe, *mode, *display, "-logFile", log, *args], cwd=cwd, env=env,
                            creationflags=subprocess.CREATE_NO_WINDOW, timeout=420)
    text = log.read_text(encoding="utf-8", errors="replace")
    critical=[line for line in text.splitlines() if ("error CS" in line or line.startswith(("NullReferenceException:", "DllNotFoundException:",
              "MissingMethodException:", "EntryPointNotFoundException:", "Unhandled Exception:", "Aborting batchmode due to failure")))]
    if result.returncode or critical or (marker and marker not in text):
        # License metadata belongs to the workstation and stays out of the receipt.
        errors = [s for s in text.splitlines() if any(t in s for t in ("error CS", "Exception:", "BuildFailed", "Aborting batchmode", "Assertion failed", "Error building Player", "error during build"))]
        raise RuntimeError(f"{log.name} exit {result.returncode}; {marker or 'player result'}: " + "\n".join(errors[-14:]))


def rows(path):
    return [json.loads(s) for s in path.read_text(encoding="utf-8-sig").splitlines() if s]


def check_replays(work, stage):
    combat, expected = rows(work / (stage + "-combat.replies")), rows(work / "combat.expected")
    assert len(combat) == len(expected) == 60
    for idx, (got, want) in enumerate(zip(combat, expected)):
        assert got == want, ("combat", idx, got, want)
    pouches, expected = rows(work / (stage + "-pouches.replies")), rows(work / "pouches.expected")
    assert len(pouches) == len(expected) == 2334
    for idx, (got, want) in enumerate(zip(pouches, expected)):
        assert got["ok"] == want["ok"], ("pouch", idx, got)
        if "gem" in want:
            assert got["nextUid"] == want["nextUid"] and len(got["items"]) == 1
            assert got["items"][0]["gem"] == want["gem"], ("cut", idx)
        elif "result" in want:
            assert got["result"] == want["result"] and got["items"][-1] == want["item"]
            assert [i["uid"] for i in got["items"]] == want["order"]
            pouch = next((i for i in got["items"] if i["uid"] == want["pouch"]), {})
            assert pouch.get("mem") == want["remaining"] and got["ledger"] == want["ledger"]
            assert got["memory"]["secondary"] == want["secondary"] and got["memory"]["seatLedger"] == want["seatLedger"]
        else:
            for key, value in want.items():
                assert got.get(key) == value, ("view/refusal", idx, key)


def check_workshop_replay(work, stage):
    workshop, expected = rows(work / (stage + "-workshop.replies")), rows(work / "workshop.expected")
    assert len(workshop) == len(expected) == 56
    for idx, (got, want) in enumerate(zip(workshop, expected)):
        assert got == want, ("workshop", idx, got, want)


def check_stage(work, stage, run_id):
    metrics = json.loads((work / (stage + ".json")).read_text(encoding="utf-8-sig"))
    assert metrics["stage"] == stage and metrics["run"]==run_id and metrics["unity"] == "2021.3.6f1", metrics
    check_replays(work, stage)
    check_workshop_replay(work, stage)
    assert metrics["liveBytes"] == metrics["liveBlocks"] == 0
    assert all(metrics[k] for k in ("saveContinuation", "isolatedActors", "refusedInvalidRestore", "closedHost", "duplicatePress","catchUpBoundary","stoppedOnDeath","typedPouch"))
    assert all(metrics[k] for k in ("typedWorkshop","workshopContinuation","workshopIsolation","workshopClosed"))
    assert metrics["workshopRequests"] == 56 and 0 < metrics["workshopPeak"] <= 32 * 1024 * 1024
    assert len(metrics["catchUpManagedBytes"])==len(metrics["singleStepManagedBytes"])==4
    if metrics["managedAllocationCounterAvailable"]:
        assert all(0<b<a for a,b in zip(metrics["singleStepManagedBytes"],metrics["catchUpManagedBytes"]))
    else:
        assert all(v==0 for v in metrics["singleStepManagedBytes"]+metrics["catchUpManagedBytes"])
    assert metrics["singleRequests"]==512 and metrics["catchUpRequests"]==8
    assert 0<metrics["catchUpWireBytes"]<metrics["singleWireBytes"]
    if stage == "player":
        assert metrics["importedSample"] and metrics["sampleHit"] > 0 and metrics["workshopSample"]
    return metrics


def verify(args, scratch):
    project = scratch / "project"
    run_id=uuid.uuid4().hex
    work=scratch/("run-"+run_id)
    work.mkdir()
    for rel in ("Assets/Editor", "Packages", "ProjectSettings"):
        (project / rel).mkdir(parents=True, exist_ok=True)
    pack = json.loads((args.package / "package-receipt.json").read_text())
    archive = args.package / pack["file"]
    assert archive.parent == args.package and digest(archive) == pack["sha256"]
    local_name=pack["sha256"][:16]+"-"+archive.name
    shutil.copyfile(archive, project / "Packages" / local_name)
    config = {"dependencies": {"com.unity.modules.jsonserialize":"1.0.0",
              "com.unity.modules.screencapture":"1.0.0","com.unity.modules.imageconversion":"1.0.0",
              pack["name"]:"file:"+local_name}}
    (project / "Packages/manifest.json").write_text(json.dumps(config),encoding="utf-8")
    (project / "ProjectSettings/ProjectVersion.txt").write_text("m_EditorVersion: 2021.3.6f1\n",encoding="ascii")
    for name in ("Editor/PackageChecks.cs", "GameplayReplay.cs", "WorkshopReplay.cs"):
        shutil.copyfile(ROOT / "test/unity-gameplay" / name,project / "Assets" / name)
    with tarfile.open(archive,"r:gz") as pkg:
        data = pkg.extractfile("package/Runtime/Resources/HollowWake/PouchesContent.bytes").read()
        assert hashlib.sha256(data).hexdigest()==pack["hashes"]["PouchesContent"]
        (work/"pouch-data.json").write_bytes(data)
    for folder in ("temp","cache"):
        (scratch/folder).mkdir(exist_ok=True)
    env = dict(os.environ,TEMP=str(scratch/"temp"),TMP=str(scratch/"temp"),TMPDIR=str(scratch/"temp"),UPM_CACHE_ROOT=str(scratch/"cache"),
               HWE_UNITY_COURSES=str(work),HWE_UNITY_RUN_ID=run_id)
    subprocess.run(["node",ROOT/"scripts/prepare-unity-replay.mjs",work,args.release],cwd=ROOT,env=env,check=True,timeout=120)
    for label,method,marker in [("import","ImportSample","HWE_SAMPLE_IMPORTED"),("build","VerifyAndBuild","HWE_UNITY_BUILT")]:
        run_engine(args.editor,["-quit","-projectPath",project,"-buildTarget","Win64","-executeMethod","PackageChecks."+method],
                   work,env,work/(label+".log"),marker)
    editor = check_stage(work,"editor",run_id)
    built=work/"Built"
    moved=work/("Relocated-"+pack["sha256"][:16])
    assert built.resolve().parent==work and moved.resolve().parent==work and not moved.exists()
    built.rename(moved)
    native=list(moved.rglob("hwe_embedded.dll")); assert len(native)==1 and digest(native[0])==pack["nativeSha256"]
    profile=Path(os.environ["USERPROFILE"])/"AppData/LocalLow/HollowWakeSdkVerification"
    game_profile=profile/"GameplayPackageTest"
    old_profile,old_game=profile.exists(),game_profile.exists()
    try:
        player_env=dict(env)
        if args.render: player_env["HWE_UNITY_SCREENSHOT"]=str(work/"workshop.png")
        run_engine(moved/"Gameplay.exe",[],work,player_env,work/"player.log",graphics=args.render)
    finally:
        # Some Windows players create an empty persistentDataPath despite
        # explicit external logs. Only remove previously absent empty folders.
        for folder,existed in [(game_profile,old_game),(profile,old_profile)]:
            if not existed and folder.is_dir() and not any(folder.iterdir()): folder.rmdir()
    player=check_stage(work,"player",run_id)
    assert editor["restoredHit"]==player["restoredHit"]
    run_engine(args.editor,["-projectPath",project,"-executeMethod","PackageChecks.VerifyPlayExit"],work,env,work/"play-exit.log","HWE_PLAY_EXIT_VERIFIED")
    # Use a different UPM package location. Leave the accepted archive intact.
    damaged=project/"Packages"/("damaged-"+local_name)
    with tarfile.open(archive) as original, tarfile.open(damaged,"w:gz") as altered:
        for member in original:
            body=original.extractfile(member).read()
            if member.name.endswith(("/PouchesContent.bytes", "/WorkshopContent.bytes")):
                body+=b" "
                member.size=len(body)
            altered.addfile(member,io.BytesIO(body))
    config["dependencies"][pack["name"]]="file:"+damaged.name
    (project/"Packages/manifest.json").write_text(json.dumps(config),encoding="utf-8")
    try:
        run_engine(args.editor,["-quit","-projectPath",project,"-executeMethod","PackageChecks.VerifyCorruption"],
                   work,env,work/"damaged.log","HWE_DAMAGED_POUCH_REJECTED")
    finally:
        config["dependencies"][pack["name"]]="file:"+local_name
        (project/"Packages/manifest.json").write_text(json.dumps(config),encoding="utf-8")
    control=subprocess.run([sys.executable,"-I","-B",ROOT/"test/unity-gameplay/content-load.py",archive,native[0],work],
                           cwd=work,env=env,capture_output=True,text=True,creationflags=subprocess.CREATE_NO_WINDOW,timeout=180)
    if control.returncode: raise RuntimeError(control.stderr[-2000:])
    return {"package":pack,"editor":editor,"player":player,"contentComparison":json.loads(control.stdout),
            "renderedSampleSha256":digest(work/"workshop.png") if args.render else None,
            "installedFromTarball":True,"sampleImported":True,"relocatedPlayer":True,"playModeExitsWithoutDomainReload":2,"changedPouchAssetRejected":True,"changedWorkshopAssetRejected":True,
            "nativePluginSha256":digest(native[0]),"originalPouchCuts":2304,"originalPouchActions":15,"combatControlRequests":60}


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ("editor","package","release","receipt"):
        parser.add_argument("--"+name,required=True,type=lambda p:Path(p).resolve())
    parser.add_argument("--work",type=lambda p:Path(p).resolve(),help="Reuse a fresh verifier-owned directory instead of creating one")
    parser.add_argument("--render",action="store_true",help="Capture the real imported scene in the relocated Windows player")
    args=parser.parse_args()
    assert not args.receipt.exists(),"Choose a new receipt path"
    if args.work:
        assert args.work.parent==ARTIFACTS and args.work.name.startswith("owned-unity-")
        marker=args.work/".hwe-unity-fixture"
        if not any(args.work.iterdir()): marker.write_text(args.work.name,encoding="ascii")
        assert marker.read_text(encoding="ascii")==args.work.name,"Refusing to edit an unowned project"
        result=verify(args,args.work)
    else:
        with tempfile.TemporaryDirectory(dir=ARTIFACTS,prefix="owned-unity-") as scratch:
            result=verify(args,Path(scratch).resolve())
    with args.receipt.open("x",encoding="utf-8",newline="\n") as output:
        output.write(json.dumps(result,indent=2)+"\n")
    print(json.dumps({"passed":True,"player":result["player"],"sha256":result["package"]["sha256"]}))
