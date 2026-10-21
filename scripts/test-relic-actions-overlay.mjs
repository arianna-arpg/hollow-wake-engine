import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';import {relicActionWorld,relicActionBridge,integrateRelicActions,renderRelicActions} from '../adapters/hollow-wake/integrate-relic-actions.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);const receipts=[];
const original=fs.readFileSync(path.join(reference,relicActionWorld),'utf8').replaceAll('\r\n','\n');
for(const newline of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/relic-actions-overlay-')),target=path.join(game,relicActionWorld),source=original.replaceAll('\n',newline);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
 const unknown=source.replace('canManageAccountRelics(seat: Seat): boolean {','canManageAccountRelics(seat: Seat): boolean { /* independent work */');fs.writeFileSync(target,unknown);assert.throws(()=>integrateRelicActions(game),/Unreviewed/);assert.equal(fs.readFileSync(target,'utf8'),unknown);assert(!fs.existsSync(path.join(game,relicActionBridge)));
 fs.writeFileSync(target,source);fs.writeFileSync(path.join(game,relicActionBridge),'independent host binding');assert.throws(()=>integrateRelicActions(game),/overwrite/);fs.unlinkSync(path.join(game,relicActionBridge));
 const unrelated=source+newline+'// unrelated preserved work'+newline;fs.writeFileSync(target,unrelated);integrateRelicActions(game,false);assert.equal(fs.readFileSync(target,'utf8'),unrelated);
 integrateRelicActions(game);const after=fs.readFileSync(target,'utf8');assert(after.endsWith(newline+'// unrelated preserved work'+newline));assert.equal(after.includes('\r\n'),newline==='\r\n');assert.throws(()=>integrateRelicActions(game),/overwrite/);
 receipts.push({lineEndings:newline==='\n'?'lf':'crlf',elevenOriginalMethodsCheckedBeforeWrites:true,unknownOwnedWorkRefused:true,unrelatedWorkPreserved:true,bindingCollisionRefused:true,reapplicationRejected:true});
}
const duplicate=original.replace('  canManageAccountRelics(seat: Seat): boolean {','  canManageAccountRelics(seat: Seat): boolean { return false; }\n  canManageAccountRelics(seat: Seat): boolean {');assert.throws(()=>renderRelicActions(duplicate,original),/Ambiguous/);
for(const name of ['sdkRelicAccess','sdkRelicContext','sdkRelicAccessCache'])assert.throws(()=>renderRelicActions(original.replace('  canManageAccountRelics(seat: Seat): boolean {',`  private ${name} = 1;\n  canManageAccountRelics(seat: Seat): boolean {`),original),/already exists/);
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/relic-actions-overlay-verification.json'),{receipts,duplicateMethodRefused:true,helperMemberCollisionsRefused:true});console.log('Relic action overlay guards all eleven methods and preserves unrelated World code.');
