import pathlib
import runpy
import sys
import zipfile


if __name__ == "__main__":
    mode, first, second = sys.argv[1:]
    if mode == "assets":
        stage = pathlib.Path(second)
        with zipfile.ZipFile(first) as source:
            for name, target in {
                "HollowWake.Pouches/hwe_embedded.dll": "Runtime/Native/Windows/hwe_embedded.dll",
                "HollowWake.Pouches/pouch-data.json": "Runtime/Resources/HollowWake/PouchesContent.bytes",
                "LICENSE.md": "LICENSE.md", "NOTICE.md": "NOTICE.md", "quickjs-source-notices.txt": "Third Party Notices.txt",
            }.items():
                path = stage / target
                path.parent.mkdir(exist_ok=True, parents=True)
                path.write_bytes(source.read(name))
    elif mode == "workshop-assets":
        stage = pathlib.Path(second) / "Runtime/Resources/HollowWake"
        with zipfile.ZipFile(first) as source:
            for asset, name in {"WorkshopContent": "content.json", "WorkshopInspection": "inspection.json",
                                "WorkshopEquipment": "equipment.json"}.items():
                (stage / (asset + ".bytes")).write_bytes(source.read("addons/hollow_wake/crafting/" + name))
            (stage / "ProgressionContent.bytes").write_bytes(source.read("addons/hollow_wake/progression/content.json"))
    elif mode == "pack":
        runpy.run_path(str(pathlib.Path(__file__).with_name("unity-package-archive.py")))["package"](pathlib.Path(first), pathlib.Path(second))
    else:
        raise ValueError(mode)
