import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {admissionActor,admissionBridge,renderAdmissionActor,integrateSkillAdmission} from '../adapters/hollow-wake/integrate-skill-admission.mjs';
const game=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(game,lock);
const original=fs.readFileSync(path.join(game,admissionActor),'utf8').replaceAll('\r\n','\n'),receipts=[];
for(const newline of ['\n','\r\n']){
 const temp=fs.mkdtempSync(path.join(root,'.artifacts/admission-overlay-')),file=path.join(temp,admissionActor),input=(original+'\n// unrelated admission marker\n').replaceAll('\n',newline);
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,input);
 integrateSkillAdmission(temp,false);assert.equal(fs.readFileSync(file,'utf8'),input);
 for(const[before,after]of [['if (this.tagsForbidden(inst))','if (false)'],['this.primedPours.length >= cap','this.primedPours.length > cap'],["d.stun !== true","d.stun === true"]]){
  assert(input.includes(before));const changed=input.replace(before,after);fs.writeFileSync(file,changed);
  assert.throws(()=>integrateSkillAdmission(temp),/Unreviewed/);assert.equal(fs.readFileSync(file,'utf8'),changed);assert(!fs.existsSync(path.join(temp,admissionBridge)));
 }
 fs.writeFileSync(file,input);integrateSkillAdmission(temp);const rendered=fs.readFileSync(file,'utf8');
 assert(rendered.endsWith(newline+'// unrelated admission marker'+newline));assert.equal(rendered.includes('\r\n'),newline==='\r\n');
 assert.equal(ts.createSourceFile(file,rendered,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);
 for(const name of ['canAct','canUse','tagsForbidden','isReflex','unmetGate','gatesMet','primedPourOpen'])assert(rendered.includes('sdkSkillAdmission.'+name+'('));
 assert(!rendered.includes('private reflexOpen'));assert(!rendered.includes('private gatherReleasable'));
 assert.throws(()=>integrateSkillAdmission(temp),/Refusing to replace/);receipts.push({newline,unrelatedPreserved:true,changedInputsRejectedBeforeWrites:true,reapplicationRefused:true});
}
assert.throws(()=>renderAdmissionActor(original+'\n// this.reflexOpen(',original),/New private admission helper caller/);
const priorLocation=path.join(root,'.artifacts/m29-adapter-location.json');
if(fs.existsSync(priorLocation)){
 const prior=fs.readFileSync(path.join(JSON.parse(fs.readFileSync(priorLocation)).game,admissionActor),'utf8');
 const rendered=renderAdmissionActor(prior,original);assert(rendered.includes('sdkSkillAdmission.canUse'));
 assert.throws(()=>renderAdmissionActor(prior.replace('!sdkChargeCostReady(this.charges.get(cc.charge) ?? 0, cc)','false'),original),/Unreviewed admission method/);
 assert.throws(()=>renderAdmissionActor(prior.replace('requiresUseCharge(uc) && this.skillChargeBank(inst).count <= 0','false'),original),/Unreviewed admission method/);
}
verifyReference(game,lock);writeJSON(path.join(root,'.artifacts/skill-admission-overlay-verification.json'),{receipts,privateCallersGuarded:true,retainedControlChecked:fs.existsSync(priorLocation)});
console.log('Admission overlay preserves unrelated source and rejects unreviewed policy changes before writes.');
