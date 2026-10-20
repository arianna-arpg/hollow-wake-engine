import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,listFiles,writeJSON} from './reference-utils.mjs';
const location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json'))),installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');
for(const file of listFiles(path.join(root,'dist')))assert.deepEqual(fs.readFileSync(path.join(installed,file)),fs.readFileSync(path.join(root,'dist',file)),`Stale policy package: ${file}`);
const out=path.join(root,'.artifacts/game-passive-policy'),sources=new Map();
for(const name of ['passives','passive-policy-host']){const bytes=fs.readFileSync(path.join(root,`reference/export-${name}.ts`)),file=path.join(location.game,`balance/sdk-policy-${randomUUID()}.ts`);fs.writeFileSync(file,bytes,{flag:'wx'});sources.set(name,{file,bytes});}
const run=(name,output,stdio='inherit')=>execFileSync(process.execPath,['--import','tsx',sources.get(name).file,output,'--sdk'],{cwd:location.game,stdio});
function difference(a,b,p='root'){
 if(Object.is(a,b))return;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return `${p}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
 for(const key of new Set([...Object.keys(a),...Object.keys(b)])){const d=difference(a[key],b[key],`${p}.${key}`);if(d)return d;}
}
try{
 run('passives',out);run('passive-policy-host',out);
 const policy=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-eight/passives.json.gz'))));
 assert.equal(difference(JSON.parse(fs.readFileSync(path.join(out,'passives.json'))),policy),undefined,'Actual game policy callbacks or state changed');
 const expected=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-ten/passive-policy-host.json.gz'))));
 assert.equal(difference(JSON.parse(fs.readFileSync(path.join(out,'passive-policy-host.json'))),expected),undefined,'Real host effects differ from original');
 const kernel=path.join(installed,'passive-policy.js'),bytes=fs.readFileSync(kernel,'utf8'),anchor='s.passivePoints -= cost;';assert.equal(bytes.split(anchor).length,2);
 let detected=false;
 try{fs.writeFileSync(kernel,bytes.replace(anchor,'s.passivePoints -= 0;'));const negative=path.join(root,'.artifacts/game-passive-policy-negative');run('passives',negative,'pipe');detected=JSON.stringify(JSON.parse(fs.readFileSync(path.join(negative,'passives.json'))))!==JSON.stringify(policy);}
 finally{fs.writeFileSync(kernel,bytes);}
 assert.ok(detected,'Game bypassed the installed policy runtime');
 writeJSON(path.join(root,'.artifacts/game-passive-policy-verification.json'),{originalCommands:policy.scenarios.reduce((n,s)=>n+s.steps.length,0),fullHostTransitions:expected.rows.length,callbackStates:true,liveSummons:true,coOp:true,saveRestore:true,retiredSelections:true,installedMutationRejected:detected,packageIntegrity:location.integrity});
 console.log('Actual game policy, callbacks, live summon stats and save restore match; installed fault detected.');
}finally{for(const {file,bytes} of sources.values())if(fs.existsSync(file)&&fs.readFileSync(file).equals(bytes))fs.unlinkSync(file);}
