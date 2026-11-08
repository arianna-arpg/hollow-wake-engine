"""Derive a native-only patch from a pinned Unity archive without extracting it."""
import gzip,hashlib,io,json,pathlib,sys,tarfile

def digest(data):return hashlib.sha256(data).hexdigest()
def load(file):
    entries={}
    with tarfile.open(file,'r:gz') as archive:
        total=0
        for member in archive:
            name=member.name
            assert member.isfile() and not member.issym() and not member.islnk(),'Only regular files'
            parts=pathlib.PurePosixPath(name).parts
            assert len(parts)>1 and parts[0]=='package' and '..' not in parts and '\\' not in name and not name.startswith('/'),'Unsafe archive path'
            assert name not in entries,'Duplicate archive entry'
            total+=member.size;assert 0<=member.size<=32*1024*1024 and total<=128*1024*1024,'Archive budget'
            entries[name]=archive.extractfile(member).read()
    return entries
def derive(parent,library,provenance,version):
    entries=load(parent);before=dict(entries)
    native='package/Runtime/Native/Windows/hwe_embedded.dll'
    assert native in entries,'Missing gameplay native library'
    manifest=json.loads(entries['package/package.json'])
    assert manifest['name']=='com.hollowwake.gameplay' and manifest['version']=='0.4.0-preview.1','Unexpected parent'
    assert version=='0.4.1-preview.1'
    entries[native]=library
    manifest['version']=version
    entries['package/package.json']=(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n').encode()
    note='package/Documentation~/NativeRuntime.json'
    assert note not in entries
    entries[note]=(json.dumps(provenance,indent=2,ensure_ascii=False)+'\n').encode()
    changed=sorted(name for name in before if before[name]!=entries[name])
    assert changed==sorted([native,'package/package.json'])
    assert sorted(set(entries)-set(before))==[note]
    for name,body in before.items():
        if name not in changed:assert entries[name]==body,name
    return entries,dict(changed=changed,added=[note],preservedFiles=len(before)-len(changed),
                       parentFiles={name:digest(body) for name,body in before.items()})
def save(entries,file):
    with file.open('xb') as out,gzip.GzipFile(fileobj=out,filename='',mode='wb',mtime=0) as gz:
        with tarfile.open(fileobj=gz,mode='w|',format=tarfile.USTAR_FORMAT) as archive:
            for name,body in sorted(entries.items()):
                member=tarfile.TarInfo(name);member.size=len(body);member.mode=0o644
                archive.addfile(member,io.BytesIO(body))
if __name__=='__main__':
    config=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
    entries,result=derive(pathlib.Path(config['parent']),pathlib.Path(config['native']).read_bytes(),config['provenance'],config['version'])
    target=pathlib.Path(config['output']);save(entries,target)
    assert load(target)==entries
    result['files']={name:digest(body) for name,body in entries.items()}
    pathlib.Path(config['inventory']).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
