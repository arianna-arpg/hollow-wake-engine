"""Assemble the Win64 project plugin from the already accepted engine-neutral rules and C ABI."""
import argparse
import hashlib
import json
from pathlib import Path
import stat
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = "HollowWakeGameplay"
ASSETS = ("CombatRules", "CombatContent", "PouchesRules", "PouchesContent")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def files_for_package(unity, editor_binaries=None):
    verified = json.loads((ROOT / "evidence/unity-gameplay/windows.json").read_bytes())["package"]
    if sha(unity.read_bytes()) != verified["sha256"]:
        raise ValueError("Unexpected source package")
    source = ROOT / "adapters/unreal"
    inputs = [source / "HollowWakeGameplay.uplugin", source / "README.md"]
    for pattern in ("*.cpp", "*.h", "*.Build.cs"):
        inputs.extend((source / "Source").rglob(pattern))
    files = {path.relative_to(source).as_posix(): path.read_bytes() for path in inputs}
    with tarfile.open(unity) as pkg:
        for key in ASSETS:
            data = pkg.extractfile(f"package/Runtime/Resources/HollowWake/{key}.bytes").read()
            if sha(data) != verified["hashes"][key]:
                raise ValueError("Unexpected resource: " + key)
            files[f"Resources/SDK/{key}.bin"] = data
        dll = pkg.extractfile("package/Runtime/Native/Windows/hwe_embedded.dll").read()
        if sha(dll) != verified["nativeSha256"]:
            raise ValueError("Unexpected native runtime")
        files["ThirdParty/Win64/hwe_embedded.dll"] = dll
        build = pkg.extractfile("package/Samples~/Casting and Burning/Resources/HollowWakeSample/Magician.json").read()
        files["Resources/SDK/Magician.bin"] = build
        for name in ["LICENSE.md", "NOTICE.md", "Third Party Notices.txt"]:
            files[name] = pkg.extractfile("package/" + name).read()

    private = "Source/HollowWakeGameplay/Private/"
    files[private + "hwe_embedded.h"] = (ROOT / "experiments/embedded-js/native/hwe_embedded.h").read_bytes()
    hashes = {**verified["hashes"], "Magician": sha(build), "Native": sha(dll)}
    declarations = "".join(f'static const TCHAR {name}[] = TEXT("{digest}");\n' for name, digest in hashes.items())
    files[private + "HweDigests.h"] = ("#pragma once\nnamespace HweDigests {\n" + declarations + "}\n").encode()
    if editor_binaries:
        manifest = editor_binaries / "UnrealEditor.modules"
        modules = json.loads(manifest.read_bytes())
        binary = "UnrealEditor-HollowWakeGameplay.dll"
        if modules.get("BuildId") != "19505902" or modules.get("Modules") != {PLUGIN: binary}:
            raise ValueError("Expected the Win64 Unreal 5.0.3 plugin module")
        for path in (manifest, editor_binaries / binary):
            files["Binaries/Win64/" + path.name] = path.read_bytes()
    return files


def archive(files, target):
    with zipfile.ZipFile(target, "x") as out:
        for rel, data in sorted(files.items()):
            info = zipfile.ZipInfo(f"{PLUGIN}/{rel}", (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            out.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("unity", type=Path)
    parser.add_argument("output", type=Path, help="New plugin ZIP")
    parser.add_argument("--editor-binaries", type=Path, help="Win64 editor module built against Unreal 5.0.3")
    args = parser.parse_args()
    archive(files_for_package(args.unity, args.editor_binaries), args.output)
    print(json.dumps({"file": args.output.name, "bytes": args.output.stat().st_size, "sha256": sha(args.output.read_bytes())}))
