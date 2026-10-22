import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {channelCastFile,channelCastBridge,renderChannelCasting,integrateChannelCasting} from '../adapters/hollow-wake/integrate-channel-casting.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const original=fs.readFileSync(path.join(reference,channelCastFile),'utf8').replaceAll('\r\n','\n'),receipts=[];
for(const newline of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/channel-overlay-')),target=path.join(game,channelCastFile),bridge=path.join(game,channelCastBridge),source=(original+'\n// independent channel marker\n').replaceAll('\n',newline);
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
 integrateChannelCasting(game,false);assert.equal(fs.readFileSync(target,'utf8'),source);assert(!fs.existsSync(bridge));
 integrateChannelCasting(game);const after=fs.readFileSync(target,'utf8');assert.equal(after.includes('\r\n'),newline==='\r\n');assert(after.endsWith(newline+'// independent channel marker'+newline));
 assert.equal((after.match(/sdkChannelCasting\(\).advance\(a, cs, dt, targetInfo\)/g)??[]).length,1);
 assert(after.includes('advanceChannelPersistence(pp, dt, pp.caster.dead)'));assert(after.includes('channelInterval(chSpec.interval'));assert(after.includes('channelWindup(chSpec.windup'));
 assert.equal(ts.createSourceFile(channelCastFile,after,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);
 assert.throws(()=>integrateChannelCasting(game),/Refusing to overwrite/);assert.equal(fs.readFileSync(target,'utf8'),after);
 receipts.push({lineEndings:newline==='\n'?'lf':'crlf',parsed:true,independentSourcePreserved:true,preflightBeforeWrites:true,reapplicationRefused:true});
}
assert.throws(()=>renderChannelCasting(original.replace('cs.pulseTimer += cs.total;','cs.pulseTimer = 0;'),original),/Unreviewed channel case/);
assert.throws(()=>renderChannelCasting(original.replace('pp.remaining -= dt;','pp.remaining += dt;'),original),/Unreviewed persistent channel phase/);
assert.throws(()=>renderChannelCasting(original.replace('Math.max(0.1, chSpec.interval / caster.speedFactor(inst))','chSpec.interval'),original),/Changed channel duration expression/);
assert.throws(()=>renderChannelCasting(original+'\n// sdkChannelCasting\n',original),/already integrated/);
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/channel-casting-overlay-verification.json'),{receipts,ownedChannelCaseEditsRejected:true,persistenceEditsRejected:true,preparationExpressionEditsRejected:true,importCollisionsRejected:true});
console.log('Channel overlay preserves unrelated source and guards lifecycle, persistence and initial timing.');
