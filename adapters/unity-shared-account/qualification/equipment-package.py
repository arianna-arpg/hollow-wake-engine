"""Build unpublished equipment-integration archives from exact public shared-account parents."""
import argparse,hashlib,json,os,runpy,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];ARTIFACTS=(ROOT/'.artifacts').resolve()
def sha(body):return hashlib.sha256(body).hexdigest()
def package(args):
    assert not args.output.exists();args.output.mkdir()
    helper=runpy.run_path(str(ROOT/'experiments/embedded-js/patches/unity-cleanup-archive.py'))
    with tempfile.TemporaryDirectory(prefix='shared-equipment-bundle-',dir=ARTIFACTS) as temp:
        work=Path(temp).resolve();assert work.parent==ARTIFACTS
        subprocess.run(['node',str(ROOT/'adapters/unity-shared-account/qualification/equipment-bundle.mjs'),str(work)],cwd=ROOT,check=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        bundle=json.loads((work/'bundle.json').read_text());result={}
        for name,parent,digest,version in [('gameplay',args.gameplay,'a34b721bc3cc4649e28a33fe1821d30b508884f0d3b43f659008a2a1305df44c','0.6.0-candidate.0'),('storage',args.storage,'6d22281f2ba07e7631270e9af19bf11d5e512be54254bbc8bb230b574714428b','0.5.0-candidate.0')]:
            assert sha(parent.read_bytes())==digest;entries=helper['load'](parent);before=dict(entries)
            sources=['adapters/unity-shared-account/qualification/equipment-package.py','experiments/embedded-js/patches/unity-cleanup-archive.py']
            if name=='gameplay':
                source='adapters/unity-shared-account/Runtime/SharedAccountWorkshop.cs';sources.append(source)
                entries['package/Runtime/SharedAccountWorkshop.cs']=(ROOT/source).read_bytes()
                for file,want in bundle['files'].items():
                    body=(work/file).read_bytes();assert sha(body)==want;entries['package/Runtime/Resources/HollowWake/'+file]=body
                entries['package/Runtime/SharedAccountPackHashes.cs']=('namespace HollowWake.Gameplay { internal static class SharedAccountPackHashes { '+''.join('internal const string '+label+'="'+bundle['files']['SharedAccount'+label+'.bytes']+'"; ' for label in ['Rules','Content'])+'} }\n').encode()
                native='hwe_embedded.dll'
            else:
                source='adapters/unity-shared-account/Storage/DurableSharedAccount.cs';sources.append(source)
                entries['package/Runtime/GameplayBridge/DurableSharedAccount.cs']=(ROOT/source).read_bytes()
                file='package/Runtime/GameplayBridge/HollowWake.Storage.Gameplay.asmdef';definition=json.loads(entries[file])
                definition['versionDefines'].append(dict(name='com.hollowwake.gameplay',expression='0.6.0-candidate.0',define='HWE_STORAGE_SHARED_EQUIPMENT'))
                entries[file]=(json.dumps(definition,indent=2)+'\n').encode();native='hwe_save.dll'
            manifest=json.loads(entries['package/package.json']);manifest['version']=version;entries['package/package.json']=(json.dumps(manifest,indent=2)+'\n').encode()
            assert set(entries)==set(before)
            allowed=['package/package.json']+(['package/Runtime/SharedAccountWorkshop.cs','package/Runtime/SharedAccountPackHashes.cs','package/Runtime/Resources/HollowWake/SharedAccountRules.bytes','package/Runtime/Resources/HollowWake/SharedAccountContent.bytes'] if name=='gameplay' else ['package/Runtime/GameplayBridge/DurableSharedAccount.cs','package/Runtime/GameplayBridge/HollowWake.Storage.Gameplay.asmdef'])
            changed=[file for file in before if before[file]!=entries[file]];assert set(changed)==set(allowed)
            folder=args.output/name;folder.mkdir();archive=folder/(manifest['name']+'-'+version+'.tgz');helper['save'](entries,archive);assert helper['load'](archive)==entries
            receipt=dict(candidate=True,engineQualified=False,deviceQualified=False,name=manifest['name'],version=version,file=archive.name,sha256=sha(archive.read_bytes()),parentSha256=digest,nativeSha256=sha(entries['package/Runtime/Native/Windows/'+native]),changed=changed,preservedFiles=len(before)-len(changed),files={file:sha(body) for file,body in entries.items()},sources={file:sha((ROOT/file).read_bytes()) for file in sources})
            if name=='gameplay':receipt['sdkSources']=bundle['sources']
            (folder/'package-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8',newline='\n');result[name]=receipt['sha256']
        return result
if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ['gameplay','storage','output']:parser.add_argument('--'+name,type=lambda p:Path(p).resolve(),required=True)
    print(json.dumps(package(parser.parse_args())))
