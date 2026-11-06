import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';

// Exercise the actual installed wrappers; only edit a private, isolated copy.
const [flag,receipt,toolFlag,toolFile,...rest]=process.argv.slice(2);
assert.deepEqual([flag,toolFlag,rest.length],['--package','--tools',0]);
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const pkg=read(receipt),tools=read(toolFile);
assert(pkg.passed&&pkg.platform===process.platform&&pkg.arch===process.arch);
assert.equal(hash(pkg.archive),pkg.archiveSha256);
const pin=read(path.join(root,'experiments/godot-native/toolchain-lock.json')).platforms[process.platform];
assert.equal(hash(tools.editor),pin.editor.executableSha256);
const proof=read(path.join(root,'evidence/content-tables/windows.json'));
const courseBytes=fs.readFileSync(path.join(root,proof.raw.file));assert.equal(sha256(courseBytes),proof.raw.sha256);
const {course}=JSON.parse(gunzipSync(courseBytes));assert.equal(pkg.immutableCourseSha256,sha256(JSON.stringify(course,null,2)+'\n'));
const saved=course.rows.map(r=>r.expected.save).find(s=>s?.state.overflow.length===1&&s.state.items.length===2);assert(saved);
const dir=fs.mkdtempSync(path.join(root,'.artifacts/godot-crafting-faults-')),project=path.join(dir,'project');
fs.mkdirSync(project);
const verification=path.join(dir,'verification.json'),report={passed:false,archiveSha256:pkg.archiveSha256,directory:dir,
  sources:Object.fromEntries(['test/godot-crafting/faults.gd','scripts/test-godot-crafting-faults.mjs'].map(f=>[f,hash(path.join(root,f))])),runs:[]};
writeJSON(path.join(root,'.artifacts/godot-crafting-faults-latest.json'),{directory:dir,receipt:verification});
writeJSON(verification,report);
const env={...process.env};
for(const key of (process.platform==='win32'?['APPDATA','LOCALAPPDATA']:['XDG_DATA_HOME','XDG_CONFIG_HOME','XDG_CACHE_HOME'])){
  env[key]=path.join(dir,key);fs.mkdirSync(env[key]);
}
for(const key of ['LD_LIBRARY_PATH','LD_PRELOAD','LD_AUDIT','LD_DEBUG','LD_DEBUG_OUTPUT'])delete env[key];
function run(label,args,status,marker){
  const log=path.join(dir,label+'.txt'),fd=fs.openSync(log,'wx');let out;
  try{out=spawnSync(tools.editor,['--headless','--path',project,...args,'--log-file',path.join(dir,label+'-engine.log')],{env,cwd:dir,windowsHide:true,timeout:90000,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
  const text=fs.readFileSync(log,'utf8');
  if(out.error||out.signal)throw new Error(label+' terminated: '+String(out.error?.message??out.signal));
  assert.equal(out.status,status,label+': '+text.slice(-800));
  assert(!/SCRIPT ERROR:|Parse Error:/.test(text),label+' script error');
  assert.deepEqual(text.split(/\r?\n/).filter(line=>line.startsWith('HWE_CONTROL_')),marker?[marker]:[]);
  report.runs.push({label,status,marker:marker??null,logSha256:hash(log)});
}
try{
  execFileSync(tools.python,['-I',path.join(root,'scripts/godot-proc-example-archive.py'),'install',pkg.archive,project],{windowsHide:true});
  const addon=path.join(project,'addons/hollow_wake');
  const pristine=()=>{for(const [f,h]of Object.entries(pkg.addon.files))assert.equal(hash(path.join(addon,f)),h,f);};
  pristine();
  for(const f of ['project.godot','main.tscn'])fs.copyFileSync(path.join(root,'experiments/godot-native',f),path.join(project,f));
  fs.copyFileSync(path.join(root,'test/godot-crafting/faults.gd'),path.join(project,'replay.gd'));
  fs.writeFileSync(path.join(project,'full-bag.json'),JSON.stringify(saved),{flag:'wx'});
  // Use the pinned editor's cold-import shutdown workaround in the isolated
  // fault project too. A failed first import remains a terminal failure.
  run('import',['--import','--frame-delay','1000'],0);
  run('control-before',['--quit-after','16'],0,'HWE_CONTROL_PASS');
  const cases=[
    ['item-roll-precision','owned_session.gd','bytes.encode_double(0, n)','bytes.encode_double(0, snappedf(n, 0.00001))'],
    ['automatic-sale-lane','crafting.gd','"op": "salvage", "profile": profile, "uid": uid, "access": access','"op": "salvage", "profile": profile, "uid": uid, "access": access, "lane": "break"'],
    ['transfer-releases-custody','crafting.gd','"op": "take-overflow"','"op": "recover"']
  ];
  for(const [name,file,from,to]of cases){
    const target=path.join(addon,'crafting',file),before=fs.readFileSync(target,'utf8');
    assert.equal(before.split(from).length,2,name+' unique span');
    try{fs.writeFileSync(target,before.replace(from,to));run(name,['--quit-after','16'],1,'HWE_CONTROL_FAIL:'+name);}
    finally{fs.writeFileSync(target,before);}
  }
  pristine();run('control-after',['--quit-after','16'],0,'HWE_CONTROL_PASS');
  assert.equal(hash(pkg.archive),pkg.archiveSha256);report.passed=true;
  console.log({passed:true,faults:cases.length,directory:dir});
}catch(error){report.failure={name:error.name,message:error.message};throw error;}finally{writeJSON(verification,report);}
