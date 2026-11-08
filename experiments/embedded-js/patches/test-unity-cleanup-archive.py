"""Archive refusal and byte-preservation controls; all temporary files are owned."""
import io,json,pathlib,runpy,sys,tarfile,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[3]
api=runpy.run_path(str(pathlib.Path(__file__).with_name('unity-cleanup-archive.py')))
parent=pathlib.Path(sys.argv[1]);before=api['load'](parent)
passed=[]
def refuse(name,fn):
    try:fn()
    except (AssertionError,ValueError,tarfile.TarError):passed.append(name)
    else:raise AssertionError('Fault admitted: '+name)
with tempfile.TemporaryDirectory(prefix='unity-cleanup-controls-',dir=ROOT/'.artifacts') as temp:
    work=pathlib.Path(temp)
    entries,record=api['derive'](parent,b'candidate-library',{'profile':'test'},'0.4.1-preview.1')
    assert record['preservedFiles']==len(before)-2
    assert all(body==entries[name] for name,body in before.items() if name.endswith('.meta'))
    assert all(body==entries[name] for name,body in before.items() if name.startswith('package/Runtime/Resources/'))
    assert all(body==entries[name] for name,body in before.items() if name.endswith(('.cs','.asmdef')))
    output=work/'valid.tgz';api['save'](entries,output);assert api['load'](output)==entries
    passed.append('exact-gameplay-content-guid-preservation')
    try:api['save'](entries,output)
    except FileExistsError:passed.append('existing-output')
    else:raise AssertionError('Archive overwritten')
    refuse('unexpected-new-version',lambda:api['derive'](parent,b'native',{},'99.0.0'))
    for name,member_name,kind in [
        ('traversal','package/../escape','file'),('absolute','/package/item','file'),
        ('wrong-root','other/item','file'),('backslash','package/a\\b','file'),
        ('duplicate','package/item','duplicate'),('symlink','package/item','symlink'),
        ('directory','package/item','directory')]:
        file=work/(name+'.tgz')
        with tarfile.open(file,'w:gz') as archive:
            member=tarfile.TarInfo(member_name)
            if kind=='symlink':member.type=tarfile.SYMTYPE;member.linkname='target';archive.addfile(member)
            elif kind=='directory':member.type=tarfile.DIRTYPE;archive.addfile(member)
            else:
                member.size=1;archive.addfile(member,io.BytesIO(b'x'))
                if kind=='duplicate':archive.addfile(member,io.BytesIO(b'y'))
        refuse(name,lambda file=file:api['load'](file))
    for name,manifest,native in [
        ('wrong-parent-name',{'name':'other','version':'0.4.0-preview.1'},True),
        ('wrong-parent-version',{'name':'com.hollowwake.gameplay','version':'0.1.0'},True),
        ('missing-native',{'name':'com.hollowwake.gameplay','version':'0.4.0-preview.1'},False)]:
        sample={'package/package.json':json.dumps(manifest).encode()}
        if native:sample['package/Runtime/Native/Windows/hwe_embedded.dll']=b'old'
        file=work/(name+'.tgz');api['save'](sample,file)
        refuse(name,lambda file=file:api['derive'](file,b'new',{},'0.4.1-preview.1'))
assert not work.exists()
print(json.dumps(dict(passed=True,controls=len(passed),names=passed,cleaned=True),indent=2))
