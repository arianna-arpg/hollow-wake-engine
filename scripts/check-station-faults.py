"""Challenge delivered station UI, authority and durable continuation checks."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import runpy
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
HELPERS = runpy.run_path(str(ROOT / "scripts/verify-background-workshop.py"))


def verify(args, work):
    receipt = json.loads((args.delivery / "verification.json").read_text())
    archive = HELPERS["delivered_project"](args.delivery, receipt)
    name = archive.name
    with zipfile.ZipFile(archive) as source:
        for member in source.namelist():
            assert member.startswith("inventory-workshop/") and ".." not in PurePosixPath(member).parts
            assert "\\" not in member and ":" not in member
        source.extractall(work)
    project = work / "inventory-workshop"

    def launch(label, expected=None, importing=False, render=False):
        settings = work / label
        settings.mkdir()
        (settings / ".background-save-owner").write_text("owned station verification")
        env = dict(os.environ, APPDATA=str(settings), LOCALAPPDATA=str(settings), HOME=str(settings),
            XDG_CONFIG_HOME=str(settings), XDG_DATA_HOME=str(settings), XDG_CACHE_HOME=str(settings),
            TEMP=str(settings), TMP=str(settings), TMPDIR=str(settings), HWE_BACKGROUND_TEST_ROOT=str(settings))
        command = [args.editor, "--path", str(project)]
        if render:
            command += ["--rendering-method", "gl_compatibility", "--resolution", "960x600", "--position", "-2000,-2000"]
            env["HWE_STATION_SCREENSHOT"] = str(settings / "station.png")
        else:
            command += ["--headless"]
        command += ["--editor", "--import", "--frame-delay", "1000"] if importing else ["--", "--verify-stations"]
        print("Checking", label, flush=True)
        result = subprocess.run(command, cwd=project, env=env, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, encoding="utf-8", errors="replace",
            timeout=120, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        errors = [line for line in result.stdout.splitlines() if ("ERROR:" in line or "ObjectDB instances leaked" in line)
            and "Failed to read the root certificate store." not in line]
        assert not errors, result.stdout
        if expected:
            assert result.returncode == 1 and "HWE_STATIONS_FAILED " + expected in result.stdout, result.stdout
            return dict(name=label, assertion=expected, output=result.stdout, logSha256=hashlib.sha256(result.stdout.encode()).hexdigest())
        assert result.returncode == 0, result.stdout
        if importing:
            return result.stdout
        observed = json.loads(next(line[len("HWE_STATIONS "):] for line in result.stdout.splitlines() if line.startswith("HWE_STATIONS ")))
        assert observed["unpaidPersisted"] and observed["busyRestored"] and observed["originalPrices"]
        if render:
            assert (settings / "station.png").is_file()
        return observed

    imported = HELPERS["cold_import"](project, lambda: launch("import", importing=True))
    baseline = launch("baseline", render=args.render)
    profile = project / "profile.gd"
    dialog = project / "workshop_station.gd"
    originals = {file: file.read_bytes() for file in (profile, dialog)}
    # All replacements are applied only to a fresh delivered test project.
    faults = [
        ("lost-unpaid-continuation", profile,
            "if changed or change.draws!=saved.random.draws or change.nextUid!=saved.nextUid:",
            "if changed:", "unpaid random continuation queued"),
        ("stale-station-authority", profile,
            'if seen_revision!=revision:return {"ok":false,"reason":"stale-revision"}\n\tvar change:Dictionary',
            'if false:return {"ok":false,"reason":"stale-revision"}\n\tvar change:Dictionary', "stale displayed revision refused"),
        ("revoked-access-ignored", profile,
            'api.reroll(1,uid,index,score,station_access)',
            'api.reroll(1,uid,index,score,{"salvage":true,"oracle":true,"bench":true,"counter":false})', "revoked access refused"),
        ("failed-runtime-not-restored", profile,
            "var recovered:=reload()\n\t\tif not recovered.ok: reply=recovered",
            "var recovered:Dictionary={\"ok\":true}\n\t\tif not recovered.ok: reply=recovered", "failed save restores exact continuation"),
        ("protected-choice-enabled", dialog,
            "var locked:bool=not craft and (row.locked or row.crafted)",
            "var locked:bool=false", "crafted affix protected in dialog"),
    ]
    detected = []
    try:
        for label, file, before, after, assertion in faults:
            text = originals[file].decode("utf-8")
            assert text.count(before) == 1, label
            file.write_text(text.replace(before, after), encoding="utf-8")
            detected.append(launch(label, expected=assertion))
            file.write_bytes(originals[file])
    finally:
        for file, data in originals.items():
            file.write_bytes(data)
    restored = launch("restored")
    assert restored["assertions"] == baseline["assertions"] - (2 if args.render else 0)
    if args.render:
        assert not args.output.with_suffix(".png").exists()
        shutil.copyfile(work / "baseline/station.png", args.output.with_suffix(".png"))
    return dict(passed=True, platform=receipt["platform"], archiveSha256=receipt["archives"][name], coldImport=imported,
        baseline=baseline, faults=detected, restored=restored, screenshotSha256=HELPERS["digest"](args.output.with_suffix(".png")) if args.render else None)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("editor")
    for name in ["delivery", "scratch", "output"]:
        parser.add_argument(name, type=Path)
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args()
    assert __debug__ and not args.output.exists()
    with HELPERS["working_directory"](args.scratch) as work:
        result = verify(args, work.resolve())
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"passed": True, "faults": len(result["faults"])}))
