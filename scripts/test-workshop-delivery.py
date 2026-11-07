"""Require an unambiguous, accepted and unmodified project archive."""
import argparse
import hashlib
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
HELPERS = runpy.run_path(str(ROOT / "scripts/verify-background-workshop.py"))


def check(scratch):
    with HELPERS["working_directory"](scratch) as work:
        content = b"owned archive identity fixture"
        digest = hashlib.sha256(content).hexdigest()
        legacy = "hollow-wake-workshop-windows-x64.zip"
        fresh = "hollow-wake-inventory-project-windows-x64.zip"
        for name in (legacy, fresh):
            (work / name).write_bytes(content)
        for platform, name in (("windows", legacy), ("win32", fresh)):
            proof = dict(passed=True, platform=platform, archives={name: digest})
            assert HELPERS["delivered_project"](work, proof) == work / name
        refused = [
            dict(passed=False, platform="win32", archives={fresh: digest}),
            dict(passed=True, platform="win32", archives={}),
            dict(passed=True, platform="win32", archives={legacy: digest, fresh: digest}),
            dict(passed=True, platform="win32", archives={fresh: "0" * 64}),
        ]
        for proof in refused:
            try:
                HELPERS["delivered_project"](work, proof)
            except AssertionError:
                pass
            else:
                raise AssertionError("Invalid project identity accepted")
    print("Project identity passed: both formats; failed, missing, ambiguous and changed archives refused")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scratch", type=Path)
    args = parser.parse_args()
    assert __debug__ and args.scratch.is_dir()
    check(args.scratch)
