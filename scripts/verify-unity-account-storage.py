"""Actual UPM account/workshop coordination in the editor and a relocated player."""
import argparse,gzip,hashlib,io,json,os,runpy,shutil,sqlite3,subprocess,tarfile,tempfile,time
from contextlib import closing,contextmanager
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=(ROOT/'.artifacts').resolve()
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def read(file):return json.loads(file.read_text(encoding='utf-8-sig'))
def fault_archive(original,target,before,after):
    member='package/Runtime/GameplayBridge/DurableAccountWorkshop.cs'
    changed=False
    with tarfile.open(original) as source,tarfile.open(target,'w:gz') as out:
        for row in source.getmembers():
            if not row.isfile():out.addfile(row);continue
            body=source.extractfile(row).read()
            if row.name==member:
                text=body.decode('utf-8');assert text.count(before)==1
                body=text.replace(before,after).encode('utf-8');row.size=len(body);changed=True
            out.addfile(row,io.BytesIO(body))
    assert changed
@contextmanager
def owned_workspace():
    work=Path(tempfile.mkdtemp(prefix='unity-account-storage-',dir=ARTIFACTS)).resolve()
    assert work.parent==ARTIFACTS
    try:yield work
    finally:
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
    sources=['scripts/verify-unity-account-storage.py','scripts/verify-unity-storage.py',
             'test/unity-account-storage/inputs.mjs','test/unity-live-equipment/inputs.mjs',
             'test/unity-account-storage/AccountStorageReplay.cs','test/unity-account-storage/Editor/AccountStorageChecks.cs',
             'test/unity-account-storage/AccountSampleReplay.cs','test/unity-account-storage/Editor/AccountSampleChecks.cs']
    hashes={file:digest(ROOT/file) for file in sources}
    report=dict(passed=False,sources=hashes,scope='Unity 2021.3.6f1 Windows x64 Mono durable account/workshop coordinator, imported sample, lifecycle and deliberate faults; physical devices separate')
    project=work/'project';course=work/'course';course.mkdir()
    raw={}
    try:
        for folder in ('Assets/Editor','Packages','ProjectSettings'):(project/folder).mkdir(parents=True,exist_ok=True)
        packages={};dependencies={'com.unity.modules.jsonserialize':'1.0.0','com.unity.modules.imgui':'1.0.0'}
        assets={}
        for delivery in (args.gameplay,args.storage):
            receipt=read(delivery/'package-receipt.json');archive=delivery/receipt['file']
            assert archive.parent==delivery and digest(archive)==receipt['sha256']
            for file,sha in receipt['sources'].items():assert digest(ROOT/file)==sha,file
            for file,sha in receipt.get('nativeSources',{}).items():assert digest(ROOT/file)==sha,file
            for file,sha in receipt.get('sdkSources',{}).items():assert digest(ROOT/file)==sha,file
            name=receipt['sha256'][:16]+'-'+archive.name
            shutil.copyfile(archive,project/'Packages'/name);dependencies[receipt['name']]='file:'+name
            packages[receipt['name']]=receipt
            if receipt['name']=='com.hollowwake.gameplay':
                with tarfile.open(archive) as source:
                    for key,resource in [('progression','ProgressionContent'),('workshop','WorkshopContent'),('equipment','WorkshopEquipment')]:
                        relative='Runtime/Resources/HollowWake/'+resource+'.bytes'
                        body=source.extractfile('package/'+relative).read()
                        assert hashlib.sha256(body).hexdigest()==receipt['hashes'][resource],resource
                        assets[key]=json.loads(body)
        report['packages']=packages
        (course/'assets.json').write_text(json.dumps(assets),encoding='utf-8')
        oracle=subprocess.run(['node',str(ROOT/'test/unity-account-storage/inputs.mjs'),str(course/'inputs.json'),str(course/'assets.json')],
                              cwd=ROOT,capture_output=True,text=True,creationflags=subprocess.CREATE_NO_WINDOW)
        (course/'oracle.log').write_text(oracle.stdout+'\n'+oracle.stderr,encoding='utf-8')
        if oracle.returncode:raise RuntimeError('SDK oracle refused: '+oracle.stderr)
        (project/'Packages/manifest.json').write_text(json.dumps(dict(dependencies=dependencies)),encoding='utf-8')
        (project/'ProjectSettings/ProjectVersion.txt').write_text('m_EditorVersion: 2021.3.6f1\n',encoding='ascii')
        for file in ('AccountStorageReplay.cs','Editor/AccountStorageChecks.cs'):
            shutil.copyfile(ROOT/'test/unity-account-storage'/file,project/'Assets'/file)
        for folder in ('temp','cache'):(work/folder).mkdir()
        env=dict(os.environ,TEMP=str(work/'temp'),TMP=str(work/'temp'),TMPDIR=str(work/'temp'),
                 UPM_CACHE_ROOT=str(work/'cache'),HWE_ACCOUNT_STORAGE_WORK=str(course))
        launch=runpy.run_path(str(ROOT/'scripts/verify-unity-storage.py'))['launch']
        launch(args.editor,['-quit','-projectPath',project,'-buildTarget','Win64','-executeMethod','AccountStorageChecks.VerifyAndBuild'],
               ROOT,env,course/'editor.log','HWE_ACCOUNT_STORAGE_BUILT')
        built=course/'Built';relocated=course/'Relocated';assert built.parent==relocated.parent==course
        built.rename(relocated)
        for name,key in [('hwe_embedded.dll','com.hollowwake.gameplay'),('hwe_save.dll','com.hollowwake.storage')]:
            libraries=list(relocated.rglob(name));assert len(libraries)==1 and digest(libraries[0])==packages[key]['nativeSha256']
        launch(relocated/'AccountStorage.exe',[],ROOT,env,course/'player.log')
        expected=read(course/'inputs.json')['expected'];report['results']={}
        for stage in ('editor','player'):
            result=read(course/(stage+'-result.json'))
            for flag in ('passed','closed','accountRefusal','workshopRollback','busy','stale','invalidReload','publicationFailureClosed'):
                assert result[flag],(stage,flag)
            assert result['unity']=='2021.3.6f1' and result['stage']==stage
            assert result['cancellation'] in ('committed','cancelled')
            for label in ('initial','pair','equipped','continued','cancellation','publication-failure'):
                wanted='cancel-committed' if label=='cancellation' and result['cancellation']=='committed' else 'continued' if label=='cancellation' else label
                for owner in ('account','workshop'):
                    assert read(course/(stage+'-'+label+'-'+owner+'.json'))==expected[wanted][owner],(stage,label,owner)
            before=read(course/(stage+'-combat-before.json'));after=read(course/(stage+'-combat-after.json'))
            assert before['character']!=after['character']
            assert {k:v for k,v in before.items() if k!='character'}=={k:v for k,v in after.items() if k!='character'}
            view=read(course/(stage+'-final-view.json'))
            with closing(sqlite3.connect(course/(stage+'.db'))) as db:
                assert db.execute('PRAGMA integrity_check').fetchone()==('ok',)
                assert db.execute('SELECT slot,revision,crafting,stash FROM slots ORDER BY slot').fetchall()==[
                    (10,view['accountRevision'],view['account'],view['extra']),(20,view['workshopRevision'],view['workshop'],view['stash'])]
            with closing(sqlite3.connect(course/(stage+'-publication.db'))) as db:
                rows=db.execute('SELECT slot,revision,crafting FROM slots ORDER BY slot').fetchall()
                assert [(r[0],r[1]) for r in rows]==[(10,2),(20,2)]
                assert json.loads(rows[0][2])==expected['publication-failure']['account']
                assert json.loads(rows[1][2])==expected['publication-failure']['workshop']
            report['results'][stage]=result
        for method,marker in [('VerifyPlayExit','HWE_ACCOUNT_PLAY_EXIT'),('VerifyReload','HWE_ACCOUNT_RELOAD')]:
            launch(args.editor,['-projectPath',project,'-executeMethod','AccountStorageChecks.'+method],
                   ROOT,env,course/(method+'.log'),marker)
        report['lifecycle']={}
        for stage in ('play-entry-0','play-exit-0','play-entry-1','play-exit-1','reload'):
            result=read(course/(stage+'-lifecycle.json'));assert result==dict(passed=True,closed=True,stage=stage)
            report['lifecycle'][stage]=result
            with closing(sqlite3.connect(course/(stage+'.db'))) as db:
                rows=db.execute('SELECT slot,revision,crafting FROM slots ORDER BY slot').fetchall()
                assert [(r[0],r[1]) for r in rows]==[(10,1),(20,1)]
                assert json.loads(rows[0][2])==expected['initial']['account']
                assert json.loads(rows[1][2])==expected['initial']['workshop']
        launch(args.editor,['-quit','-projectPath',project,'-executeMethod','AccountStorageChecks.ImportSample'],
               ROOT,env,course/'sample-import.log','HWE_ACCOUNT_SAMPLE_IMPORTED')
        for file in ('AccountSampleReplay.cs','Editor/AccountSampleChecks.cs'):
            shutil.copyfile(ROOT/'test/unity-account-storage'/file,project/'Assets'/file)
        launch(args.editor,['-quit','-projectPath',project,'-executeMethod','AccountSampleChecks.VerifyAndBuild'],
               ROOT,env,course/'sample-editor.log','HWE_ACCOUNT_SAMPLE_BUILT')
        sample_player=course/'SampleRelocated';(course/'SampleBuilt').rename(sample_player)
        for name,key in [('hwe_embedded.dll','com.hollowwake.gameplay'),('hwe_save.dll','com.hollowwake.storage')]:
            libraries=list(sample_player.rglob(name));assert len(libraries)==1 and digest(libraries[0])==packages[key]['nativeSha256']
        launch(sample_player/'AccountSample.exe',[],ROOT,env,course/'sample-player.log')
        report['sample']={}
        sample_expected=read(course/'inputs.json')['sampleExpected']
        for stage in ('sample-editor','sample-player'):
            result=read(course/(stage+'-result.json'));assert result==dict(passed=True,closed=True)
            for label in ('initial','memory','forge','continued'):
                for owner in ('account','workshop'):
                    assert read(course/(stage+'-'+label+'-'+owner+'.json'))==sample_expected[label][owner],(stage,label,owner)
            with closing(sqlite3.connect(course/(stage+'-saves')/'account-inventory.db')) as db:
                assert db.execute('PRAGMA integrity_check').fetchone()==('ok',)
                rows=db.execute('SELECT slot,revision,crafting FROM slots ORDER BY slot').fetchall()
                assert [(r[0],r[1]) for r in rows]==[(10,4),(20,4)]
                assert json.loads(rows[0][2])==sample_expected['continued']['account']
                assert json.loads(rows[1][2])==sample_expected['continued']['workshop']
            report['sample'][stage]=result
        if args.mutations:
            report['faults']=[]
            faults=[
                ('early-current','ticket=submitted.Value;return Pending();','ticket=submitted.Value;Current=pendingView;return Pending();','Initial group published early'),
                ('accept-false','return envelope.ok && envelope.result;','return envelope.ok;','Refused purchase admitted paired inventory'),
                ('failed-current','if(!saved.Succeeded) { Discard();return StorageRefused(saved); }',
                 'if(!saved.Succeeded) { Current=pendingView;Discard();return StorageRefused(saved); }','Busy group published candidates'),
                ('retain-postcommit','try { Dispose(); } catch(Exception closing) { error=new AggregateException(error,closing); }',
                 'try { GC.KeepAlive(this); } catch(Exception closing) { error=new AggregateException(error,closing); }','Post-commit publication failure left owner live'),
            ]
            receipt=packages['com.hollowwake.storage'];original=args.storage/receipt['file']
            original_sha=digest(original)
            for name,before,after,assertion in faults:
                trial=course/('fault-'+name);trial.mkdir()
                shutil.copyfile(course/'inputs.json',trial/'inputs.json')
                archive=project/'Packages'/('fault-'+name+'.tgz')
                fault_archive(original,archive,before,after)
                dependencies['com.hollowwake.storage']='file:'+archive.name
                (project/'Packages/manifest.json').write_text(json.dumps(dict(dependencies=dependencies)),encoding='utf-8')
                trial_env=dict(env,HWE_ACCOUNT_STORAGE_WORK=str(trial))
                log=course/('fault-'+name+'.log')
                try:
                    launch(args.editor,['-quit','-projectPath',project,'-executeMethod','AccountStorageChecks.VerifyFault'],
                           ROOT,trial_env,log,'HWE_ACCOUNT_FAULT_SURVIVED')
                except RuntimeError:
                    body=log.read_text(encoding='utf-8',errors='replace')
                    assert 'Exception: '+assertion in body and 'error CS' not in body and 'HWE_ACCOUNT_FAULT_SURVIVED' not in body,name
                else:raise AssertionError('Fault escaped: '+name)
                report['faults'].append(dict(name=name,detected=True,assertion=assertion,archiveSha256=digest(archive)))
                assert digest(original)==original_sha
        report['passed']=True
    except BaseException as error:
        report['failure']=str(error);raise
    finally:
        for file,sha in hashes.items():assert digest(ROOT/file)==sha,file
        for file in course.iterdir():
            if file.is_file() and file.name!='assets.json' and file.suffix in ('.json','.log'):
                raw[file.name]=file.read_text(encoding='utf-8',errors='replace')
        packed=gzip.compress(json.dumps(raw,ensure_ascii=False).encode(),mtime=0)
        report['rawSha256']=hashlib.sha256(packed).hexdigest()
        Path(str(args.output)+'.raw.json.gz').write_bytes(packed)
        args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--mutations',action='store_true')
    for flag in ('editor','gameplay','storage','output'):parser.add_argument('--'+flag,type=Path,required=True)
    args=parser.parse_args()
    for flag in ('editor','gameplay','storage','output'):setattr(args,flag,getattr(args,flag).resolve())
    assert os.name=='nt' and not args.output.exists() and not Path(str(args.output)+'.raw.json.gz').exists()
    with owned_workspace() as work:report=verify(args,work)
    report['cleaned']=True
    args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(passed=report['passed'],output=str(args.output),cleaned=True)))
