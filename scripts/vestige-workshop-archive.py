"""Refresh the project, add-on, or playable ZIP from a verified previous workshop."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "inventory-workshop/"
ADDON = "addons/hollow_wake/"
CRAFT = ADDON + "crafting/"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def replace(prior, checksum, output, changes, addon=None, extras=None):
    assert sha(Path(prior).read_bytes()) == checksum
    with zipfile.ZipFile(prior) as source:
        names = source.namelist()
        assert len(names) == len(set(names)) and set(PREFIX+n for n in changes) <= set(names)
        with zipfile.ZipFile(output, "x") as dest:
            for rel,data in (extras or {}).items():
                assert PREFIX+rel not in names
                info=zipfile.ZipInfo(PREFIX+rel)
                info.create_system=3
                info.external_attr=(stat.S_IFREG|0o644)<<16
                dest.writestr(info,data,compress_type=zipfile.ZIP_DEFLATED,compresslevel=6)
            for member in source.infolist():
                name = member.filename
                assert name.startswith(PREFIX) and ".." not in PurePosixPath(name).parts
                assert ":" not in name and "\\" not in name and not stat.S_ISLNK(member.external_attr >> 16)
                rel = name[len(PREFIX):]
                data = changes[rel] if rel in changes else source.read(name)
                dest.writestr(member, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
                if addon is not None and rel.startswith(ADDON):
                    info = zipfile.ZipInfo(rel, member.date_time)
                    info.create_system, info.external_attr = member.create_system, member.external_attr
                    addon.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)


if __name__ == "__main__":
    mode, prior, checksum, output, *rest = sys.argv[1:]
    if mode == "project":
        extension, bundle, sdk = rest
        changes = {n:(ROOT/"examples/godot-inventory"/n).read_bytes() for n in ("profile.gd","inventory.gd","workshop_start.gd","README.md")}
        changes.update({CRAFT+n:(ROOT/"adapters/godot/crafting"/n).read_bytes() for n in ("crafting.gd","README.md")})
        changes[CRAFT+"bundle.txt"] = Path(bundle).read_bytes()
        assert sha(Path(prior).read_bytes()) == checksum
        with zipfile.ZipFile(prior) as source:
            manifest = json.loads(source.read(PREFIX+CRAFT+"manifest.json"))
            for n,digest in manifest["files"].items():
                assert sha(source.read(PREFIX+CRAFT+n)) == digest
                if CRAFT+n in changes:
                    manifest["files"][n] = sha(changes[CRAFT+n])
        manifest.update(sdkArchiveSha256=sdk)
        manifest["optional"] += ["crafting-session/v3","vestige-inlays/v1"]
        changes[CRAFT+"manifest.json"] = (json.dumps(manifest,indent=2)+"\n").encode()
        with zipfile.ZipFile(extension,"x") as addon:
            extra={n:(ROOT/"examples/godot-inventory"/n).read_bytes() for n in ("measure_inlays.gd","verify_inlays.gd")}
            replace(prior,checksum,output,changes,addon,extra)
    elif mode == "player":
        replace(prior,checksum,output,{"Inventory.pck":Path(rest[0]).read_bytes(),
            "README.md":(ROOT/"examples/godot-inventory/README.md").read_bytes()})
    else:
        raise ValueError("Unknown archive format")
