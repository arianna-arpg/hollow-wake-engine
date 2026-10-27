import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';import {root,sha256} from './reference-utils.mjs';

export function readLifeRecoveryExpectations(){
  const acceptance=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-forty-two/acceptance.json')));
  assert.equal(acceptance.schemaVersion,1);assert.equal(acceptance.milestone,42);assert.equal(acceptance.courses,101);
  assert.equal(sha256(fs.readFileSync(path.join(root,acceptance.sourceLock))),acceptance.sourceLockSha256);
  assert.equal(acceptance.helpers.length,3);assert.equal(acceptance.fixtures.length,3);
  assert.deepEqual(acceptance.fixtures.map(row=>[row.name,row.courses]),[['life-recovery',59],['heal-procs',29],['life-recovery-world',13]]);
  const addendum=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-forty-two/method-resolution-addendum.json')));
  assert.equal(addendum.baseAcceptanceSha256,sha256(fs.readFileSync(path.join(root,'baseline/milestone-forty-two/acceptance.json'))));
  assert.equal(addendum.courses,3);assert.equal(addendum.fixture.courses,3);assert.equal(addendum.fixture.name,'heal-method-resolution');
  const cueAddendum=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-forty-two/cue-observation-addendum.json')));
  assert.equal(cueAddendum.baseAcceptanceSha256,addendum.baseAcceptanceSha256);
  assert.equal(cueAddendum.courses,13);assert.equal(cueAddendum.fixture.courses,13);assert.equal(cueAddendum.fixture.name,'heal-cues');
  const helpers=[...acceptance.helpers,addendum.helper,cueAddendum.helper],rows=[...acceptance.fixtures,addendum.fixture,cueAddendum.fixture];
  for(const helper of helpers)assert.equal(sha256(fs.readFileSync(path.join(root,helper.file))),helper.sha256);
  const boundaryBytes=fs.readFileSync(path.join(root,acceptance.sourceBoundaries.file));
  assert.equal(sha256(boundaryBytes),acceptance.sourceBoundaries.sha256);
  const boundaries=JSON.parse(boundaryBytes);assert.equal(boundaries.source,acceptance.source);
  assert.equal(boundaries.sourceLockSha256,acceptance.sourceLockSha256);
  for(const method of boundaries.actor.methods)assert.equal(sha256(method.text),method.sha256);
  assert.equal(sha256(boundaries.proc.text),boundaries.proc.sha256);
  const fixtures=new Map();
  for(const row of rows){
    assert(helpers.some(h=>h.file===row.helper&&h.sha256===row.helperSha256));
    const compressed=fs.readFileSync(path.join(root,row.file));assert.equal(sha256(compressed),row.compressedSha256);
    const bytes=gunzipSync(compressed);assert.equal(bytes.length,row.bytes);assert.equal(sha256(bytes),row.fixtureSha256);
    const value=JSON.parse(bytes);assert.equal(value.courses,row.courses);assert.equal(value.rows.length,row.courses);
    fixtures.set(row.name,{bytes,value});
  }
  return{acceptance,addendum,cueAddendum,boundaries,fixtures,helpers,rows,courses:117};
}
