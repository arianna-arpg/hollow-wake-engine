"""Measure complete inventory action calls and UI updates in the exported player."""
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
import statistics
import subprocess
import zipfile

ROOT=Path(__file__).resolve().parents[1]


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def measure(args,work):
    proof=json.loads((args.delivery/"verification.json").read_text())
    platform=proof["platform"]
    tools=json.loads(args.tools.read_text())
    for kind in ["workshop","inventory"]:
        file=args.delivery/("hollow-wake-"+kind+"-"+platform+"-x64.zip")
        assert digest(file)==proof["archives"][file.name]
        with zipfile.ZipFile(file) as archive:
            for name in archive.namelist():
                assert name.startswith("inventory-workshop/") and ".." not in PurePosixPath(name).parts
                assert "\\" not in name and ":" not in name
            archive.extractall(work/("project" if kind=="workshop" else "player"))
    project=work/"project/inventory-workshop"
    player=work/"player/inventory-workshop"
    executable=player/("Inventory.exe" if platform=="windows" else "Inventory.x86_64")
    if platform=="linux":executable.chmod(0o755)
    original_profile=(project/"profile.gd").read_text(encoding="utf-8")
    original_inventory=(project/"inventory.gd").read_text(encoding="utf-8")
    wire_file=project/"addons/hollow_wake/crafting/owned_session.gd"
    original_wire=wire_file.read_text(encoding="utf-8")
    addon_files=["bundle.txt","crafting.gd"]
    original_addon={name:(wire_file.parent/name).read_bytes() for name in addon_files}
    candidate=args.candidate.read_text(encoding="utf-8")
    reference=json.loads((ROOT/"evidence/content-tables/windows.json").read_text())
    raw=(ROOT/reference["raw"]["file"]).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==reference["raw"]["sha256"]
    course=json.loads(gzip.decompress(raw))["course"]
    loaded=next(row["expected"]["save"] for row in course["rows"] if len(row["expected"].get("save",{}).get("state",{}).get("items",[]))==128)
    sample=json.loads((project/"cargo-sample.json").read_text(encoding="utf-8"))
    fire=next(item for item in sample if item.get("gem",{}).get("kind")=="skill")
    loaded["state"]["items"][127]={**fire,**{axis:loaded["state"]["items"][127][axis] for axis in ["x","y"]}}
    loaded["nextUid"]=max(loaded["nextUid"],fire["uid"]+1)
    (project/"benchmark-loaded.json").write_text(json.dumps(loaded),encoding="utf-8")
    shutil.copyfile(ROOT/"test/godot-inventory/profile-performance.gd",project/"profile-performance.gd")
    (project/"profile-performance.tscn").write_text('[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://profile-performance.gd" id="1"]\n[node name="Measure" type="Node"]\nscript=ExtResource("1")\n')
    config=project/"project.godot"
    text=config.read_text()
    assert text.count('run/main_scene="res://workshop_start.tscn"')==1
    config.write_text(text.replace('run/main_scene="res://workshop_start.tscn"','run/main_scene="res://profile-performance.tscn"'))
    scene=project/"inventory.tscn"
    scene.write_text(scene.read_text().replace('path="res://inventory.gd"','path="res://measured_inventory.gd"'))
    (project/"measured_inventory.gd").write_text('''extends "res://inventory.gd"
var measuring:=false
var slices:Array=[]
var render_us:=0
var finished_us:=0
func render(first:=false)->void:
 var before:=Time.get_ticks_usec()
 super.render(first)
 if measuring:render_us+=Time.get_ticks_usec()-before
func _process(delta:float)->void:
 var pending:bool=profile.is_saving()
 var before:=Time.get_ticks_usec()
 super._process(delta)
 if measuring and pending:
  slices.append(Time.get_ticks_usec()-before)
  if not profile.is_saving():finished_us=Time.get_ticks_usec()
''')
    (project/"measured_crafting.gd").write_text('''extends "res://addons/hollow_wake/crafting/crafting.gd"
var times:Dictionary={}
func request(command:Dictionary)->Dictionary:
 var before:=Time.get_ticks_usec()
 var reply:=super.request(command)
 var key:String=command.get("op","unknown")
 times[key]=int(times.get(key,0))+Time.get_ticks_usec()-before
 return reply
func to_portable_json(value:Variant)->Dictionary:
 var before:=Time.get_ticks_usec()
 var reply:=super.to_portable_json(value)
 times["format"]=int(times.get("format",0))+Time.get_ticks_usec()-before
 return reply
func from_portable_json(value:String)->Dictionary:
 var before:=Time.get_ticks_usec()
 var reply:=super.from_portable_json(value)
 times["parse"]=int(times.get("parse",0))+Time.get_ticks_usec()-before
 return reply
''')
    import_settings=work/"import-settings"
    import_settings.mkdir()

    def environment(settings):
        return dict(os.environ,APPDATA=str(settings),LOCALAPPDATA=str(settings),HOME=str(settings),
                    XDG_CONFIG_HOME=str(settings),XDG_DATA_HOME=str(settings),XDG_CACHE_HOME=str(settings),
                    TEMP=str(settings),TMP=str(settings),TMPDIR=str(settings),HWE_PROFILE_PAIRS=str(args.pairs))

    def launch(exe,arguments,settings):
        result=subprocess.run([exe,"--headless",*arguments],cwd=project,env=environment(settings),
                              stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
                              encoding="utf-8",errors="replace",timeout=240,
                              creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        errors=[line for line in result.stdout.splitlines() if ("ERROR:" in line or "ObjectDB instances leaked" in line)
                and "Failed to read the root certificate store." not in line]
        assert result.returncode==0 and not errors,result.stdout[-5000:]
        return result.stdout

    runs=[]
    saves={}
    variants=["synchronous","baseline","candidate","control","control","candidate","baseline","synchronous"]
    for index,variant in enumerate(variants):
        print("Measuring",variant,index,flush=True)
        for name in addon_files:
            (wire_file.parent/name).write_bytes((args.candidate_addon/name).read_bytes() if variant=="candidate" and args.candidate_addon else original_addon[name])
        profile=candidate if variant=="candidate" else original_profile
        anchor='preload("res://addons/hollow_wake/crafting/crafting.gd")'
        assert profile.count(anchor)==1
        (project/"profile.gd").write_text(profile.replace(anchor,'preload("res://measured_crafting.gd")'),encoding="utf-8")
        wire=args.candidate_wire.read_text(encoding="utf-8") if variant=="candidate" and args.candidate_wire else original_wire
        wire=instrument_wire(wire)
        wire_file.write_text(wire,encoding="utf-8")
        inventory=original_inventory
        if variant=="synchronous":
            call='profile.begin_action(action,uid,revision,slot,row.gem.skillId if row != null else "")'
            assert inventory.count(call)==1
            inventory=inventory.replace(call,call.replace("begin_action","act"))
        (project/"inventory.gd").write_text(inventory,encoding="utf-8")
        if args.direct_registration:
            cache=project/".godot"
            cache.mkdir(exist_ok=True)
            (cache/"extension_list.cfg").write_text("".join("res://"+file.relative_to(project).as_posix()+"\n" for file in sorted(project.rglob("*.gdextension"))))
        else:
            launch(tools["editor"],["--editor","--import","--frame-delay","1000","--path",project],import_settings)
        launch(tools["editor"],["--path",project,"--export-pack","Windows Desktop" if platform=="windows" else "Linux",player/"Inventory.pck"],import_settings)
        settings=work/("run-"+str(index))
        settings.mkdir()
        output=launch(executable,[],settings)
        marker="HWE_PROFILE_MEASURE "
        observed=json.loads(next(line[len(marker):] for line in output.splitlines() if line.startswith(marker)))
        for size in ["small","loaded"]:
            row=observed[size]
            assert len(row["rows"])==(args.pairs-2)*2 and len(row["warmup"])==4
            expected="snapshot-view" if "api.snapshot_view(1)" in profile else "parse" if "api.from_portable_json(source_json.text)" in profile else "save"
            assert all(expected in sample["apiUs"] and "snapshot-text" in sample["apiUs"] for sample in row["rows"])
            database=Path(row["database"])
            assert database.resolve().is_relative_to(settings.resolve())
            with closing(sqlite3.connect(database)) as db:
                assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
                revision,body,stash=db.execute("SELECT revision,crafting,stash FROM slots WHERE slot=1").fetchone()
                assert revision==row["revision"] and hashlib.sha256(body.encode()).hexdigest()==row["saveSha256"]
                saved=json.loads(body)
                assert saved["nextUid"]==row["uid"]+1 and json.loads(stash)==[]
                assert len(saved["state"]["items"])==(128 if size=="loaded" else 4)
                value=(revision,body,stash)
                assert saves.setdefault(size,value)==value,"durable outcome changed: "+variant+"/"+size
        runs.append(dict(variant=variant,packSha256=digest(player/"Inventory.pck"),**observed))
    summaries={}
    for variant in ["synchronous","baseline","control","candidate"]:
        summaries[variant]={}
        for size in ["small","loaded"]:
            rows=[row for run in runs if run["variant"]==variant for row in run[size]["rows"]]
            summaries[variant][size]={key:dict(median=statistics.median(row[key] for row in rows),maximum=max(row[key] for row in rows))
                                      for key in ["mainUs","maxBlockingUs","completionUs","storageCallUs","renderUs"]}
            summaries[variant][size]["apiUs"]={key:statistics.median(row["apiUs"][key] for row in rows if key in row["apiUs"]) for key in
                                                sorted(set(key for row in rows for key in row["apiUs"]))}
            summaries[variant][size]["wireUs"]={key:statistics.median(row["wireUs"][key] for row in rows if key in row["wireUs"]) for key in
                                                sorted(set(key for row in rows for key in row["wireUs"]))}
    return dict(passed=True,platform=platform,pairs=args.pairs,editorImport=not args.direct_registration,scope="Exported headless player; action calls, serialization, save polling and UI methods. GPU rendering excluded; nested timings must not be added. API/phase medians include only actions calling that operation.",
                archiveSha256=proof["archives"]["hollow-wake-workshop-"+platform+"-x64.zip"],
                sourceHashes={name:digest(ROOT/name) for name in ["scripts/measure-profile-saves.py","test/godot-inventory/profile-performance.gd"]},
                candidateSha256=digest(args.candidate),candidateWireSha256=digest(args.candidate_wire) if args.candidate_wire else None,
                candidateAddonHashes={name:digest(args.candidate_addon/name) for name in addon_files} if args.candidate_addon else None,
                summaries=summaries,runs=runs)


def instrument_wire(source):
    edits=[
        ('func _exchange(mode: String, payload: Variant) -> Dictionary:',
         'var wire_times:Dictionary={}\nfunc _record_wire(key:String,before:int)->void:\n\twire_times[key]=int(wire_times.get(key,0))+Time.get_ticks_usec()-before\n\nfunc _exchange(mode: String, payload: Variant) -> Dictionary:\n\tvar probe_key:String=String(payload.get("op","unknown")) if mode=="command" else mode\n\tvar probe_time:=Time.get_ticks_usec()'),
        ('\tvar reply := _host.submit_json(encoded)',
         '\t_record_wire(probe_key+"/encode",probe_time)\n\tprobe_time=Time.get_ticks_usec()\n\tvar reply := _host.submit_json(encoded)\n\t_record_wire(probe_key+"/native",probe_time)'),
        ('\tvar result: Variant = JSON.parse_string(reply.response)',
         '\tprobe_time=Time.get_ticks_usec()\n\tvar result: Variant = JSON.parse_string(reply.response)\n\t_record_wire(probe_key+"/json",probe_time)'),
        ('\t\tvar decoded: Variant = _wire(result, false, budget)',
         '\t\tprobe_time=Time.get_ticks_usec()\n\t\tvar decoded: Variant = _wire(result, false, budget)\n\t\t_record_wire(probe_key+"/decode",probe_time)')
    ]
    for before,after in edits:
        assert source.count(before)==1,before
        source=source.replace(before,after)
    return source


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ["tools","delivery","candidate","scratch","output"]:parser.add_argument(name,type=Path)
    parser.add_argument("--pairs",type=int,default=18,choices=range(3,19))
    parser.add_argument("--candidate-wire",type=Path)
    parser.add_argument("--candidate-addon",type=Path)
    parser.add_argument("--direct-registration",action="store_true")
    args=parser.parse_args()
    assert __debug__ and not args.output.exists()
    with runpy.run_path(str(ROOT/"scripts/verify-background-workshop.py"))["working_directory"](args.scratch) as work:
        report=measure(args,work.resolve())
    args.output.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"passed":True,"summaries":report["summaries"]}))
