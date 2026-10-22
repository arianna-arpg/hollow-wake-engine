import test from 'node:test';import assert from 'node:assert/strict';
import {projectAdmission,withoutParents} from '../scripts/admission-comparison.mjs';
test('comparison retains preflight gates, payment, targeting and every state field',()=>{
 const calls=[{method:'unmetGate',parents:[],skill:'x'},{method:'canUse',parents:[],skill:'x'},
  {method:'unmetGate',parents:['canUse','gatesMet'],skill:'x'},{method:'resolveTargeting',skill:'x'},
  {method:'payCost',parents:[],cost:{mana:3,life:0}}];
 const original={courses:[{steps:[{before:{mana:4},result:true,after:{mana:1},calls}]}]},copy=structuredClone(original);
 const result=projectAdmission('admission-world',original);
 assert.deepEqual(result.courses[0].steps[0].calls.map(c=>c.method),['unmetGate','canUse','resolveTargeting','payCost']);
 assert.deepEqual(result.courses[0].steps[0].after,{mana:1});assert.deepEqual(original,copy);
 assert.equal(withoutParents(original).courses[0].steps[0].calls.length,5);
 calls[2].parents=['payCost'];assert.throws(()=>projectAdmission('admission-world',original),/Unexpected nested/);
 delete calls[0].parents;assert.throws(()=>projectAdmission('admission-world',original),/Uninstrumented/);
});
test('comparison never discards unknown observations or bank, price and stat read ordering',()=>{
 const original={cases:[{steps:[{trace:['canAct','skillChargeBank','skillCost','canAfford','gatesMet','unmetGate','availableMaxMana','maxMana'],result:false,after:{banks:[1]}}]}]};
 const result=projectAdmission('admission-actor',original);assert.deepEqual(result.cases[0].steps[0].trace,['skillChargeBank','skillCost','canAfford','availableMaxMana','maxMana']);
 assert.deepEqual(result.cases[0].steps[0].after,{banks:[1]});original.cases[0].steps[0].trace.push('newAuthority');
 assert.throws(()=>projectAdmission('admission-actor',original),/Unknown admission trace/);
});
