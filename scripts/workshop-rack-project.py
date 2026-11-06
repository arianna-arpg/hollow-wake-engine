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
    extra = {crafting + "support_fit.gd": (root / "adapters/godot/crafting/support_fit.gd").read_bytes()}
    extra[crafting + "pouch_recall.gd"] = (root / "adapters/godot/crafting/pouch_recall.gd").read_bytes()
    for name in ("measure_supports.gd", "support-measure.json", "measure_pouch.gd", "recall-measure.json", "workshop_start.gd", "workshop_start.tscn"):
        extra[name] = (root / "examples/godot-inventory" / name).read_bytes()
    for name in ("support-fit.txt", "support-index.json", "support-pages.txt", "pouch-rules.txt", "pouch-data.json"):
        extra[crafting + name] = (bundle.parent / name).read_bytes()
    for name in ("crafting.gd", "cargo_cards.gd", "README.md"):
        changes[crafting + name] = (root / "adapters/godot/crafting" / name).read_bytes()
    for name in ("profile.gd", "inventory.gd", "project.godot", "README.md"):
        changes[name] = (root / "examples/godot-inventory" / name).read_bytes()
    with zipfile.ZipFile(donor) as source:
        manifest = json.loads(source.read(prefix + crafting + "manifest.json"))
        for name, checksum in manifest["files"].items():
            assert digest(source.read(prefix + crafting + name)) == checksum
            if crafting + name in changes:
                manifest["files"][name] = digest(changes[crafting + name])
        manifest["files"].update({name.removeprefix(crafting): digest(data) for name, data in extra.items() if name.startswith(crafting)})
        manifest.update(optional=["crafting-session/v2","workshop-supports/v1","pouch-recall/v1"], sdkArchiveSha256=sdk_digest)
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
            for rel, data in extra.items():
                for target, filename in ((project, prefix + rel), (extension, rel)):
                    if target is extension and not rel.startswith(addon):
                        continue
                    entry = zipfile.ZipInfo(filename)
                    entry.create_system = 3
                    entry.external_attr = (stat.S_IFREG | 0o644) << 16
                    target.writestr(entry, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)


def switch_programs(prior, release, variant, directory):
    # The benchmark reuses immutable content and native programs in place.
    prefix = "inventory-workshop/"
    changed = {"profile.gd", "inventory.gd", "workshop_start.gd", "project.godot", "README.md", "addons/hollow_wake/crafting/bundle.txt", "addons/hollow_wake/crafting/crafting.gd", "addons/hollow_wake/crafting/cargo_cards.gd",
               "addons/hollow_wake/crafting/manifest.json", "addons/hollow_wake/crafting/README.md"}
    directory = pathlib.Path(directory).resolve(strict=True)
    with zipfile.ZipFile(prior) as old, zipfile.ZipFile(release) as new:
        additions = {prefix+"addons/hollow_wake/crafting/"+name for name in ("support_fit.gd","support-fit.txt","support-index.json","support-pages.txt")}
        additions.update(prefix+crafting for crafting in ("addons/hollow_wake/crafting/pouch_recall.gd","addons/hollow_wake/crafting/pouch-rules.txt","addons/hollow_wake/crafting/pouch-data.json"))
        additions.update(prefix+name for name in ("measure_supports.gd","support-measure.json","measure_pouch.gd","recall-measure.json","workshop_start.gd","workshop_start.tscn"))
        assert set(new.namelist()).difference(old.namelist()) <= additions and set(old.namelist()) <= set(new.namelist())
        assert variant in ("previous", "candidate")
        for name in old.namelist():
            assert name.startswith(prefix)
            rel = name.removeprefix(prefix)
            if rel in changed:
                (directory / rel).write_bytes((old if variant == "previous" else new).read(name))
            else:
                assert old.read(name) == new.read(name), "different benchmark inputs: " + rel


if __name__ == "__main__" and sys.argv[1] == "switch":
    switch_programs(*sys.argv[2:])
elif __name__ == "__main__":
    donor, expected, sdk, bundle, project, addon = sys.argv[1:]
    build(pathlib.Path(donor), expected, sdk, pathlib.Path(bundle), project, addon)
