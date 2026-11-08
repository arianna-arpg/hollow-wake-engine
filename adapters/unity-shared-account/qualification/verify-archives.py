"""Rebuild both previews and check immutable parent files and refusal controls."""
import argparse,hashlib,json,runpy,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];ARTIFACTS=(ROOT/'.artifacts').resolve()
def digest(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def read(file):return json.loads(file.read_text(encoding='utf-8'))
def verify(args):
    assert not args.output.exists()
    base=ROOT/'adapters/unity-shared-account/qualification'
    gameplay=runpy.run_path(str(base/'package.py'))['package'];storage=runpy.run_path(str(base/'storage-package.py'))['package']
    load=runpy.run_path(str(ROOT/'experiments/embedded-js/patches/unity-cleanup-archive.py'))['load']
    source_names=['adapters/unity-shared-account/qualification/'+name for name in ['verify-archives.py','package.py','storage-package.py']]+['experiments/embedded-js/patches/unity-cleanup-archive.py']
    sources={name:digest(ROOT/name) for name in source_names};controls=[];report=dict(passed=False,cleaned=False,sources=sources)
    def refuse(name,action):
        try:action()
        except (AssertionError,FileExistsError):controls.append(name)
        else:raise AssertionError('Invalid input admitted: '+name)
    try:
        with tempfile.TemporaryDirectory(prefix='shared-archive-controls-',dir=ARTIFACTS) as temp:
            work=Path(temp).resolve();assert work.parent==ARTIFACTS
            packages={}
            for name,builder,parent in [('gameplay',gameplay,args.gameplay_parent),('storage',storage,args.storage_parent)]:
                folder=getattr(args,name);expected=read(folder/'package-receipt.json');original=folder/expected['file']
                assert digest(original)==expected['sha256'];before=load(parent);after=load(original)
                # Existing native binaries, resource bytes, sample files and GUIDs
                # survive exactly, independently of the builder's change list.
                protected=[file for file in before if file.endswith('.meta') or file.startswith(('package/Runtime/Native/','package/Runtime/Resources/','package/Samples~/'))]
                assert protected and all(before[file]==after[file] for file in protected)
                controls.append(name+'-preserved-native-content-samples-guids')
                call=(lambda output:builder(parent,args.embedded,output)) if name=='gameplay' else (lambda output:builder(parent,output))
                built=call(work/name);assert (work/name/built['file']).read_bytes()==original.read_bytes()
                assert built==expected;controls.append(name+'-exact-rebuild')
                refuse(name+'-existing-output',lambda:call(work/name))
                bad=work/(name+'-wrong-parent.tgz');bad.write_bytes(parent.read_bytes()+b'changed')
                refuse(name+'-wrong-parent',(lambda:gameplay(bad,args.embedded,work/'bad-gameplay')) if name=='gameplay' else (lambda:storage(bad,work/'bad-storage')))
                packages[name]=expected['sha256']
            invalid=work/'embedded';invalid.mkdir()
            original=read(args.embedded/'report.json')
            for name,change in [('failed-native-course',lambda r:r.update(passed=False)),('changed-source',lambda r:r['sources'].update({'adapters/embedded/account-workshop-session.mjs':'0'*64}))]:
                changed=json.loads(json.dumps(original));change(changed)
                (invalid/'report.json').write_text(json.dumps(changed),encoding='utf-8')
                refuse(name,lambda:gameplay(args.gameplay_parent,invalid,work/name))
            report.update(packages=packages,controls=controls,passed=True)
        report['cleaned']=True
    finally:
        report['inputsUnchanged']=all(digest(ROOT/name)==sha for name,sha in sources.items())
        report['passed']=report['passed'] and report['inputsUnchanged']
        args.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ['gameplay-parent','storage-parent','embedded','gameplay','storage','output']:parser.add_argument('--'+name,type=lambda p:Path(p).resolve(),required=True)
    result=verify(parser.parse_args());print(json.dumps(result))
