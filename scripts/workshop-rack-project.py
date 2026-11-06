"""Refresh a verified project archive while reusing its native libraries and content."""
import hashlib
import json
import pathlib
import stat
import sys
import zipfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def build(donor, expected, sdk_digest, bundle, project_out, addon_out):
    root = pathlib.Path(__file__).resolve().parents[1]
    assert digest(donor.read_bytes()) == expected, "unexpected donor project"
    prefix = "inventory-workshop/"
    addon = "addons/hollow_wake/"
    crafting = addon + "crafting/"
    changes = {crafting + "bundle.txt": bundle.read_bytes()}
    for name in ("crafting.gd", "cargo_cards.gd", "README.md"):
        changes[crafting + name] = (root / "adapters/godot/crafting" / name).read_bytes()
    for name in ("profile.gd", "inventory.gd", "README.md"):
        changes[name] = (root / "examples/godot-inventory" / name).read_bytes()
    with zipfile.ZipFile(donor) as source:
        manifest = json.loads(source.read(prefix + crafting + "manifest.json"))
        for name, checksum in manifest["files"].items():
            assert digest(source.read(prefix + crafting + name)) == checksum
            if crafting + name in changes:
                manifest["files"][name] = digest(changes[crafting + name])
        manifest.update(optional=["crafting-session/v2"], sdkArchiveSha256=sdk_digest)
        changes[crafting + "manifest.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
        assert set(prefix + f for f in changes) <= set(source.namelist())
        assert len(source.namelist()) == len(set(source.namelist()))
        with zipfile.ZipFile(project_out, "x") as project, zipfile.ZipFile(addon_out, "x") as extension:
            for member in source.infolist():
                name = pathlib.PurePosixPath(member.filename)
                assert name.parts[0] == "inventory-workshop" and ".." not in name.parts
                assert "\\" not in member.filename and ":" not in member.filename and not stat.S_ISLNK(member.external_attr >> 16)
                rel = member.filename.removeprefix(prefix)
                data = changes[rel] if rel in changes else source.read(member)
                for target, filename in [(project, member.filename), (extension, rel)]:
                    if target is extension and not rel.startswith(addon):
                        continue
                    entry = zipfile.ZipInfo(filename)
                    entry.create_system = 3
                    entry.external_attr = member.external_attr
                    target.writestr(entry, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)


if __name__ == "__main__":
    donor, expected, sdk, bundle, project, addon = sys.argv[1:]
    build(pathlib.Path(donor), expected, sdk, pathlib.Path(bundle), project, addon)
