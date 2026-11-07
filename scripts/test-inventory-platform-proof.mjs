import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyInventoryPlatform} from './inventory-platform-proof.mjs';
import {sha256,writeJSON} from './reference-utils.mjs';

const [proofFlag,file,gameFlag,gameSha256,outFlag,output,...rest]=process.argv.slice(2);
assert.deepEqual([proofFlag,gameFlag,outFlag,rest.length],['--proof','--game-sha','--out',0]);
assert(!fs.existsSync(output));
const bytes=fs.readFileSync(file),proof=JSON.parse(bytes);
verifyInventoryPlatform(proof,gameSha256);
const runs=[];
for(const [name,alter,expected] of [
  ['foreign-archive',p=>{p.gameSha256='0'.repeat(64);},'matched shipping archive'],
  ['missing-crash-boundary',p=>{p.crashes.pop();},'all journal crash boundaries'],
  ['writer-not-terminated',p=>{p.crashes[0].terminated=false;},'observed process termination'],
  ['uncommitted-revision',p=>{p.crashes[1].recovery.revision=2;},'recovered revision'],
  ['missing-database-reader',p=>{p.crashes[0].recovery.gameEqualsDatabase=false;},'both recovered owners observed'],
  ['shipping-recovery-skipped',p=>{p.checks=p.checks.filter(s=>s!=='wal-after-stage-shipping-recovery');},'complete crash observation sequence'],
]){
  const changed=structuredClone(proof);alter(changed);
  assert.throws(()=>verifyInventoryPlatform(changed,gameSha256),error=>error.code==='ERR_ASSERTION'&&error.message.includes(expected),name);
  runs.push({name,assertion:expected,detected:true});
}
// A zero-byte WAL is a valid observation, not a weakened recovery requirement.
const cached=structuredClone(proof);
cached.crashes.find(row=>row.journalMode==='wal'&&row.phase==='after-stage').journalBytes['-wal']=0;
verifyInventoryPlatform(cached,gameSha256);
verifyInventoryPlatform(proof,gameSha256);
assert(fs.readFileSync(file).equals(bytes));
writeJSON(output,{passed:true,proofSha256:sha256(bytes),runs,zeroByteWalAccepted:true,sourcePreserved:true});
console.log({passed:true,faults:runs.length,zeroByteWalAccepted:true});
