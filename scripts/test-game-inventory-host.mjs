import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,listFiles,writeJSON} from './reference-utils.mjs';
const location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json'))),installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');
for(const file of listFiles(path.join(root,'dist')))assert.deepEqual(fs.readFileSync(path.join(installed,file)),fs.readFileSync(path.join(root,'dist',file)),`Stale inventory package: ${file}`);
const out=path.join(root,'.artifacts/game-inventory-host'),sources=new Map();
for(const name of ['inventory','inventory-host']){const bytes=fs.readFileSync(path.join(root,`reference/export-${name}.ts`)),file=path.join(location.game,`balance/sdk-inventory-${randomUUID()}.ts`);fs.writeFileSync(file,bytes,{flag:'wx'});sources.set(name,{file,bytes});}
const run=(name,output,stdio='inherit')=>execFileSync(process.execPath,['--import','tsx',sources.get(name).file,output],{cwd:location.game,stdio});
function difference(a,b,p='root'){
 if(Object.is(a,b))return;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return `${p}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
 for(const key of new Set([...Object.keys(a),...Object.keys(b)])){const d=difference(a[key],b[key],`${p}.${key}`);if(d)return d;}
}
try{
 run('inventory',out);run('inventory-host',out);
 const expected=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-three/inventory.json')));
 assert.equal(difference(JSON.parse(fs.readFileSync(path.join(out,'inventory.json'))),expected),undefined,'Original grid transitions differ');
 const host=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-eleven/inventory-host.json.gz'))));
 assert.equal(difference(JSON.parse(fs.readFileSync(path.join(out,'inventory-host.json'))),host),undefined,'Live host or complete game transitions differ');
 const file=path.join(installed,'inventory-host.js'),bytes=fs.readFileSync(file,'utf8'),anchor='Math.min(board.w, other.x + os.w)';assert.equal(bytes.split(anchor).length,2);
 let detected=false;
 try{fs.writeFileSync(file,bytes.replace(anchor,'Math.min(board.w, other.x)'));const negative=path.join(root,'.artifacts/game-inventory-host-negative');run('inventory',negative,'pipe');detected=JSON.stringify(JSON.parse(fs.readFileSync(path.join(negative,'inventory.json'))))!==JSON.stringify(expected);}
 finally{fs.writeFileSync(file,bytes);}
 assert(detected,'Game bypassed the installed inventory host');
 writeJSON(path.join(root,'.artifacts/game-inventory-host-verification.json'),{originalTransitions:3000,liveQueries:host.queries.length,liveFootprintRevisions:host.revisions.length,completeGameTransitions:host.rows.length,hostIdentity:true,maskedContainers:true,saveRestore:true,installedMutationRejected:detected,packageIntegrity:location.integrity});
 console.log('Installed inventory host matches original grid, live records, masked container, stash and save transitions; installed fault detected.');
}finally{for(const {file,bytes} of sources.values())if(fs.existsSync(file)&&fs.readFileSync(file).equals(bytes))fs.unlinkSync(file);}
