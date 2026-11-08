"""Prove Unity ownership/restore checks reject concrete defects in actual UPM archives."""
import argparse,gzip,hashlib,json,os,runpy,shutil,subprocess,tarfile
from pathlib import Path,PurePosixPath
ROOT=Path(__file__).resolve().parents[1]
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def read(file):return json.loads(file.read_text(encoding='utf-8'))
def controls(args,work):
    accepted=read(args.acceptance);assert accepted['passed']
    for file,sha in accepted['sources'].items():assert digest(ROOT/file)==sha,file
    receipt=read(args.gameplay/'package-receipt.json');archive=args.gameplay/receipt['file']
    assert digest(archive)==receipt['sha256']==accepted['package']['sha256']
    for file,sha in receipt['sources'].items():assert digest(ROOT/file)==sha,file
    sources=['scripts/test-unity-progression-faults.py','scripts/verify-unity-progression.py',
             'scripts/unity-package-archive.py','test/unity-progression/Editor/ProgressionFaultChecks.cs']
    hashes={file:digest(ROOT/file) for file in sources}
    report=dict(passed=False,acceptanceSha256=digest(args.acceptance),packageSha256=receipt['sha256'],sources=hashes,cases=[])
    raw={};project=work/'project';stage=work/'stage';stage.mkdir()
    for folder in ('Assets/Editor','Packages','ProjectSettings'):(project/folder).mkdir(parents=True,exist_ok=True)
    with tarfile.open(archive) as packed:
        for member in packed.getmembers():
            name=PurePosixPath(member.name)
            assert member.isfile() and name.parts[0]=='package' and '..' not in name.parts
            if member.name.endswith('.meta'):continue
            target=stage.joinpath(*name.parts[1:]);target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(packed.extractfile(member).read())
    file=stage/'Runtime/AccountProgression.cs';good=file.read_text(encoding='utf-8')
    shutil.copyfile(ROOT/'test/unity-progression/Editor/ProgressionFaultChecks.cs',project/'Assets/Editor/ProgressionFaultChecks.cs')
    (project/'ProjectSettings/ProjectVersion.txt').write_text('m_EditorVersion: 2021.3.6f1\n',encoding='ascii')
    for folder in ('temp','cache'):(work/folder).mkdir()
    env=dict(os.environ,TEMP=str(work/'temp'),TMP=str(work/'temp'),TMPDIR=str(work/'temp'),UPM_CACHE_ROOT=str(work/'cache'))
    variants=[
        ('baseline',None,None,None),
        ('retired-handle','if(closed)throw new ObjectDisposedException(nameof(Profile));',
         '/* deliberate missing profile retirement check */','Retired profile reached replacement'),
        ('cross-profile','op="profile-command",profile=id,text=commandJson',
         'op="profile-command",profile=0,text=commandJson','Cross-profile purchase changed another account'),
        ('restore-reset','new TextRequest {op="restore-text",profile=id,text=snapshotJson}',
         'new OpenRequest {op="open",profile=id,seed=0}','Restore changed complete snapshot'),
        ('rules-integrity',None,None,'Mismatched Hollow Wake asset ProgressionRules'),
        ('content-integrity',None,None,'Mismatched Hollow Wake asset ProgressionContent')]
    try:
        for name,before,after,expected in variants:
            file.write_text(good,encoding='utf-8')
            if before:
                assert good.count(before)==1,name
                file.write_text(good.replace(before,after),encoding='utf-8')
            asset=None;original=None
            if name.endswith('-integrity'):
                asset=stage/'Runtime/Resources/HollowWake'/('ProgressionRules.bytes' if name=='rules-integrity' else 'ProgressionContent.bytes')
                original=asset.read_bytes();asset.write_bytes(original+b' ')
            output=project/'Packages'/(name+'.tgz')
            try:runpy.run_path(str(ROOT/'scripts/unity-package-archive.py'))['package'](stage,output)
            finally:
                if asset:asset.write_bytes(original)
            dependencies={'com.unity.modules.jsonserialize':'1.0.0','com.unity.modules.imgui':'1.0.0',receipt['name']:'file:'+output.name}
            (project/'Packages/manifest.json').write_text(json.dumps(dict(dependencies=dependencies)),encoding='utf-8')
            log=work/(name+'.log')
            result=subprocess.run([str(args.editor),'-batchmode','-nographics','-quit','-projectPath',str(project),
                '-logFile',str(log),'-executeMethod','ProgressionFaultChecks.Run'],cwd=ROOT,env=env,timeout=420,
                creationflags=subprocess.CREATE_NO_WINDOW)
            text=log.read_text(encoding='utf-8',errors='replace');raw[name]=text
            if expected:
                assert result.returncode!=0 and expected in text,(name,result.returncode,expected)
                assert 'HWE_PROGRESSION_CONTROLS_PASSED' not in text,name
            else:
                assert result.returncode==0 and 'HWE_PROGRESSION_CONTROLS_PASSED' in text,name
            assert 'error CS' not in text,name
            report['cases'].append(dict(name=name,rejected=bool(expected),exitCode=result.returncode,
                expectedFailure=expected,packageSha256=digest(output),logSha256=digest(log)))
        report['passed']=True
    finally:
        assert digest(archive)==receipt['sha256'];report['originalArchiveUnchanged']=True
        for name,sha in hashes.items():assert digest(ROOT/name)==sha,name
        packed=gzip.compress(json.dumps(raw).encode(),mtime=0);report['rawSha256']=hashlib.sha256(packed).hexdigest()
        Path(str(args.output)+'.raw.json.gz').write_bytes(packed)
        args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for flag in ('editor','gameplay','acceptance','output'):parser.add_argument('--'+flag,type=Path,required=True)
    args=parser.parse_args()
    for flag in ('editor','gameplay','acceptance','output'):setattr(args,flag,getattr(args,flag).resolve())
    assert os.name=='nt' and not args.output.exists() and not Path(str(args.output)+'.raw.json.gz').exists()
    owned_workspace=runpy.run_path(str(ROOT/'scripts/verify-unity-progression.py'))['owned_workspace']
    with owned_workspace() as work:report=controls(args,work)
    report['cleaned']=True
    args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(passed=report['passed'],cases=len(report['cases']),cleaned=True)))
