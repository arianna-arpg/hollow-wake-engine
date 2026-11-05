"""Extend a verified Godot addon, or install the verified ZIP in a new project."""
import hashlib
import json
import pathlib
import stat
import sys
import zipfile

PREFIX = "addons/hollow_wake/"
EXTRAS = {
    "ward": ("bundle.txt", "content.json", "ward.gd", "README.md", "manifest.json"),
    "progression": ("bundle.txt", "content.json", "progression.gd", "README.md", "manifest.json"),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def members(archive):
    names = archive.namelist()
    if len(names) != len(set(name.casefold() for name in names)):
        raise ValueError("Duplicate addon member")
    for member in archive.infolist():
        path = pathlib.PurePosixPath(member.filename)
        if (member.orig_filename != member.filename or path.as_posix() != member.filename
                or path.parts[:2] != ("addons", "hollow_wake") or len(path.parts) < 3
                or ":" in member.filename or "\x00" in member.filename
                or ".." in path.parts or "\\" in member.filename or member.is_dir()
                or stat.S_ISLNK(member.external_attr >> 16)):
            raise ValueError(f"Invalid addon member {member.filename!r}")
    return set(names)


def assemble(base, expected_path, extra, output, capability="ward"):
    names = EXTRAS[capability]
    prefix = PREFIX + capability + "/"
    expected = json.loads(expected_path.read_bytes())
    if sha(base.read_bytes()) != expected["archiveSha256"]:
        raise ValueError("Base archive differs from its verification receipt")
    files = {PREFIX + name: digest for name, digest in expected["files"].items()}
    with zipfile.ZipFile(base) as original, zipfile.ZipFile(output, "x") as target:
        if members(original) != set(files) | {PREFIX + "manifest.json"}:
            raise ValueError("Unexpected base addon layout")
        for member in original.infolist():
            data = original.read(member)
            if member.filename in files and sha(data) != files[member.filename]:
                raise ValueError(f"Base member changed: {member.filename}")
            target.writestr(member, data)
        for name in names:
            member = zipfile.ZipInfo(prefix + name)
            member.compress_type = zipfile.ZIP_DEFLATED
            target.writestr(member, (extra / name).read_bytes(), compresslevel=9)
    with zipfile.ZipFile(output) as created, zipfile.ZipFile(base) as original:
        if members(created) != members(original) | {prefix + name for name in names}:
            raise ValueError("Combined archive layout differs")
        for name in original.namelist():
            if created.read(name) != original.read(name):
                raise ValueError(f"Base addon changed: {name}")
        for name in names:
            if created.read(prefix + name) != (extra / name).read_bytes():
                raise ValueError(f"Example member changed: {name}")


def install(archive_path, project):
    project = project.resolve()
    with zipfile.ZipFile(archive_path) as archive:
        for name in sorted(members(archive)):
            target = project.joinpath(*pathlib.PurePosixPath(name).parts).resolve()
            if not target.is_relative_to(project):
                raise ValueError("Addon path escapes the selected project")
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as out:
                out.write(archive.read(name))


if __name__ == "__main__":
    args = [pathlib.Path(p) for p in sys.argv[2:]]
    if sys.argv[1] == "assemble" and len(args) == 4:
        assemble(*args)
    elif sys.argv[1] == "assemble" and len(args) == 5:
        assemble(*args[:4], capability=sys.argv[-1])
    elif sys.argv[1] == "install" and len(args) == 2:
        install(*args)
    else:
        raise ValueError("Use assemble BASE RECEIPT EXTRA OUTPUT or install ZIP PROJECT")
