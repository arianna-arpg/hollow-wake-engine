import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {CharacterProgression,ProgressionHost,experienceForLevel,passivePointsAtLevel,levelModifiers} from '../dist/character-progression.js';
import {progressionPack} from '../scripts/compile-progression-content.mjs';
const observed=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-eighteen/character-progression.json.gz',import.meta.url)))),pack=progressionPack();
const project=state=>({seats:state.seats.map(s=>({id:s.id,level:s.level,controlledLevel:s.home?s.controlledLevel:s.level,xp:s.xp,xpNeeded:s.xpNeeded,points:s.points??s.passivePoints,life:s.life,mana:s.mana})),ledger:state.ledger,dirty:state.dirty});
test('all original class and party XP transitions retain arithmetic, milestone order and per-level callbacks',()=>{
 let checked=0;
 for(const scenario of observed.scenarios){
  const data=structuredClone(pack);if(scenario.name==='live-tuning')Object.assign(data.tuning,{passivePointsPerLevel:3,lifePerLevel:7,manaPerLevel:2});const policy=new CharacterProgression(data);
  for(const row of scenario.rows){
   const seats=structuredClone(row.before.seats);for(const s of seats){s.passivePoints=s.points;delete s.points;}
   const ledger=Object.fromEntries(row.before.ledger),dirty=new Set(row.before.dirty);let at=0;
   const state=()=>({seats,ledger:Object.entries(ledger),dirty:[...dirty]});
   const check=(name,phase,seat)=>{const expected=row.events[at++];assert(expected,`${scenario.name}/${row.name}: extra ${name}`);assert.equal(expected.name,name);assert.equal(expected.phase,phase);assert.equal(expected.seat,seat);assert.deepEqual(project(state()),project(expected.state),`${scenario.name}/${row.name}/${name}/${phase}`);return expected;};
   const effect=(name,s,action)=>{check(name,'before',name==='text'||name==='resyncMercenary'?undefined:s?.id);action?.();check(name,'after');};
   const ports={state:s=>s,hero:s=>s,classId:s=>s.classId,eligible:s=>!s.dead&&!s.merc,rules:()=>policy,
    blessing:()=>row.before.blessing>0?.05:0,experienceMultiplier:()=>['relic-fraction','blessing-before-relic'].includes(row.name)?.98:1,
    markDirty:s=>effect('markMetaDirty',s,()=>dirty.add(s.id)),
    recalculate:s=>effect('recalcSeat',s,()=>{const expected=row.events[at].state.seats.find(other=>other.id===s.id);assert.deepEqual(policy.levelModifiers(s.level),expected.levelMods);Object.assign(s,{life:expected.life,mana:expected.mana,maxLife:expected.maxLife,maxMana:expected.maxMana});}),
    fillResources:s=>effect('fillResources',s,()=>{s.life=s.maxLife;s.mana=s.maxMana;}),
    announce:s=>effect('text',s),local:s=>s.local,resyncMercenary:()=>effect('resyncMercenary'),accountOwned:s=>s.local||s.couch,ledger:()=>ledger};
   new ProgressionHost(ports).grantAll(seats,row.amount);assert.equal(at,row.events.length);assert.deepEqual(project(state()),project(row.after),`${scenario.name}/${row.name}/final`);checked++;
  }
 }
 assert.equal(checked,744);
});

function harness(limit=4096){
 const policy=new CharacterProgression(pack),state={xp:0,xpNeeded:45,passivePoints:0},hero={level:1,downed:false},ledger={},events=[],seat={};
 const ports={state:()=>state,hero:()=>hero,classId:()=>pack.classes[0].id,eligible:()=>true,rules:()=>policy,blessing:()=>0,experienceMultiplier:()=>1,
  markDirty:()=>events.push('dirty'),recalculate:()=>events.push('rebuild'),fillResources:()=>events.push('fill'),announce:()=>events.push('announce'),local:()=>true,resyncMercenary:()=>events.push('merc'),accountOwned:()=>true,ledger:()=>ledger};
 return {policy,state,hero,ledger,events,seat,ports,host:new ProgressionHost(ports,limit)};
}
test('invalid arithmetic and bounded-work refusals leave the current character untouched',()=>{
 for(const value of [NaN,Infinity,-Infinity,Number.MAX_VALUE]){const h=harness(3);assert.throws(()=>h.host.grant(h.seat,value));assert.deepEqual(h.state,{xp:0,xpNeeded:45,passivePoints:0});assert.equal(h.hero.level,1);assert.deepEqual(h.events,[]);}
 const h=harness(2);assert.throws(()=>h.host.grant(h.seat,100000),/work limit/);assert.equal(h.state.xp,0);assert.deepEqual(h.events,[]);
 for(const change of [h=>h.state.xpNeeded=0,h=>h.state.xp=Infinity,h=>h.hero.level=1.5,h=>h.state.passivePoints=-1]){const h=harness();change(h);const before=structuredClone(h.state);assert.throws(()=>h.host.grant(h.seat,1));assert.deepEqual(h.state,before);assert.deepEqual(h.events,[]);}
 const edge=harness();edge.state.passivePoints=Number.MAX_SAFE_INTEGER;assert.throws(()=>edge.host.grant(edge.seat,45));assert.equal(edge.hero.level,1);assert.equal(edge.state.xp,0);
});
test('input ownership, unknown classes and prototype-named milestone keys are explicit',()=>{
 const data=structuredClone(pack),policy=new CharacterProgression(data);data.tuning.lifePerLevel=99;assert.equal(policy.pack.tuning.lifePerLevel,4);assert.throws(()=>policy.classMilestones('missing'));
 const next=structuredClone(pack);next.milestones=[{level:1,key:'__proto__'},{level:1,key:'constructor'}];next.classes=[{id:'__proto__',milestones:[]}];const p=new CharacterProgression(next),ledger={};p.stamp(ledger,1,'__proto__');assert.equal(Object.getPrototypeOf(ledger),Object.prototype);assert.equal(ledger.__proto__,1);assert.equal(ledger.constructor,1);p.stamp(ledger,1,'__proto__');assert.equal(ledger.__proto__,1);
 for(const change of [p=>p.tuning.experience.scale=0,p=>p.tuning.experience.exponent=NaN,p=>p.tuning.passivePointsPerLevel=-1,p=>p.classes.push(p.classes[0]),p=>p.milestones[0].level=0]){const bad=structuredClone(pack);change(bad);assert.throws(()=>new CharacterProgression(bad));}
});
test('fractional and negative awards remain valid; no level-100 cap is inferred',()=>{
 const h=harness();h.host.grant(h.seat,-.5);assert.equal(h.state.xp,-.5);h.host.grant(h.seat,.25);assert.equal(h.state.xp,-.25);
 h.hero.level=100;h.state.xp=0;h.state.xpNeeded=h.policy.experienceForLevel(100);h.host.grant(h.seat,h.state.xpNeeded);assert.equal(h.hero.level,101);
 assert.equal(experienceForLevel(2,45,1.55),131);assert.equal(passivePointsAtLevel(10,2,3),29);assert.deepEqual(levelModifiers(3,2,5,7).map(m=>m.value),[4,10,14]);
});
test('completion callbacks cannot reenter, and downed status is read after recalculation',()=>{
 const h=harness();h.ports.recalculate=()=>{assert.throws(()=>h.host.grant(h.seat,1),/Reentrant/);h.hero.downed=true;};h.host=new ProgressionHost(h.ports);h.host.grant(h.seat,45);assert(!h.events.includes('fill'));assert.equal(h.hero.level,2);
 h.hero.downed=false;h.host.grant(h.seat,0);assert.equal(h.state.xp,0);
});
