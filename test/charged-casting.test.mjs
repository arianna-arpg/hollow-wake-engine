import fs from 'node:fs';import assert from 'node:assert/strict';import test from 'node:test';
import {ChargedCasting,chargeCastDuration,overchargeCastDuration,overchargeMarker} from '../dist/charged-casting.js';
import {gunzipSync} from 'node:zlib';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twenty-four/charged-casting.json.gz',import.meta.url))));
const wire=value=>JSON.parse(JSON.stringify(value));
const releaseKeys=['dmgMult','aoeMult','arcMult','speedMult'];
const options=value=>Object.fromEntries(releaseKeys.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
const cast=value=>value?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,v??null])):null;
test('charged updates match independent original state, payments and releases',()=>{
 let comparisons=0;
 for(const course of fixture.courses)for(const step of course.steps){
  if(!step.beforeCast?.cast||step.terms.stunned)continue;
  const before=step.beforeCast,actor={...structuredClone(before),cast:Object.fromEntries(Object.entries(before.cast).map(([k,v])=>[k,v===null?undefined:v]))};
  const calls=[],draws=[],p={
   active:a=>a.cast,dead:a=>a.dead,chargeSpec:()=>course.charge,overchargeSpec:()=>course.overcharge,
   stageLimit:()=>step.terms.stageBase,timing:()=>course.timing??undefined,sparkBonus:()=>step.terms.sparkBonus,
   cost:()=>structuredClone(step.terms.cost),canAfford:(a,c)=>a.mana>=c.mana&&a.life>c.life,
   pay:(a,s,c)=>{calls.push(wire({kind:'pay',cost:c,before:{mana:a.mana,life:a.life},cast:!!a.cast}));a.mana-=c.mana;a.life-=c.life;},
   random:()=>{const n=step.draws[draws.length];draws.push(n);return n;},
   stageBanked:(a,s)=>calls.push({kind:'trigger',on:'overchargeStage',stage:s.stage}),
   end:(a,s,recovery)=>{assert.equal(a.cast,s);a.cast=null;a.recovery=recovery;},
   execute:(a,s,release)=>calls.push({kind:'execute',options:options(release),cast:!!a.cast,recovery:a.recovery}),cue:()=>{},
  };
  new ChargedCasting(p).advance(actor,step.dt);
  const expected=step.calls.filter(c=>c.kind==='pay'||c.kind==='execute'||(c.kind==='trigger'&&c.on==='overchargeStage')).map(c=>c.kind==='execute'?{...c,options:options(c.options)}:c);
  assert.deepEqual(calls,expected,course.name+'/'+step.command.type+' calls');
  assert.deepEqual(cast(actor.cast),step.after.cast,course.name+' cast');
  assert.equal(actor.recovery,step.after.recovery,course.name+' recovery');
  assert.equal(actor.mana,step.after.mana,course.name+' mana');assert.equal(actor.life,step.after.life,course.name+' life');
  // Delivery may consume additional host RNG. Only stage-marker draws belong to this phase.
  if(before.cast.indicatorAt!==null&&actor.cast?.stage>before.cast.stage)assert.equal(draws.length,1);
  else assert.equal(draws.length,0);
  comparisons++;
 }
 assert.equal(comparisons,69);console.log('Compared '+comparisons+' original charged update transitions.');
});
test('duration laws and marker endpoints are explicit',()=>{
 assert.equal(chargeCastDuration(2,2),4);assert.equal(chargeCastDuration(.01,1),.2);
 assert.equal(overchargeCastDuration(.8,2,2),1);assert.equal(overchargeCastDuration(.01,.02,3),.2);
 assert.equal(overchargeMarker(0),.3);assert(overchargeMarker(1-Number.EPSILON)<.85);
 assert.throws(()=>chargeCastDuration(1,Infinity),/finite/);assert.throws(()=>overchargeCastDuration(1,1,0),/positive/);assert.throws(()=>overchargeMarker(1),/\[0, 1\)/);
});

function host(overrides={}) {
  return {
    active: actor => actor.cast,
    dead: actor => actor.dead ?? false,
    chargeSpec: () => ({maxTime: 2}),
    overchargeSpec: () => ({stages: 3, time: .8, perStage: .4}),
    stageLimit: (_actor, _state, spec) => spec.stages,
    timing: () => undefined,
    sparkBonus: () => .35,
    cost: () => ({mana: 6, life: 2}),
    canAfford: (actor, cost) => actor.mana >= cost.mana && actor.life > cost.life,
    pay: (actor, _state, cost) => { actor.mana -= cost.mana; actor.life -= cost.life; },
    random: () => 0,
    stageBanked: () => {},
    end: (actor, state, recovery) => { assert.equal(actor.cast, state); actor.cast = null; actor.recovery = recovery; },
    execute: () => {},
    cue: () => {},
    ...overrides,
  };
}
const state = (mode='overcharge') => ({mode, elapsed: 0, total: .8, held: true, baseMult: 1, stage: 0});

test('one binding serves interleaved actors with independent stage payment and release', () => {
  const a = {cast: state(), mana: 12, life: 10}, b = {cast: state(), mana: 0, life: 10}, releases = [];
  const runtime = new ChargedCasting(host({
    marker: 'bound',
    active(actor) { assert.equal(this.marker, 'bound'); return actor.cast; },
    execute: (actor, _state, release) => releases.push({actor, power: release.dmgMult}),
  }));
  runtime.advance(a, 10); runtime.advance(b, 10);
  assert.equal(a.cast.stage, 1); assert.equal(a.cast.elapsed, 0); assert.equal(a.mana, 6);
  assert.equal(b.cast.stage, 0); assert.equal(b.cast.elapsed, .8); assert.equal(b.mana, 0);
  b.mana = 6; runtime.advance(b, 0);
  assert.equal(b.cast.stage, 1); assert.equal(b.mana, 0); assert.equal(a.mana, 6);
  a.cast.held = false; runtime.advance(a, 0); runtime.advance(a, 10);
  assert.deepEqual(releases, [{actor: a, power: 1.4}]); assert.equal(b.cast.stage, 1);
});

test('marker draws follow successful stage commits, including free stages', () => {
  const actor = {cast: {...state(), indicatorAt: .5}, mana: 0, life: 1}, order = [];
  let free = false;
  const runtime = new ChargedCasting(host({
    overchargeSpec: () => ({stages: 3, time: .8, perStage: .4, costPerStage: free ? 0 : 1}),
    random: () => { order.push(['draw', actor.cast.stage, actor.cast.elapsed, actor.cast.sinceStage]); return .5; },
    stageBanked: (_actor, cast) => order.push(['stage', cast.indicatorAt]),
    pay: () => { throw new Error('Free stage must not pay'); },
  }));
  runtime.advance(actor, 1); assert.deepEqual(order, []); assert.equal(actor.cast.elapsed, .8);
  free = true; runtime.advance(actor, 0);
  assert.deepEqual(order, [['draw', 1, 0, 0], ['stage', .575]]);
  delete actor.cast.indicatorAt; order.length = 0; runtime.advance(actor, .8);
  assert.deepEqual(order, [['stage', undefined]]);
});

test('release clears state before delivery, then emits timing and spark cues in order', () => {
  const actor = {cast: {...state(), stage: 1, elapsed: .72, total: 1, sinceStage: 0, sparkWindow: .25, held: false}}, order = [];
  const runtime = new ChargedCasting(host({
    timing: () => ({kind: 'perfect'}),
    end: (a, _state, recovery) => { a.cast = null; a.recovery = recovery; order.push('end'); },
    execute: (a, _state, release) => { assert.equal(a.cast, null); assert.equal(a.recovery, .15); order.push(release.dmgMult); },
    cue: (_a, _state, kind) => order.push(kind),
  }));
  runtime.advance(actor, .25);
  assert.deepEqual(order, ['end', 1.4 * 1.7 * 1.35, 'perfect', 'spark']);
  runtime.advance(actor, 0); assert.equal(order.length, 4);
});

test('invalid frames and reentry fail explicitly and release the shared guard', () => {
  const actor = {cast: state(), mana: 20, life: 10}; let runtime;
  runtime = new ChargedCasting(host({stageBanked: () => runtime.advance(actor, 0)}));
  assert.throws(() => runtime.advance(actor, -1), /nonnegative/);
  assert.throws(() => runtime.advance(actor, NaN), /finite/);
  assert.equal(actor.mana, 20); assert.equal(actor.cast.elapsed, 0);
  assert.throws(() => runtime.advance(actor, 1), /Reentrant/);
  assert.equal(actor.cast.stage, 1); assert.equal(actor.mana, 14); // Earlier payment is committed.
  runtime.advance(actor, 0); // No stage due; previous exception did not wedge the binding.
  actor.cast.held = false; runtime.advance(actor, 0); assert.equal(actor.cast, null);
});
