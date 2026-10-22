import test from 'node:test';
import assert from 'node:assert/strict';
import {SkillAdmission} from '../dist/skill-admission.js';
import {chargeCostReady} from '../dist/charge-runtime.js';

function actor() {
  return {dead:false,useLock:0,reflexLock:0,statuses:[],skillRecoveryLocks:new Set(),cooldowns:new Map(),
    activeAuras:new Map(),summonToggles:new Map(),strobes:new Map(),overdrive:{},runes:[],charges:new Map(),
    pools:new Map(),venting:new Set(),brims:new Map(),buffs:new Map(),primedPours:[],recentHurt:0,
    life:100,mana:80,es:40,ward:20,reservedMana:0,manaReserved:0,banks:new Map()};
}
function skill(extra={}) { return {def:{id:'press',useTime:0,delivery:{type:'self'},effects:[],...extra},gates:[]}; }
function ports(extra={}) { return {
  replenishing:i=>!!i.replenishing,stunned:a=>!!a.stunned,statusForbids:()=>undefined,contextTags:i=>i.tags??new Set(),
  castMode:i=>i.mode??'cast',useTime:(_a,i)=>i.def.useTime,reflexStat:()=>0,reflexDuring:()=>({}),
  guardCast:i=>!!i.guardCast,gather:i=>i.gather,requiresUseCharge:i=>!!i.ammunition,
  useChargeBank:(a,i)=>{if(!a.banks.has(i.def.id))a.banks.set(i.def.id,{count:2});return a.banks.get(i.def.id);},
  cost:()=>({mana:0,life:0}),canAfford:(a,c)=>a.mana>=c.mana&&a.life>=c.life,gates:i=>i.gates,
  gaugeRefusal:()=>null,thirstless:()=>0,primeCapacity:()=>0,chargeCost:i=>i.chargeCost,chargeCostReady,
  delivery:i=>i.resolved??i.def.delivery,summonSlots:()=>1,summonReservation:()=>10,
  maxLife:()=>100,maxMana:()=>100,availableMana:()=>80,maxShield:()=>40,...extra}; }

test('admission preserves lazy bank creation and stops before later observations',()=>{
  const a=actor(),i=skill(),log=[];i.ammunition=true;
  const original=ports(),p=new SkillAdmission({...original,
    useChargeBank:(a,i)=>{log.push('bank');return original.useChargeBank(a,i);},
    cost:()=>{log.push('cost');return {mana:81,life:0};},gates:()=>{throw Error('late gate read');}});
  a.useLock=1;assert.equal(p.canUse(a,i),false);assert.equal(a.banks.size,0);
  a.useLock=0;a.cooldowns.set(i.def.id,1);assert.equal(p.canUse(a,i),false);assert.equal(a.banks.size,0);
  a.cooldowns.clear();assert.equal(p.canUse(a,i),false);assert.deepEqual(log,['bank','cost']);assert.equal(a.banks.size,1);
  log.length=0;a.banks.get(i.def.id).count=0;assert.equal(p.canUse(a,i),false);assert.deepEqual(log,['bank']);
  a.banks.get(i.def.id).count=.001;assert.equal(p.canUse(a,i),false);assert.deepEqual(log,['bank','bank','cost']);
});

test('active off-switches precede ammunition and prices but retain debt, life and body locks',()=>{
  const a=actor(),i=skill({delivery:{type:'aura',mode:'toggle',overdrive:{lane:'mana'},lockAboveLife:.5}});
  a.activeAuras.set(i.def.id,{});a.life=50;
  const p=new SkillAdmission(ports({requiresUseCharge:()=>{throw Error('late ammunition');}}));
  assert.equal(p.canUse(a,i),true);a.overdrive.mana={debt:.001};assert.equal(p.canUse(a,i),false);
  a.overdrive.mana.debt=0;a.life=50.001;assert.equal(p.canUse(a,i),false);a.life=50;
  a.skillRecoveryLocks.add(i.def.id);assert.equal(p.canUse(a,i),false);a.skillRecoveryLocks.clear();
  i.def.delivery={type:'summon',persistent:{toggle:true}};a.summonToggles.set(i.def.id,{inst:i,reserved:1000});assert.equal(p.canUse(a,i),true);
  i.def.delivery={type:'ground',strobe:{}};a.strobes.set(i.def.id,{});assert.equal(p.canUse(a,i),true);
  a.dead=true;assert.equal(p.canUse(a,i),false);
});

test('first authored refusal keeps identity and gauge notes precede gate reads',()=>{
  const a=actor(),i=skill(),first={charge:{id:'spark',amount:2},note:'charge'},second={buff:'ready'};
  i.gates=[first,second];const p=new SkillAdmission(ports());
  assert.equal(p.unmetGate(a,i),first);a.charges.set('spark',2);assert.equal(p.unmetGate(a,i),second);
  a.buffs.set('ready',{});assert.equal(p.unmetGate(a,i),null);
  i.def.gauge={};const q=new SkillAdmission(ports({gaugeRefusal:()=>'',gates:()=>{throw Error('late gate');}}));
  assert.deepEqual(q.unmetGate(a,i),{note:''});assert.notEqual(q.unmetGate(a,i),q.unmetGate(a,i));
});

test('gate thresholds are inclusive and each authored predicate retains its position',()=>{
  const a=actor(),i=skill(),g={charge:{id:'c',amount:1},buff:'b',holding:true,resource:{kind:'ward',amount:20},guard:true,active:'a',recentDamage:{within:2}};
  i.gates=[g];const p=new SkillAdmission(ports());
  for(const advance of [()=>a.charges.set('c',1),()=>a.buffs.set('b',{}),()=>a.gripping={},()=>a.casting={mode:'guard',inst:i},()=>a.activeAuras.set('a',{})]){
    assert.equal(p.unmetGate(a,i),g);advance();
  }
  a.recentHurt=2;assert.equal(p.unmetGate(a,i),null);a.recentHurt=2.001;assert.equal(p.unmetGate(a,i),g);
  a.recentHurt=0;a.ward=19.999;assert.equal(p.unmetGate(a,i),g);
});

test('missing-resource arithmetic uses raw life, available mana and life-or-mana any',()=>{
  const a=actor(),i=skill(),g={missing:{kind:'any',amount:2,pct:.1}};i.gates=[g];const p=new SkillAdmission(ports());
  a.es=0;assert.equal(p.unmetGate(a,i),g);
  a.life=90;assert.equal(p.unmetGate(a,i),null);a.life=90.001;assert.equal(p.unmetGate(a,i),g);
  a.mana=72;assert.equal(p.unmetGate(a,i),null);a.mana=72.001;assert.equal(p.unmetGate(a,i),g);
  g.missing.kind='es';a.es=36;assert.equal(p.unmetGate(a,i),null);a.es=36.001;assert.equal(p.unmetGate(a,i),g);
  const waived=new SkillAdmission(ports({thirstless:()=>1,maxShield:()=>{throw Error('waived read');}}));assert.equal(waived.unmetGate(a,i),null);
});

test('priming requires actual full relevant pools, instant restoration and floored spare capacity',()=>{
  const a=actor(),i=skill({effects:[{type:'restoreOverTime'}]}),g={missing:{kind:'any',pct:.2}};i.gates=[g];
  let capacity=1.9;const p=new SkillAdmission(ports({primeCapacity:()=>capacity}));
  a.life=99.01;a.mana=79.01;assert.equal(p.primedPourOpen(a,i),true);assert.equal(p.unmetGate(a,i),null);
  a.life=99;assert.equal(p.primedPourOpen(a,i),false);assert.equal(p.unmetGate(a,i),g);
  a.life=100;a.primedPours.push({});assert.equal(p.primedPourOpen(a,i),false);capacity=2;assert.equal(p.primedPourOpen(a,i),true);
  i.def.useTime=.001;assert.equal(p.primedPourOpen(a,i),true);i.def.useTime=.00101;assert.equal(p.primedPourOpen(a,i),false);
  i.def.useTime=0;i.def.effects=[];assert.equal(p.primedPourOpen(a,i),false);
});

test('held combinations and reflexes observe different body restrictions and live policy',()=>{
  const a=actor(),i=skill({usableWhileGuarding:true}),during={},p=new SkillAdmission(ports({reflexDuring:()=>during}));
  for(const mode of ['guard','channel','charge','overcharge']){a.casting={mode,inst:i};assert.equal(p.canUse(a,i),true);}
  a.casting.mode='cast';assert.equal(p.canUse(a,i),false);i.def.reflex=true;assert.equal(p.canUse(a,i),true);
  during.cast=false;assert.equal(p.canUse(a,i),false);delete during.cast;
  a.stunned=true;assert.equal(p.canUse(a,i),false);during.stun=true;assert.equal(p.canUse(a,i),true);
  a.reflexLock=.1;assert.equal(p.canUse(a,i),false);a.reflexLock=0;a.stunned=false;
  i.def.channel={};assert.equal(p.isReflex(a,i),false);delete i.def.channel;
  i.def.concentration={};assert.equal(p.isReflex(a,i),false);delete i.def.concentration;
  a.dead=true;assert.equal(p.canUse(a,i),false);
});

test('gather cooldown release requires native cast shape and never bypasses recovery lock',()=>{
  const a=actor(),i=skill({useTime:.3});i.gather={releaseOnCooldown:true};a.cooldowns.set(i.def.id,1);a.brims.set(i.def.id,{fill:.15});
  const p=new SkillAdmission(ports());assert.equal(p.canUse(a,i),true);
  a.skillRecoveryLocks.add(i.def.id);assert.equal(p.canUse(a,i),false);a.skillRecoveryLocks.clear();
  i.def.useTime=.299;assert.equal(p.canUse(a,i),false);i.def.useTime=.3;i.def.concentration={};assert.equal(p.canUse(a,i),false);
  delete i.def.concentration;a.brims.get(i.def.id).fill=.1499;assert.equal(p.canUse(a,i),false);
});

test('reserve fuel, invocation, charge costs and pool venting retain inclusive floors',()=>{
  const a=actor(),i=skill({invokes:{},pool:{id:'pool',min:2}});i.chargeCost={charge:'c',amount:'all',minimum:2};
  a.reserves=new Map([['fuel',{cur:3,ventUntil:0}]]);a.reserveSpecs=[{id:'fuel',perCast:4,costs:{press:3}}];
  const p=new SkillAdmission(ports());assert.equal(p.canUse(a,i),false);a.runes.push({});assert.equal(p.canUse(a,i),false);
  a.charges.set('c',2);assert.equal(p.canUse(a,i),false);a.venting.add('pool');assert.equal(p.canUse(a,i),true);
  a.reserves.get('fuel').ventUntil=.001;assert.equal(p.canUse(a,i),false);a.reserves.get('fuel').ventUntil=0;
  a.charges.clear();i.chargeCost.optional=true;assert.equal(p.canUse(a,i),true);
  i.chargeCost={charge:'c',amount:2,minimum:3};a.charges.set('c',2.999);assert.equal(p.canUse(a,i),false);
  a.charges.set('c',3);assert.equal(p.canUse(a,i),true);
});

test('resolved summon slots and exclusive rivals free only their actual reservation',()=>{
  const a=actor(),i=skill(),rival=skill({id:'rival',delivery:{type:'summon',exclusiveGroup:'g'}});
  i.resolved={type:'summon',persistent:{toggle:true},exclusiveGroup:'g'};a.reservedMana=90;
  a.summonToggles.set('rival',{inst:rival,reserved:30});
  let slots=2;const p=new SkillAdmission(ports({summonSlots:()=>slots,summonReservation:()=>20}));
  assert.equal(p.canUse(a,i),true);a.summonToggles.get('rival').reserved=29.999;assert.equal(p.canUse(a,i),false);
  a.manaReserved=1;assert.equal(p.canUse(a,i),true);slots=0;assert.equal(p.canUse(a,i),false);
  i.resolved.persistent.toggle=false;assert.equal(p.canUse(a,i),true);
});

test('existing charge-cost validation remains at its original nonoptional admission point',()=>{
  const a=actor(),i=skill(),p=new SkillAdmission(ports());i.chargeCost={charge:'c',amount:-1};
  assert.throws(()=>p.canUse(a,i),/charge cost/);i.chargeCost.optional=true;assert.equal(p.canUse(a,i),true);
  i.chargeCost.optional=false;a.useLock=1;assert.equal(p.canUse(a,i),false);
});

test('status contexts are lazy, ordered and independent from reflex stat context',()=>{
  const a=actor(),i=skill(),seen=[];a.statuses=[{id:'unknown'},{id:'silence'},{id:'later'}];
  const p=new SkillAdmission(ports({statusForbids:id=>{seen.push(id);return id==='silence'?['attack','spell']:undefined;},
    contextTags:()=>{seen.push('tags');return new Set(['spell']);},reflexStat:()=>{throw Error('unrelated reflex');}}));
  assert.equal(p.canUse(a,i),false);assert.deepEqual(seen,['unknown','silence','tags','tags']);
});

test('policies snapshot ports, retain no actor scratch and do not roll back lazy mutation on error',()=>{
  const a=actor(),b=actor(),i=skill(),original=ports();i.ammunition=true;let p,nesting=false;
  p=new SkillAdmission({...original,cost:(who,inst)=>{if(!nesting){nesting=true;assert.equal(p.canUse(b,inst),true);nesting=false;}return {mana:who===a?81:0,life:0};}});
  assert.equal(p.canUse(a,i),false);assert.notEqual(a.banks.get(i.def.id),b.banks.get(i.def.id));
  const snapshot=ports(),q=new SkillAdmission(snapshot);snapshot.replenishing=()=>true;assert.equal(q.canUse(b,i),true);
  const c=actor(),error=new Error('price unavailable'),r=new SkillAdmission(ports({cost:()=>{throw error;}}));
  assert.throws(()=>r.canUse(c,i),e=>e===error);assert.equal(c.banks.size,1);
});
