import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {downloadPinned} from './tool-download.mjs';

assert(['win32', 'linux'].includes(process.platform)); assert.equal(process.arch, 'x64');
const args = process.argv.slice(2), local = {};
assert.equal(args.length, 6, '--cmake EXE --ninja EXE --python EXE');
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace(/^--/, ''); assert(['cmake', 'ninja', 'python'].includes(key));
  assert(!Object.hasOwn(local, key)); local[key] = fs.realpathSync(args[i + 1]);
}
const lock = JSON.parse(fs.readFileSync(path.join(root, 'experiments/godot-native/toolchain-lock.json')));
assert.equal(lock.schemaVersion, 2);
const target = lock.platforms[process.platform];
for (const name of [target.editor.executable, ...target.editor.members, ...Object.keys(target.templates.files)])
  assert(/^[A-Za-z0-9_.-]+$/.test(name), 'Pinned archive members must be plain filenames');
const directory = fs.mkdtempSync(path.join(root, '.artifacts/godot-tools-'));
const report = {schemaVersion: 1, directory, platform: process.platform, arch: process.arch, passed: false, status: 'downloading', downloads: []};
const receipt = path.join(directory, 'preparation.json');
writeJSON(path.join(root, '.artifacts/godot-tools-latest.json'), {directory, receipt, tools: path.join(directory, 'tools.json')});
try {
  const artifacts = [target.editor.archive, lock.bindings.archive, lock.exportTemplates];
  for (const item of artifacts) {
    const name = item.name ?? path.posix.basename(new URL(item.url).pathname); assert(/^[A-Za-z0-9_.-]+$/.test(name));
    const downloaded=await downloadPinned(item,path.join(directory,name));
    report.downloads.push({file:name,...downloaded}); writeJSON(receipt,report);
  }
  const extraction = `import json,pathlib,sys,tarfile,zipfile
root=pathlib.Path(sys.argv[1]).resolve(); lock=json.loads(pathlib.Path(sys.argv[2]).read_text()); target=lock['platforms'][sys.argv[3]]
def copy_member(archive,name,target):
    member=archive.getinfo(name); assert not member.is_dir()
    with target.open('xb') as out: out.write(archive.read(member))
with zipfile.ZipFile(root/target['editor']['archive']['name']) as archive:
    names=target['editor']['members']
    assert set(archive.namelist())==set(names)
    for name in names: copy_member(archive,name,root/name)
with tarfile.open(root/lock['bindings']['archive']['name']) as archive:
    prefix='godot-cpp-'+lock['bindings']['commit']
    for member in archive.getmembers():
        name=pathlib.PurePosixPath(member.name)
        assert not name.is_absolute() and '..' not in name.parts and name.parts[0]==prefix
        assert not member.issym() and not member.islnk()
    archive.extractall(root,filter='data')
with zipfile.ZipFile(root/'Godot_v4.7.2-stable_export_templates.tpz') as archive:
    for name in target['templates']['files']: copy_member(archive,'templates/'+name,root/name)
`;
  const script = path.join(directory, 'extract.py'); fs.writeFileSync(script, extraction, {flag: 'wx'});
  execFileSync(local.python, [script, directory, path.join(root, 'experiments/godot-native/toolchain-lock.json'), process.platform], {cwd: directory, windowsHide: true, stdio: 'inherit', timeout: 120000});
  const tools = {...local, platform: process.platform, editor: path.join(directory, target.editor.executable),
    bindings: path.join(directory, 'godot-cpp-' + lock.bindings.commit),
    exportRelease: path.join(directory, target.templates.release), exportDebug: path.join(directory, target.templates.debug)};
  assert.equal(sha256(fs.readFileSync(tools.editor)), target.editor.executableSha256);
  for (const [file, expected] of Object.entries(lock.bindings.files)) assert.equal(sha256(fs.readFileSync(path.join(tools.bindings, file))), expected, file);
  for (const [file, expected] of Object.entries(target.templates.files)) assert.equal(sha256(fs.readFileSync(path.join(directory, file))), expected, file);
  if (process.platform === 'linux') for (const file of [tools.editor, tools.exportRelease, tools.exportDebug]) fs.chmodSync(file, 0o755);
  writeJSON(path.join(directory, 'tools.json'), tools); report.passed = true; report.status = 'completed';
} catch (error) {report.status = 'failed'; report.error = error.message; throw error;}
finally {
  if(!report.passed){
    assert.equal(path.dirname(fs.realpathSync(directory)),fs.realpathSync(path.join(root,'.artifacts')));
    // This fresh preparation directory owns every archive/extracted file here.
    // Keep the diagnostic receipt, not failed partial tool installations.
    for(const name of fs.readdirSync(directory))if(name!=='preparation.json'){
      const target=path.join(directory,name);
      if(fs.lstatSync(target).isSymbolicLink())fs.unlinkSync(target);
      else {assert.equal(path.dirname(fs.realpathSync(target)),fs.realpathSync(directory));fs.rmSync(target,{recursive:true});}
    }
    report.failedFilesCleaned=true;
  }
  writeJSON(receipt, report); console.log({directory, passed: report.passed, status: report.status, tools: path.join(directory, 'tools.json')});
}
