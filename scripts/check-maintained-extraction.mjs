import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256} from './reference-utils.mjs';

// A maintained port is no longer byte-identical to its October extraction.
// Verify that extraction independently, then admit only its reviewed revision.
// Unknown files still require exact mechanical equivalence.
export function assertExtractionRevision(file,original,current,revisions){
 const row=revisions.files[file],before=sha256(original),after=sha256(current);
 if(!row){assert.equal(after,before,file+': unreviewed extraction change');return;}
 assert.equal(before,row.beforeSha256,file+': original extraction changed');
 assert.equal(after,row.afterSha256,file+': maintained revision changed');
}

export function checkMaintainedExtraction(file,original){
 const revisions=JSON.parse(fs.readFileSync(path.join(root,'baseline/prototype-parity/maintained-extractions.json')));
 const lock=fs.readFileSync(path.join(root,'baseline/prototype-parity/source-lock.json'));
 assert.equal(sha256(lock),revisions.sourceLockSha256,'Maintained revision source lock changed');
 assert.equal(JSON.parse(lock).commit,revisions.sourceCommit);
 for(const[evidence,digest]of Object.entries(revisions.evidence))
  assert.equal(sha256(fs.readFileSync(path.join(root,evidence))),digest,'Maintained revision evidence changed: '+evidence);
 assertExtractionRevision(file,original,fs.readFileSync(path.join(root,file)),revisions);
}
