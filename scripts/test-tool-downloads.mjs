import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
assert(['win32','linux'].includes(process.platform)&&process.arch==='x64','Godot tool qualification targets Windows/Linux x64');
const args=process.argv.slice(2);assert(args.length===0||args.length===2&&args[0]==='--output');
const output=path.resolve(args[1]??path.join(root,'.artifacts/tool-downloads.json'));
if(args.length)assert(!fs.existsSync(output)&&!fs.existsSync(output+'.logs.json.gz'));
const artifact=path.join(root,'.artifacts');fs.mkdirSync(artifact,{recursive:true});
const work=fs.mkdtempSync(path.join(artifact,'tool-download-qualification-'));
const copied=['scripts/tool-download.mjs','scripts/install-reference-electron.mjs','scripts/prepare-godot-tools.mjs',
 'scripts/reference-utils.mjs','test/tool-download.test.mjs','experiments/godot-native/toolchain-lock.json'];
const workflows=['character-rules','device-lifecycle','unlock-lifecycle','godot-native'].map(name=>'.github/workflows/'+name+'.yml');
const sources=[...copied,...workflows,'scripts/test-tool-downloads.mjs','.github/workflows/tool-downloads.yml'];
const report={passed:false,contracts:12,faults:[],sources:Object.fromEntries(sources.map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))]))},logs={};
function run(label){
 const child=spawnSync(process.execPath,['--test','--test-reporter=tap','test/tool-download.test.mjs'],{cwd:work,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4*1024*1024,
  env:{...process.env,TEMP:work,TMP:work,TMPDIR:work}});
 logs[label]=(child.stdout??'')+'\n'+(child.stderr??'');assert(!child.error&&!child.signal,label+': '+child.error);
 return{status:child.status,logSha256:sha256(logs[label])};
}
function control(label){const r=run(label);assert.equal(r.status,0,logs[label]);assert.match(logs[label],/# pass 12\b/);return r;}
try{
 for(const file of copied){const target=path.join(work,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
 for(const file of workflows){
  const text=fs.readFileSync(path.join(root,file),'utf8');assert(text.includes("- 'scripts/tool-download.mjs'"),file);assert(text.includes('node --test test/tool-download.test.mjs'),file);
  if(!file.endsWith('godot-native.yml'))assert(/node scripts\/install-reference-electron\.mjs (?:\.reference|reference\/tooling)\/node_modules\/electron\/install\.js/.test(text),file);
 }
 assert(fs.readFileSync(path.join(root,'.github/workflows/tool-downloads.yml'),'utf8').includes('run: node scripts/test-tool-downloads.mjs'));
 report.control=control('control');
 const helper='scripts/tool-download.mjs',godot='scripts/prepare-godot-tools.mjs';
 const first='transient HTTP failures retry with bounded delays and retain only exact pinned bytes';
 const invalid='short, oversized and checksum-invalid archives fail once and remove their partial files';
 const faults=[
  ['missing-retry',helper,[['attempt===3','attempt===1']],first],
  ['four-attempts',helper,[['attempt<=3','attempt<=4'],['attempt===3','attempt===4']],'exhausted transient failures stop after three attempts without partial files'],
  ['unchecked-checksum',helper,[["if(sha256!==item.sha256)throw Error('Archive does not match pinned checksum');",'void sha256;']],invalid],
  ['retained-partial-file',helper,[['fs.unlinkSync(destination);','void destination;']],invalid],
  ['deleted-concurrent-file',helper,[['if(owned&&!complete)','if(!complete)']],'existing files and a destination created during the request are never overwritten or deleted'],
  ['retry-permanent-http',helper,[['[408,429,500,502,503,504]','[404,408,429,500,502,503,504]']],'permanent HTTP errors cancel the response and do not retry or create a file'],
  ['reset-deadline',helper,[['fetchImpl(item.url,{signal})','fetchImpl(item.url,{signal:AbortSignal.timeout(600000)})']],first],
  ['retry-electron-corruption',helper,[["const status=(result.stderr??'').match", "const status=(result.stderr??'').includes('Checksum mismatch')?['','504']:(result.stderr??'').match"]],'Electron checksum errors, process errors and signals fail immediately'],
  ['retained-failed-tools',godot,[['if(!report.passed){','if(false){']],'Godot preparation uses bounded retries and retains only its failure receipt'],
 ];
 for(const[name,file,replacements,checkpoint]of faults){
  const target=path.join(work,file),original=fs.readFileSync(target,'utf8');let broken=original;
  for(const[needle,replacement]of replacements){assert.equal(broken.split(needle).length,2,name+' must target one site');broken=broken.replace(needle,replacement);}
  fs.writeFileSync(target,broken);
  try{
   const r=run(name);assert.equal(r.status,1,name+' escaped');assert.match(logs[name],/ERR_ASSERTION/);
   const failing=logs[name].split(/\r?\n/).filter(line=>/^not ok \d+ - /.test(line));assert(failing.some(line=>line.endsWith(checkpoint)),name+': '+failing.join('\n'));
   report.faults.push({name,checkpoint,...r});console.log({detected:name});
  }finally{fs.writeFileSync(target,original);}
 }
 report.restored=control('restored');report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 try{
  report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);
  const bytes=gzipSync(JSON.stringify(logs),{level:9});fs.writeFileSync(output+'.logs.json.gz',bytes);report.logsSha256=sha256(bytes);
 }finally{
  assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(artifact));fs.rmSync(work,{recursive:true});report.cleaned=true;
  report.passed=report.passed&&report.inputsUnchanged;fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 }
}
assert(report.passed);console.log({passed:true,contracts:report.contracts,faults:report.faults.length,cleaned:true});
