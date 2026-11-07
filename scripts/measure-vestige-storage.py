"""Compare DELETE and WAL on fresh, local disposable files through the same Godot inventory action."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import statistics
import subprocess
import tempfile
import threading
import time
import zipfile


def read_slot(file,mode):
    with closing(sqlite3.connect(file)) as db:
        assert db.execute("PRAGMA journal_mode").fetchone()[0] == mode
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        revision,body,stash=db.execute("SELECT revision,crafting,stash FROM slots WHERE slot=1").fetchone()
        save=json.loads(body)
        assert save["schemaVersion"]==3 and json.loads(stash)==[]
        return revision,save,hashlib.sha256(body.encode()).hexdigest()


def measure(args,work):
    assert hashlib.sha256(args.project_zip.read_bytes()).hexdigest()==args.zip_sha256
    with zipfile.ZipFile(args.project_zip) as z:
        for member in z.namelist():
            assert member.startswith("inventory-workshop/") and ".." not in Path(member).parts
        z.extractall(work)
    project=work/"inventory-workshop"
    config=work/"appdata"
    config.mkdir()
    env=dict(os.environ,HOME=str(config),APPDATA=str(config),LOCALAPPDATA=str(config),
             XDG_CONFIG_HOME=str(config),XDG_CACHE_HOME=str(config),XDG_DATA_HOME=str(config),
             TEMP=str(work),TMP=str(work),TMPDIR=str(work))
    def godot(cli,extra=None,crash=False):
        command=[args.editor,"--headless","--path",project,*cli]
        options=dict(cwd=project,env={**env,**(extra or {})},encoding="utf-8",errors="replace",stdin=subprocess.DEVNULL,
                     stdout=subprocess.PIPE,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
        if crash:
            marker=Path(extra["HWE_INLAY_DB"]+".point")
            assert not marker.exists()
            with subprocess.Popen(command,**options) as child:
                deadline=time.monotonic()+60
                reached=threading.Event()
                def interrupt():
                    while child.poll() is None and time.monotonic()<deadline:
                        if marker.exists() and marker.read_text()==extra["HWE_INLAY_CASE"]:
                            reached.set()
                            child.kill()
                            break
                        time.sleep(.025)
                watcher=threading.Thread(target=interrupt)
                watcher.start()
                try:
                    output,_=child.communicate(timeout=65)
                finally:
                    if child.poll() is None:
                        child.kill()
                        child.communicate(timeout=30)
                    watcher.join()
                if not reached.is_set():
                    raise RuntimeError("Godot did not reach "+extra["HWE_INLAY_CASE"]+"\n"+output[-1800:])
                assert child.returncode!=0,output[-1200:]
                return output
        run=subprocess.run(command,timeout=180,**options)
        issues=[s for s in run.stdout.splitlines() if ("SCRIPT ERROR" in s or "ERROR:" in s)
                and "Failed to read the root certificate store." not in s]
        if issues or run.returncode:raise RuntimeError(str(issues)+"\n"+run.stdout[-1800:])
        return run.stdout
    if args.register_extensions:
        # A source-only timing fixture needs native registration, without importing UI assets.
        cache=project/".godot"
        cache.mkdir()
        extensions=sorted("res://"+p.relative_to(project).as_posix() for p in project.rglob("*.gdextension"))
        assert extensions
        (cache/"extension_list.cfg").write_text("\n".join(extensions)+"\n",encoding="utf-8")
    else:
        godot(["--editor","--import"])
    rows=[]
    for index,mode in enumerate(["delete","wal","wal","delete"]):
        file=work/(str(index)+".sqlite3")
        with closing(sqlite3.connect(file)) as db:
            assert db.execute("PRAGMA journal_mode="+mode).fetchone()[0]==mode
        (work/(file.name+".owner")).write_text("owned test")
        def invoke(phase):
            print("Measuring",mode,index,phase,flush=True)
            return godot(["--script",args.driver],{"HWE_INLAY_DB":str(file),"HWE_INLAY_CASE":phase},phase!="measure")
        log=invoke("measure")
        result=json.loads(next(line.split("HWE_STORAGE_OK ",1)[1] for line in log.splitlines() if line.startswith("HWE_STORAGE_OK ")))
        assert len(result["samples"])==32 and all(len(s)==4 and all(v>=0 for v in s) for s in result["samples"])
        revision,save,checksum=read_slot(file,mode)
        assert revision==43 and save["state"]["items"][0]["sockets"]==["thal",None]
        for phase in ["before","after"]:
            invoke(phase)
            marker=work/(file.name+".point")
            assert marker.read_text()==phase
            marker.unlink()
            new_revision,new,new_checksum=read_slot(file,mode)
            if phase=="before":
                assert (new_revision,new_checksum)==(revision,checksum)
            else:
                assert new_revision==revision+1 and new["state"]["vestiges"]["morren"]==1
                assert new["state"]["items"][0]["sockets"]==["morren",None]
                assert new["random"]==save["random"] and new["nextUid"]==save["nextUid"]
        medians=dict(zip(result["columns"],map(statistics.median,zip(*result["samples"]))))
        rows.append(dict(mode=mode,saveSha256=checksum,median=medians,beforeRollback=True,afterCommit=True,**result))
    assert len({r["saveSha256"] for r in rows})==1
    filesystem=None if os.name=="nt" else subprocess.check_output(["stat","-f","-c","%T",work],text=True).strip()
    return dict(platform=os.name,filesystem=filesystem,projectSha256=args.zip_sha256,
                fixtureStartup="registered-extensions" if args.register_extensions else "editor-import",
                sqliteSynchronization="EXTRA (native slot store)",
                sqlitePreparationVersion=sqlite3.sqlite_version,order=[r["mode"] for r in rows],runs=rows)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ["editor","driver","project_zip","scratch","output"]:
        parser.add_argument(name,type=Path)
    parser.add_argument("zip_sha256")
    parser.add_argument("--register-extensions",action="store_true")
    args=parser.parse_args()
    if not __debug__:raise RuntimeError("Assertions required")
    with tempfile.TemporaryDirectory(prefix="vestige-io-",dir=args.scratch) as temp:
        report=measure(args,Path(temp).resolve())
    with args.output.open("x",encoding="utf-8") as output:
        json.dump(report,output,indent=2)
        output.write("\n")
    print(json.dumps([r["median"] for r in report["runs"]]))
