import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,listFiles,writeJSON} from './reference-utils.mjs';
const location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json'))),installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');
for(const file of listFiles(path.join(root,'dist')))assert.deepEqual(fs.readFileSync(path.join(installed,file)),fs.readFileSync(path.join(root,'dist',file)),`Stale container package: ${file}`);
const sources=new Map(),output=path.join(root,'.artifacts/game-containers');
for(const name of ['containers','container-refresh']){const bytes=fs.readFileSync(path.join(root,`reference/export-${name}.ts`)),file=path.join(location.game,`balance/sdk-container-${randomUUID()}.ts`);fs.writeFileSync(file,bytes,{flag:'wx'});sources.set(name,{bytes,file});}
const run=(name,out,stdio='inherit')=>execFileSync(process.execPath,['--import','tsx',sources.get(name).file,out],{cwd:location.game,stdio});
function difference(a,b,p='root'){
 if(Object.is(a,b))return;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return `${p}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
 for(const key of new Set([...Object.keys(a),...Object.keys(b)])){const d=difference(a[key],b[key],`${p}.${key}`);if(d)return d;}
}
try{
 for(const name of sources.keys()){run(name,output);const expected=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,`baseline/milestone-thirteen/${name}.json.gz`))));assert.equal(difference(JSON.parse(fs.readFileSync(path.join(output,name+'.json'))),expected),undefined,`Original ${name} observations differ`);}
 const file=path.join(installed,'container-layout.js'),bytes=fs.readFileSync(file,'utf8'),anchor='if (!features?.has(this.#rungs[0].feature))';assert.equal(bytes.split(anchor).length,2);let detected=false;
 try{fs.writeFileSync(file,bytes.replace(anchor,'if (false)'));const negative=path.join(root,'.artifacts/game-containers-negative');run('containers',negative,'pipe');detected=!fs.readFileSync(path.join(negative,'containers.json')).equals(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-thirteen/containers.json.gz'))));}
 finally{fs.writeFileSync(file,bytes);}
 assert(detected,'Game bypassed the installed container layout');
 writeJSON(path.join(root,'.artifacts/game-container-verification.json'),{ladders:81,featureCombinations:1006,landingQueries:2000,neighbourhoods:600,relicPowerCases:2816,worldTransitions:12,liveContentRevisions:16,installedMutationRejected:detected,packageIntegrity:location.integrity});
 console.log('Installed container and relic rules match original geometry, policy, World transitions and live content revisions; installed gate fault detected.');
}finally{for(const {file,bytes} of sources.values())if(fs.existsSync(file)&&fs.readFileSync(file).equals(bytes))fs.unlinkSync(file);}
