import pathlib
import runpy
import stat
import sys
import tempfile
import zipfile

helpers = runpy.run_path(str(pathlib.Path(__file__).with_name("combat-inventory-archive.py")))
pathlib.Path(sys.argv[1]).mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="m6-archive-owned-", dir=sys.argv[1]) as temporary:
    root = pathlib.Path(temporary)
    for label, entries in {
        "path-escape": [("../escaped.txt", stat.S_IFREG)],
        "absolute-path": [("/escaped.txt", stat.S_IFREG)],
        "case-collision": [("File.txt", stat.S_IFREG), ("file.txt", stat.S_IFREG)],
        "symlink": [("link", stat.S_IFLNK)],
    }.items():
        archive = root / (label + ".zip")
        with zipfile.ZipFile(archive, "w") as output:
            for name, kind in entries:
                row = zipfile.ZipInfo(name)
                row.create_system = 3
                row.external_attr = (kind | 0o644) << 16
                output.writestr(row, b"probe")
        target = root / label
        try:
            helpers["extract"](archive, target)
        except AssertionError:
            pass
        else:
            raise AssertionError("Accepted " + label)
        assert not target.exists(), "Invalid archive created output"
    assert not (root.parent / "escaped.txt").exists()
print('{"passed":true,"archiveControls":4,"cleaned":true}')
