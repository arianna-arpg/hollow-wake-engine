import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {chargedCastFile,chargedCastBridge,renderChargedCasting,integrateChargedCasting} from '../adapters/hollow-wake/integrate-charged-casting.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const original=fs.readFileSync(path.join(reference,chargedCastFile),'utf8').replaceAll('\r\n','\n'),receipts=[];
for(const newline of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/charged-overlay-')),target=path.join(game,chargedCastFile),source=(original+'\n// independent charged-casting marker\n').replaceAll('\n',newline);
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
 fs.writeFileSync(path.join(game,chargedCastBridge),'independent bridge');assert.throws(()=>integrateChargedCasting(game),/overwrite/);assert.equal(fs.readFileSync(target,'utf8'),source);fs.unlinkSync(path.join(game,chargedCastBridge));
 integrateChargedCasting(game,false);assert.equal(fs.readFileSync(target,'utf8'),source);
 integrateChargedCasting(game);const after=fs.readFileSync(target,'utf8');assert.equal(after.includes('\r\n'),newline==='\r\n');assert(after.endsWith(newline+'// independent charged-casting marker'+newline));
 assert.equal((after.match(/this.sdkChargedCasting\(\).advance\(a, dt\)/g)??[]).length,2);
 assert(after.includes('chargeCastDuration(def.chargeUp.maxTime'));assert(after.includes('overchargeMarker(Math.random())'));
 assert.equal(ts.createSourceFile(chargedCastFile,after,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);assert.throws(()=>integrateChargedCasting(game),/overwrite/);
 receipts.push({lineEndings:newline==='\n'?'lf':'crlf',parsed:true,independentSourcePreserved:true,bridgeCollisionRefused:true,preflightBeforeWrites:true,reapplicationRefused:true});
}
assert.throws(()=>renderChargedCasting(original.replace('cs.elapsed = Math.min(cs.total, cs.elapsed + dt);','cs.elapsed += dt;'),original),/Unreviewed charge case/);
assert.throws(()=>renderChargedCasting(original.replace('const per = spec.costPerStage ?? 1;','const per = 0;'),original),/Unreviewed overcharge case/);
assert.throws(()=>renderChargedCasting(original.replace('Math.max(ocSpec.time, def.useTime) / caster.speedFactor(inst)','ocSpec.time'),original),/Changed charged press expression/);
assert.throws(()=>renderChargedCasting(original+'\n// sdkChargedCasting\n',original),/already integrated/);
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/charged-casting-overlay-verification.json'),{receipts,ownedCaseEditsRejected:true,pressExpressionEditsRejected:true,memberCollisionsRejected:true});
console.log('Charged casting overlay guards update cases and preparation expressions while retaining unrelated source.');
