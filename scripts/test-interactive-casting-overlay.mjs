import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {interactiveCastFile,renderInteractiveCasting,integrateInteractiveCasting} from '../adapters/hollow-wake/integrate-interactive-casting.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const original=fs.readFileSync(path.join(reference,interactiveCastFile),'utf8').replaceAll('\r\n','\n'),receipts=[];
for(const newline of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/interactive-overlay-')),target=path.join(game,interactiveCastFile),source=(original+'\n// independent interactive-casting marker\n').replaceAll('\n',newline);
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
 integrateInteractiveCasting(game,false);assert.equal(fs.readFileSync(target,'utf8'),source);
 integrateInteractiveCasting(game);const after=fs.readFileSync(target,'utf8');assert.equal(after.includes('\r\n'),newline==='\r\n');assert(after.endsWith(newline+'// independent interactive-casting marker'+newline));
 assert.equal((after.match(/advanceFocusCast\(cs, spec, dt, focused\)/g)??[]).length,1);assert.equal((after.match(/pressCastTiming\(cs,/g)??[]).length,1);
 assert(after.includes('focusCastDuration(def.concentration.time'));assert(after.includes('focusFizzleCooldown(def.cooldown'));
 assert.equal(ts.createSourceFile(interactiveCastFile,after,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);assert.throws(()=>integrateInteractiveCasting(game),/already integrated/);assert.equal(fs.readFileSync(target,'utf8'),after);
 receipts.push({lineEndings:newline==='\n'?'lf':'crlf',parsed:true,independentSourcePreserved:true,preflightBeforeWrites:true,reapplicationRefused:true});
}
assert.throws(()=>renderInteractiveCasting(original.replace('cs.elapsed -= dt * (spec.drainRate ?? 1);','cs.elapsed += dt;'),original),/Unreviewed concentration case/);
assert.throws(()=>renderInteractiveCasting(original.replace('cs.presses = Math.min(15, (cs.presses ?? 1) + 1);','cs.presses = 99;'),original),/Unreviewed timing press/);
assert.throws(()=>renderInteractiveCasting(original.replace('Math.max(0.2, def.concentration.time / caster.speedFactor(inst))','def.concentration.time'),original),/Changed focus duration expression/);
assert.throws(()=>renderInteractiveCasting(original+'\n// advanceFocusCast\n',original),/already integrated/);
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/interactive-casting-overlay-verification.json'),{receipts,ownedFocusCaseEditsRejected:true,ownedTimingMethodEditsRejected:true,preparationExpressionEditsRejected:true,importCollisionsRejected:true});
console.log('Interactive casting overlay guards focus, timing input and duration while retaining unrelated source.');
