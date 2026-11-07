"""Preserve the published gameplay tarball when sharing Unity package tooling."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import runpy
import sys
import tarfile
import tempfile

root = Path(__file__).resolve().parents[2]
published, output = map(Path, sys.argv[1:])
accepted = "ea56ce53d14a5c0b669ba1dcc05e96e90ea768994ac682e6ec54c5fd38577c76"
assert hashlib.sha256(published.read_bytes()).hexdigest() == accepted
assert not output.exists()
with tempfile.TemporaryDirectory(prefix="unity-storage-archive-", dir=root / ".artifacts") as temp:
    work = Path(temp)
    stage = work / "package"
    stage.mkdir()
    with tarfile.open(published, "r:gz") as archive:
        for item in archive.getmembers():
            name = PurePosixPath(item.name)
            assert item.isfile() and name.parts[0] == "package" and ".." not in name.parts
            if item.name.endswith(".meta"):
                continue
            target = stage.joinpath(*name.parts[1:])
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.extractfile(item).read())
    repacked = work / "repacked.tgz"
    tool = root / "scripts/unity-package-archive.py"
    runpy.run_path(str(tool))["package"](stage, repacked)
    assert repacked.read_bytes() == published.read_bytes(), "Shared builder changed the accepted archive"
    meta = runpy.run_path(str(tool))["meta"]
    gameplay = meta("Runtime/SlotStore.cs", False, "com.hollowwake.gameplay")
    storage = meta("Runtime/SlotStore.cs", False, "com.hollowwake.storage")
    assert gameplay != storage, "Package GUIDs must not alias"
    receipt = dict(passed=True,archiveSha256=accepted,byteIdentical=True,packageGuidIsolation=True,
                   toolSha256=hashlib.sha256(tool.read_bytes()).hexdigest(),
                   verifierSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt))
