import test from 'node:test';
import assert from 'node:assert/strict';
import {CastResourceEffects} from '../dist/cast-resource-effects.js';

function setup() {
  const host={def:{id:'bank',useCharges:{max:4}}},still={def:{id:'still',useCharges:{max:3,still:{bleed:1}}}},press={def:{id:'press'},hostSkillId:'bank'};
  const banks=new Map([[host,{count:1,timer:.7,reloading:true}],[still,{count:0,timer:.3,reloading:true}]]),events=[];
  const actor={skills:[press,host,still],cooldowns:new Map([['press',8],['bank',5],['still',2]]),
    totals:new Map([['press',8],['bank',5],['still',2]]),activeAuras:new Map([['bank',{ledger:{balance:10}}]]),
    casting:{inst:press,mode:'channel',held:true},
    skillChargeBank:skill=>banks.get(skill),skillChargeCap:skill=>skill.def.useCharges.max,
    gainCharge(...args){events.push(['gain',...args]);},startChargeDrain(...args){events.push(['drain',...args]);}};
  const ports={useCharges:skill=>skill.def.useCharges,
    refundCooldown(a,id){a.cooldowns.delete(id);a.totals.delete(id);events.push(['refund',id]);},
    ammunitionCue(a,skill){events.push(['ammo',skill.def.id,banks.get(skill).count]);},
    ledgerPaid(a,amount){events.push(['paid',amount,a.activeAuras.get('bank').ledger.balance]);},
    ledgerEmpty(a,id){events.push(['empty',id]);},cooldownsReduced(){events.push(['reduced']);}};
  return {host,still,press,banks,actor,ports,events,runtime:new CastResourceEffects(ports)};
}

test('host refill keeps identities, clears reload, refunds both clocks and releases a full channel',()=>{
  const s=setup(),cast=s.actor.casting,bank=s.banks.get(s.host);
  s.runtime.apply(s.actor,s.press,{type:'restoreSkillCharges'});
  assert.equal(s.actor.casting,cast);assert.equal(s.banks.get(s.host),bank);
  assert.deepEqual(bank,{count:4,timer:.7,reloading:false});assert.equal(cast.held,false);
  assert.equal(s.actor.totals.has('bank'),false);assert.equal(s.actor.cooldowns.has('bank'),false);
  assert.deepEqual(s.events,[['refund','bank'],['ammo','bank',4]]);
});
test('partial refill keeps the channel held; full-bank refusal refunds the press',()=>{
  const s=setup();s.runtime.apply(s.actor,s.press,{type:'restoreSkillCharges',amount:1});
  assert.equal(s.actor.casting.held,true);assert.equal(s.banks.get(s.host).count,2);
  s.banks.get(s.host).count=4;s.events.length=0;
  s.runtime.apply(s.actor,s.press,{type:'restoreSkillCharges',amount:1});
  assert.deepEqual(s.events,[['refund','press']]);assert.equal(s.actor.totals.has('press'),false);
});
test('still scope skips other banks and ammunition cues, and does not stop a host channel',()=>{
  const s=setup();s.runtime.apply(s.actor,s.press,{type:'restoreSkillCharges',scope:'still'});
  assert.equal(s.banks.get(s.host).count,1);assert.equal(s.banks.get(s.still).count,3);
  assert.equal(s.actor.casting.held,true);assert.deepEqual(s.events,[['refund','still']]);
});
test('all scope preserves bar order and repeated references rather than deduplicating skills',()=>{
  const s=setup();s.actor.skills=[s.host,null,s.host,s.still];
  s.runtime.apply(s.actor,s.press,{type:'restoreSkillCharges',scope:'all',amount:1});
  assert.equal(s.banks.get(s.host).count,3);assert.equal(s.banks.get(s.still).count,1);
  assert.deepEqual(s.events.map(e=>e.slice(0,2)),[['refund','bank'],['ammo','bank'],['refund','bank'],['ammo','bank'],['refund','still'],['ammo','still']]);
});
test('host lookup takes precedence over an own bank and does not fallback from an unbanked host',()=>{
  const s=setup();s.press.def.useCharges={max:2};s.banks.set(s.press,{count:0,timer:0});
  delete s.host.def.useCharges;s.runtime.apply(s.actor,s.press,{type:'restoreSkillCharges'});
  assert.equal(s.banks.get(s.press).count,0);assert.deepEqual(s.events,[]);
  s.actor.skills=[s.press];s.runtime.apply(s.actor,s.press,{type:'restoreSkillCharges'});
  assert.equal(s.banks.get(s.press).count,2);
});
test('refill callbacks observe writes and a throwing callback preserves only the completed prefix',()=>{
  const s=setup();s.ports.refundCooldown=(actor,id)=>{
    assert.equal(id,'bank');assert.deepEqual(s.banks.get(s.host),{count:2,timer:.7,reloading:false});throw Error('host callback');
  };
  assert.throws(()=>s.runtime.apply(s.actor,s.press,{type:'restoreSkillCharges',scope:'all',amount:1}),/host callback/);
  assert.equal(s.banks.get(s.host).count,2);assert.equal(s.banks.get(s.still).count,0);assert.deepEqual(s.events,[]);
});
test('ledger repayment reads the owning aura and applies the flat-plus-current-fraction formula',()=>{
  const s=setup();s.runtime.apply(s.actor,s.press,{type:'payLedger',flat:2,pct:.25});
  assert.deepEqual(s.events,[['paid',4.5,5.5]]);
  s.runtime.apply(s.actor,s.press,{type:'payLedger',flat:100});assert.equal(s.actor.activeAuras.get('bank').ledger.balance,0);
  s.runtime.apply(s.actor,s.press,{type:'payLedger',pct:1});assert.deepEqual(s.events.at(-1),['empty','press']);
});
test('ledger threshold is strict, and zero payment still produces the original success signal',()=>{
  const s=setup(),ledger=s.actor.activeAuras.get('bank').ledger;ledger.balance=.5;
  s.runtime.apply(s.actor,s.press,{type:'payLedger',pct:1});assert.equal(ledger.balance,.5);assert.deepEqual(s.events,[['empty','press']]);
  ledger.balance=.50001;s.runtime.apply(s.actor,s.press,{type:'payLedger'});
  assert.deepEqual(s.events.at(-1),['paid',0,.50001]);
});
test('skill cooldown reduction excludes self, snapshots values, and preserves total-clock metadata',()=>{
  const s=setup();s.runtime.apply(s.actor,s.press,{type:'reduceCooldowns',seconds:1,fraction:.5});
  assert.deepEqual([...s.actor.cooldowns],[['press',8],['bank',1.5]]);
  assert.deepEqual([...s.actor.totals],[['press',8],['bank',5],['still',2]]);assert.deepEqual(s.events,[['reduced']]);
});
test('zero cooldown reduction is observably different from a zero proc reduction',()=>{
  const s=setup();s.runtime.apply(s.actor,s.press,{type:'reduceCooldowns'});assert.deepEqual(s.events,[['reduced']]);
  s.actor.cooldowns=new Map([['press',8]]);s.events.length=0;
  s.runtime.apply(s.actor,s.press,{type:'reduceCooldowns',seconds:100});assert.deepEqual(s.events,[]);assert.equal(s.actor.cooldowns.get('press'),8);
});
test('cooldown callbacks cannot cause newly added entries to join the in-flight reduction',()=>{
  const s=setup(),store=s.actor.cooldowns;
  s.actor.cooldowns={*[Symbol.iterator](){yield*store;},set(id,value){store.set(id,value);store.set('new',10);return this;},delete(id){return store.delete(id);}};
  s.runtime.apply(s.actor,s.press,{type:'reduceCooldowns',seconds:1});assert.equal(store.get('new'),10);assert.equal(store.get('still'),1);
});
test('charge gain and drain retain authored values, call order and the live skill identity',()=>{
  const s=setup();s.runtime.apply(s.actor,s.press,{type:'gainCharge',charge:'fury',amount:1.5,max:6});
  s.runtime.apply(s.actor,s.press,{type:'drainCharge',charge:'fury',perSec:.25});
  assert.deepEqual(s.events,[['gain','fury',1.5,6,s.press],['drain','fury',.25]]);
});
