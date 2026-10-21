import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {eventFile,eventBridge,renderResourceEvents,integrateResourceEvents} from '../adapters/hollow-wake/integrate-resource-events.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const original=fs.readFileSync(path.join(reference,eventFile),'utf8').replaceAll('\r\n','\n'),receipts=[];
for(const newline of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/event-overlay-')),target=path.join(game,eventFile),source=(original+'\n// independent event-source marker\n').replaceAll('\n',newline);
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
 fs.writeFileSync(path.join(game,eventBridge),'independent bridge');assert.throws(()=>integrateResourceEvents(game),/overwrite/);assert.equal(fs.readFileSync(target,'utf8'),source);fs.unlinkSync(path.join(game,eventBridge));
 integrateResourceEvents(game,false);assert.equal(fs.readFileSync(target,'utf8'),source);
 integrateResourceEvents(game);const after=fs.readFileSync(target,'utf8');assert.equal(after.includes('\r\n'),newline==='\r\n');assert(after.endsWith(newline+'// independent event-source marker'+newline));
 assert(after.includes('this.sdkResourceEvents().dispatch(a, on, at, orbKind, victim)'));assert(!after.includes('private tapFires('));assert(after.includes('gaugeSpend'));assert(!/import[^\n]+\b(gaugeAdd|gaugeShaveSec|GaugeFeedSpec)\b/.test(after));
 assert.equal(ts.createSourceFile(eventFile,after,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);assert.throws(()=>integrateResourceEvents(game),/overwrite/);
 receipts.push({lineEndings:newline==='\n'?'lf':'crlf',parsed:true,independentSourcePreserved:true,bridgeCollisionRefused:true,preflightBeforeWrites:true,reapplicationRefused:true});
}
assert.throws(()=>renderResourceEvents(original.replace('if (spec.on !== on) return false;','if (spec.on !== on) return true;'),original),/Unreviewed resource event method tapFires/);
assert.throws(()=>renderResourceEvents(original.replace('private tapCharges(','private differentTapCharges('),original),/Ambiguous/);
assert.throws(()=>renderResourceEvents(original.replace('private tapFires(','private sdkResourceEvents('),original),/already exists/);
const independent=original+'\nexport function independentlyUsedGauge() { return gaugeAdd; }\n',kept=renderResourceEvents(independent,original);assert(kept.includes('import { gaugeAdd, gaugeSpend }'));assert(kept.endsWith('return gaugeAdd; }\n'));
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/resource-event-overlay-verification.json'),{receipts,ownedEditsRejected:true,renamesRejected:true,memberCollisionsRejected:true,unrelatedImportRetained:true});
console.log('Resource event overlay guards the owned World methods and retains unrelated source.');
