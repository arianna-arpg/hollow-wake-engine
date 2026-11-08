"""Retain raw observations from the existing gameplay or standalone-storage course."""
import argparse,gzip,hashlib,json,os,runpy,shutil,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];ARTIFACTS=(ROOT/'.artifacts').resolve()
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def verify(args):
    assert os.name=='nt' and not args.output.exists() and not Path(str(args.output)+'.raw.json.gz').exists()
    if args.mode=='gameplay':assert args.release is not None
    module='scripts/verify-unity-'+args.mode+'.py'
    names=[str(Path(__file__).relative_to(ROOT)).replace('\\','/'),module]
    if args.mode=='gameplay':
        names+=['scripts/prepare-unity-replay.mjs','scripts/reference-utils.mjs','scripts/compile-item-content.mjs','scripts/compile-passive-content.mjs',
                'test/unity-gameplay/content-load.py','test/unity-gameplay/GameplayReplay.cs','test/unity-gameplay/WorkshopReplay.cs','test/unity-gameplay/Editor/PackageChecks.cs']
    else:names+=['test/unity-storage/StorageReplay.cs','test/unity-storage/Editor/StorageChecks.cs']
    sources={name:digest(ROOT/name) for name in names}
    owned=Path(tempfile.mkdtemp(prefix='owned-unity-retained-',dir=ARTIFACTS)).resolve();assert owned.parent==ARTIFACTS
    report=dict(passed=False,cleaned=False,sources=sources,mode=args.mode);raw={}
    try:
        result=runpy.run_path(str(ROOT/module))['verify'](args,owned)
        report['result']=result;report['passed']=True
    except BaseException as error:report['failure']=str(error);raise
    finally:
        try:
            report['inputsUnchanged']=all(digest(ROOT/name)==sha for name,sha in sources.items())
            report['passed']=report['passed'] and report['inputsUnchanged']
            courses=[p for p in owned.iterdir() if p.is_dir() and (p.name=='course' or p.name.startswith('run-'))]
            for course in courses:
                for file in course.iterdir():
                    if file.is_file() and file.suffix in ['.json','.jsonl','.log','.expected','.replies','.requests']:
                        raw[file.name]=file.read_text(encoding='utf-8',errors='replace')
            packed=gzip.compress(json.dumps(raw,ensure_ascii=False).encode(),mtime=0)
            report['rawSha256']=hashlib.sha256(packed).hexdigest();Path(str(args.output)+'.raw.json.gz').write_bytes(packed)
        finally:
            try:
                deadline=time.monotonic()+20
                while owned.exists():
                    assert owned.resolve().parent==ARTIFACTS and owned.name.startswith('owned-unity-retained-')
                    try:shutil.rmtree(owned)
                    except FileNotFoundError:
                        if owned.exists():raise
                    except PermissionError:
                        if time.monotonic()>=deadline:raise
                        time.sleep(.25)
                report['cleaned']=True
            finally:args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--mode',choices=['gameplay','storage'],required=True)
    for name in ['editor','package','output']:parser.add_argument('--'+name,type=lambda p:Path(p).resolve(),required=True)
    parser.add_argument('--release',type=lambda p:Path(p).resolve())
    args=parser.parse_args();args.render=False;args.gameplay=None;args.screenshot=None;args.fault_controls=False
    report=verify(args);print(json.dumps({key:report[key] for key in ['passed','cleaned','inputsUnchanged','mode']}))
