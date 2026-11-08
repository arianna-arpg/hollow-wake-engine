"""Add the shared coordinator without changing the qualified storage runtime."""
import argparse,hashlib,json,runpy,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def sha(data):return hashlib.sha256(data).hexdigest()
def package(parent,output):
    assert sha(parent.read_bytes())=='b42636e1e0b6f2b1ca7903a4a3b8774ba31c7d31207097f1f01dd961b183706c'
    helper=runpy.run_path(str(ROOT/'experiments/embedded-js/patches/unity-cleanup-archive.py'))
    entries=helper['load'](parent);before=dict(entries)
    sources=['adapters/unity-shared-account/Storage/DurableSharedAccount.cs','adapters/unity-shared-account/qualification/storage-package.py',
             'adapters/unity-shared-account/StoragePackageREADME.md','docs/prepared-account-changes.md','experiments/embedded-js/patches/unity-cleanup-archive.py']
    target='package/Runtime/GameplayBridge/DurableSharedAccount.cs';assert target not in entries
    entries[target]=(ROOT/sources[0]).read_bytes()
    entries['package/README.md']=(ROOT/'adapters/unity-shared-account/StoragePackageREADME.md').read_bytes()
    guide=(ROOT/'docs/prepared-account-changes.md').read_text(encoding='utf-8')
    guide=guide.replace('(shared-account.md)','(https://github.com/arianna-arpg/hollow-wake-engine/blob/ee663a3449fbaa29e67ba65b5293f300a97ff837/docs/shared-account.md)')
    entries['package/Documentation~/SharedAccount.md']=guide.encode()
    entries[target+'.meta']=('fileFormatVersion: 2\nguid: '+uuid.uuid5(uuid.NAMESPACE_URL,'hollow-wake/shared-account/'+target).hex+'\n').encode()
    asmdef='package/Runtime/GameplayBridge/HollowWake.Storage.Gameplay.asmdef';assembly=json.loads(entries[asmdef])
    assembly['versionDefines'].append(dict(name='com.hollowwake.gameplay',expression='0.5.0-preview.0',define='HWE_STORAGE_SHARED_ACCOUNT'))
    entries[asmdef]=(json.dumps(assembly,indent=2)+'\n').encode()
    manifest=json.loads(entries['package/package.json']);assert manifest['name']=='com.hollowwake.storage' and manifest['dependencies']=={}
    manifest['version']='0.4.0-preview.1';entries['package/package.json']=(json.dumps(manifest,indent=2)+'\n').encode()
    changed=sorted(file for file in before if before[file]!=entries[file]);assert changed==['package/README.md',asmdef,'package/package.json']
    assert all(entries[file]==body for file,body in before.items() if file not in changed)
    output.mkdir();archive=output/'com.hollowwake.storage-0.4.0-preview.1.tgz';helper['save'](entries,archive);assert helper['load'](archive)==entries
    receipt=dict(candidate=True,name=manifest['name'],version=manifest['version'],file=archive.name,bytes=archive.stat().st_size,
        sha256=sha(archive.read_bytes()),parentSha256=sha(parent.read_bytes()),nativeSha256=sha(entries['package/Runtime/Native/Windows/hwe_save.dll']),
        sources={file:sha((ROOT/file).read_bytes()) for file in sources},changed=changed,added=sorted(set(entries)-set(before)),
        preservedFiles=len(before)-len(changed),files={file:sha(body) for file,body in entries.items()})
    (output/'package-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
    return receipt
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ['parent','output']:parser.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args();receipt=package(args.parent.resolve(),args.output.resolve())
    print(json.dumps({key:receipt[key] for key in ['file','sha256','preservedFiles']}))
