"""Prove that normal-import qualification rejects cached and broken installs."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def check(args, work):
    proof = json.loads((args.delivery / "verification.json").read_text())
    archive_name = "hollow-wake-workshop-" + proof["platform"] + "-x64.zip"
    original = args.delivery / archive_name
    accepted = proof["archives"][archive_name]
    assert digest(original) == accepted
    library = "addons/hollow_wake/bin/" + ("hwe_godot.dll" if proof["platform"] == "windows" else "libhwe_godot.so")
    prefix = "inventory-workshop/"
    faults = []
    for name in ("preseeded-cache", "missing-native-library"):
        folder = work / name
        folder.mkdir()
        archive = folder / archive_name
        with zipfile.ZipFile(original) as source, zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as target:
            assert prefix + library in source.namelist()
            assert not any(".godot" in Path(member).parts for member in source.namelist())
            for member in source.infolist():
                if name == "missing-native-library" and member.filename == prefix + library:
                    continue
                target.writestr(member, source.read(member))
            if name == "preseeded-cache":
                target.writestr(prefix + ".godot/extension_list.cfg", "res://addons/hollow_wake/hollow_wake.gdextension\n")
        changed = {**proof, "archives": {**proof["archives"], archive_name: digest(archive)}}
        (folder / "verification.json").write_text(json.dumps(changed))
        # The production checker owns a separate sibling fixture. Extra nested
        # owners can make ZIP extraction exceed Win32's ordinary path limit.
        scratch = args.scratch.resolve()
        before = set(scratch.iterdir())
        output = folder / "unexpected-success.json"
        result = subprocess.run([sys.executable, "-I", "-B", str(ROOT / "scripts/check-background-workflows.py"),
                                 args.editor, str(folder), str(scratch), str(output)],
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                encoding="utf-8", errors="replace", timeout=180,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        # Preserve the full diagnostic even if this observer itself fails.
        args.output.with_name(args.output.stem+"-"+name+".log").write_text(result.stdout,encoding="utf-8")
        assert result.returncode == 1 and not output.exists(), result.stdout[-5000:]
        expected = "Cold import requires a fresh project without .godot" if name == "preseeded-cache" else "res://addons/hollow_wake/hollow_wake.gdextension"
        assert expected in result.stdout, result.stdout[-5000:]
        if name == "missing-native-library":
            assert "ERROR:" in result.stdout and "dynamic library" in result.stdout, result.stdout[-5000:]
        assert set(scratch.iterdir()) == before, "Failed fixture was not removed"
        faults.append(dict(name=name, expected=expected, exitCode=result.returncode,
                           logSha256=hashlib.sha256(result.stdout.encode()).hexdigest(), output=result.stdout))
    assert digest(original) == accepted, "Accepted delivery changed"
    return dict(passed=True, platform=proof["platform"], archiveSha256=accepted, faults=faults)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("editor")
    for name in ("delivery", "scratch", "output"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    assert __debug__ and not args.output.exists()
    with runpy.run_path(str(ROOT / "scripts/verify-background-workshop.py"))["working_directory"](args.scratch) as work:
        report = check(args, work)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(dict(passed=True, platform=report["platform"], faults=len(report["faults"]))))
