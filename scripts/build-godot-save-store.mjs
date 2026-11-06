import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {listFiles,root,sha256,writeJSON} from './reference-utils.mjs';
import {nativeEnvironment} from './native-tools.mjs';

const [toolsFlag,toolsFile,sourceFlag,archive,...rest]=process.argv.slice(2);
assert.deepEqual([toolsFlag,sourceFlag,rest.length],['--tools','--sqlite',0]);
assert(['win32','linux'].includes(process.platform) && process.arch==='x64');
const read=f=>JSON.parse(fs.readFileSync(f));
const hash=f=>sha256(fs.readFileSync(f));
const source=path.join(root,'adapters/godot/local-save');
const pin=read(path.join(source,'sqlite-lock.json'));
const godot=read(path.join(root,'experiments/godot-native/toolchain-lock.json'));
const tools=read(toolsFile);
assert.equal(createHash('sha3-256').update(fs.readFileSync(archive)).digest('hex'),pin.sha3_256);
const bindingFiles=listFiles(tools.bindings).filter(f=>!(f.split('/').includes('__pycache__')&&f.endsWith('.pyc')));
assert.deepEqual(bindingFiles,Object.keys(godot.bindings.files).sort());
for(const [file,digest] of Object.entries(godot.bindings.files))assert.equal(hash(path.join(tools.bindings,file)),digest,file);
const dir=fs.mkdtempSync(path.join(root,'.artifacts/godot-save-store-'));
const env=nativeEnvironment(dir);
env.PYTHONPYCACHEPREFIX=path.join(dir,'pycache');
function run(label,exe,args) {
  const file=path.join(dir,label+'.txt'),fd=fs.openSync(file,'wx');
  try{execFileSync(exe,args,{env,windowsHide:true,timeout:600000,stdio:['ignore',fd,fd]});}
  catch(error){console.error(fs.readFileSync(file,'utf8').slice(-3000));throw error;}
  finally{fs.closeSync(fd);}
}
const vendor=path.join(dir,'sqlite');fs.mkdirSync(vendor);
const extract=[
  'import pathlib,sys,zipfile',
  'with zipfile.ZipFile(sys.argv[1]) as archive:',
  ' for name in ("sqlite3.c","sqlite3.h"):',
  '  with (pathlib.Path(sys.argv[3])/name).open("xb") as out: out.write(archive.read(sys.argv[2]+"/"+name))'
].join('\n');
run('unpack',tools.python,['-I','-c',extract,path.resolve(archive),pin.directory,vendor]);
const build=path.join(dir,'build'),bin=path.join(dir,'bin');
run('configure',tools.cmake,['-S',source,'-B',build,'-G','Ninja','-DCMAKE_BUILD_TYPE=Release',
  '-DCMAKE_MAKE_PROGRAM='+tools.ninja,'-DPython3_EXECUTABLE='+tools.python,'-DSQLITE_SOURCE:PATH='+vendor,
  '-DGODOT_CPP_SOURCE:PATH='+tools.bindings,'-DHWE_OUTPUT:PATH='+bin]);
run('compile',tools.cmake,['--build',build,'--parallel','4']);
const library=path.join(bin,process.platform==='win32'?'hwe_slot_store.dll':'libhwe_slot_store.so');
const sources=['adapters/godot/local-save/CMakeLists.txt','adapters/godot/local-save/store.cpp','adapters/godot/local-save/store.gdextension',
  'adapters/godot/local-save/sqlite-lock.json','experiments/godot-native/build-profile.json','scripts/build-godot-save-store.mjs'];
const receipt=path.join(dir,'verification.json');
writeJSON(receipt,{passed:true,platform:process.platform,arch:process.arch,sqlite:pin.version,sqliteArchiveSha3:pin.sha3_256,
  bindings:godot.bindings.commit,library,librarySha256:hash(library),sources:Object.fromEntries(sources.map(f=>[f,hash(path.join(root,f))]))});
writeJSON(path.join(root,'.artifacts/godot-save-store-latest.json'),{dir,receipt});
console.log({library,sha256:hash(library)});
