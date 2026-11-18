import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
import {readParitySource} from './prototype-parity-tools.mjs';
import {readPrototypeContent} from './prototype-content.mjs';

export const revisionDirectory=path.join(root,'baseline/prototype-revision');
export function readRevisionSource(){
 const lockBytes=fs.readFileSync(path.join(revisionDirectory,'source-lock.json')),lock=JSON.parse(lockBytes);
 const base=readParitySource();assert.equal(lock.previous.commit,base.lock.commit);
 assert.equal(lock.previous.sha256,sha256(fs.readFileSync(path.join(root,lock.previous.lock))));
 const archive=fs.readFileSync(path.join(revisionDirectory,'source-delta.json.gz'));assert.equal(sha256(archive),lock.deltaSha256);
 const delta=JSON.parse(gunzipSync(archive));assert.equal(delta.commit,lock.commit);assert.equal(delta.previous,base.lock.commit);
 const files=new Map(base.files);
 for(const[name,encoded]of Object.entries(delta.files)){
  assert(!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').some(p=>p==='..'||p==='.'||p.includes(':')),'Invalid delta path');
  if(encoded===null)files.delete(name);else files.set(name,Buffer.from(encoded,'base64'));
 }
 assert.deepEqual([...files.keys()].sort(),Object.keys(lock.files).sort());
 for(const[name,bytes]of files)assert.equal(sha256(bytes),lock.files[name],name);
 return{lock,lockBytes,files};
}
export function readRevisionFixture(name){
 const accepted=JSON.parse(fs.readFileSync(path.join(revisionDirectory,'acceptance.json')));
 assert.equal(accepted.sourceLockSha256,sha256(fs.readFileSync(path.join(revisionDirectory,'source-lock.json'))));
 for(const[file,hash]of Object.entries(accepted.sources))assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
 const row=accepted.fixtures[name];assert(row,'Unknown revision fixture');
 const compressed=fs.readFileSync(path.join(revisionDirectory,name+'.json.gz'));assert.equal(sha256(compressed),row.compressedSha256);
 const bytes=gunzipSync(compressed);assert.equal(sha256(bytes),row.sha256);return JSON.parse(bytes);
}
/** Own source files for one build/check, reuse locked tools, remove on failure too. */
export async function withPrototypeRevision(use){
 const{lock,lockBytes,files}=readRevisionSource();
 fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});const parent=fs.realpathSync(path.join(root,'.artifacts'));
 const directory=fs.mkdtempSync(path.join(parent,'prototype-revision-owned-')),link=path.join(directory,'node_modules');
 try{
  for(const[name,bytes]of files){const file=path.join(directory,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
  const tools=path.join(root,'.reference/node_modules');if(fs.existsSync(tools))fs.symlinkSync(fs.realpathSync(tools),link,process.platform==='win32'?'junction':'dir');
  const profile={lock,lockBytes,directory,previous:readPrototypeContent(),catalogue:readRevisionFixture('catalogue'),runtime:readRevisionFixture('runtime'),inspection:readRevisionFixture('inspection')};
  return await use(profile);
 }finally{
  if(fs.existsSync(link))fs.unlinkSync(link);
  assert.equal(path.dirname(fs.realpathSync(directory)),parent);fs.rmSync(directory,{recursive:true,maxRetries:4});
 }
}
