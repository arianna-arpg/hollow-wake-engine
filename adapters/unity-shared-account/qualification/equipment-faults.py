"""Require real Unity assertions to distinguish broken shared equipment archives."""
import argparse,gzip,hashlib,json,os,runpy,shutil,subprocess,sys,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];ARTIFACTS=(ROOT/'.artifacts').resolve()

def sha(data):return hashlib.sha256(data).hexdigest()

def read(file):return json.loads(file.read_text(encoding='utf-8-sig'))

def verify(args):
    assert not args.output.exists();args.output.mkdir()
    work=Path(tempfile.mkdtemp(prefix='unity-equipment-faults-',dir=ARTIFACTS)).resolve();assert work.parent==ARTIFACTS
    names=['adapters/unity-shared-account/qualification/'+name for name in ['equipment-faults.py','verify-equipment.py','SharedEquipmentReplay.cs','Editor/SharedEquipmentChecks.cs']]+['adapters/unity-shared-account/Storage/DurableSharedAccount.cs']
    sources={name:sha((ROOT/name).read_bytes()) for name in names};raw={}
    report=dict(passed=False,cleaned=False,sources=sources,faults=[],scope='Actual Unity Windows x64 editor assertions; unchanged editor/player/lifecycle control; no device acceptance')
    try:
        helper=runpy.run_path(str(ROOT/'experiments/embedded-js/patches/unity-cleanup-archive.py'))
        base=read(args.packages/'storage/package-receipt.json');archive=args.packages/'storage'/base['file'];assert sha(archive.read_bytes())==base['sha256']
        entries=helper['load'](archive);target='package/Runtime/GameplayBridge/DurableSharedAccount.cs';source=entries[target].decode();report['basePackageSha256']=base['sha256']
        faults=[
            ('early-equipment','ticket=result.Value;return Waiting();','PublishEquipment();ticket=result.Value;return Waiting();','Prepared gear was exposed'),
            ('omit-later-actor','foreach(var link in linked)link.Pending?.Publish();','foreach(var link in linked)if(link==linked[0]||link.NextGear=="{}")link.Pending?.Publish();','Shared equip restored stale resources'),
            ('account-only-combat-work','if(!changed){link.NextGear=link.CurrentGear;continue;}','if(!changed){link.NextGear=link.CurrentGear;link.Pending=link.Actor.PrepareEquipment(link.CurrentGear);continue;}','Account-only change rebuilt combat equipment'),
            ('ignore-unsupported','link.Pending=link.Actor.PrepareEquipment(link.NextGear);','try{link.Pending=link.Actor.PrepareEquipment(link.NextGear);}catch(InvalidOperationException){}','Unsupported later actor retained an earlier projection'),
            ('abandoned-projection','try{link.Pending?.Dispose();}','try{if(false)link.Pending?.Dispose();}','Shared equipment retained an abandoned actor projection'),
            ('retain-owned-actors','if(disposeActors)try{link.Actor.Dispose();}','if(false)try{link.Actor.Dispose();}','Shared owner disposed wrong actors'),
            ('omit-unchanged-dependency','var result=storage.Store.SubmitGroup(writes);','var selected=new System.Collections.Generic.List<SaveWrite>();if(pending==null||pending.Writes.Count!=1||pending.Writes[0].Kind!="workshop")selected.AddRange(writes);else foreach(var change in pending.Writes)selected.Add(writes[change.Kind=="account"?0:(int)change.Handle]);var result=storage.Store.SubmitGroup(selected.ToArray());','Stale dependency published linked gear')]
        def mutated(name,edits):
            body=source
            for needle,replacement in edits:
                assert body.count(needle)==1,(name,needle);body=body.replace(needle,replacement)
            folder=work/name;folder.mkdir();shutil.copytree(args.packages/'gameplay',folder/'gameplay');(folder/'storage').mkdir()
            changed=dict(entries);changed[target]=body.encode();packed=folder/'storage'/base['file'];helper['save'](changed,packed);assert helper['load'](packed)==changed
            receipt={**base,'sha256':sha(packed.read_bytes()),'files':{file:sha(data) for file,data in changed.items()},'faultControl':dict(name=name,baseSha256=base['sha256'],file=target,edits=edits)}
            (folder/'storage/package-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8');return folder,receipt
        def run(name,packages,mode):
            output=work/(name+'.json')
            process=subprocess.run([sys.executable,'-I','-B',str(ROOT/'adapters/unity-shared-account/qualification/verify-equipment.py'),'--editor',str(args.editor),'--packages',str(packages),'--output',str(output),'--mode',mode],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=1800,creationflags=subprocess.CREATE_NO_WINDOW)
            observed=read(output);capture=json.loads(gzip.decompress(Path(str(output)+'.raw.json.gz').read_bytes()))
            raw[name]=dict(report=observed,observations=capture,status=process.returncode,stdout=process.stdout,stderr=process.stderr)
            assert observed['cleaned'] and observed['inputsUnchanged'],name
            return process.returncode,observed
        status,control=run('control',args.packages,'complete');assert status==0 and control['passed'];report['control']=control
        print(json.dumps(dict(control=True)),flush=True)
        for name,needle,replacement,message in faults:
            folder,receipt=mutated(name,[(needle,replacement)]);status,observed=run(name,folder,'editor')
            assert status!=0 and not observed['passed'] and message in observed.get('failure',''),(name,status,observed.get('failure'))
            report['faults'].append(dict(name=name,detected=True,assertion=message,archiveSha256=receipt['sha256'],sourceSha256=receipt['files'][target]));print(json.dumps(report['faults'][-1]),flush=True)
        needle='foreach(var link in linked)link.Pending?.Publish();'
        replacement='int published=0;foreach(var link in linked){if(link.Pending!=null&&link.NextGear!="{}"&&++published==2)throw new InvalidOperationException("Injected second equipment publication");link.Pending?.Publish();}'
        edits=[(needle,replacement)];folder,receipt=mutated('partial-publication',edits)
        status,observed=run('partial-publication',folder,'publication-failure');assert status==0 and observed['passed']
        report['partialPublication']=dict(passed=True,archiveSha256=receipt['sha256'],report=observed);print(json.dumps(dict(partialPublication=True)),flush=True)
        folder,receipt=mutated('partial-publication-retained-actor',edits+[('if(disposeActors)try{link.Actor.Dispose();}','if(false)try{link.Actor.Dispose();}')])
        status,observed=run('partial-publication-retained-actor',folder,'publication-failure');message='Partial equipment publication failed to retire every bound actor'
        assert status!=0 and not observed['passed'] and message in observed.get('failure',''),(status,observed.get('failure'))
        report['faults'].append(dict(name='partial-publication-retained-actor',detected=True,assertion=message,archiveSha256=receipt['sha256'],sourceSha256=receipt['files'][target]));print(json.dumps(report['faults'][-1]),flush=True)
        report['passed']=True
    except BaseException as error:report['failure']=str(error);raise
    finally:
        report['inputsUnchanged']=all(sha((ROOT/file).read_bytes())==digest for file,digest in sources.items());report['passed']=report['passed'] and report['inputsUnchanged']
        packed=gzip.compress(json.dumps(raw,ensure_ascii=False).encode(),mtime=0);(args.output/'raw.json.gz').write_bytes(packed);report['rawSha256']=sha(packed)
        try:
            deadline=time.monotonic()+20
            while work.exists():
                assert work.resolve().parent==ARTIFACTS and work.name.startswith('unity-equipment-faults-')
                try:shutil.rmtree(work)
                except FileNotFoundError:
                    if work.exists():raise
                except PermissionError:
                    if time.monotonic()>=deadline:raise
                    time.sleep(.25)
            report['cleaned']=True
        finally:(args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ['editor','packages','output']:parser.add_argument('--'+name,type=lambda p:Path(p).resolve(),required=True)
    report=verify(parser.parse_args());print(json.dumps(dict(passed=report['passed'],faults=len(report['faults']),cleaned=report['cleaned'])))
