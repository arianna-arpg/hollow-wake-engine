import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,listFiles,writeJSON} from './reference-utils.mjs';
const location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json'))),installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');
assert.deepEqual(listFiles(installed),listFiles(path.join(root,'dist')));
for(const file of listFiles(path.join(root,'dist')))assert.deepEqual(fs.readFileSync(path.join(installed,file)),fs.readFileSync(path.join(root,'dist',file)),`Stale relic package: ${file}`);
const bytes=fs.readFileSync(path.join(root,'reference/export-relic-custody.ts')),file=path.join(location.game,`balance/sdk-custody-${randomUUID()}.ts`),output=path.join(root,'.artifacts/game-relic-custody');fs.writeFileSync(file,bytes,{flag:'wx'});
const expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-fourteen/relic-custody.json.gz')));
const run=(out,stdio='inherit')=>execFileSync(process.execPath,['--import','tsx',file,out],{cwd:location.game,stdio});
try{
 run(output);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'relic-custody.json'))),JSON.parse(expected));
 const target=path.join(installed,'relic-custody.js'),source=fs.readFileSync(target,'utf8'),anchor='if (state.released.includes(key))';assert.equal(source.split(anchor).length,2);let detected=false;
 try{fs.writeFileSync(target,source.replace(anchor,'if (false)'));const negative=path.join(root,'.artifacts/game-relic-custody-negative');run(negative,'pipe');detected=!fs.readFileSync(path.join(negative,'relic-custody.json')).equals(expected);}
 finally{fs.writeFileSync(target,source);}
 assert(detected,'Game bypassed installed relic custody');
 writeJSON(path.join(root,'.artifacts/game-relic-custody-verification.json'),{restores:240,investments:600,custodySequences:120,custodyTransitions:2520,experienceFolds:160,installedMutationRejected:detected,packageIntegrity:location.integrity});
 console.log('Installed relic custody matches original ownership and progression observations; installed tombstone fault detected.');
}finally{if(fs.existsSync(file)&&fs.readFileSync(file).equals(bytes))fs.unlinkSync(file);}
