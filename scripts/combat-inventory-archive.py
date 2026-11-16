"""Deterministic release ZIPs and bounded extraction for owned verification folders."""
import pathlib
import re
import stat
import sys
import zipfile


def safe_names(names):
    assert len(names) <= 500 and len({n.casefold() for n in names}) == len(names)
    for name in names:
        assert re.fullmatch(r"[A-Za-z0-9_./-]+", name), name
        assert not name.startswith("/") and all(p not in ("", ".", "..") for p in name.split("/")), name


def pack(source, destination):
    assert source.is_dir() and not destination.exists()
    # Path ordering is case-insensitive on Windows and case-sensitive on POSIX.
    # Sort archive names as strings so both builders emit the same member order.
    files = sorted((p for p in source.rglob("*") if p.is_file()), key=lambda p: p.relative_to(source).as_posix())
    assert not any(p.is_symlink() for p in source.rglob("*"))
    names = [p.relative_to(source).as_posix() for p in files]
    safe_names(names)
    with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, file in zip(names, files):
            row = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            row.create_system = 3
            row.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(row, file.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def extract(source, destination):
    assert not destination.exists(), "Choose a new extraction directory"
    with zipfile.ZipFile(source) as archive:
        rows = archive.infolist()
        safe_names([r.filename for r in rows])
        assert sum(r.file_size for r in rows) <= 128 * 1024 * 1024
        assert all(not r.is_dir() and stat.S_ISREG(r.external_attr >> 16) for r in rows)
        destination.mkdir()
        base = destination.resolve()
        for row in rows:
            target = base / row.filename
            assert target.resolve().is_relative_to(base)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(row))


if __name__ == "__main__":
    mode, first, second = sys.argv[1:]
    assert mode in ("pack", "extract")
    (pack if mode == "pack" else extract)(pathlib.Path(first), pathlib.Path(second))
