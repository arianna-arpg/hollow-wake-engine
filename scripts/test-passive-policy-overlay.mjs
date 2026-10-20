import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {root,sha256,writeJSON} from './reference-utils.mjs';
import {renderPassiveGrants} from '../adapters/hollow-wake/integrate-passive-grants.mjs';import {integratePassivePolicy} from '../adapters/hollow-wake/integrate-passive-policy.mjs';
const files=['src/engine/world.ts','src/dev/passiveEditor.ts','src/engine/passiveRefund.ts'],lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const reference=Object.fromEntries(files.map(f=>{const b=fs.readFileSync(path.join(root,'.reference',f));assert.equal(sha256(b),lock.files[f]);return[f,b.toString().replaceAll('\r\n','\n')];}));
const directory=fs.mkdtempSync(path.join(root,'.artifacts/passive-policy-overlay-')),receipts=[];
for(const ending of ['\n','\r\n']){
 const game=path.join(directory,ending==='\n'?'lf':'crlf');
 const grant=renderPassiveGrants(reference[files[0]],reference[files[1]],reference[files[0]],reference[files[1]]);
 const inputs=[grant.world+'\n// unrelated host work\n',grant.editor,reference[files[2]]];
 for(const [i,f] of files.entries()){fs.mkdirSync(path.dirname(path.join(game,f)),{recursive:true});fs.writeFileSync(path.join(game,f),inputs[i].replaceAll('\n',ending));}
 const snapshot=()=>files.map(f=>fs.readFileSync(path.join(game,f),'utf8'));const before=snapshot();
 fs.appendFileSync(path.join(game,files[2]),'\n// user work');assert.throws(()=>integratePassivePolicy(game),/Unreviewed refund/);assert.deepEqual(snapshot().slice(0,2),before.slice(0,2));fs.writeFileSync(path.join(game,files[2]),before[2]);
 integratePassivePolicy(game,false);assert.deepEqual(snapshot(),before);
 const changed=before[0].replace('allocateNode(nodeId: string, seat: Seat = this.localSeat, optionId?: string): boolean {','allocateNode(nodeId: string, seat: Seat = this.localSeat, optionId?: string): boolean { /* unreviewed */');assert.notEqual(changed,before[0]);fs.writeFileSync(path.join(game,files[0]),changed);
 assert.throws(()=>integratePassivePolicy(game),/Unreviewed allocateNode/);assert.equal(snapshot()[1],before[1]);fs.writeFileSync(path.join(game,files[0]),before[0]);
 integratePassivePolicy(game);const after=snapshot();assert.ok(after[0].endsWith('// unrelated host work'+ending));assert.equal(after[0].includes('\r\n'),ending==='\r\n');assert.throws(()=>integratePassivePolicy(game),/overwrite policy bridge/);assert.deepEqual(snapshot(),after);
 receipts.push({lineEndings:ending==='\n'?'lf':'crlf',preflightBeforeWrites:true,methodGuards:true,unrelatedWorkPreserved:true,reapplicationRejected:true});
}
writeJSON(path.join(root,'.artifacts/passive-policy-overlay-verification.json'),{receipts});console.log('Policy patch protects unreviewed inputs, unrelated edits and line endings.');
