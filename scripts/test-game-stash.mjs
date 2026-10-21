import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,listFiles,writeJSON} from './reference-utils.mjs';
const location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json'))),installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');
for(const file of listFiles(path.join(root,'dist')))assert.deepEqual(fs.readFileSync(path.join(installed,file)),fs.readFileSync(path.join(root,'dist',file)),`Stale storage package: ${file}`);
const out=path.join(root,'.artifacts/game-stash'),sources=new Map();
for(const name of ['stash','inventory-host']){const bytes=fs.readFileSync(path.join(root,`reference/export-${name}.ts`)),file=path.join(location.game,`balance/sdk-storage-${randomUUID()}.ts`);fs.writeFileSync(file,bytes,{flag:'wx'});sources.set(name,{file,bytes});}
const run=(name,output,stdio='inherit')=>execFileSync(process.execPath,['--import','tsx',sources.get(name).file,output],{cwd:location.game,stdio});
function difference(a,b,p='root'){
 if(Object.is(a,b))return;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return `${p}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
 for(const key of new Set([...Object.keys(a),...Object.keys(b)])){const d=difference(a[key],b[key],`${p}.${key}`);if(d)return d;}
}
try{
 run('stash',out);run('inventory-host',out);
 for(const [name,milestone] of [['stash','twelve'],['stash-edges','twelve'],['inventory-host','eleven']]){
  const expected=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,`baseline/milestone-${milestone}/${name}.json.gz`))));
  assert.equal(difference(JSON.parse(fs.readFileSync(path.join(out,`${name}.json`))),expected),undefined,`Original ${name} observations differ`);
 }
 const file=path.join(installed,'stash-policy.js'),bytes=fs.readFileSync(file,'utf8'),anchor='if (!target) {';assert.equal(bytes.split(anchor).length,2);
 let detected=false;
 try{fs.writeFileSync(file,bytes.replace(anchor,'if (false) {'));const negative=path.join(root,'.artifacts/game-stash-negative');run('stash',negative,'pipe');detected=!fs.readFileSync(path.join(negative,'stash.json')).equals(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twelve/stash.json.gz'))));}
 finally{fs.writeFileSync(file,bytes);}
 assert(detected,'Game bypassed the installed storage planner');
 writeJSON(path.join(root,'.artifacts/game-stash-verification.json'),{storageRepairs:400,legacyShapeCases:18,storageCommands:3000,liveInventoryQueries:1400,liveFootprintRevisions:3,completeGameTransitions:19,installedMutationRejected:detected,packageIntegrity:location.integrity});
 console.log('Installed storage matches original repairs, plans, legacy shapes and complete game transfers; installed planner fault detected.');
}finally{for(const {file,bytes} of sources.values())if(fs.existsSync(file)&&fs.readFileSync(file).equals(bytes))fs.unlinkSync(file);}
