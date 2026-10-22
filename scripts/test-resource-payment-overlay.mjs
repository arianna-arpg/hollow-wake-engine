import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {paymentActor,paymentBridge,renderPaymentActor,integrateResourcePayment} from '../adapters/hollow-wake/integrate-resource-payment.mjs';
import {integrate} from '../adapters/hollow-wake/integrate.mjs';
const game=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(game,lock);
const original=fs.readFileSync(path.join(game,paymentActor),'utf8').replaceAll('\r\n','\n'),receipts=[];
for(const newline of ['\n','\r\n']){
 const temp=fs.mkdtempSync(path.join(root,'.artifacts/payment-overlay-')),file=path.join(temp,paymentActor),input=(original+'\n// unrelated payment marker\n').replaceAll('\n',newline);
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,input);
 integrateResourcePayment(temp,false);assert.equal(fs.readFileSync(file,'utf8'),input);
 for(const [before,after]of [['const room = cap - od.debt;','const room = cap;'],['od.idle -= dt;','od.idle = 0;'],['this.healBy(regen * (1 - toEs) * dt, true);','this.healBy(0, true);']]){
  assert(input.includes(before));const changed=input.replace(before,after);fs.writeFileSync(file,changed);
  assert.throws(()=>integrateResourcePayment(temp),/Unreviewed/);assert.equal(fs.readFileSync(file,'utf8'),changed);assert(!fs.existsSync(path.join(temp,paymentBridge)));
 }
 fs.writeFileSync(file,input);integrateResourcePayment(temp);const rendered=fs.readFileSync(file,'utf8');
 assert(rendered.endsWith(newline+'// unrelated payment marker'+newline));assert.equal(rendered.includes('\r\n'),newline==='\r\n');
 assert.equal(ts.createSourceFile(file,rendered,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);
 assert(rendered.includes('sdkResourcePayment.advanceDebt(this, dt, regen);'));assert(!rendered.includes('private overdriveIdleDelay'));
 assert.throws(()=>integrateResourcePayment(temp),/Refusing to replace/);receipts.push({newline,unrelatedPreserved:true,changedInputsRejectedBeforeWrites:true,reapplicationRefused:true});
}
assert.throws(()=>renderPaymentActor(original+'\n// this.overdriveIdleDelay(',original),/New idle helper caller/);
const previous=fs.mkdtempSync(path.join(root,'.artifacts/payment-prior-overlay-'));fs.mkdirSync(path.join(previous,'src/engine'),{recursive:true});
for(const file of ['actor.ts','world.ts'])fs.copyFileSync(path.join(game,'src/engine',file),path.join(previous,'src/engine',file));
integrate(previous);const prior=fs.readFileSync(path.join(previous,paymentActor),'utf8');
assert.throws(()=>renderPaymentActor(prior.replace('return canPayCast(this, cost);','return true;'),original),/Unreviewed payment method/);
integrateResourcePayment(previous);const after=fs.readFileSync(path.join(previous,paymentActor),'utf8');
assert(!after.includes('canPayCast'));assert(!after.includes('payCast('));assert(after.includes('advanceCooldown'));assert(after.includes('overdraftHeadroom('));assert(!after.includes('private overdraftHeadroom'));
verifyReference(game,lock);writeJSON(path.join(root,'.artifacts/resource-payment-overlay-verification.json'),{receipts,fullRegenerationPhaseGuarded:true,priorOrdinaryPaymentDelegationRetired:true});console.log('Payment overlay guards methods and the full regeneration phase, and retires the exact earlier payment delegation.');
