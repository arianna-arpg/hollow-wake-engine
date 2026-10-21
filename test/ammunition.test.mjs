import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import assert from 'node:assert/strict';import test from 'node:test';
import {Ammunition,commitAmmunitionPress,useChargeReady,requiresUseCharge} from '../dist/ammunition.js';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twenty-six/ammunition.json.gz',import.meta.url))));
test('SDK reproduces original bank recovery through complete actor timer phases',()=>{
 let frames=0;
 for(const course of fixture.courses)for(const step of course.steps){
  if(step.command.type!=='tick')continue;
  const terms=new Map(step.terms.map(t=>[t.skill,t])),skills=step.terms.map(t=>({def:{id:t.skill,cooldown:t.cooldown}})),banks=new Map(structuredClone(step.before.banks));
  const runtime=new Ammunition(banks,{spec:i=>terms.get(i.def.id).spec,skills:()=>skills,capacityBonus:i=>terms.get(i.def.id).cap-(terms.get(i.def.id).spec?.max??0),chargeRate:i=>terms.get(i.def.id).rate,cooldownRecovery:i=>terms.get(i.def.id).recovery,still:()=>step.terms[0].still,cooling:i=>step.afterTimer.clocks.some(([id])=>id===i.def.id)});
  runtime.advance(step.command.dt);assert.deepEqual([...banks],step.afterTimer.banks,course.name);frames++;
 }
 assert.equal(frames,108);console.log('Compared '+frames+' whole actor timer phases.');
});
function rig(spec={max:3,recharge:2}){
 const inst={def:{id:'bank',cooldown:2}},banks=new Map(),ports={spec:()=>spec,skills:()=>[inst],capacityBonus:()=>ports.bonus??0,chargeRate:()=>1,cooldownRecovery:()=>1,stationary:true,still:()=>ports.stationary,cooling:()=>false};
 return {inst,banks,ports,runtime:new Ammunition(banks,ports)};
}
test('last-round stamp observes payment before reload flag and rest-clock reset',()=>{
 const {inst,runtime}=rig({max:1,magazine:true}),bank=runtime.bank(inst);bank.timer=1.5;const observations=[];
 const result=commitAmmunitionPress(null,inst,{max:1,magazine:true},{bank:()=>bank,spend:()=>runtime.spendOne(inst),finalRoundDamage:()=>2,stampCooldown:()=>observations.push({...bank})});
 assert.deepEqual(observations,[{count:0,timer:1.5}]);assert.deepEqual(bank,{count:0,timer:0,reloading:true});assert.deepEqual(result,{bankSteps:undefined,roundMult:2,ventRounds:undefined});
});
test('empower, vent and repeated delivery quote preserve distinct bank economies',()=>{
 for(const spec of [{max:3,empower:.5},{max:3,ventAll:true},{max:3,stepsFromBank:true}]){
  const {inst,runtime}=rig(spec),bank=runtime.bank(inst),ports={bank:()=>bank,spend:()=>runtime.spendOne(inst),finalRoundDamage:()=>3,stampCooldown:()=>assert.fail('Not a magazine')};
  const result=commitAmmunitionPress(null,inst,spec,ports);
  assert.equal(bank.count,spec.ventAll?0:2);assert.equal(result.bankSteps,spec.stepsFromBank?3:undefined);assert.equal(result.ventRounds,spec.ventAll?3:undefined);assert.equal(result.roundMult,spec.empower?1.5:1);
  bank.count=0;assert.equal(useChargeReady(spec,0),!!(spec.ventAll||spec.empower!==undefined));
  if(spec.empower!==undefined||spec.ventAll)assert.equal(commitAmmunitionPress(null,inst,spec,ports).roundMult,1);
 }
});
test('active reload keeps partial rest time and does not mutate an over-cap or full bank',()=>{
 const {inst,runtime}=rig(),bank=runtime.bank(inst);Object.assign(bank,{count:0,timer:1.5,reloading:true});
 assert.equal(runtime.restore(inst,1),1);assert.deepEqual(bank,{count:1,timer:1.5,reloading:false});runtime.advance(.5);assert.equal(bank.count,2);
 Object.assign(bank,{count:4,reloading:true});const before={...bank};assert.equal(runtime.restore(inst),0);assert.deepEqual(bank,before);
});
test('one recovery per update carries time; moving bleed retains fractional remainder',()=>{
 const {inst,runtime,ports}=rig(),bank=runtime.bank(inst);bank.count=0;runtime.advance(10);assert.deepEqual(bank,{count:1,timer:8});runtime.advance(0);assert.deepEqual(bank,{count:2,timer:6});runtime.advance(0);assert.deepEqual(bank,{count:3,timer:0});
 ports.spec().still={bleed:.5};ports.stationary=false;bank.timer=.5;runtime.advance(1);assert.deepEqual(bank,{count:2,timer:1.5});
});

test('lazy optional fuel, fixed ports and independent bank ownership are explicit', () => {
  const spec = {max: 3, empower: .5};
  assert.equal(requiresUseCharge(spec), false);
  assert.equal(requiresUseCharge({...spec, empower: undefined}), true);
  const first = rig(spec), second = rig(spec);
  assert.equal(first.banks.size, 0);
  first.runtime.spendOne(first.inst);
  assert.equal(first.runtime.bank(first.inst).count, 2);
  assert.equal(second.banks.size, 0);
  first.ports.spec = () => ({max: 99});
  assert.equal(first.runtime.capacity(first.inst), 3, 'Bindings retain the original callback');
  spec.max = 5;
  assert.equal(first.runtime.capacity(first.inst), 5, 'The callback still observes live data');
  first.ports.bonus = .5;
  assert.equal(first.runtime.capacity(first.inst), 6);
  first.ports.bonus = -100;
  assert.equal(first.runtime.capacity(first.inst), 1);
  const plain = commitAmmunitionPress(null, first.inst, undefined, null);
  assert(Object.isFrozen(plain));
  assert.equal(plain, commitAmmunitionPress(null, second.inst, undefined, null));
});

test('invalid inputs reject before public writes and fractional legacy banks remain representable', () => {
  const {inst, runtime, banks} = rig();
  assert.throws(() => runtime.advance(-1), /nonnegative/);
  assert.throws(() => runtime.advance(Infinity), /finite/);
  assert.throws(() => runtime.restore(inst, NaN), /finite/);
  assert.equal(banks.size, 0);
  assert.throws(() => new Ammunition({}, {}), /map/);
  assert.throws(() => new Ammunition(new Map(), {}), /port/);
  for (const spec of [null, {max: NaN}, {max: 2, recharge: -1}, {max: 2, magazine: false}, {max: 2, still: {bleed: Infinity}}]) {
    assert.throws(() => requiresUseCharge(spec));
  }
  const bank = runtime.bank(inst);
  bank.count = -.5;
  assert.equal(runtime.restore(inst, 1), 1);
  assert.equal(bank.count, .5);
  runtime.spendOne(inst);
  assert.equal(bank.count, 0);
  bank.timer = NaN;
  assert.throws(() => runtime.advance(1), /finite/);
});

test('read reentry and excessive bleed fail without leaving the binding locked', () => {
  const inst = {def: {id: 'bank', cooldown: 2}};
  let reenter = true, runtime;
  const ports = {spec: () => ({max: 100_000, recharge: 1, still: {bleed: 1}}), skills: () => [inst],
    capacityBonus: () => { if (reenter) runtime.bank(inst); return 0; },
    chargeRate: () => 1, cooldownRecovery: () => 1, still: () => false, cooling: () => false};
  runtime = new Ammunition(new Map(), ports);
  assert.throws(() => runtime.bank(inst), /Reentrant/);
  assert.equal(runtime.banks.size, 0);
  reenter = false;
  const bank = runtime.bank(inst), before = {...bank};
  assert.throws(() => runtime.advance(100_000), /operation limit/);
  assert.deepEqual(bank, before, 'The excessive bleed phase did not commit');
  runtime.advance(1);
  assert.equal(bank.count, 99_999);
});

test('ordered updates retain earlier commits when a later host observation fails', () => {
  const skills = [{def: {id: 'first', cooldown: 0}}, {def: {id: 'second', cooldown: 0}}];
  const banks = new Map(skills.map(s => [s.def.id, {count: 0, timer: 0}]));
  let invalid = true;
  const runtime = new Ammunition(banks, {spec: () => ({max: 3, recharge: 2}), skills: () => skills,
    capacityBonus: () => 0, chargeRate: inst => invalid && inst === skills[1] ? NaN : 1,
    cooldownRecovery: () => 1, still: () => true, cooling: () => false});
  assert.throws(() => runtime.advance(2), /finite/);
  assert.equal(banks.get('first').count, 1);
  assert.equal(banks.get('second').count, 0);
  invalid = false;
  runtime.advance(0);
  const bank = banks.get('first');
  bank.timer = .5;
  skills[0].def.cooldown = 2;
  assert.throws(() => commitAmmunitionPress(null, skills[0], {max: 3, magazine: true}, {
    bank: () => bank, spend: () => runtime.spendOne(skills[0]), finalRoundDamage: () => 2,
    stampCooldown: () => { throw new Error('Host sink failed'); },
  }), /Host sink failed/);
  assert.deepEqual(bank, {count: 0, timer: .5}, 'A thrown clock sink does not roll back spent ammunition');
});
