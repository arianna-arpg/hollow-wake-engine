"""Qualify the shipped progression binding in the actual editor and relocated player."""
import argparse,gzip,hashlib,json,os,runpy,shutil,subprocess,tempfile,time
from contextlib import contextmanager
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=(ROOT/'.artifacts').resolve()
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def read(file):return json.loads(file.read_text(encoding='utf-8-sig'))
@contextmanager
def owned_workspace():
    work=Path(tempfile.mkdtemp(prefix='unity-progression-',dir=ARTIFACTS)).resolve()
    assert work.parent==ARTIFACTS
    try:
        yield work
    finally:
        # Windows may retain UnityCrashHandler64.exe briefly after player exit.
        # Retry only deletion of this exact owned project, never another process.
        deadline=time.monotonic()+15
        while work.exists():
            assert work.resolve().parent==ARTIFACTS
            try:shutil.rmtree(work)
            except FileNotFoundError:
                if work.exists():raise
            except PermissionError:
                if time.monotonic()>=deadline:raise
                time.sleep(.25)
def verify(args,work):
    sources=['scripts/verify-unity-progression.py','scripts/verify-unity-storage.py',
             'test/unity-progression/inputs.mjs','test/unity-progression/ProgressionReplay.cs',
             'test/unity-progression/Editor/ProgressionChecks.cs']
    hashes={file:digest(ROOT/file) for file in sources}
    report=dict(passed=False,sources=hashes,scope='Unity 2021.3.6f1 Windows x64 Mono binding equivalence; no physical-device or durable-save qualification')
    project=work/'project';course=work/'course';course.mkdir()
    raw={}
    try:
        for folder in ('Assets/Editor','Packages','ProjectSettings'):(project/folder).mkdir(parents=True,exist_ok=True)
        receipt=read(args.gameplay/'package-receipt.json');archive=args.gameplay/receipt['file']
        assert archive.parent==args.gameplay and digest(archive)==receipt['sha256']
        for file,sha in receipt['sources'].items():assert digest(ROOT/file)==sha,file
        for file,sha in receipt['sdkSources'].items():assert digest(ROOT/file)==sha,file
        report['package']=receipt
        shutil.copyfile(archive,project/'Packages'/archive.name)
        dependencies={'com.unity.modules.jsonserialize':'1.0.0','com.unity.modules.imgui':'1.0.0',receipt['name']:'file:'+archive.name}
        (project/'Packages/manifest.json').write_text(json.dumps(dict(dependencies=dependencies)),encoding='utf-8')
        (project/'ProjectSettings/ProjectVersion.txt').write_text('m_EditorVersion: 2021.3.6f1\n',encoding='ascii')
        for file in ('ProgressionReplay.cs','Editor/ProgressionChecks.cs'):
            shutil.copyfile(ROOT/'test/unity-progression'/file,project/'Assets'/file)
        subprocess.run(['node',str(ROOT/'test/unity-progression/inputs.mjs'),str(course/'inputs.json')],
                       cwd=ROOT,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
        for folder in ('temp','cache'):(work/folder).mkdir()
        env=dict(os.environ,TEMP=str(work/'temp'),TMP=str(work/'temp'),TMPDIR=str(work/'temp'),
                 UPM_CACHE_ROOT=str(work/'cache'),HWE_PROGRESSION_WORK=str(course))
        launch=runpy.run_path(str(ROOT/'scripts/verify-unity-storage.py'))['launch']
        launch(args.editor,['-quit','-projectPath',project,'-buildTarget','Win64','-executeMethod','ProgressionChecks.ImportSample'],
               ROOT,env,course/'import.log','HWE_PROGRESSION_IMPORTED')
        launch(args.editor,['-quit','-projectPath',project,'-buildTarget','Win64','-executeMethod','ProgressionChecks.VerifyAndBuild'],
               ROOT,env,course/'editor.log','HWE_PROGRESSION_BUILT')
        built=course/'Built';relocated=course/'Relocated';assert built.parent==relocated.parent==course
        built.rename(relocated)
        libraries=list(relocated.rglob('hwe_embedded.dll'));assert len(libraries)==1 and digest(libraries[0])==receipt['nativeSha256']
        launch(relocated/'Progression.exe',[],ROOT,env,course/'player.log')
        report['results']={}
        expected=read(course/'inputs.json')['expected']
        for stage in ('editor','player'):
            result=read(course/(stage+'-result.json'))
            assert result['passed'] and result['closed'] and result['retiredHandle'] and result['ownerDisposal'] and result['sample']
            assert result['unity']=='2021.3.6f1' and result['stage']==stage and 0<result['peak']<=32*1024*1024
            replies=[json.loads(line) for line in (course/(stage+'-replies.jsonl')).read_text(encoding='utf-8-sig').splitlines()]
            assert len(replies)==len(expected)==result['steps']
            for index,(got,want) in enumerate(zip(replies,expected)):assert got==want,(stage,index,got,want)
            report['results'][stage]=result
        report['passed']=True
    except BaseException as error:
        report['failure']=str(error)
        raise
    finally:
        for file,sha in hashes.items():assert digest(ROOT/file)==sha,file
        for file in course.iterdir():
            if file.is_file() and file.suffix in ('.json','.jsonl','.log'):raw[file.name]=file.read_text(encoding='utf-8',errors='replace')
        packed=gzip.compress(json.dumps(raw,ensure_ascii=False).encode(),mtime=0)
        report['rawSha256']=hashlib.sha256(packed).hexdigest()
        Path(str(args.output)+'.raw.json.gz').write_bytes(packed)
        args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for flag in ('editor','gameplay','output'):parser.add_argument('--'+flag,type=Path,required=True)
    args=parser.parse_args()
    for flag in ('editor','gameplay','output'):setattr(args,flag,getattr(args,flag).resolve())
    assert os.name=='nt' and not args.output.exists() and not Path(str(args.output)+'.raw.json.gz').exists()
    with owned_workspace() as work:
        report=verify(args,work)
    report['cleaned']=True
    args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(passed=report['passed'],output=str(args.output),cleaned=True)))
