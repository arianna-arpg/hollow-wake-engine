import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {resourceFiles,resourceBridge,renderResources,integrateResources} from '../adapters/hollow-wake/integrate-resources.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const originals=Object.fromEntries(resourceFiles.map(f=>[f,fs.readFileSync(path.join(reference,f),'utf8').replaceAll('\r\n','\n')])),anchors=['gainCharge(charge:','export function gaugeTick','private consumeChargeCost'],receipts=[];
for(const newline of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/resource-overlay-')),sources=Object.fromEntries(Object.entries(originals).map(([f,s])=>[f,(s+'\n// independent resource work retained\n').replaceAll('\n',newline)]));
 const reset=()=>{for(const [file,source] of Object.entries(sources)){fs.mkdirSync(path.dirname(path.join(game,file)),{recursive:true});fs.writeFileSync(path.join(game,file),source);}};
 for(let i=0;i<resourceFiles.length;i++){
  reset();const file=resourceFiles[i],at=sources[file].indexOf(anchors[i]);assert(at>=0);const brace=sources[file].indexOf('{',at);assert(brace>at);
  fs.writeFileSync(path.join(game,file),sources[file].slice(0,brace+1)+' /* separately edited owned declaration */ '+sources[file].slice(brace+1));
  const before=Object.fromEntries(resourceFiles.map(f=>[f,fs.readFileSync(path.join(game,f),'utf8')]));assert.throws(()=>integrateResources(game),/Unreviewed/);for(const f of resourceFiles)assert.equal(fs.readFileSync(path.join(game,f),'utf8'),before[f]);assert(!fs.existsSync(path.join(game,resourceBridge)));
 }
 reset();fs.writeFileSync(path.join(game,resourceBridge),'independent binding');assert.throws(()=>integrateResources(game),/overwrite/);fs.unlinkSync(path.join(game,resourceBridge));
 integrateResources(game,false);for(const [f,s] of Object.entries(sources))assert.equal(fs.readFileSync(path.join(game,f),'utf8'),s);
 integrateResources(game);for(const f of resourceFiles){const s=fs.readFileSync(path.join(game,f),'utf8');assert(s.endsWith(newline+'// independent resource work retained'+newline));assert.equal(s.includes('\r\n'),newline==='\r\n');}assert.throws(()=>integrateResources(game),/overwrite/);
 receipts.push({lineEndings:newline==='\n'?'lf':'crlf',threeFilePreflightBeforeWrites:true,ownedDeclarationChangesRefused:true,unrelatedWorkPreserved:true,bindingCollisionRefused:true,reapplicationRefused:true});
}
const actor=originals[resourceFiles[0]],gauge=originals[resourceFiles[1]],world=originals[resourceFiles[2]];
assert.throws(()=>renderResources(resourceFiles[0],actor.replace('  gainCharge(charge:','  private sdkResourceRuntime = 1;\n  gainCharge(charge:'),actor),/already exists/);
assert.throws(()=>renderResources(resourceFiles[0],actor.replace('Math.max(cc.amount, cc.minimum ?? 0)','Math.max(cc.amount, cc.minimum ?? 0) + 1'),actor),/Unreviewed resource cost admission/);
assert.throws(()=>renderResources(resourceFiles[1],gauge+'\nexport function gaugeAdd() { return 0; }',gauge),/Ambiguous/);
assert.throws(()=>renderResources(resourceFiles[2],world.replace('private consumeChargeCost','private independentlyRenamedChargeCost'),world),/Ambiguous/);
const unrelated="\nexport function independentChargeRegistry() { return CHARGE_DEFS; }\n",kept=renderResources(resourceFiles[0],actor+unrelated,actor);assert(kept.endsWith(unrelated));assert(kept.includes("import { CHARGE_DEFS } from './charges';"));
const migrated=renderResources(resourceFiles[0],actor,actor),registration=migrated.indexOf("import './charges';");assert(registration>=0);assert(registration<migrated.indexOf("from './gauge'"),'Charge stat registration must precede gauges as in the original module');
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/resource-overlay-verification.json'),{receipts,memberCollisionRefused:true,admissionEditRefused:true,duplicateFunctionRefused:true,renamedPaymentRefused:true,independentImportRetained:true,chargeStatRegistrationOrderRetained:true});
console.log('Resource migration guards three source files and one binding, and preserves independent changes.');
