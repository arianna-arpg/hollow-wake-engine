"""Require concrete publication defects to fail the actual Unity actor/storage course."""
import argparse,gzip,hashlib,json,os,runpy,shutil,subprocess,tarfile,tempfile
from pathlib import Path,PurePosixPath
ROOT=Path(__file__).resolve().parents[1];ARTIFACTS=(ROOT/'.artifacts').resolve()
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def read(file):return json.loads(file.read_text(encoding='utf-8'))
def controls(args,work):
    accepted=read(args.acceptance);assert accepted['passed']
    for file,sha in accepted['sources'].items():assert digest(ROOT/file)==sha,file
    report=dict(passed=False,acceptanceSha256=digest(args.acceptance),cases=[])
    raw={}
    project=work/'project';stage=work/'storage';stage.mkdir()
    for folder in ('Assets/Editor','Packages','ProjectSettings'):(project/folder).mkdir(parents=True,exist_ok=True)
    dependencies={'com.unity.modules.jsonserialize':'1.0.0','com.unity.modules.imgui':'1.0.0'}
    for delivery in (args.gameplay,args.storage):
        receipt=read(delivery/'package-receipt.json');archive=delivery/receipt['file']
        assert digest(archive)==accepted['packages'][receipt['name']]['sha256']==receipt['sha256']
        for file,sha in receipt['sources'].items():assert digest(ROOT/file)==sha,file
        shutil.copyfile(archive,project/'Packages'/archive.name)
        dependencies[receipt['name']]='file:'+archive.name
    archive=args.storage/read(args.storage/'package-receipt.json')['file'];original=digest(archive)
    with tarfile.open(archive) as packed:
        for member in packed.getmembers():
            name=PurePosixPath(member.name)
            assert member.isfile() and name.parts[0]=='package' and '..' not in name.parts
            if member.name.endswith('.meta'):continue
            target=stage.joinpath(*name.parts[1:]);target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(packed.extractfile(member).read())
    file=stage/'Runtime/GameplayBridge/DurableWorkshop.cs';good=file.read_text(encoding='utf-8')
    shutil.copyfile(ROOT/'test/unity-live-equipment/EquipmentReplay.cs',project/'Assets/EquipmentReplay.cs')
    (project/'Assets/Editor/EquipmentFaultChecks.cs').write_text('public static class EquipmentFaultChecks { public static void Run() { EquipmentReplay.Run("fault"); UnityEngine.Debug.Log("HWE_EQUIPMENT_FAULT_SURVIVED"); } }',encoding='utf-8')
    (project/'ProjectSettings/ProjectVersion.txt').write_text('m_EditorVersion: 2021.3.6f1\n',encoding='ascii')
    for folder in ('temp','cache'):(work/folder).mkdir()
    env=dict(os.environ,TEMP=str(work/'temp'),TMP=str(work/'temp'),TMPDIR=str(work/'temp'),UPM_CACHE_ROOT=str(work/'cache'))
    variants=[
        ('early-equipment','var submitted=storage.Store.Submit(slot,Revision,candidateSnapshot,stash);',
         'equipment?.Publish();equipment=null;var submitted=storage.Store.Submit(slot,Revision,candidateSnapshot,stash);',
         'Gear published before observation'),
        ('missing-equipment','equipment?.Publish();equipment=null;currentEquipment=candidateEquipment;',
         'if(candidateEquipment=="{}")equipment?.Publish();equipment=null;currentEquipment=candidateEquipment;',
         'Equip changed paid mana'),
        ('continued-after-commit-failure','try { Dispose(); }\n                catch(Exception closing) { error=new AggregateException(error,closing); }',
         '/* deliberately keep the owner alive */',
         'Post-commit publication failure continued a stale actor'),
        ('cleanup-error-after-commit','\n        }\n    }\n}',
         '\n            if(ticket!=0) { Debug.Log("HWE_EQUIPMENT_CLEANUP_FAILURE");throw new IOException("Deliberate cleanup failure"); }\n        }\n    }\n}',
         'HWE_EQUIPMENT_CLEANUP_FAILURE')]
    try:
        for name,before,after,expected in variants:
            assert good.count(before)==1,name
            file.write_text(good.replace(before,after),encoding='utf-8')
            output=project/'Packages'/('fault-'+name+'.tgz')
            runpy.run_path(str(ROOT/'scripts/unity-package-archive.py'))['package'](stage,output)
            dependencies['com.hollowwake.storage']='file:'+output.name
            (project/'Packages/manifest.json').write_text(json.dumps(dict(dependencies=dependencies)),encoding='utf-8')
            course=work/name;course.mkdir();log=course/'editor.log'
            subprocess.run(['node',str(ROOT/'test/unity-live-equipment/inputs.mjs'),str(course/'inputs.json')],
                           cwd=ROOT,check=True,creationflags=subprocess.CREATE_NO_WINDOW)
            result=subprocess.run([str(args.editor),'-batchmode','-nographics','-quit','-projectPath',str(project),
                '-logFile',str(log),'-executeMethod','EquipmentFaultChecks.Run'],cwd=ROOT,
                env={**env,'HWE_EQUIPMENT_WORK':str(course)},timeout=420,creationflags=subprocess.CREATE_NO_WINDOW)
            text=log.read_text(encoding='utf-8',errors='replace');raw[name]=text
            recovery=name=='cleanup-error-after-commit'
            assert (result.returncode==0 if recovery else result.returncode!=0) and expected in text,(name,result.returncode,expected)
            assert 'error CS' not in text and (('HWE_EQUIPMENT_FAULT_SURVIVED' in text)==recovery),name
            report['cases'].append(dict(name=name,rejected=not recovery,exitCode=result.returncode,expectedFailure=expected,
                                       packageSha256=digest(output),sourceSha256=digest(file),logSha256=digest(log)))
            if recovery:report['cleanupFailureHandled']=True
        report['passed']=True
    finally:
        assert digest(archive)==original
        report['originalArchiveUnchanged']=True
        report['sources']={file:digest(ROOT/file) for file in ['scripts/test-live-equipment-unity-faults.py',
            'scripts/unity-package-archive.py','test/unity-live-equipment/inputs.mjs','test/unity-live-equipment/EquipmentReplay.cs']}
        packed=gzip.compress(json.dumps(raw).encode(),mtime=0);report['rawSha256']=hashlib.sha256(packed).hexdigest()
        Path(str(args.output)+'.raw.json.gz').write_bytes(packed);args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for flag in ('editor','gameplay','storage','acceptance','output'):parser.add_argument('--'+flag,type=Path,required=True)
    args=parser.parse_args()
    for flag in ('editor','gameplay','storage','acceptance','output'):setattr(args,flag,getattr(args,flag).resolve())
    assert os.name=='nt' and not args.output.exists() and not Path(str(args.output)+'.raw.json.gz').exists()
    with tempfile.TemporaryDirectory(prefix='live-equipment-unity-fault-',dir=ARTIFACTS) as temp:
        work=Path(temp).resolve();assert work.parent==ARTIFACTS
        report=controls(args,work)
    print(json.dumps(dict(passed=report['passed'],faults=len(report['cases']),cleaned=True)))
