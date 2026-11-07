"""Check legacy archive refreshes include the current scene's static dependencies."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import runpy
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "inventory-workshop/"
CRAFT = "addons/hollow_wake/crafting/"
SUPPLEMENTAL = ("measure_inlays.gd", "verify_inlays.gd", "verify_background.gd", "verify_stations.gd", "workshop_station.gd")


def dependencies(file, omit=()):
    with zipfile.ZipFile(file) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)), "duplicate archive members"
        names = set(names).difference(PREFIX+n for n in omit)
        count = 0
        for name in names:
            if not name.endswith(".gd"):
                continue
            text = archive.read(name).decode("utf-8")
            for target in re.findall(r'(?:preload|load)\(["\']res://([^"\']+)["\']\)', text):
                assert PREFIX+target in names, target
                count += 1
            for target in re.findall(r'^extends ["\']([^"\']+)["\']', text, re.MULTILINE):
                resolved = PREFIX+target[6:] if target.startswith("res://") else str(PurePosixPath(name).parent / target)
                assert resolved in names, resolved
        for name in SUPPLEMENTAL:
            assert archive.read(PREFIX+name) == (ROOT/"examples/godot-inventory"/name).read_bytes()
        return count


def check(donor, overlay, work):
    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    expected = sha(donor)
    source = work/"inputs"
    source.mkdir()
    bundle = source/"bundle.txt"
    bundle.write_bytes((overlay/"bundle.txt").read_bytes())
    with zipfile.ZipFile(donor) as archive:
        for name in ("support-fit.txt", "support-index.json", "support-pages.txt", "pouch-rules.txt", "pouch-data.json"):
            (source/name).write_bytes(archive.read(PREFIX+CRAFT+name))
    sdk = json.loads((overlay/"overlay.json").read_text())["sdkArchiveSha256"]
    rack = runpy.run_path(str(ROOT/"scripts/workshop-rack-project.py"))
    rack["build"](donor, expected, sdk, bundle, work/"rack.zip", work/"rack-addon.zip")
    vestige = runpy.run_path(str(ROOT/"scripts/vestige-workshop-archive.py"))
    changes = {name:(ROOT/"examples/godot-inventory"/name).read_bytes() for name in ("profile.gd", "inventory.gd", "workshop_start.gd", "README.md")}
    extras = {name:(ROOT/"examples/godot-inventory"/name).read_bytes() for name in SUPPLEMENTAL}
    vestige["replace"](donor, expected, work/"vestige.zip", changes, extras=extras)
    results = {}
    for name in ("rack", "vestige"):
        file = work/(name+".zip")
        count = dependencies(file)
        try:
            dependencies(file, ("workshop_station.gd",))
        except AssertionError as error:
            assert str(error) == "workshop_station.gd"
        else:
            raise AssertionError("Missing dialog was not detected")
        results[name] = dict(dependencies=count, missingDialogDetected=True)
    return dict(passed=True, donorSha256=expected, results=results)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("donor", "overlay", "scratch", "output"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    assert __debug__ and not args.output.exists()
    helpers = runpy.run_path(str(ROOT/"scripts/verify-background-workshop.py"))
    with helpers["working_directory"](args.scratch) as work:
        result = check(args.donor.resolve(), args.overlay.resolve(), work)
    args.output.write_text(json.dumps(result, indent=2)+"\n")
    print(json.dumps(result))
