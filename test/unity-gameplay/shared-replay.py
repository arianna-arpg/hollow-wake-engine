"""Preserve Unreal's combat/pouch verifier while Unity requires workshop evidence."""
import gzip
import hashlib
import json
from pathlib import Path
import runpy
import tempfile

ROOT = Path(__file__).resolve().parents[2]
unity = runpy.run_path(str(ROOT / "scripts/verify-unity-gameplay.py"))
unreal = runpy.run_path(str(ROOT / "scripts/verify-unreal-gameplay.py"))
evidence = ROOT / "evidence/unity-workshop"
packed = (evidence / "replay.json.gz").read_bytes()
assert hashlib.sha256(packed).hexdigest() == json.loads((evidence / "acceptance.json").read_text())["evidence"]["replay.json.gz"]
course = json.loads(gzip.decompress(packed))
metrics = json.loads((evidence / "windows.json").read_text())["editor"]
with tempfile.TemporaryDirectory(prefix="shared-replay-", dir=ROOT / ".artifacts") as folder:
    work = Path(folder)
    for name, body in course.items():
        assert Path(name).name == name
        (work / name).write_text(body, encoding="utf-8", newline="\n")
    (work / "editor.json").write_text(json.dumps(metrics), encoding="utf-8")
    unity["check_stage"](work, "editor", metrics["run"])
    unreal["COMPARE"](work, "editor")
    (work / "editor-workshop.replies").unlink()
    unreal["COMPARE"](work, "editor")
    try:
        unity["check_stage"](work, "editor", metrics["run"])
    except FileNotFoundError:
        pass
    else:
        raise AssertionError("Unity accepted absent workshop evidence")
    replies = course["editor-workshop.replies"].splitlines()
    replies[0] = '{"ok":false,"reason":"deliberately changed reply"}'
    (work / "editor-workshop.replies").write_text("\n".join(replies), encoding="utf-8")
    try:
        unity["check_stage"](work, "editor", metrics["run"])
    except AssertionError:
        pass
    else:
        raise AssertionError("Unity accepted a changed workshop reply")
print(json.dumps(dict(passed=True, unrealCombatPouchesPreserved=True, unityRequiresWorkshop=True,
                      changedWorkshopReplyRejected=True, temporaryCourseRemoved=True)))
