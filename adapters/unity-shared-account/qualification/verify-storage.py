"""Qualify complete shared-account publication through actual Unity and SQLite."""
import argparse,gzip,hashlib,json,os,runpy,shutil,sqlite3,tempfile,time
from contextlib import closing
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];ARTIFACTS=(ROOT/'.artifacts').resolve()
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def read(file):return json.loads(file.read_text(encoding='utf-8-sig'))
def compact(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def verify(args):
    assert os.name=='nt' and not args.output.exists() and not Path(str(args.output)+'.raw.json.gz').exists()
    owned=Path(tempfile.mkdtemp(prefix='unity-shared-storage-',dir=ARTIFACTS)).resolve();assert owned.parent==ARTIFACTS
    course=owned/'course';course.mkdir();project=owned/'project';raw={}
    names=['adapters/unity-shared-account/qualification/'+name for name in ['verify-storage.py','SharedStorageReplay.cs','Editor/SharedStorageChecks.cs']]
    sources={name:digest(ROOT/name) for name in names}
    report=dict(passed=False,cleaned=False,sources=sources,scope='Candidate Unity 2021.3.6f1 Windows x64 Mono shared-account grouped publication; no physical-device or full-package qualification')
    try:
        packages={name:read(folder/'package-receipt.json') for name,folder in [('gameplay',args.gameplay),('storage',args.storage)]}
        for name,receipt in packages.items():
            folder=getattr(args,name);archive=folder/receipt['file'];assert archive.parent==folder and digest(archive)==receipt['sha256']
            for file,sha in receipt['sources'].items():assert digest(ROOT/file)==sha,file
        report['packages']=packages
        fixture=json.loads(gzip.decompress((args.gameplay/'qualification-inputs.json.gz').read_bytes()));prepared=json.loads(fixture['prepared.json'])[0]
        control=prepared['control'];a=control[0]['request'];w=control[1]['request']
        memory=next(row['request']['command'] for row in control if row['request']['op']=='account' and row['request']['command']['op']=='buy')
        salvage=next(row['request']['command'] for row in control if row['request']['op']=='workshop')
        input=dict(key=a['key'],fields=compact({key:a[key] for key in ['state','craftLore','extra'] if key in a}),inventory=compact(w['state']),
            accountSeed=a['seed'],inventorySeed=w['seed'],memory=compact(memory),salvage=compact(salvage),invalid=compact({**salvage,'lane':'invalid'}),locked='{"op":"buy","id":"feat_craft_second"}')
        saves=[row['reply']['save'] for row in control if row['request']['op'] in ['account-save','workshop-save']];assert len(saves)==9
        expected=dict(initial=saves[:3],batch=saves[3:6],continued=saves[6:],recovered=saves[3:6])
        (course/'inputs.json').write_text(compact(input),encoding='utf-8');(course/'expected.json').write_text(compact(expected),encoding='utf-8')
        for name in ['Assets/Editor','Packages','ProjectSettings']:(project/name).mkdir(parents=True,exist_ok=True)
        deps={'com.unity.modules.jsonserialize':'1.0.0','com.unity.modules.imgui':'1.0.0'}
        for name,receipt in packages.items():
            shutil.copyfile(getattr(args,name)/receipt['file'],project/'Packages'/receipt['file']);deps['com.hollowwake.'+name]='file:'+receipt['file']
        (project/'Packages/manifest.json').write_text(compact(dict(dependencies=deps)),encoding='utf-8')
        (project/'ProjectSettings/ProjectVersion.txt').write_text('m_EditorVersion: 2021.3.6f1\n',encoding='ascii')
        for name in ['SharedStorageReplay.cs','Editor/SharedStorageChecks.cs']:shutil.copyfile(ROOT/'adapters/unity-shared-account/qualification'/name,project/'Assets'/name)
        for name in ['temp','cache']:(owned/name).mkdir()
        env=dict(os.environ,TEMP=str(owned/'temp'),TMP=str(owned/'temp'),TMPDIR=str(owned/'temp'),UPM_CACHE_ROOT=str(owned/'cache'),HWE_SHARED_STORAGE_WORK=str(course))
        launch=runpy.run_path(str(ROOT/'scripts/verify-unity-storage.py'))['launch']
        launch(args.editor,['-quit','-projectPath',project,'-buildTarget','Win64','-executeMethod','SharedStorageChecks.VerifyAndBuild'],ROOT,env,course/'editor.log','HWE_SHARED_STORAGE_BUILT')
        built=course/'Built';relocated=course/'Relocated';assert built.parent==relocated.parent==course;built.rename(relocated)
        libraries=list(relocated.rglob('hwe_embedded.dll'));assert len(libraries)==1 and digest(libraries[0])==packages['gameplay']['nativeSha256']
        libraries=list(relocated.rglob('hwe_save.dll'));assert len(libraries)==1 and digest(libraries[0])==packages['storage']['files']['package/Runtime/Native/Windows/hwe_save.dll']
        launch(relocated/'SharedStorage.exe',[],ROOT,env,course/'player.log')
        report['results']={};report['databases']={}
        for stage in ['editor','player']:
            result=read(course/(stage+'-result.json'));assert result['stage']==stage and result['unity']=='2021.3.6f1'
            for flag in ['passed','closed','policyRollback','exceptionRollback','invalidRollback','busy','staleDependency','reopened','publicationFailureClosed','incompleteGroupRefused']:assert result[flag],(stage,flag)
            assert 0<result['peak']<=48*1024*1024 and result['cancellation'] in ['committed','cancelled']
            for name,rows in expected.items():
                for part,want in zip(['account','inventory0','inventory1'],rows):assert read(course/(stage+'-'+name+'-'+part+'.json'))==want,(stage,name,part)
            for suffix in ['', '-publication','-incomplete']:
                file=course/(stage+suffix+'.db')
                with closing(sqlite3.connect('file:'+file.as_posix()+'?mode=ro',uri=True)) as db:
                    assert db.execute('PRAGMA integrity_check').fetchone()==('ok',)
                    records=db.execute('SELECT slot,revision,crafting,stash FROM slots ORDER BY slot').fetchall()
                assert [row[0] for row in records]==([30] if suffix=='-incomplete' else [10,20,30])
                if suffix=='':
                    for record,part in zip(records,['account','inventory0','inventory1']):assert json.loads(record[2])==read(course/(stage+'-final-'+part+'.json'))
                report['databases'][stage+suffix]=records
            report['results'][stage]=result
        report['passed']=True
    except BaseException as error:report['failure']=str(error);raise
    finally:
        report['inputsUnchanged']=all(digest(ROOT/file)==sha for file,sha in sources.items());report['passed']=report['passed'] and report['inputsUnchanged']
        for file in course.iterdir():
            if file.is_file() and file.suffix in ['.json','.jsonl','.log']:raw[file.name]=file.read_text(encoding='utf-8',errors='replace')
        packed=gzip.compress(compact(raw).encode(),mtime=0);report['rawSha256']=hashlib.sha256(packed).hexdigest();Path(str(args.output)+'.raw.json.gz').write_bytes(packed)
        try:
            deadline=time.monotonic()+20
            while owned.exists():
                assert owned.resolve().parent==ARTIFACTS
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
    for name in ['editor','gameplay','storage','output']:parser.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args()
    for name in ['editor','gameplay','storage','output']:setattr(args,name,getattr(args,name).resolve())
    report=verify(args);print(compact(dict(passed=report['passed'],cleaned=report['cleaned'],results=report['results'])))
