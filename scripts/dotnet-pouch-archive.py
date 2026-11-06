import pathlib
import stat
import sys
import zipfile


def copy_assets(addon, stage):
    prefix = "addons/hollow_wake/"
    with zipfile.ZipFile(addon) as source:
        assert len(source.namelist()) == len(set(source.namelist()))
        for rel, destination in {
            "bin/hwe_embedded.dll": "HollowWake.Pouches/hwe_embedded.dll",
            "crafting/pouch-data.json": "HollowWake.Pouches/pouch-data.json",
            "notices/Hollow-Wake-LICENSE.md": "LICENSE.md",
            "notices/Hollow-Wake-NOTICE.md": "NOTICE.md",
            "notices/quickjs-source-notices.txt": "quickjs-source-notices.txt",
        }.items():
            (stage / destination).write_bytes(source.read(prefix + rel))


def package(stage, archive):
    with zipfile.ZipFile(archive, "x") as output:
        for file in sorted(stage.rglob("*")):
            assert not file.is_symlink()
            if file.is_file():
                entry = zipfile.ZipInfo(file.relative_to(stage).as_posix())
                entry.create_system = 3
                entry.external_attr = (stat.S_IFREG | 0o644) << 16
                output.writestr(entry, file.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)


if __name__ == "__main__":
    mode, first, second = sys.argv[1:]
    if mode == "assets":
        copy_assets(pathlib.Path(first), pathlib.Path(second))
    elif mode == "pack":
        package(pathlib.Path(first), pathlib.Path(second))
    else:
        raise ValueError(mode)
