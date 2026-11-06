"""Create a self-contained Linux measurement kit from a verified Platform run."""
import argparse
import gzip
import io
import json
import os
import tarfile
import tempfile
import zipfile
from pathlib import Path
import hashlib


def sha(data):
    if isinstance(data, Path):
        result = hashlib.sha256()
        with data.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                result.update(block)
        return result.hexdigest()
    return hashlib.sha256(data).hexdigest()


def check(ok, reason):
    if not ok:
        raise ValueError(reason)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--bundle", required=True, type=Path)
    cli.add_argument("--platform-proof", required=True, type=Path)
    cli.add_argument("--out", required=True, type=Path)
    args = cli.parse_args()
    root = Path(__file__).resolve().parents[1]
    bundle = args.bundle.resolve(strict=True)
    sdk_bytes = (bundle / "sdk.json").read_bytes()
    sdk = json.loads(sdk_bytes)
    platform_bytes = args.platform_proof.read_bytes()
    proof = json.loads(platform_bytes)
    check(sdk["passed"] and proof["passed"] and proof["sdkProofSha256"] == sha(sdk_bytes), "unmatched acceptance")
    check(sdk["archive"] == "hollow-wake-godot-crafting-progression-linux-x64.zip", "unexpected addon")
    archive = bundle / sdk["archive"]
    check(sha(archive) == sdk["archiveSha256"] == proof["archiveSha256"], "changed addon")
    notices = (bundle / "godot-notices.json").read_bytes()
    notice_data = json.loads(notices)
    engine = json.loads((root / "experiments/godot-native/toolchain-lock.json").read_bytes())
    check(notice_data["commit"][:9] == engine["godotVersionOutput"].rsplit(".", 1)[1], "engine build mismatch")
    check("Godot Engine contributors" in notice_data["engine"] and notice_data["licenses"] and notice_data["components"],
          "incomplete engine notices")
    entries = {"sdk.json": sdk_bytes, "platform.json": platform_bytes, "notices/Godot.json": notices,
               "measure.py": (root / "scripts/measure-steamrt-device.py").read_bytes(),
               "README.md": (root / "docs/steamrt-device-run.md").read_bytes()}
    with zipfile.ZipFile(archive) as addon:
        for file in ("Hollow-Wake-LICENSE.md", "Hollow-Wake-NOTICE.md", "godot-cpp-LICENSE.md", "quickjs-source-notices.txt"):
            entries["notices/" + file] = addon.read("addons/hollow_wake/notices/" + file)
    for name in ("crafting", "progression"):
        inventory = sdk["exports"][name]["files"]
        check(inventory == proof["replays"][name]["exportedFiles"], "changed export inventory")
        check(set(inventory) == {name + ".x86_64", name + ".pck", "libhwe_godot.so", "libhwe_embedded.so"}, "unexpected export layout")
        for file, digest in inventory.items():
            source = bundle / name / file
            check(source.is_file() and not source.is_symlink() and sha(source) == digest, "changed game file " + file)
            entries[name + "/" + file] = source
    # Identical engine executables and libraries are hard links inside the kit.
    # Both extracted game layouts retain the bytes and paths tested in Platform.
    with tempfile.TemporaryDirectory(dir=args.out.parent, prefix=".hwe-kit-") as temporary:
        staged = Path(temporary) / "kit.tar.gz"
        with staged.open("xb") as handle, gzip.GzipFile(filename="", mode="wb", fileobj=handle, mtime=0) as compressed, \
                tarfile.open(fileobj=compressed, mode="w|", format=tarfile.GNU_FORMAT) as kit:
            shared = {}
            for file, data in sorted(entries.items()):
                member = tarfile.TarInfo("hollow-wake-device/" + file)
                member.mode = 0o755 if file.endswith((".x86_64", ".so")) else 0o644
                key = (sha(data), member.mode)
                if key in shared:
                    member.type = tarfile.LNKTYPE
                    member.linkname = shared[key]
                    kit.addfile(member)
                else:
                    member.size = data.stat().st_size if isinstance(data, Path) else len(data)
                    with (data.open("rb") if isinstance(data, Path) else io.BytesIO(data)) as source:
                        kit.addfile(member, source)
                    shared[key] = member.name
        # Publish only a complete archive and preserve an existing destination.
        os.link(staged, args.out)
    print(args.out)


if __name__ == "__main__":
    main()
