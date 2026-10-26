import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';import {fileURLToPath} from 'node:url';
import {root,sha256} from './reference-utils.mjs';

/** Produce detached expected observations; never edit the original fixtures. */
export function readDelayedRepairExpectations(){
 const folder=path.join(root,'baseline/milestone-forty'),acceptanceBytes=fs.readFileSync(path.join(folder,'acceptance.json')),acceptance=JSON.parse(acceptanceBytes);
 const contractBytes=fs.readFileSync(path.join(folder,'runtime-contract.json')),contract=JSON.parse(contractBytes);
 assert.equal(contract.capability,'delayed-burst/v1');assert.equal(contract.decision,'delayed-queue-generation/v1');assert.equal(contract.baselineAcceptanceSha256,sha256(acceptanceBytes));assert.equal(contract.source,acceptance.source);
 const repairBytes=fs.readFileSync(path.join(root,contract.repairExpectations.file));assert.equal(sha256(repairBytes),contract.repairExpectations.sha256);const repairs=JSON.parse(repairBytes);
 assert.equal(repairs.schemaVersion,1);assert.equal(repairs.decision,contract.decision);assert.equal(repairs.baselineAcceptanceSha256,sha256(acceptanceBytes));assert.equal(repairs.affectedCourses,6);assert.equal(repairs.unchangedCourses,42);
 assert.deepEqual(repairs.changes.map(c=>[c.fixture,c.case]),[
  ['delayed-ordering','nested-drain-exhausts-outer-index'],['delayed-ordering','clear-queue-during-callback'],['delayed-ordering','replace-queue-during-callback'],
  ['delayed-descent','future-entry-before-lethal-descent-wipe'],['delayed-stale','single-burst-stale-target-after-descent-wipe'],['delayed-stale','future-entry-and-stale-target-after-descent-wipe'],
 ]);
 const expected=new Map(),originals=new Map();
 for(const fixture of acceptance.fixtures){const compressed=fs.readFileSync(path.join(root,fixture.file));assert.equal(sha256(compressed),fixture.compressedSha256);const bytes=gunzipSync(compressed);assert.equal(sha256(bytes),fixture.fixtureSha256);const value=JSON.parse(bytes);assert.equal(value.rows.length,fixture.courses);assert(!expected.has(fixture.name));originals.set(fixture.name,value);expected.set(fixture.name,structuredClone(value));}
 let edits=0;for(const change of repairs.changes){const document=expected.get(change.fixture);assert(document);const rows=document.rows.filter(row=>row.name===change.case);assert.equal(rows.length,1);const row=rows[0];assert.equal(sha256(JSON.stringify(row)),change.originalCaseSha256);assert(change.edits.length>0);
  for(const edit of change.edits){assert(Array.isArray(edit.path)&&edit.path.length>0);let target=row;for(const key of edit.path.slice(0,-1)){assert(Object.hasOwn(target,key));assert(!['__proto__','prototype','constructor'].includes(key));target=target[key];}const key=edit.path.at(-1);assert(!['__proto__','prototype','constructor'].includes(key));assert(Object.hasOwn(target,key));assert.deepEqual(target[key],edit.before,'Changed repair before-value');assert.notDeepEqual(edit.before,edit.after);target[key]=structuredClone(edit.after);edits++;}
  assert.equal(sha256(JSON.stringify(row)),change.expectedCaseSha256);assert.notEqual(change.expectedCaseSha256,change.originalCaseSha256);
 }
 let changed=0,unchanged=0;for(const[name,original]of originals){const revised=expected.get(name);assert.equal(revised.rows.length,original.rows.length);assert.deepEqual({...revised,rows:[]},{...original,rows:[]});for(let i=0;i<original.rows.length;i++){if(JSON.stringify(original.rows[i])===JSON.stringify(revised.rows[i]))unchanged++;else changed++;}}
 assert.equal(changed,6);assert.equal(unchanged,42);
 return{expected,proof:{decision:contract.decision,contractSha256:sha256(contractBytes),repairSha256:sha256(repairBytes),acceptanceSha256:sha256(acceptanceBytes),changedCourses:changed,unchangedCourses:unchanged,edits,originalFixturesUnchanged:true,implementationAccepted:false}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(readDelayedRepairExpectations().proof,null,2));
