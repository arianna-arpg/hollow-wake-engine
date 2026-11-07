import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root,writeJSON} from './reference-utils.mjs';

const [cmakeFlag,cmake,ninjaFlag,ninja,pythonFlag,python,outputFlag,output,...rest]=process.argv.slice(2);
assert.deepEqual([cmakeFlag,ninjaFlag,pythonFlag,outputFlag,rest.length],
  ['--cmake','--ninja','--python','--output',0]);
const out=path.resolve(output);
assert(!fs.existsSync(out),'Choose a fresh preparation directory');
for(const tool of [cmake,ninja,python])assert(path.isAbsolute(tool)&&fs.statSync(tool).isFile(),'Expected an installed tool path');
const pin=JSON.parse(fs.readFileSync(path.join(root,'adapters/godot/local-save/sqlite-lock.json')));
const url=new URL(pin.url);
assert(url.protocol==='https:'&&url.hostname==='www.sqlite.org');
const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
assert(response.ok,'Pinned SQLite download failed: '+response.status);
const chunks=[];let bytes=0;
for await(const chunk of response.body){
  bytes+=chunk.length;assert(bytes<=8*1024*1024,'SQLite archive exceeds preparation limit');chunks.push(chunk);
}
const archive=Buffer.concat(chunks);
assert.equal(createHash('sha3-256').update(archive).digest('hex'),pin.sha3_256,'SQLite archive does not match the accepted pin');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.mkdirSync(out);
try {
  fs.writeFileSync(path.join(out,'sqlite.zip'),archive,{flag:'wx'});
  writeJSON(path.join(out,'tools.json'),{cmake,ninja,python});
  writeJSON(path.join(out,'preparation.json'),{passed:true,sqlite:pin,bytes,platform:process.platform,arch:process.arch});
} catch(error) {
  for(const name of ['sqlite.zip','tools.json','preparation.json']){
    const file=path.join(out,name);if(fs.existsSync(file))fs.unlinkSync(file);
  }
  fs.rmdirSync(out);throw error;
}
console.log({passed:true,directory:out,bytes});
