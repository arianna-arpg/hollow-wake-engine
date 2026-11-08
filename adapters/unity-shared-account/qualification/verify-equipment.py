"""Exercise shared account saves with two live actors in actual Unity packages."""
import argparse,gzip,hashlib,json,os,runpy,shutil,sqlite3,subprocess,tempfile,time
from pathlib import Path
from contextlib import closing
ROOT=Path(__file__).resolve().parents[3];ARTIFACTS=(ROOT/'.artifacts').resolve()
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def read(file):return json.loads(file.read_text(encoding='utf-8-sig'))
def compact(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def verify(args):
    assert os.name=='nt' and not args.output.exists() and not Path(str(args.output)+'.raw.json.gz').exists()
    names=['adapters/unity-shared-account/qualification/'+name for name in ['verify-equipment.py','SharedEquipmentReplay.cs','Editor/SharedEquipmentChecks.cs']]+['scripts/verify-unity-storage.py','test/unity-live-equipment/inputs.mjs']
    sources={name:digest(ROOT/name) for name in names};report=dict(passed=False,cleaned=False,sources=sources,scope='Unpublished shared-account equipment integration; Unity 2021.3.6f1 Windows x64 Mono; no physical-device acceptance');raw={}
    work=Path(tempfile.mkdtemp(prefix='unity-shared-equipment-',dir=ARTIFACTS)).resolve();assert work.parent==ARTIFACTS
    course=work/'course';course.mkdir();project=work/'project'
    try:
        packages={name:read(args.packages/name/'package-receipt.json') for name in ['gameplay','storage']};report['packages']=packages
        for folder in ['Assets/Editor','Packages','ProjectSettings']:(project/folder).mkdir(parents=True,exist_ok=True)
        deps={'com.unity.modules.jsonserialize':'1.0.0','com.unity.modules.imgui':'1.0.0'}
        for name,p in packages.items():
            archive=args.packages/name/p['file'];assert digest(archive)==p['sha256']
            for field in ['sources','sdkSources']:
                for file,sha in p.get(field,{}).items():assert digest(ROOT/file)==sha,file
            shutil.copyfile(archive,project/'Packages'/p['file']);deps[p['name']]='file:'+p['file']
        (project/'Packages/manifest.json').write_text(compact(dict(dependencies=deps)),encoding='utf-8')
        (project/'ProjectSettings/ProjectVersion.txt').write_text('m_EditorVersion: 2021.3.6f1\n',encoding='ascii')
        for name in ['SharedEquipmentReplay.cs','Editor/SharedEquipmentChecks.cs']:shutil.copyfile(ROOT/'adapters/unity-shared-account/qualification'/name,project/'Assets'/name)
        subprocess.run(['node',str(ROOT/'test/unity-live-equipment/inputs.mjs'),str(course/'inputs.json')],cwd=ROOT,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
        inputs=read(course/'inputs.json');state=json.loads(inputs['state']);del state['account']
        unsupported={**state['items'][0],'uid':4294967300,'x':6,'rarity':'magic','name':'Unsupported projection control'};state['items'].append(unsupported)
        inputs['state']=compact(state);(course/'inputs.json').write_text(compact(inputs),encoding='utf-8')
        for name in ['temp','cache']:(work/name).mkdir()
        env=dict(os.environ,TEMP=str(work/'temp'),TMP=str(work/'temp'),TMPDIR=str(work/'temp'),UPM_CACHE_ROOT=str(work/'cache'),HWE_SHARED_EQUIPMENT_WORK=str(course))
        launch=runpy.run_path(str(ROOT/'scripts/verify-unity-storage.py'))['launch']
        report['mode']=args.mode;report['results']={};report['databases']={}
        method,marker={'complete':('VerifyAndBuild','BUILT'),'editor':('VerifyEditor','EDITOR'),'publication-failure':('VerifyPublicationFailure','PUBLICATION_FAILURE')}[args.mode]
        launch(args.editor,['-quit','-projectPath',project,'-buildTarget','Win64','-executeMethod','SharedEquipmentChecks.'+method],ROOT,env,course/'editor.log','HWE_SHARED_EQUIPMENT_'+marker)
        if args.mode=='publication-failure':
            stage=args.mode;result=read(course/(stage+'-result.json'));assert result==dict(passed=True,closed=True,stage=stage)
            with closing(sqlite3.connect('file:'+(course/(stage+'.db')).as_posix()+'?mode=ro',uri=True)) as db:
                assert db.execute('PRAGMA integrity_check').fetchone()==('ok',);records=db.execute('SELECT slot,revision,crafting,stash FROM slots ORDER BY slot').fetchall()
            assert [(row[0],row[1]) for row in records]==[(10,2),(20,2),(30,2)]
            for record,part in zip(records,['account','inventory0','inventory1']):assert json.loads(record[2])==read(course/(stage+'-final-'+part+'.json'))
            for index,uid in [(1,4294967297),(2,4294967298)]:assert json.loads(records[index][2])['workshop']['state']['equipped']['ring1']['uid']==uid
            report['results'][stage]=result;report['databases'][stage]=records;report['passed']=True;return report
        if args.mode=='complete':
            relocated=course/'Relocated';(course/'Built').rename(relocated)
            for name,key in [('hwe_embedded.dll','gameplay'),('hwe_save.dll','storage')]:
                libs=list(relocated.rglob(name));assert len(libs)==1 and digest(libs[0])==packages[key]['nativeSha256']
            launch(relocated/'SharedEquipment.exe',[],ROOT,env,course/'player.log')
        for stage in (['editor','player'] if args.mode=='complete' else ['editor']):
            result=read(course/(stage+'-result.json'));assert result['stage']==stage and result['unity']=='2021.3.6f1'
            for flag in ['passed','closed','busy','stale','unsupported','publicationFailureClosed','bindings','accountOnlyNoCombatWork','reopened','equipmentReads']:assert result[flag],(stage,flag)
            assert 0<result['sharedPeak']<=48*1024*1024 and 0<result['combatPeak']<=64*1024*1024
            for phase in ['equip','remove']:
                for index in [0,1]:
                    before=read(course/(stage+'-'+phase+'-before-'+str(index)+'.json'));after=read(course/(stage+'-'+phase+'-after-'+str(index)+'.json'))
                    assert before.pop('character')!=after.pop('character');assert before==after,(stage,phase,index,'live state changed')
            with closing(sqlite3.connect('file:'+(course/(stage+'.db')).as_posix()+'?mode=ro',uri=True)) as db:
                assert db.execute('PRAGMA integrity_check').fetchone()==('ok',);records=db.execute('SELECT slot,revision,crafting,stash FROM slots ORDER BY slot').fetchall()
            assert [row[0] for row in records]==[10,20,30]
            for record,part in zip(records,['account','inventory0','inventory1']):assert json.loads(record[2])==read(course/(stage+'-final-'+part+'.json'))
            for index,uid in [(1,4294967297),(2,4294967298)]:assert json.loads(records[index][2])['workshop']['state']['equipped']['ring1']['uid']==uid
            report['results'][stage]=result;report['databases'][stage]=records
        if args.mode=='editor':report['passed']=True;return report
        report['lifecycle']={}
        for method,marker in [('VerifyPlayExit','HWE_SHARED_EQUIPMENT_PLAY_EXIT'),('VerifyReload','HWE_SHARED_EQUIPMENT_RELOAD')]:
            launch(args.editor,['-projectPath',project,'-executeMethod','SharedEquipmentChecks.'+method],ROOT,env,course/(method+'.log'),marker)
        for stage in ['play-entry-0','play-exit-0','play-entry-1','play-exit-1','reload']:
            result=read(course/(stage+'-lifecycle.json'));assert result==dict(passed=True,closed=True,stage=stage)
            with closing(sqlite3.connect('file:'+(course/(stage+'.db')).as_posix()+'?mode=ro',uri=True)) as db:
                assert db.execute('PRAGMA integrity_check').fetchone()==('ok',);records=db.execute('SELECT slot,revision,crafting FROM slots ORDER BY slot').fetchall()
            assert [(row[0],row[1]) for row in records]==[(10,1),(20,1),(30,1)]
            assert [json.loads(row[2]) for row in records]==[read(course/(stage+'-initial-'+part+'.json')) for part in ['account','inventory0','inventory1']]
            report['lifecycle'][stage]=result;report['databases'][stage]=records
        report['passed']=True
    except BaseException as error:report['failure']=str(error);raise
    finally:
        try:
            report['inputsUnchanged']=all(digest(ROOT/file)==sha for file,sha in sources.items());report['passed']=report['passed'] and report['inputsUnchanged']
            for file in course.iterdir():
                if file.is_file() and file.suffix in ['.json','.log']:raw[file.name]=file.read_text(encoding='utf-8',errors='replace')
            packed=gzip.compress(compact(raw).encode(),mtime=0);report['rawSha256']=hashlib.sha256(packed).hexdigest();Path(str(args.output)+'.raw.json.gz').write_bytes(packed)
        finally:
            try:
                deadline=time.monotonic()+20
                while work.exists():
                    assert work.resolve().parent==ARTIFACTS and work.name.startswith('unity-shared-equipment-')
                    try:shutil.rmtree(work)
                    except FileNotFoundError:
                        if work.exists():raise
                    except PermissionError:
                        if time.monotonic()>=deadline:raise
                        time.sleep(.25)
                report['cleaned']=True
            finally:args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ['editor','packages','output']:parser.add_argument('--'+name,type=lambda p:Path(p).resolve(),required=True)
    parser.add_argument('--mode',choices=['complete','editor','publication-failure'],default='complete')
    result=verify(parser.parse_args());print(compact(dict(passed=result['passed'],cleaned=result['cleaned'],results=result['results'])))
