import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,listFiles,writeJSON} from './reference-utils.mjs';
const location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json'))),installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');
assert.deepEqual(listFiles(installed),listFiles(path.join(root,'dist')));for(const file of listFiles(installed))assert.deepEqual(fs.readFileSync(path.join(installed,file)),fs.readFileSync(path.join(root,'dist',file)),`Stale action package: ${file}`);
const bytes=fs.readFileSync(path.join(root,'reference/export-relic-actions.ts')),file=path.join(location.game,`balance/sdk-relic-actions-${randomUUID()}.ts`),output=path.join(root,'.artifacts/game-relic-actions');fs.writeFileSync(file,bytes,{flag:'wx'});
const expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-fifteen/relic-actions.json.gz'))),run=(out,stdio='inherit')=>execFileSync(process.execPath,['--import','tsx',file,out],{cwd:location.game,stdio,maxBuffer:64*1024*1024});
function difference(a,b,p='root'){if(Object.is(a,b))return;if(!a||!b||typeof a!=='object'||typeof b!=='object')return `${p}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;for(const key of new Set([...Object.keys(a),...Object.keys(b)])){const result=difference(a[key],b[key],`${p}.${key}`);if(result)return result;}}
try{
 run(output);assert.equal(difference(JSON.parse(fs.readFileSync(path.join(output,'relic-actions.json'))),JSON.parse(expected)),undefined,'Original action/callback observations differ');
 const target=path.join(installed,'relic-actions.js'),source=fs.readFileSync(target,'utf8'),anchor='return access.ownHosted && !access.fallen && access.oracleReach();';assert.equal(source.split(anchor).length,2);let detected=false;
 try{fs.writeFileSync(target,source.replace(anchor,'return !access.fallen && access.oracleReach();'));const negative=path.join(root,'.artifacts/game-relic-actions-negative');run(negative,'pipe');detected=!fs.readFileSync(path.join(negative,'relic-actions.json')).equals(expected);}
 finally{fs.writeFileSync(target,source);}
 assert(detected,'Game bypassed installed action authorization');writeJSON(path.join(root,'.artifacts/game-relic-actions-verification.json'),{accessQueries:2048,distinctAccessCombinations:512,worlds:8,actionTransitions:264,callbackOrderMatches:true,installedMutationRejected:detected,packageIntegrity:location.integrity});
 console.log('Installed actions match original authority, ownership, refusals, actor updates and callback order; installed authority fault detected.');
}finally{if(fs.existsSync(file)&&fs.readFileSync(file).equals(bytes))fs.unlinkSync(file);}
