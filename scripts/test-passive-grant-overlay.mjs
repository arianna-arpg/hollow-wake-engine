import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, sha256, writeJSON } from './reference-utils.mjs';
import { integratePassiveGrants, renderPassiveGrants } from '../adapters/hollow-wake/integrate-passive-grants.mjs';

const files=['src/engine/world.ts','src/dev/passiveEditor.ts'];
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const original=files.map(file=>{const bytes=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(bytes),lock.files[file]);return bytes.toString().replaceAll('\r\n','\n');});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/passive-grant-overlay-'));
const receipts=[];
for(const newline of ['\n','\r\n']) {
  const game=path.join(directory,newline==='\n'?'lf':'crlf');
  const world='// unrelated host work retained\n'+original[0]+'\n// another host change\n';
  for(const [i,file] of files.entries()) {fs.mkdirSync(path.dirname(path.join(game,file)),{recursive:true});fs.writeFileSync(path.join(game,file),(i===0?world:original[1]).replaceAll('\n',newline));}
  const snapshot=()=>files.map(file=>fs.readFileSync(path.join(game,file),'utf8'));
  const before=snapshot();
  fs.appendFileSync(path.join(game,files[1]),'\n// unreviewed editor work');
  assert.throws(()=>integratePassiveGrants(game),/Unreviewed passive editor/);
  assert.equal(snapshot()[0],before[0],'Validate all sources before writing any');
  fs.writeFileSync(path.join(game,files[1]),before[1]);
  integratePassiveGrants(game,false);assert.deepEqual(snapshot(),before);
  const changed=world.replace('recalcSeat(seat: Seat): void {', 'recalcSeat(seat: Seat): void { /* changed rebuild */');
  assert.notEqual(changed,world,'Guard mutation must actually alter the method');
  assert.throws(()=>renderPassiveGrants(changed,original[1],...original),/Unreviewed recalcSeat/);
  integratePassiveGrants(game);
  const after=snapshot();
  assert.ok(after[0].startsWith('// unrelated host work retained'+newline));
  assert.ok(after[0].endsWith('// another host change'+newline));
  assert.equal(after[0].includes('\r\n'),newline==='\r\n');
  assert.throws(()=>integratePassiveGrants(game),/overwrite grant bridge/);
  assert.deepEqual(snapshot(),after,'Reapplication must preserve the completed change');
  const bridge=path.join(game,'src/engine/passiveGrantAdapter.ts');
  assert.equal(fs.readFileSync(bridge,'utf8'),fs.readFileSync(path.join(root,'adapters/hollow-wake/passiveGrantAdapter.ts'),'utf8'));
  receipts.push({lineEndings:newline==='\n'?'lf':'crlf',preflightBeforeWrites:true,recalcGuard:true,unrelatedWorkPreserved:true,reapplicationRejected:true});
}
writeJSON(path.join(root,'.artifacts/passive-grant-overlay-verification.json'),{receipts});
console.log('Passive grant patch preserves unrelated work and line endings, and refuses changed inputs before writes.');
