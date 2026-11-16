import {verifyLifecycleCourses} from '../test/combat-session/lifecycles.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';
import {sha256} from './reference-utils.mjs';import {buildCombatContent} from './compile-combat-content.mjs';
import {createCombatSession} from '../adapters/embedded/combat-session.mjs';import {emptyCombatSpace} from '../test/combat-empty-space.mjs';
const probe=process.argv.includes('--probe'),procs=process.argv.includes('--procs'),name=procs?'combat-proc-families':process.argv.includes('--interactions')?'combat-interactions':'combat-lifecycles';
const archive=fs.readFileSync(probe?'.artifacts/m3-'+name+'-probe.json.gz':'baseline/'+name+'/observations.json.gz'),bytes=gunzipSync(archive),fixture=JSON.parse(bytes);
assert(fixture.originalOnly);if(!probe){const a=JSON.parse(fs.readFileSync('baseline/'+name+'/acceptance.json'));assert.equal(sha256(archive),a.compressedSha256);assert.equal(sha256(bytes),a.sha256);}
const parent=fs.realpathSync('.artifacts'),work=fs.mkdtempSync(path.join(parent,'m3-lifecycles-owned-'));
try {
 await buildCombatContent(path.join(work,'content'));const {combatContent:content}=await import(pathToFileURL(path.join(work,'content/content.mjs')));
 const {observations,mismatches}=verifyLifecycleCourses({fixture,content,createCombatSession,emptyCombatSpace,procs});
 fs.writeFileSync('.artifacts/m3-'+name+'-comparison.json',JSON.stringify({passed:!mismatches.length,mismatches},null,2));
 console.log({courses:fixture.courses.length,observations,mismatches:mismatches.map(m=>({id:m.id,step:m.step,message:(m.error??m.message).slice(0,1300)}))});
 assert.equal(mismatches.length,0,'Composed lifecycles must match the pinned original');
}finally{assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true,maxRetries:3});}
