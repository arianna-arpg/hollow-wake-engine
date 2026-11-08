"""Qualify standalone storage with native provenance inherited from its pinned parent."""
import argparse,gzip,hashlib,json,os,runpy,shutil,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];ARTIFACTS=(ROOT/'.artifacts').resolve()
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def read(file):return json.loads(file.read_text(encoding='utf-8'))
def verify(args):
    assert os.name=='nt' and not args.output.exists() and not Path(str(args.output)+'.raw.json.gz').exists()
    proof='evidence/unity-account-storage/reports.json'
    sources={name:digest(ROOT/name) for name in ['adapters/unity-shared-account/qualification/verify-standalone.py','scripts/verify-unity-storage.py','test/unity-storage/StorageReplay.cs','test/unity-storage/Editor/StorageChecks.cs',proof]}
    original=read(args.package/'package-receipt.json');parent=read(ROOT/proof)['engine']['packages']['com.hollowwake.storage']
    assert original['parentSha256']==parent['sha256'] and original['nativeSha256']==parent['nativeSha256']
    for name,sha in parent['nativeSources'].items():assert digest(ROOT/name)==sha; sources[name]=sha
    archive=args.package/original['file'];assert archive.parent==args.package and digest(archive)==original['sha256']
    owned=Path(tempfile.mkdtemp(prefix='unity-shared-standalone-',dir=ARTIFACTS)).resolve();assert owned.parent==ARTIFACTS
    report=dict(passed=False,cleaned=False,sources=sources,originalPackage=original,nativeProvenanceParent=parent['sha256']);raw={}
    try:
        # Only this temporary verification receipt gains the native-source map.
        # The candidate archive and its original receipt remain byte-identical.
        supplemental=owned/'package';supplemental.mkdir();shutil.copyfile(archive,supplemental/archive.name)
        (supplemental/'package-receipt.json').write_text(json.dumps({**original,'nativeSources':parent['nativeSources']}),encoding='utf-8')
        args.package=supplemental;args.gameplay=None;args.screenshot=None;args.fault_controls=False
        report['result']=runpy.run_path(str(ROOT/'scripts/verify-unity-storage.py'))['verify'](args,owned);report['passed']=True
    except BaseException as error:report['failure']=str(error);raise
    finally:
        try:
            report['inputsUnchanged']=all(digest(ROOT/name)==sha for name,sha in sources.items())
            report['passed']=report['passed'] and report['inputsUnchanged']
            for file in (owned/'course').glob('*'):
                if file.is_file() and file.suffix in ['.json','.log','.expected'] :raw[file.name]=file.read_text(encoding='utf-8',errors='replace')
            packed=gzip.compress(json.dumps(raw,ensure_ascii=False).encode(),mtime=0);report['rawSha256']=hashlib.sha256(packed).hexdigest()
            Path(str(args.output)+'.raw.json.gz').write_bytes(packed)
        finally:
            try:
                deadline=time.monotonic()+20
                while owned.exists():
                    assert owned.resolve().parent==ARTIFACTS and owned.name.startswith('unity-shared-standalone-')
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
    for name in ['editor','package','output']:parser.add_argument('--'+name,type=lambda p:Path(p).resolve(),required=True)
    report=verify(parser.parse_args());print(json.dumps({key:report[key] for key in ['passed','cleaned','inputsUnchanged']}))
