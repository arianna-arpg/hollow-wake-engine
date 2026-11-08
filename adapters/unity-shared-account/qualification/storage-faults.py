"""Require real Unity assertions to reject broken durable coordinator archives."""
import argparse,gzip,hashlib,json,os,runpy,shutil,subprocess,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];ARTIFACTS=(ROOT/'.artifacts').resolve()
def sha(data):return hashlib.sha256(data).hexdigest()
def read(file):return json.loads(file.read_text(encoding='utf-8-sig'))
def verify(args):
    assert not args.output.exists();args.output.mkdir()
    work=Path(tempfile.mkdtemp(prefix='unity-shared-faults-',dir=ARTIFACTS)).resolve();assert work.parent==ARTIFACTS
    helper=runpy.run_path(str(ROOT/'experiments/embedded-js/patches/unity-cleanup-archive.py'))
    base=read(args.storage/'package-receipt.json');archive=args.storage/base['file'];assert sha(archive.read_bytes())==base['sha256']
    entries=helper['load'](archive);target='package/Runtime/GameplayBridge/DurableSharedAccount.cs';source=entries[target].decode()
    names=['adapters/unity-shared-account/qualification/'+name for name in ['storage-faults.py','verify-storage.py','SharedStorageReplay.cs','Editor/SharedStorageChecks.cs']]+['adapters/unity-shared-account/Storage/DurableSharedAccount.cs']
    sources={name:sha((ROOT/name).read_bytes()) for name in names};raw={}
    report=dict(passed=False,cleaned=False,sources=sources,basePackageSha256=base['sha256'],faults=[])
    faults=[
        ('omit-unchanged-dependency','var result=storage.Store.SubmitGroup(writes);',
         'var selected=new System.Collections.Generic.List<SaveWrite>(); if(pending==null)selected.AddRange(writes); else foreach(var change in pending.Writes)selected.Add(writes[change.Kind=="account"?0:(int)change.Handle]); var result=storage.Store.SubmitGroup(selected.ToArray());',
         'Unchanged dependency was not guarded'),
        ('publish-before-ack','ticket=result.Value;return Waiting();','ticket=result.Value;Current=pendingView;return Waiting();','Initial group published before acknowledgement'),
        ('lose-publication','pending?.Commit();Current=pendingView;','pending?.Commit();','Initial group failed'),
        ('ignore-gameplay-policy','if(!accept(pending.RepliesJson))','if(false)','Refused gameplay result published salvage'),
        ('retain-aborted-proposal','try { pending?.Dispose(); }','try { if(false)pending?.Dispose(); }','Policy exception left a proposal'),
        ('leave-storage-open','try{Dispose();}catch(Exception closing){error=new AggregateException(error,closing);}',
         'try{}catch(Exception closing){error=new AggregateException(error,closing);}','Post-commit failure left the storage worker open')]
    def run(name,package):
        output=work/(name+'.json')
        process=subprocess.run([sys.executable,'-I','-B',str(ROOT/'adapters/unity-shared-account/qualification/verify-storage.py'),
            '--editor',str(args.editor),'--gameplay',str(args.gameplay),'--storage',str(package),'--output',str(output)],
            cwd=ROOT,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=900,creationflags=subprocess.CREATE_NO_WINDOW)
        observed=read(output);capture=json.loads(gzip.decompress(Path(str(output)+'.raw.json.gz').read_bytes()))
        raw[name]=dict(report=observed,observations=capture,status=process.returncode,stdout=process.stdout,stderr=process.stderr)
        assert observed['cleaned'] and observed['inputsUnchanged'],name
        return process.returncode,observed
    try:
        status,control=run('control',args.storage);assert status==0 and control['passed'];report['control']=control
        for name,needle,replacement,message in faults:
            assert source.count(needle)==1,name
            folder=work/name;folder.mkdir();mutated=dict(entries);mutated[target]=source.replace(needle,replacement).encode()
            packed=folder/base['file'];helper['save'](mutated,packed);assert helper['load'](packed)==mutated
            receipt={**base,'sha256':sha(packed.read_bytes()),'files':{file:sha(body) for file,body in mutated.items()},
                'faultControl':dict(name=name,baseSha256=base['sha256'],file=target,needle=needle,replacement=replacement)}
            (folder/'package-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
            status,observed=run(name,folder)
            assert status!=0 and not observed['passed'] and message in observed.get('failure',''),(name,status,observed.get('failure'))
            report['faults'].append(dict(name=name,detected=True,assertion=message,archiveSha256=receipt['sha256'],sourceSha256=sha(mutated[target])))
            print(json.dumps(report['faults'][-1]),flush=True)
        report['passed']=True
    finally:
        report['inputsUnchanged']=all(sha((ROOT/file).read_bytes())==digest for file,digest in sources.items());report['passed']=report['passed'] and report['inputsUnchanged']
        packed=gzip.compress(json.dumps(raw,ensure_ascii=False).encode(),mtime=0);(args.output/'raw.json.gz').write_bytes(packed);report['rawSha256']=sha(packed)
        try:
            assert work.resolve().parent==ARTIFACTS;shutil.rmtree(work);report['cleaned']=True
        finally:(args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ['editor','gameplay','storage','output']:parser.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args()
    for name in ['editor','gameplay','storage','output']:setattr(args,name,getattr(args,name).resolve())
    report=verify(args);print(json.dumps(dict(passed=report['passed'],faults=len(report['faults']),cleaned=report['cleaned'])))
