"""Verify new storage alone and alongside the exact public pre-equipment gameplay."""
import argparse,gzip,hashlib,json,os,runpy,shutil,tempfile,time
from pathlib import Path
from types import SimpleNamespace
ROOT=Path(__file__).resolve().parents[3];ARTIFACTS=(ROOT/'.artifacts').resolve()

def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()

def read(file):return json.loads(file.read_text(encoding='utf-8-sig'))

def verify(args):
    assert not args.output.exists();args.output.mkdir()
    proof='evidence/unity-shared-account/reports.json.gz'
    names=['adapters/unity-shared-account/qualification/'+name for name in ['equipment-compatibility.py','verify-storage.py','SharedStorageReplay.cs','Editor/SharedStorageChecks.cs']]+[proof,'scripts/verify-unity-storage.py','test/unity-storage/StorageReplay.cs','test/unity-storage/Editor/StorageChecks.cs']
    sources={name:digest(ROOT/name) for name in names};raw={};report=dict(passed=False,cleaned=False,sources=sources)
    owned=Path(tempfile.mkdtemp(prefix='unity-equipment-compatibility-',dir=ARTIFACTS)).resolve();assert owned.parent==ARTIFACTS
    try:
        original=read(args.storage/'package-receipt.json');prior=json.loads(gzip.decompress((ROOT/proof).read_bytes()))['standalone']['result']['package']
        assert prior['sha256']=='6d22281f2ba07e7631270e9af19bf11d5e512be54254bbc8bb230b574714428b'
        assert original['nativeSha256']==prior['nativeSha256']
        if original['parentSha256']!=prior['sha256']:
            # A release preview can add guides/version metadata above the
            # equipment candidate. Verify that complete Runtime boundary from
            # actual archive bytes, rather than rewriting its recorded parent.
            accepted_name='evidence/shared-account-equipment/acceptance.json'
            reports_name='evidence/shared-account-equipment/reports.json.gz'
            archive_helper='experiments/embedded-js/patches/unity-cleanup-archive.py'
            accepted=read(ROOT/accepted_name);body=(ROOT/reports_name).read_bytes()
            assert accepted['passed'] and hashlib.sha256(body).hexdigest()==accepted['files']['reports.json.gz']
            candidate=json.loads(gzip.decompress(body))['equipmentFaults']['control']['packages']['storage']
            assert original['parentSha256']==candidate['sha256'] and candidate['parentSha256']==prior['sha256']
            assert candidate['nativeSha256']==prior['nativeSha256']
            entries=runpy.run_path(str(ROOT/archive_helper))['load'](args.storage/original['file'])
            runtime={file:hashlib.sha256(content).hexdigest() for file,content in entries.items() if file.startswith('package/Runtime/')}
            assert runtime=={file:sha for file,sha in candidate['files'].items() if file.startswith('package/Runtime/')}
            for name in [accepted_name,reports_name,archive_helper]:sources[name]=digest(ROOT/name)
            report['runtimeCandidateParent']=candidate['sha256'];report['runtimeCandidateEvidenceSha256']=digest(ROOT/accepted_name)
        for file,sha in prior['nativeSources'].items():assert digest(ROOT/file)==sha;sources[file]=sha
        archive=args.storage/original['file'];assert archive.parent==args.storage and digest(archive)==original['sha256']
        package=owned/'package';package.mkdir();shutil.copyfile(archive,package/archive.name)
        (package/'package-receipt.json').write_text(json.dumps({**original,'nativeSources':prior['nativeSources']}),encoding='utf-8')
        report['originalStoragePackage']=original;report['nativeProvenanceParent']=prior['sha256']
        standalone=owned/'standalone';standalone.mkdir()
        params=SimpleNamespace(editor=args.editor,package=package,gameplay=None,screenshot=None,fault_controls=False)
        report['standalone']=runpy.run_path(str(ROOT/'scripts/verify-unity-storage.py'))['verify'](params,standalone)
        print(json.dumps(dict(standalone=True)),flush=True)
        old=read(args.gameplay/'package-receipt.json');assert old['sha256']=='a34b721bc3cc4649e28a33fe1821d30b508884f0d3b43f659008a2a1305df44c'
        params=SimpleNamespace(editor=args.editor,gameplay=args.gameplay,storage=args.storage,output=owned/'mixed.json',fixtures=None,gameplay_source_ref='98edfa74a4b9caecf6e0e6ef3ce49cb4365966f8')
        report['mixed']=runpy.run_path(str(ROOT/'adapters/unity-shared-account/qualification/verify-storage.py'))['verify'](params)
        report['passed']=report['standalone']['passed'] and report['mixed']['passed'];print(json.dumps(dict(mixed=True)),flush=True)
    except BaseException as error:report['failure']=str(error);raise
    finally:
        try:
            report['inputsUnchanged']=all(digest(ROOT/name)==sha for name,sha in sources.items());report['passed']=report['passed'] and report['inputsUnchanged']
            for file in (owned/'standalone/course').glob('*'):
                if file.is_file() and file.suffix in ['.json','.log','.expected']:raw['standalone/'+file.name]=file.read_text(encoding='utf-8',errors='replace')
            mixed=owned/'mixed.json.raw.json.gz'
            if mixed.exists():raw['mixed']=json.loads(gzip.decompress(mixed.read_bytes()))
            packed=gzip.compress(json.dumps(raw,ensure_ascii=False).encode(),mtime=0);(args.output/'raw.json.gz').write_bytes(packed);report['rawSha256']=hashlib.sha256(packed).hexdigest()
        finally:
            try:
                deadline=time.monotonic()+20
                while owned.exists():
                    assert owned.resolve().parent==ARTIFACTS and owned.name.startswith('unity-equipment-compatibility-')
                    # Unity's PackageCache can exceed MAX_PATH beneath this
                    # existing worktree. Use the already-validated absolute
                    # directory through Windows' extended path syntax.
                    try:shutil.rmtree('\\\\?\\'+str(owned) if os.name=='nt' else owned)
                    except FileNotFoundError:
                        if owned.exists():raise
                    except PermissionError:
                        if time.monotonic()>=deadline:raise
                        time.sleep(.25)
                report['cleaned']=True
            finally:(args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ['editor','gameplay','storage','output']:parser.add_argument('--'+name,type=lambda p:Path(p).resolve(),required=True)
    result=verify(parser.parse_args());print(json.dumps({key:result[key] for key in ['passed','cleaned','inputsUnchanged']}))
