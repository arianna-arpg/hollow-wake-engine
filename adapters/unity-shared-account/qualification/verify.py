"""Exercise the typed shared owner in an actual Unity editor and relocated player."""
import argparse,gzip,hashlib,json,os,runpy,shutil,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
ARTIFACTS=(ROOT/'.artifacts').resolve()
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def read(file):return json.loads(file.read_text(encoding='utf-8-sig'))
def compact(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def normalize(request):
    request=dict(request);op=request['op']
    if op=='prepare-text':return dict(op='prepare',commands=[normalize(row) for row in json.loads(request['text'])])
    if op in ['account-command-text','workshop-command-text']:
        request['op']=op.split('-')[0];request['command']=json.loads(request.pop('text'))
    elif op.endswith('-save-text'):
        request['op']=op[:-5]
    if request['op'] in ['account','workshop']:request['text']=compact(request.pop('command'))
    if request['op']=='prepare':request['commands']=[normalize(row) if 'text' not in row else row for row in request['commands']]
    return request
def inputs(courses):
    steps=[];expected=[]
    for course in courses:
        for row in course['rows']:
            step=normalize(row['request']);reply=dict(row['reply']);op=step['op']
            if op in ['account-save','workshop-save','prepared-save'] and reply['ok']:
                saved=reply.get('save') if 'save' in reply else json.loads(reply['text'])
                want=dict(text=saved,version=reply['version'],accountVersion=reply.get('accountVersion',0))
            elif op=='prepare' and reply['ok']:
                step['token']=reply['token'];want=dict(text=reply.get('replies') if 'replies' in reply else json.loads(reply['text']),hasChanges=bool(reply['token']),writes=reply['writes'])
            elif op=='abort-prepared':want=dict(ok=True) # Typed Dispose is idempotent; later saves prove no publication.
            elif not reply['ok'] and op in ['prepare','prepared-save','commit-prepared']:
                step['throws']=True;want=dict(threw=True)
            elif op in ['open-account','open-workshop','close-account','close-workshop','commit-prepared']:want=dict(ok=True)
            else:want=reply
            if op=='open-account':
                step['text']=compact({key:step.pop(key) for key in ['state','craftLore','extra'] if key in step})
            if op=='open-workshop':
                step['text']=compact(step.pop('state'));step.setdefault('progression',True);step.setdefault('nextUid',0)
            steps.append(step);expected.append(want)
    assert len(steps)==84
    return dict(steps=steps),expected
def verify(editor,package,output):
    assert os.name=='nt' and not output.exists() and not Path(str(output)+'.raw.json.gz').exists()
    owned=Path(tempfile.mkdtemp(prefix='unity-shared-account-',dir=ARTIFACTS)).resolve();assert owned.parent==ARTIFACTS
    course=owned/'course';course.mkdir();project=owned/'project';raw={}
    source_names=['adapters/unity-shared-account/qualification/'+name for name in ['verify.py','SharedAccountReplay.cs','Editor/SharedAccountChecks.cs']]
    sources={name:digest(ROOT/name) for name in source_names}
    report=dict(passed=False,cleaned=False,sources=sources,scope='Candidate typed shared owner in Unity 2021.3.6f1 Windows x64 Mono; storage and physical-device qualification remain separate')
    try:
        receipt=read(package/'package-receipt.json');archive=package/receipt['file'];assert archive.parent==package and digest(archive)==receipt['sha256']
        for file,sha in receipt['sources'].items():assert digest(ROOT/file)==sha,file
        report['package']=receipt
        fixture=json.loads(gzip.decompress((package/'qualification-inputs.json.gz').read_bytes()))
        prepared=json.loads(fixture['prepared.json']);data,expected=inputs(prepared)
        (course/'inputs.json').write_text(compact(data),encoding='utf-8')
        (course/'expected.json').write_text(compact(expected),encoding='utf-8')
        for name in ['Assets/Editor','Packages','ProjectSettings']:(project/name).mkdir(parents=True,exist_ok=True)
        shutil.copyfile(archive,project/'Packages'/archive.name)
        (project/'Packages/manifest.json').write_text(compact(dict(dependencies={'com.unity.modules.jsonserialize':'1.0.0','com.unity.modules.imgui':'1.0.0','com.hollowwake.gameplay':'file:'+archive.name})),encoding='utf-8')
        (project/'ProjectSettings/ProjectVersion.txt').write_text('m_EditorVersion: 2021.3.6f1\n',encoding='ascii')
        for name in ['SharedAccountReplay.cs','Editor/SharedAccountChecks.cs']:shutil.copyfile(ROOT/'adapters/unity-shared-account/qualification'/name,project/'Assets'/name)
        for name in ['temp','cache']:(owned/name).mkdir()
        env=dict(os.environ,TEMP=str(owned/'temp'),TMP=str(owned/'temp'),TMPDIR=str(owned/'temp'),UPM_CACHE_ROOT=str(owned/'cache'),HWE_SHARED_ACCOUNT_WORK=str(course))
        launch=runpy.run_path(str(ROOT/'scripts/verify-unity-storage.py'))['launch']
        launch(editor,['-quit','-projectPath',project,'-buildTarget','Win64','-executeMethod','SharedAccountChecks.VerifyAndBuild'],ROOT,env,course/'editor.log','HWE_SHARED_ACCOUNT_BUILT')
        built=course/'Built';relocated=course/'Relocated';assert built.parent==relocated.parent==course;built.rename(relocated)
        libraries=list(relocated.rglob('hwe_embedded.dll'));assert len(libraries)==1 and digest(libraries[0])==receipt['nativeSha256']
        launch(relocated/'SharedAccount.exe',[],ROOT,env,course/'player.log')
        report['results']={}
        for stage in ['editor','player']:
            result=read(course/(stage+'-result.json'));assert result['stage']==stage and result['unity']=='2021.3.6f1'
            for flag in ['passed','closed','retiredAccount','retiredInventory','retiredCommand','ownerDisposal','foreignOwner','documentationExample']:assert result[flag],(stage,flag)
            assert read(course/(stage+'-documentation-account.json'))['progression']['account']['credits']==970
            assert 'account' not in read(course/(stage+'-documentation-inventory.json'))['workshop']['state']
            assert 0<result['peak']<=32*1024*1024
            replies=[json.loads(line) for line in (course/(stage+'-replies.jsonl')).read_text(encoding='utf-8-sig').splitlines()]
            assert len(replies)==len(expected)==result['steps']
            for index,(got,want) in enumerate(zip(replies,expected)):
                if 'text' in got:got['text']=json.loads(got['text'])
                assert got==want,(stage,index,got,want)
            report['results'][stage]=result
        report['passed']=True
    except BaseException as error:
        report['failure']=str(error);raise
    finally:
        report['inputsUnchanged']=all(digest(ROOT/file)==sha for file,sha in sources.items())
        report['passed']=report['passed'] and report['inputsUnchanged']
        for file in course.iterdir():
            if file.is_file() and file.suffix in ['.json','.jsonl','.log']:raw[file.name]=file.read_text(encoding='utf-8',errors='replace')
        packed=gzip.compress(compact(raw).encode(),mtime=0);report['rawSha256']=hashlib.sha256(packed).hexdigest()
        Path(str(output)+'.raw.json.gz').write_bytes(packed)
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
        finally:output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ['editor','package','output']:parser.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args();report=verify(args.editor.resolve(),args.package.resolve(),args.output.resolve())
    print(compact(dict(passed=report['passed'],cleaned=report['cleaned'],results=report['results'])))
