"""Exercise long editor paths and refused cleanup without using global temp."""
import argparse
import os
from pathlib import Path
import runpy
import shutil
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def extended(path):
    value = str(path.resolve())
    if os.name == "nt":
        return Path("\\\\?\\UNC\\" + value[2:] if value.startswith("\\\\") else "\\\\?\\" + value)
    return path


def check(parent):
    working_directory = runpy.run_path(str(ROOT / "scripts/verify-background-workshop.py"))["working_directory"]
    # The outer owner also cleans up after a failed assertion or injected error.
    with working_directory(parent) as owner:
        for fail in (False, True):
            try:
                with working_directory(owner) as folder:
                    child = extended(folder / ("editor-" + "x" * 120) / ("export-" + "y" * 120 + ".cfg"))
                    child.parent.mkdir()
                    child.write_bytes(b"owned editor cache")
                    assert len(str(child)) > 260 and child.is_file()
                    if fail:
                        raise ValueError("work failed")
            except ValueError as error:
                assert fail and str(error) == "work failed"
            assert not extended(folder).exists(), "Long-path fixture leaked"

        with working_directory(owner) as target:
            with patch.object(shutil, "rmtree", side_effect=FileNotFoundError("missing child")):
                try:
                    with working_directory(target) as nested:
                        pass
                except FileNotFoundError:
                    pass
                else:
                    raise AssertionError("Nested missing child was swallowed")
                assert nested.exists()
        assert not list(owner.iterdir())
    assert not extended(owner).exists()
    print("Workshop cleanup passed: long paths on success/failure and missing-child refusal")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("scratch", type=Path)
    args = parser.parse_args()
    assert __debug__ and args.scratch.is_dir()
    check(args.scratch)
