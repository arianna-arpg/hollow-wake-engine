"""Read only named resources from the frozen public gameplay package."""
import gzip, hashlib, json, sys, tarfile
from pathlib import Path

archive, work = map(Path, sys.argv[1:])
assert hashlib.sha256(archive.read_bytes()).hexdigest() == "ea56ce53d14a5c0b669ba1dcc05e96e90ea768994ac682e6ec54c5fd38577c76"
with tarfile.open(archive) as pkg:
    prefix = "package/Runtime/Resources/HollowWake/"
    bodies = {name: pkg.extractfile(prefix + "Workshop" + name + ".bytes").read()
              for name in ("Rules", "Content", "Equipment", "Inspection")}
(work / "bundle.js").write_bytes(bodies["Rules"])
(work / "content.json").write_bytes(bodies["Content"])
root = Path(__file__).resolve().parents[3]
packed = (root / "evidence/unity-workshop/replay.json.gz").read_bytes()
accepted = json.loads((root / "evidence/unity-workshop/acceptance.json").read_text())
assert hashlib.sha256(packed).hexdigest() == accepted["evidence"]["replay.json.gz"]
course = json.loads(gzip.decompress(packed))
configure = [dict(op="configure-inspection", text=bodies["Inspection"].decode()),
             dict(op="configure-equipment", text=bodies["Equipment"].decode())]
requests = "\n".join(json.dumps(command, separators=(",", ":")) for command in configure) + "\n" + course["workshop.requests"]
(work / "requests.jsonl").write_text(requests, encoding="utf-8", newline="\n")
(work / "expected.jsonl").write_text(course["workshop.expected"], encoding="utf-8", newline="\n")
