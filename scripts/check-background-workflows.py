"""Run the existing rack, support and recall courses against the delivered project."""
import argparse
from contextlib import closing
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import runpy
import shutil
import sqlite3
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def check(args, work):
    proof = json.loads((args.delivery/"verification.json").read_text())
    archive = runpy.run_path(str(ROOT/"scripts/verify-background-workshop.py"))["delivered_project"](args.delivery,proof)
    with zipfile.ZipFile(archive) as source:
        for entry in source.namelist():
            assert entry.startswith("inventory-workshop/") and ".." not in PurePosixPath(entry).parts
            assert "\\" not in entry and ":" not in entry
        source.extractall(work)
    project = work/"inventory-workshop"
    reference = json.loads((ROOT/"evidence/content-tables/windows.json").read_text())
    packed = (ROOT/reference["raw"]["file"]).read_bytes()
    assert hashlib.sha256(packed).hexdigest() == reference["raw"]["sha256"]
    course = json.loads(gzip.decompress(packed))["course"]
    gear_bytes = gzip.decompress((ROOT/"baseline/loadout-cards/observations.json.gz").read_bytes())
    assert hashlib.sha256(gear_bytes).hexdigest() == json.loads((ROOT/"baseline/loadout-cards/acceptance.json").read_text())["sha256"]
    gear = [row for row in json.loads(gear_bytes) if row.get("expected")]
    (project/"gear-cases.json").write_text(json.dumps([row["input"] for row in gear]))
    (project/"legacy-course.txt").write_text("".join(json.dumps(row[key])+"\n" for row in course["rows"] for key in ["request","expected"]))
    support = json.loads((ROOT/"evidence/workshop-supports/native-cases.json").read_text())
    (project/"support-cases.json").write_text(json.dumps(support))
    oracle = json.loads(gzip.decompress((ROOT/"baseline/pouch-recall/observations.json.gz").read_bytes()))
    pouch = json.loads((project/"addons/hollow_wake/crafting/pouch-data.json").read_text(encoding="utf-8"))
    (project/"pouch-control.txt").write_text(json.dumps({**pouch, "content":json.loads(pouch["content"])}))
    for row in oracle["actions"]:
        if row["mode"] == "threshold":
            row["beforeLedger"] = {oracle["defs"]["rules"]["dropPrefix"]+"firebolt":oracle["defs"]["rules"]["threshold"]-1}
    (project/"pouch-cases.json").write_text(json.dumps(oracle["actions"]))
    for src, target in [("workshop-rack.gd","rack-test.gd"),("workshop-supports.gd","socket-test.gd")]:
        shutil.copyfile(ROOT/"test/godot-inventory"/src,project/target)
    if args.profile_views:
        shutil.copyfile(ROOT/"test/godot-inventory/profile-views.gd",project/"profile-views.gd")
    (project/"socket-test.tscn").write_text('[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://socket-test.gd" id="1"]\n[node name="Sockets" type="Node"]\nscript = ExtResource("1")\n')
    settings=work/"settings"
    settings.mkdir()
    env=dict(os.environ, APPDATA=str(settings), LOCALAPPDATA=str(settings), HOME=str(settings),
             XDG_CONFIG_HOME=str(settings), XDG_DATA_HOME=str(settings), XDG_CACHE_HOME=str(settings),
             TEMP=str(settings), TMP=str(settings), TMPDIR=str(settings))

    def launch(extra, marker=None, expected_failure=None):
        try:
            result=subprocess.run([args.editor,"--headless","--path",project,*extra],cwd=project,env=env,
                                  stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
                                  encoding="utf-8",errors="replace",timeout=120,
                                  creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        except subprocess.TimeoutExpired as error:
            output=error.stdout or b""
            if isinstance(output,bytes): output=output.decode("utf-8",errors="replace")
            raise AssertionError("Godot process timed out; captured output:\n"+output) from error
        errors=[line for line in result.stdout.splitlines() if ("ERROR:" in line or "ObjectDB instances leaked" in line)
                and "Failed to read the root certificate store." not in line]
        if expected_failure:
            assert result.returncode==1 and not errors and "HWE_VIEW_FAILED "+expected_failure in result.stdout,result.stdout[-5000:]
            return dict(sha256=hashlib.sha256(result.stdout.encode()).hexdigest(),output=result.stdout)
        assert result.returncode==0 and not errors,result.stdout
        if marker:
            return json.loads(next(line[len(marker):] for line in result.stdout.splitlines() if line.startswith(marker)))
        return result.stdout

    imported = None
    if args.direct_registration:
        (project/".godot").mkdir()
        (project/".godot/extension_list.cfg").write_text("".join("res://"+file.relative_to(project).as_posix()+"\n" for file in sorted(project.rglob("*.gdextension"))))
    else:
        imported=runpy.run_path(str(ROOT/"scripts/verify-background-workshop.py"))["cold_import"](
            project,lambda:launch(["--editor","--import","--frame-delay","1000"]))
    rack=launch(["--script","res://rack-test.gd","--","--cargo-sample"],"HWE_RACK ")
    folder=Path(rack["db"]).parent
    assert folder.resolve().is_relative_to(settings.resolve())
    observed=[json.loads(line) for line in (folder/"rack-replies.jsonl").read_text(encoding="utf-8").splitlines()]
    assert observed==[row["expected"] for row in course["rows"]]
    cards=[json.loads(line) for line in (folder/"gear-replies.jsonl").read_text(encoding="utf-8").splitlines()]
    assert len(cards)==len(gear)
    for card,row in zip(cards,gear):
        expected=row["expected"]
        assert card["targets"]==expected["targets"]
        assert '<span style="color:'+card["color"]+'">'+card["title"]+'</span>'==expected["title"]
        assert '<span style="color:'+("#6fc06f" if card["levelMet"] else "#d05050")+'">'+card["requirement"]+'</span> · '+card["rarityLabel"]==expected["fullMeta"]
    sockets=launch(["res://socket-test.tscn","--","--cargo-sample"],"HWE_SUPPORT ")
    assert sockets["cases"]==len(support) and sockets["pouch"]["cases"]==15
    views=launch(["--script","res://profile-views.gd"],"HWE_VIEW_OK ") if args.profile_views else None
    if views:
        wrapper=project/"addons/hollow_wake/crafting/crafting.gd"
        original=wrapper.read_bytes()
        faults=[
            ("mutable-view",[("\t_freeze_view(reply.view)","\tpass")],"complete readonly view with exact numbers"),
            ("lose-retained-account",[("reply.view.state.account=_view_account","reply.view.state.account={}")],"unchanged account shared"),
            ("reuse-VM-cursor",[("if status == 0: _clear_view()","if status == 0: pass"),("\t\t_clear_view()","\t\tpass")],"colliding token across VM lifetimes refreshed")
        ]
        detected=[]
        try:
            for label,edits,expected in faults:
                changed=original.decode("utf-8")
                for before,after in edits:
                    assert changed.count(before)==1,label
                    changed=changed.replace(before,after)
                wrapper.write_text(changed,encoding="utf-8")
                log=launch(["--script","res://profile-views.gd"],expected_failure=expected)
                detected.append(dict(name=label,assertion=expected,logSha256=log["sha256"],output=log["output"]))
        finally:
            wrapper.write_bytes(original)
        restored=launch(["--script","res://profile-views.gd"],"HWE_VIEW_OK ")
        assert restored["assertions"]==views["assertions"] and wrapper.read_bytes()==original
        views["faults"]=detected
        views["restoredAssertions"]=restored["assertions"]
        views["probeSha256"]=hashlib.sha256((ROOT/"test/godot-inventory/profile-views.gd").read_bytes()).hexdigest()
    hashes={}
    for name in ["inventory-cargo-sample.sqlite3","inventory-support-sample.sqlite3","recall-course.sqlite3"]:
        with closing(sqlite3.connect(folder/name)) as db:
            assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
            revision,body,stash=db.execute("SELECT revision,crafting,stash FROM slots WHERE slot=1").fetchone()
            assert json.loads(stash)==[]
            saved=json.loads(body)
            if name=="recall-course.sqlite3":
                assert revision==4 and saved[0]=="inventory-workshop/recall-v1"
                assert saved[2]["content"]==pouch["id"] and saved[2]["seatLedger"][oracle["defs"]["rules"]["lesson"]]==1
                assert saved[1]["state"]["account"]["ledger"][oracle["defs"]["rules"]["total"]]==2
                assert all(item["baseId"]!="preformed_memory" for item in saved[1]["state"]["items"])
                assert [[i["x"],i["y"]] for i in saved[1]["state"]["items"][-2:]]==[[1,0],[0,0]]
            else:
                receipt=rack if name=="inventory-cargo-sample.sqlite3" else sockets
                assert revision==receipt["revision"] and saved["nextUid"]==receipt["nextUid"]
                assert len(saved["state"]["rack"])==8 and all(i is None for i in saved["state"]["rack"])
                if receipt is sockets:
                    assert len(saved["state"]["items"])==4 and saved["state"]["overflow"]==[]
                    loose=[i for i in saved["state"]["items"] if i.get("gem",{}).get("kind")=="support"]
                    assert len(loose)==1 and loose[0]["locked"] and loose[0]["uid"]==sockets["uid"]
                    assert loose[0]["gem"]==dict(kind="support",supportId="teeming_vein",level=2,rolled=dict(trigger="chance",brood="grubs",clutch="brood4"))
            hashes[name]=hashlib.sha256(body.encode()).hexdigest()
    return dict(passed=True,platform=proof["platform"],archiveSha256=proof["archives"][archive.name],
                editorImport=not args.direct_registration,coldImport=imported,legacyCommands=len(observed),gearCards=len(cards),rack=rack,supports=sockets,saveHashes=hashes,profileViews=views)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("editor")
    for name in ["delivery","scratch","output"]:parser.add_argument(name,type=Path)
    parser.add_argument("--direct-registration",action="store_true")
    parser.add_argument("--profile-views",action="store_true")
    args=parser.parse_args()
    assert __debug__ and not args.output.exists()
    with runpy.run_path(str(ROOT/"scripts/verify-background-workshop.py"))["working_directory"](args.scratch) as work:
        result=check(args,work.resolve())
    args.output.write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps({"passed":True,"output":str(args.output)}))
