import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
export function readBuffExpectations(){
 const read=f=>fs.readFileSync(path.join(root,f)),acceptance=JSON.parse(read('baseline/milestone-forty-one/acceptance.json')),lockBytes=read('baseline/source-lock.json'),lock=JSON.parse(lockBytes);
 assert.equal(acceptance.schemaVersion,1);assert.equal(acceptance.milestone,41);assert.equal(acceptance.source,lock.commit);assert.equal(acceptance.sourceLockSha256,sha256(lockBytes));assert.equal(acceptance.courses,40);assert.equal(acceptance.helpers.length,4);
 assert.deepEqual(acceptance.fixtures.map(r=>[r.name,r.courses]),[['buff-lifecycle',12],['buff-edges',12],['buff-world',8],['buff-callbacks',8]]);
 const helpers=new Map(acceptance.helpers.map(r=>{assert.equal(sha256(read(r.file)),r.sha256,'Changed original helper: '+r.file);return[r.file,r.sha256];})),original=new Map(),expected=new Map();
 for(const r of acceptance.fixtures){assert.equal(helpers.get(r.helper),r.helperSha256);assert.deepEqual(r.args,[]);const compressed=read(r.file);assert.equal(sha256(compressed),r.compressedSha256);const bytes=gunzipSync(compressed);assert.equal(sha256(bytes),r.fixtureSha256);const value=JSON.parse(bytes);assert.equal(value.courses,r.courses);original.set(r.name,value);expected.set(r.name,structuredClone(value));}
 const boundaryBytes=read(acceptance.sourceBoundaries.file);assert.equal(sha256(boundaryBytes),acceptance.sourceBoundaries.sha256);const boundary=JSON.parse(boundaryBytes);assert.equal(boundary.source,lock.commit);assert.equal(boundary.sourceLockSha256,sha256(lockBytes));for(const item of [boundary.actor,boundary.skills])assert.equal(item.sha256,lock.files[item.file]);
 const decisionBytes=read(acceptance.decision.file);assert.equal(sha256(decisionBytes),acceptance.decision.sha256);const decision=JSON.parse(decisionBytes);assert.equal(decision.id,'independent-buff-consumption/v1');assert.equal(decision.fixture,'buff-lifecycle');assert.equal(decision.changes.length,4);assert.equal(decision.helperAssertions.length,2);assert.equal(decision.unchangedCourses,39);
 const value=expected.get(decision.fixture),raw=original.get(decision.fixture);assert.equal(sha256(Buffer.from(JSON.stringify(raw,null,2)+'\n')),decision.sourceFixtureSha256);assert.equal(raw.rows[6].name,decision.course);
 assert.deepEqual(decision.changes.map(c=>c.path),[['rows',6,'stages',1,'buffs',0,'expiries'],['rows',6,'stages',2,'buffs',0,'expiries'],['rows',6,'stages',2,'buffs',0,'stacks'],['rows',6,'stages',2,'life']]);
 for(const edit of decision.changes){let parent=value;for(const key of edit.path.slice(0,-1))parent=parent[key];const key=edit.path.at(-1);assert.deepEqual(parent[key],edit.before);parent[key]=structuredClone(edit.after);}
 assert.equal(sha256(Buffer.from(JSON.stringify(value,null,2)+'\n')),decision.expectedSha256);
 const before=raw.rows[6].stages,after=value.rows[6].stages;assert(before[2].buffs[0].stacks>before[1].buffs[0].stacks);assert.deepEqual(after[1].buffs[0].expiries,[8,8]);assert.deepEqual(after[2].buffs[0].expiries,[5,5]);assert.equal(after[2].buffs[0].stacks,2);assert.equal(after[2].life,100+10*2);
 for(let i=0;i<raw.rows.length;i++)if(i!==6)assert.deepEqual(value.rows[i],raw.rows[i]);
 return{acceptance,boundary,original,expected,decision,proof:{id:decision.id,originalCourses:40,unchangedCourses:39,changedCourses:1,fieldEdits:4,sourceFixtureSha256:decision.sourceFixtureSha256,expectedSha256:decision.expectedSha256}};
}
