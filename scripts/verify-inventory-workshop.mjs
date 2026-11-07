import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root} from './reference-utils.mjs';
import {publishDelivery} from './delivery-staging.mjs';

const args=process.argv.slice(2),options=new Map();
while(args.length){
  const key=args.shift();
  assert(!options.has(key));
  if(key==='--render'){options.set(key,true);continue;}
  assert(['--tools','--addon','--addon-proof','--out','--sqlite'].includes(key));
  const value=args.shift();assert(value&&!value.startsWith('--'));options.set(key,path.resolve(value));
}
for(const key of ['--tools','--addon','--addon-proof','--out'])assert(options.has(key),key);
assert(!fs.existsSync(options.get('--out')),'Choose a new output folder');
const read=f=>JSON.parse(fs.readFileSync(f));
const pin=read(path.join(root,'adapters/godot/local-save/sqlite-lock.json'));
const dir=fs.mkdtempSync(path.join(root,'.artifacts/inventory-verification-'));
let archive=options.get('--sqlite');
if(!archive){
  const response=await fetch(pin.url,{signal:AbortSignal.timeout(90000)});
  assert(response.ok,'SQLite download failed: '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha3-256').update(bytes).digest('hex'),pin.sha3_256);
  archive=path.join(dir,'sqlite.zip');fs.writeFileSync(archive,bytes,{flag:'wx'});
}
const tools=options.get('--tools');
function command(label,exe,params){
  console.log('Running '+label);
  const log=path.join(dir,label+'.txt'),fd=fs.openSync(log,'wx');
  try{execFileSync(exe,params,{cwd:root,windowsHide:true,timeout:900000,stdio:['ignore',fd,fd]});}
  catch(error){console.error(fs.readFileSync(log,'utf8').slice(-2400));throw error;}
  finally{fs.closeSync(fd);}
}
function run(script,params){command(script,process.execPath,[path.join(root,'scripts',script+'.mjs'),...params]);}
await publishDelivery(options.get('--out'),staged=>{
run('build-godot-save-store',['--tools',tools,'--sqlite',archive]);
const lib=read(path.join(root,'.artifacts/godot-save-store-latest.json')).receipt;
run('package-godot-inventory',['--tools',tools,'--library',lib,'--addon',options.get('--addon'),'--addon-proof',options.get('--addon-proof')]);
const build=read(path.join(root,'.artifacts/inventory-workshop-latest.json')).proof;
const replay=['--build',build,'--tools',tools];
if(options.has('--render'))replay.push('--render');
run('test-godot-inventory',replay);
const proof=read(path.join(root,'.artifacts/inventory-acceptance-latest.json')).receipt;
run('record-inventory-workshop',['--build',build,'--verified',proof,'--out',staged]);
run('test-inventory-record-faults',['--build',build,'--verified',proof,'--accepted',staged,
  '--out',path.join(staged,'receipt-controls.json')]);
const nativeTools=read(tools),out=staged;
command('project-identity',nativeTools.python,['-I',path.join(root,'scripts/test-workshop-delivery.py'),dir]);
command('workshop-courses',nativeTools.python,['-I',path.join(root,'scripts/check-background-workflows.py'),
  nativeTools.editor,out,dir,path.join(out,'workflow-controls.json'),'--profile-views']);
command('station-controls',nativeTools.python,['-I',path.join(root,'scripts/check-station-faults.py'),
  nativeTools.editor,out,dir,path.join(out,'station-controls.json')]);
});
console.log({passed:true,out:options.get('--out')});
