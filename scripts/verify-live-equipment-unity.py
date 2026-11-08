"""Actual UPM installation, Unity editor and relocated Mono player publication course."""
import argparse,gzip,hashlib,json,os,runpy,shutil,sqlite3,subprocess,tempfile
from pathlib import Path
from contextlib import closing
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=(ROOT/'.artifacts').resolve()
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def read(file):return json.loads(file.read_text(encoding='utf-8'))
def verify(args,work):
    sources=['scripts/verify-live-equipment-unity.py','scripts/verify-unity-storage.py',
             'test/unity-live-equipment/inputs.mjs','test/unity-live-equipment/EquipmentReplay.cs',
             'test/unity-live-equipment/Editor/EquipmentChecks.cs']
    hashes={file:digest(ROOT/file) for file in sources}
    report=dict(passed=False,scope='Unity 2021.3 Windows x64 Mono editor and relocated player; no physical device acceptance',sources=hashes)
    project=work/'project';course=work/'course';course.mkdir()
    raw={}
    try:
        for folder in ('Assets/Editor','Packages','ProjectSettings'):(project/folder).mkdir(parents=True,exist_ok=True)
        dependencies={'com.unity.modules.jsonserialize':'1.0.0','com.unity.modules.imgui':'1.0.0'}
        packages={}
        for delivery in (args.gameplay,args.storage):
            receipt=read(delivery/'package-receipt.json');archive=delivery/receipt['file']
            assert archive.parent==delivery and digest(archive)==receipt['sha256']
            for file,sha in receipt['sources'].items():assert digest(ROOT/file)==sha,file
            name=receipt['sha256'][:16]+'-'+archive.name
            shutil.copyfile(archive,project/'Packages'/name);dependencies[receipt['name']]='file:'+name
            packages[receipt['name']]=receipt
        report['packages']=packages
        (project/'Packages/manifest.json').write_text(json.dumps(dict(dependencies=dependencies)),encoding='utf-8')
        (project/'ProjectSettings/ProjectVersion.txt').write_text('m_EditorVersion: 2021.3.6f1\n',encoding='ascii')
        for file in ('EquipmentReplay.cs','Editor/EquipmentChecks.cs'):
            shutil.copyfile(ROOT/'test/unity-live-equipment'/file,project/'Assets'/file)
        subprocess.run(['node',str(ROOT/'test/unity-live-equipment/inputs.mjs'),str(course/'inputs.json')],
                       cwd=ROOT,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
        for folder in ('temp','cache'):(work/folder).mkdir()
        env=dict(os.environ,TEMP=str(work/'temp'),TMP=str(work/'temp'),TMPDIR=str(work/'temp'),
                 UPM_CACHE_ROOT=str(work/'cache'),HWE_EQUIPMENT_WORK=str(course))
        launch=runpy.run_path(str(ROOT/'scripts/verify-unity-storage.py'))['launch']
        launch(args.editor,['-quit','-projectPath',project,'-buildTarget','Win64','-executeMethod','EquipmentChecks.VerifyAndBuild'],
               ROOT,env,course/'editor.log','HWE_EQUIPMENT_BUILT')
        built=course/'Built';relocated=course/'Relocated';assert built.parent==relocated.parent==course
        built.rename(relocated)
        for name,key in [('hwe_embedded.dll','com.hollowwake.gameplay'),('hwe_save.dll','com.hollowwake.storage')]:
            found=list(relocated.rglob(name));assert len(found)==1 and digest(found[0])==packages[key]['nativeSha256']
        launch(relocated/'Equipment.exe',[],ROOT,env,course/'player.log')
        report['results']={}
        for stage in ('editor','player'):
            result=read(course/(stage+'-result.json'));assert result['passed'] and result['closed'] and result['publicationFailureClosed']
            assert result['combatPeak']<=64*1024*1024 and result['workshopPeak']<=32*1024*1024
            for phase in ('equip','remove'):
                before=read(course/(stage+'-'+phase+'-before.json'));after=read(course/(stage+'-'+phase+'-after.json'))
                assert before['character']!=after['character']
                assert {k:v for k,v in before.items() if k!='character'}=={k:v for k,v in after.items() if k!='character'},phase
            expected=(course/(stage+'-expected.json')).read_text(encoding='utf-8')
            with closing(sqlite3.connect(course/(stage+'.db'))) as db:
                assert db.execute('PRAGMA integrity_check').fetchone()==('ok',)
                assert db.execute('SELECT revision,crafting,stash FROM slots WHERE slot=1').fetchone()==(result['revision'],expected,'[]')
            report['results'][stage]=result
        report['passed']=True
    finally:
        for file,sha in hashes.items():assert digest(ROOT/file)==sha,file
        for file in course.iterdir():
            if file.is_file() and file.suffix in ('.json','.log'):raw[file.name]=file.read_text(encoding='utf-8',errors='replace')
        packed=gzip.compress(json.dumps(raw).encode(),mtime=0)
        report['rawSha256']=hashlib.sha256(packed).hexdigest()
        Path(str(args.output)+'.raw.json.gz').write_bytes(packed)
        args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for flag in ('editor','gameplay','storage','output'):parser.add_argument('--'+flag,type=Path,required=True)
    args=parser.parse_args()
    for flag in ('editor','gameplay','storage','output'):setattr(args,flag,getattr(args,flag).resolve())
    assert os.name=='nt' and not args.output.exists() and not Path(str(args.output)+'.raw.json.gz').exists()
    with tempfile.TemporaryDirectory(prefix='live-equipment-unity-',dir=ARTIFACTS) as temp:
        work=Path(temp).resolve();assert work.parent==ARTIFACTS
        report=verify(args,work)
    print(json.dumps(dict(passed=report['passed'],output=str(args.output),cleaned=True)))
