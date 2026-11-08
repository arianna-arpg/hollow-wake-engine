"""Build a candidate additive package from the exact released cleanup archive."""
import argparse,gzip,hashlib,json,runpy,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def sha(data):return hashlib.sha256(data).hexdigest()
def package(parent,embedded,output):
    assert sha(parent.read_bytes())=='4fc024e559794f7be7da42f31331b831a7102474cd3355736c94da1966523303'
    report=json.loads((embedded/'report.json').read_text())
    assert report['passed'] and report['inputsUnchanged'] and report['cleaned']
    for file,digest in report['sources'].items():assert sha((ROOT/file).read_bytes())==digest,file
    packed=(embedded/'inputs.json.gz').read_bytes();assert sha(packed)==report['inputsSha256']
    inputs=json.loads(gzip.decompress(packed));assert report['observed']['preparedSteps']==84
    helper=runpy.run_path(str(ROOT/'experiments/embedded-js/patches/unity-cleanup-archive.py'))
    entries=helper['load'](parent);before=dict(entries)
    native='package/Runtime/Native/Windows/hwe_embedded.dll'
    assert sha(entries[native])==report['nativeSha256']
    sources=['adapters/unity/Runtime/GameplayHost.cs','adapters/unity-shared-account/Runtime/SharedAccountWorkshop.cs',
             'adapters/unity-shared-account/qualification/package.py','adapters/unity-shared-account/PackageREADME.md',
             'docs/prepared-account-changes.md','experiments/embedded-js/patches/unity-cleanup-archive.py']
    entries['package/Runtime/GameplayHost.cs']=(ROOT/sources[0]).read_bytes()
    entries['package/Runtime/SharedAccountWorkshop.cs']=(ROOT/sources[1]).read_bytes()
    entries['package/README.md']=(ROOT/'adapters/unity-shared-account/PackageREADME.md').read_bytes()
    guide=(ROOT/'docs/prepared-account-changes.md').read_text(encoding='utf-8')
    guide=guide.replace('(shared-account.md)','(https://github.com/arianna-arpg/hollow-wake-engine/blob/ee663a3449fbaa29e67ba65b5293f300a97ff837/docs/shared-account.md)')
    entries['package/Documentation~/SharedAccount.md']=guide.encode()
    for label,file in [('Rules','bundle.js'),('Content','content.json')]:
        body=inputs[file].encode();assert sha(body)==report['inputs'][file]['sha256']
        entries['package/Runtime/Resources/HollowWake/SharedAccount'+label+'.bytes']=body
    hashes='namespace HollowWake.Gameplay { internal static class SharedAccountPackHashes { '+''.join(
        'internal const string '+label+'="'+report['inputs'][file]['sha256']+'"; ' for label,file in [('Rules','bundle.js'),('Content','content.json')])+'} }\n'
    entries['package/Runtime/SharedAccountPackHashes.cs']=hashes.encode()
    for file in sorted(set(entries)-set(before)):
        if file.startswith('package/Documentation~/'):continue
        guid=uuid.uuid5(uuid.NAMESPACE_URL,'hollow-wake/shared-account/'+file).hex
        entries[file+'.meta']=('fileFormatVersion: 2\nguid: '+guid+'\n').encode()
    manifest=json.loads(entries['package/package.json']);manifest['version']='0.5.0-preview.1'
    entries['package/package.json']=(json.dumps(manifest,indent=2)+'\n').encode()
    changed=sorted(file for file in before if before[file]!=entries[file])
    assert changed==['package/README.md','package/Runtime/GameplayHost.cs','package/package.json']
    assert all(entries[file]==body for file,body in before.items() if file not in changed)
    output.mkdir();archive=output/'com.hollowwake.gameplay-0.5.0-preview.1.tgz';helper['save'](entries,archive)
    assert helper['load'](archive)==entries
    receipt=dict(candidate=True,engineQualified=False,deviceQualified=False,name=manifest['name'],version=manifest['version'],
        file=archive.name,bytes=archive.stat().st_size,sha256=sha(archive.read_bytes()),
        parentSha256=sha(parent.read_bytes()),nativeSha256=sha(entries[native]),embeddedReceiptSha256=sha((embedded/'report.json').read_bytes()),
        sources={file:sha((ROOT/file).read_bytes()) for file in sources},sdkSources=report['sources'],
        hashes={Path(file).stem:sha(body) for file,body in entries.items() if file.startswith('package/Runtime/Resources/HollowWake/') and file.endswith('.bytes')},changed=changed,
        added=sorted(set(entries)-set(before)),preservedFiles=len(before)-len(changed),
        files={file:sha(body) for file,body in entries.items()})
    (output/'package-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
    # Qualification inputs stay outside the distributable gameplay archive.
    (output/'qualification-inputs.json.gz').write_bytes(gzip.compress(json.dumps({name:inputs[name] for name in ['courses.json','prepared.json']}).encode(),mtime=0))
    return receipt
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ['parent','embedded','output']:parser.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args();receipt=package(args.parent.resolve(),args.embedded.resolve(),args.output.resolve())
    print(json.dumps({key:receipt[key] for key in ['file','sha256','preservedFiles']}))
