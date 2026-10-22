import test from 'node:test';
import assert from 'node:assert/strict';
import {SkillDispatch} from '../dist/skill-dispatch.js';

function skill(id = 'host', def = {}) {
  return {def: {id, tags: [], delivery: {type: 'projectile'}, effects: [],
    cooldown: 0, useTime: .6, color: 'gold', ...def}, sockets: []};
}
function fixture(custom) {
  const inst = skill(), aim = {x: 1, y: 2, z: 3}, facing = {yaw: 0, pitch: 1};
  const actor = {skills: [inst], statuses: [], activeAuras: new Map(), summonToggles: new Map(),
    strobes: new Map(), hexToggles: new Map(), cooldowns: new Map(), cooldownTotals: new Map(),
    reservedMana: 0, useLock: 0, reflexLock: 0, casting: null, facing, mana: 100, life: 100};
  const state = {time: 10, mode: 'cast', speed: 1, castTime: .6, cost: {mana: 5, life: 0},
    cursor: {}, latch: false, target: null, zones: [], rolls: [], status: {}, stats: {},
    tags: new Set(['spell']), mods: [], charge: {mult: 2, consumed: 3}, gauge: 1,
    preflight: 'continue'};
  const events = [], reads = [], copies = [], deliveries = [];
  let policy;
  const ports = {
    preflight: (a, i, point, seat) => { events.push(['preflight', i, seat]); return state.preflight; },
    time: () => state.time,
    failNote: (a, key, text) => events.push(['refused', key, text]),
    canAct: a => !a.casting && a.useLock <= 0,
    canUse: (a, i) => { events.push(['can-use', i]); return i.usable !== false; },
    comboCursor: () => state.cursor,
    definition: id => state.step?.def.id === id ? state.step.def : undefined,
    comboStep: () => state.step,
    dispatch: (a, i, point, seat) => { events.push(['redirect', i, seat]); return policy.request(a, i, point, seat); },
    copyAim: point => { const copy = {...point}; copies.push(copy); return copy; },
    facingTo: () => ({yaw: 2, pitch: 3}),
    status: id => state.status[id],
    random: () => { assert(state.rolls.length, 'unexpected random draw'); const r=state.rolls.shift(); events.push(['random',r]); return r; },
    applyStatus: (a, ...args) => events.push(['status', ...args]),
    scrambleLatch: () => state.latch,
    setScrambleLatch: value => { events.push(['latch',value]); state.latch=value; },
    trigger: i => i.trigger,
    feedback: (a, ...args) => events.push(['feedback', ...args]),
    deactivateAura: (a, id) => { events.push(['aura-off', id]); a.activeAuras.delete(id); },
    dismissSummon: (a, id) => { events.push(['summon-off', id]); a.summonToggles.delete(id); },
    maxMana: () => 100,
    cost: () => { events.push(['cost']); return state.cost; },
    pay: (a, i, cost) => { events.push(['pay', i, cost]); a.mana-=cost.mana; a.life-=cost.life; },
    curseOnHit: () => state.hex,
    curseField: () => state.curse,
    zones: () => state.zones,
    expireZone: zone => events.push(['expire', zone]),
    castMode: () => state.mode,
    tags: () => { reads.push('tags'); return state.tags; },
    modifiers: () => { reads.push('mods'); return state.mods; },
    stat: (a, key, tags, mods, base) => { reads.push([key,tags,mods]); return state.stats[key] ?? base ?? (key==='effectDuration' ? 1 : 0); },
    useTime: () => state.castTime,
    targeting: () => state.targetSpec,
    resolveTarget: () => { events.push(['target']); return state.target; },
    lightweightCount: () => state.lightweight ?? 0,
    promoteTarget: (a, point, radius, max) => { events.push(['promote', point, radius, max]); state.target=state.promoted; return state.promoted ? [state.promoted] : []; },
    useCharges: () => undefined,
    ammunition: () => ({
      bank: () => { throw new Error('unexpected ammunition bank'); },
      spend: () => { throw new Error('unexpected ammunition spend'); },
      finalRoundDamage: () => { throw new Error('unexpected ammunition damage'); },
      stampCooldown: () => { throw new Error('unexpected ammunition clock'); },
    }),
    channel: () => state.channel,
    gather: () => state.gather,
    speed: () => { reads.push('speed'); return state.speed; },
    consumeCharges: () => { events.push(['charges']); return state.charge; },
    spendGauge: () => { events.push(['gauge']); return state.gauge; },
    stampCooldown: (a, i, duration) => events.push(['cooldown',duration]),
    opening: (a, i, point, mult) => events.push(['opening',mult]),
    quarry: target => target.actor,
    guardCapacity: () => 20,
    refreshGuard: (a, cast) => { assert.equal(a.casting,cast); events.push(['refresh-guard']); cast.bashAt=.4; },
    guardRaised: (a, i) => { assert.equal(a.casting.inst,i); events.push(['guard-raised']); },
    shellGraft: () => state.shell,
    overcharge: () => state.overcharge,
    strikeTiming: () => { reads.push('timing'); return state.timing; },
    assaultLock: () => events.push(['assault-lock']),
    primedPourOpen: a => { events.push(['prime',a.life]); return a.life===100; },
    execute: (a, i, point, payload) => { events.push(['execute']); deliveries.push({actor:a, inst:i, aim:point, payload}); },
    isReflex: (a,i) => !!i.def.reflex,
    reflexRecovery: () => .07,
  };
  Object.assign(ports, custom({actor,inst,aim,state,events,reads,ports}) ?? {});
  policy = new SkillDispatch(ports);
  return {actor,inst,aim,state,events,reads,copies,deliveries,ports,policy,
    run: (seat = true) => policy.request(actor,inst,aim,seat)};
}
// An empty customization is a function so a test can change state before binding.
const empty = () => ({});
function setup(custom = empty) { return fixture(custom); }
function reserves(f, costs = [{id:'fuel',perCast:3}], balances = [10]) {
  f.actor.reserveSpecs=costs;
  f.actor.reserves=new Map(costs.map((s,i)=>[s.id,{cur:balances[i],ventUntil:0,lastSpendAt:-1}]));
}
const names = f => f.events.map(e=>e[0]);

test('bindings are captured without gameplay reads; original 3D aim and state identities survive', () => {
  const f=setup(); assert.deepEqual(f.events,[]); assert.deepEqual(f.reads,[]);
  f.ports.preflight=()=>false;
  assert.equal(f.run(),true);
  assert.equal(f.actor.casting.inst,f.inst);
  assert.deepEqual(f.actor.casting.aim,f.aim); assert.notEqual(f.actor.casting.aim,f.aim);
  assert.notEqual(f.actor.aimPos,f.actor.casting.aim);
  assert.equal(f.actor.casting.baseMult,2); assert.equal(f.actor.casting.chargesSpent,3);
  assert.equal(f.actor.casting.paidCost,f.state.cost);
});
for(const result of [false,true]) test(`terminal preflight ${result} stops every later observation`,()=>{
  const f=setup(); f.state.preflight=result; reserves(f);
  assert.equal(f.run(),result); assert.deepEqual(names(f),['preflight']);
  assert.equal(f.actor.reserves.get('fuel').cur,10); assert.deepEqual(f.copies,[]);
});
test('reserve checks finish before spending; live pricing is read again in the spend pass',()=>{
  const f=setup(); reserves(f,[{id:'a',perCast:3},{id:'b',perCast:4}],[10,2]);
  assert.equal(f.run(),false); assert.equal(f.actor.reserves.get('a').cur,10);
  assert.deepEqual(names(f),['preflight','refused']);
  const g=setup(); let reads=0; reserves(g,[{id:'fuel',get perCast(){return ++reads===1?3:5;}}]);
  assert.equal(g.run(),true); assert.equal(reads,2); assert.equal(g.actor.reserves.get('fuel').cur,5);
  assert.equal(g.actor.reserves.get('fuel').lastSpendAt,10);
});
test('a named zero reserve price overrides the default and World vent equality admits',()=>{
  const f=setup(); reserves(f,[{id:'fuel',perCast:8,costs:{host:0}}],[0]);
  f.actor.reserves.get('fuel').ventUntil=99;
  assert.equal(f.run(),true); assert.equal(f.actor.reserves.get('fuel').lastSpendAt,-1);
  const g=setup(); reserves(g); g.actor.reserves.get('fuel').ventUntil=10;
  assert.equal(g.run(),true); assert.equal(g.actor.reserves.get('fuel').cur,7);
});
test('missing target spends reserves but does not pay ordinary cost or consume combo charges',()=>{
  const f=setup(); reserves(f); f.state.targetSpec={fallback:'refuse'};
  assert.equal(f.run(),false); assert.equal(f.actor.reserves.get('fuel').cur,7);
  assert.equal(f.actor.mana,100); assert(!names(f).includes('charges'));
  assert.deepEqual(f.actor.aimPos,f.aim);
});
test('combo redirect re-enters full admission, spends each price and clears seat press',()=>{
  const f=setup(); reserves(f); f.inst.def.comboChain={skills:['step'],window:2};
  f.state.cursor={comboAt:8,comboIdx:1}; f.state.step=skill('step');
  assert.equal(f.run(),true);
  assert.equal(f.actor.reserves.get('fuel').cur,4);
  assert.equal(f.actor.casting.inst,f.state.step);
  assert.deepEqual(f.events.filter(e=>e[0]==='preflight').map(e=>[e[1].def.id,e[2]]),[['host',true],['step',false]]);
  assert.equal(f.state.cursor.comboIdx,0);
});
test('failed combo redirect keeps its earlier spend and does not advance the cursor',()=>{
  const f=setup(({inst})=>({preflight:(a,i)=>i===inst?'continue':false})); reserves(f);
  f.inst.def.comboChain={skills:['step'],window:2}; f.state.cursor={comboAt:8,comboIdx:1}; f.state.step=skill('step');
  assert.equal(f.run(),false); assert.equal(f.actor.reserves.get('fuel').cur,7);
  assert.deepEqual(f.state.cursor,{comboAt:8,comboIdx:1}); assert.equal(f.actor.aimPos,undefined);
});
test('a repeated combo step retains the instance and commits its next cursor without recursion',()=>{
  const f=setup(); f.inst.def.comboChain={skills:['host','cross'],window:2}; f.state.cursor={comboAt:8,comboIdx:1};
  assert.equal(f.run(),true); assert.equal(f.actor.casting.inst,f.inst);
  assert.equal(f.state.cursor.comboIdx,2); assert.equal(f.state.cursor.comboSelf,undefined);
  assert.equal(names(f).filter(n=>n==='preflight').length,1);
});
test('zero powered fumble still draws; fumble caps chance and preserves earlier reserve spend',()=>{
  const f=setup(); f.inst.def.tags=['spell']; f.actor.statuses=[{id:'fog',power:0}];
  f.state.status.fog={interruptChance:1,label:'Fog',color:'gray'}; f.state.rolls=[0];
  assert.equal(f.run(),true); assert.equal(f.state.rolls.length,0);
  const g=setup(); reserves(g); g.inst.def.tags=['attack']; g.actor.statuses=[{id:'fog',power:100}];
  g.state.status.fog={interruptChance:1,label:'Fog',color:'gray'}; g.state.rolls=[.89];
  assert.equal(g.run(),false); assert.equal(g.actor.mana,100); assert.equal(g.actor.reserves.get('fuel').cur,7);
  assert.deepEqual(g.events.at(-1),['status','stun',0,.75,'Fog']);
});
test('scramble preserves duplicate bar/AI candidates and exact feedback/latch/re-entry order',()=>{
  const f=setup(); f.inst.def.tags=['spell']; f.actor.statuses=[{id:'fog'}];
  f.state.status.fog={scrambleChance:1,label:'Fog',color:'gray'};
  const one=skill('one',{tags:['spell']}), two=skill('two',{tags:['attack']});
  f.actor.skills=[f.inst,one,two]; f.actor.aiActionInsts=new Map([['same',one]]);
  f.state.rolls=[0,.9]; assert.equal(f.run(),true);
  assert.equal(f.actor.casting.inst,one); assert.equal(f.state.latch,false);
  assert.deepEqual(f.events.filter(e=>['feedback','latch','redirect','preflight'].includes(e[0])).map(e=>e[0]),
    ['preflight','feedback','latch','redirect','preflight','latch']);
  assert.equal(f.events.find(e=>e[0]==='redirect')[2],true);
});
test('scramble exceptions restore temporary request state; independent simulations stay isolated',()=>{
  const f=setup(()=>({dispatch:()=>{throw new Error('host failure');}}));
  f.inst.def.tags=['spell']; f.actor.statuses=[{id:'fog'}]; f.state.status.fog={scrambleChance:.8,label:'Fog',color:'gray'};
  f.actor.skills.push(skill('other',{tags:['spell']})); f.state.rolls=[0,0];
  reserves(f);
  assert.throws(()=>f.run(),/host failure/); assert.equal(f.state.latch,false);
  assert.equal(f.actor.reserves.get('fuel').cur,7);
  f.state.rolls=[0,0];assert.throws(()=>f.run(),/host failure/);assert.equal(f.state.latch,false);
  assert.equal(f.actor.reserves.get('fuel').cur,4);
  const other=setup(); assert.equal(other.state.latch,false); assert.equal(other.run(),true);
});
for(const kind of ['aura','summon']) test(`${kind} toggle releases without payment`,()=>{
  const f=setup(); f.inst.def.delivery=kind==='aura'?{type:kind,mode:'toggle'}:{type:kind,persistent:{toggle:true}};
  (kind==='aura'?f.actor.activeAuras:f.actor.summonToggles).set('host',{});
  assert.equal(f.run(),true); assert.equal(f.actor.useLock,.25); assert.equal(f.actor.mana,100);
  assert.equal(f.actor.casting,null); assert(!names(f).includes('cost'));
});
for(const kind of ['strobe','hex']) test(`${kind} ignition reserves once and release is seat-only`,()=>{
  const f=setup(); if(kind==='strobe') f.inst.def.delivery={type:'ground',strobe:{reservePct:.3}}; else f.state.hex={reservePct:.3};
  assert.equal(f.run(),true); assert.equal(f.actor.reservedMana,30); assert.equal(f.actor.mana,95);
  assert.equal(f.run(false),false); assert.equal(f.actor.reservedMana,30);
  assert.equal(f.run(true),true); assert.equal(f.actor.reservedMana,0); assert.equal(f.actor.mana,95);
});
test('following curse expiry precedes live-list removal even if expiry replaces the list',()=>{
  const f=setup(({state,events})=>({expireZone:zone=>{events.push(['expire',zone]); state.zones=[{replacement:true}];}}));
  f.state.curse={mode:'follow'}; const zone={caster:f.actor,inst:f.inst,toggled:true,follow:true}; f.state.zones=[zone];
  assert.equal(f.run(),true); assert.deepEqual(f.state.zones,[]);
  assert.equal(f.events.find(e=>e[0]==='expire')[1],zone); assert.equal(f.actor.mana,100);
});
test('lightweight target promotion re-queries after promotion and preserves target identity',()=>{
  const f=setup(); f.state.targetSpec={}; f.state.lightweight=1; f.inst.def.effects=[{type:'grabSeize'}];
  f.state.promoted={actor:{id:'native-body'}};
  assert.equal(f.run(),true); assert.equal(f.actor.casting.targetInfo,f.state.promoted);
  assert.deepEqual(f.events.filter(e=>['target','promote'].includes(e[0])).map(e=>e[0]),['target','promote','target']);
  assert.deepEqual(f.events.find(e=>e[0]==='promote').slice(2),[90,1]);
});
test('channel starts consume combo charges while deferring mana and gauge payment; aim copies are distinct',()=>{
  const f=setup(); f.state.mode='channel'; f.state.channel={interval:.4,windup:.1}; f.state.speed=2; f.inst.def.gauge={};
  assert.equal(f.run(),true); assert.equal(f.actor.mana,100); assert(!names(f).includes('gauge'));
  assert.equal(f.actor.casting.total,.2); assert.equal(f.actor.casting.pulseTimer,.05);
  assert.equal(f.actor.casting.chargesSpent,3); assert.equal(f.actor.casting.baseMult,2);
  assert.deepEqual(f.actor.casting.lockedAim,f.aim); assert.notEqual(f.actor.casting.lockedAim,f.actor.casting.aim);
});
test('gathered casts retain movement rules and configured duration scaling',()=>{
  const f=setup(); f.state.gather={premium:2,curve:'sqrt'}; assert.equal(f.run(),true);
  assert.equal(f.actor.casting.mode,'channel'); assert.equal(f.actor.casting.gather.move,'slowed');
  assert.equal(f.actor.casting.gather.moveFactor,.5); assert.equal(f.actor.casting.gather.brim.fillTime,1.2);
  assert.equal(f.actor.casting.gather.brim.curve,'sqrt'); assert.equal(f.actor.mana,100);
});
test('concentration without quarry refuses only after ordered payment, charge and opening effects',()=>{
  const f=setup(); f.inst.def.concentration={time:1}; f.inst.def.gauge={}; f.inst.def.cooldown=2; f.inst.def.cooldownAt='press';
  assert.equal(f.run(),false); assert.equal(f.actor.mana,95); assert.equal(f.inst.state.pressAt,10);
  assert.deepEqual(names(f),['preflight','cost','pay','gauge','cooldown','charges','opening','refused']);
});
test('guard state exists before callbacks and graft uses the live guard-strength context',()=>{
  const f=setup(); f.state.mode='guard'; f.inst.def.guard={}; f.state.shell={max:7,shellVisual:'opaque-id'}; f.state.stats.guardStrength=2;
  assert.equal(f.run(),true); assert.equal(f.actor.casting.bashAt,.4); assert.equal(f.actor.casting.shield,20);
  assert.equal(f.actor.shellGuard.max,14); assert.equal(f.actor.shellGuard.shellVisual,'opaque-id');
  assert.deepEqual(names(f).slice(-2),['refresh-guard','guard-raised']);
});
test('overcharge captures context before timing, speed, marker and spark stat observations',()=>{
  const f=setup(({state,reads})=>({strikeTiming:()=>{reads.push('timing'); state.tags=new Set(['changed']); state.mods=['changed']; return {kind:'timed'};}}));
  f.actor.construct=true; const tags=f.state.tags, mods=f.state.mods;
  f.state.overcharge={time:1,stages:3,perStage:.2,window:.3}; f.state.rolls=[.5]; f.state.speed=2;
  assert.equal(f.run(),true);
  assert.deepEqual(f.reads.slice(0,4),['tags','mods','timing','speed']);
  assert.deepEqual(f.reads.at(-1),['sparkWindow',tags,mods]);
  assert.equal(f.actor.casting.mode,'overcharge'); assert.equal(f.actor.casting.sparkWindow,.3);
});
for(const reflex of [true,false]) test(`pierced instant ${reflex?'reflex':'hold combo'} retains running cast, aim and facing`,()=>{
  const f=setup(()=>({execute:a=>{a.facing={changed:true};}}));
  const cast={inst:skill('running'),mode:'guard'}, oldAim={x:9,y:8,z:7}, oldFacing=f.actor.facing;
  f.actor.casting=cast; f.actor.aimPos=oldAim; f.inst.def.reflex=reflex; f.state.castTime=0;
  f.state.overcharge={time:1,stages:2,perStage:1}; f.state.timing={kind:'timed'};
  assert.equal(f.run(),true); assert.equal(f.actor.casting,cast); assert.equal(f.actor.aimPos,oldAim);
  assert.equal(f.actor.facing,oldFacing); assert.equal(f.actor.reflexLock,reflex?.07:0); assert.equal(f.actor.useLock,reflex?0:.12);
});
test('instant primed eligibility reads after payment; the passed aim and cost retain host identity',()=>{
  const f=setup(); f.state.castTime=0; f.state.cost={mana:0,life:1};
  assert.equal(f.run(),true); assert.equal(f.deliveries[0].payload.primed,undefined);
  assert.equal(f.deliveries[0].payload.paidCost,f.state.cost); assert.equal(f.deliveries[0].aim,f.aim);
  assert.deepEqual(f.events.find(e=>e[0]==='prime'),['prime',99]);
  assert(names(f).indexOf('prime')>names(f).indexOf('assault-lock'));
  const full=setup();full.state.castTime=0;assert.equal(full.run(),true);
  assert.equal(full.deliveries[0].payload.primed,true);
});
test('host exceptions propagate without refunding earlier reserves or inventing a cast',()=>{
  const f=setup(()=>({pay:()=>{throw new Error('payment observer failed');}})); reserves(f);
  assert.throws(()=>f.run(),/payment observer failed/);
  assert.equal(f.actor.reserves.get('fuel').cur,7); assert.equal(f.actor.casting,null);
  assert.equal(f.inst.state,undefined); assert(!names(f).includes('charges'));
});

test('ammunition is resolved lazily and last-round payment and cooldown use existing commitment rules',()=>{
  let service;
  const f=setup(({events})=>({
    ammunition:()=>{assert(service,'ammunition read before initialization');return service;},
    useCharges:()=>({max:1,magazine:true}),
    stampCooldown:()=>{throw new Error('Magazine must not stamp a second press cooldown');},
  }));
  const bank={count:1,timer:9};
  service={bank:()=>bank,spend:()=>{bank.count--;},finalRoundDamage:()=>3,
    stampCooldown:(a,i,t)=>{assert.equal(bank.count,0);assert.equal(bank.reloading,undefined);f.events.push(['reload-clock',t]);}};
  f.inst.def.cooldown=2;f.inst.def.cooldownAt='press';
  assert.equal(f.run(),true);assert.deepEqual(bank,{count:0,timer:0,reloading:true});
  assert.equal(f.actor.casting.baseMult,6);assert.deepEqual(f.events.find(e=>e[0]==='reload-clock'),['reload-clock',2]);
});
test('channel persistence pays at press and does not consume the ordinary combo charge bank',()=>{
  const f=setup();f.state.mode='channel';f.state.channel={interval:.4};f.state.stats.channelPersist=1;
  assert.equal(f.run(),true);assert.equal(f.actor.casting.plantChannel,true);
  assert.equal(f.actor.mana,95);assert.equal(f.actor.casting.baseMult,1);assert(!names(f).includes('charges'));
});
test('totem preparation pays once, keeps the host 3D copy and floors placement time',()=>{
  const f=setup();f.state.stats.castAsTotem=1;f.state.stats.totemPlaceTime=2;f.state.castTime=.1;
  assert.equal(f.run(),true);assert.equal(f.actor.casting.plantTotem,true);assert.equal(f.actor.casting.total,.3);
  assert.equal(f.actor.mana,95);assert.deepEqual(f.actor.casting.aim,f.aim);assert(!names(f).includes('target'));
});
for(const mode of ['cast','perfect','timed','multitude','charge','concentration']) test(`${mode} creates the corresponding cast with the expected timing data`,()=>{
  const f=setup();f.state.mode=mode;f.state.castTime=.05;
  if(mode==='charge') {f.inst.def.chargeUp={maxTime:2};f.state.stats.effectDuration=1.5;}
  if(mode==='concentration') {f.inst.def.concentration={time:3};f.state.targetSpec={};f.state.target={actor:{id:'3d-quarry'}};f.state.speed=2;}
  if(mode==='timed') f.state.rolls=[.25];
  assert.equal(f.run(),true);assert.equal(f.actor.casting.mode,mode);
  assert.equal(f.actor.casting.total,mode==='charge'?3:mode==='concentration'?1.5:.2);
  assert.equal(f.actor.casting.indicatorAt,mode==='timed'?.3+.25*(.85-.3):undefined);
  assert.equal(f.actor.casting.presses,mode==='multitude'?1:undefined);
  assert.equal(f.actor.casting.quarryId,mode==='concentration'?'3d-quarry':undefined);
});
test('instant delivery failure retains prior payment and does not invent recovery or restore facing',()=>{
  const changed={yaw:7,pitch:8};const f=setup(()=>({execute:a=>{a.facing=changed;throw new Error('delivery failed');}}));
  f.actor.casting={inst:skill('held'),mode:'guard'};const held=f.actor.casting;f.state.castTime=0;f.inst.def.reflex=true;
  assert.throws(()=>f.run(),/delivery failed/);assert.equal(f.actor.mana,95);assert.equal(f.actor.casting,held);
  assert.equal(f.actor.facing,changed);assert.equal(f.actor.useLock,0);assert.equal(f.actor.reflexLock,0);
});
