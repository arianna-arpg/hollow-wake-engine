import {copyAttackSequenceState} from '@hollow-wake/engine/combat/attack-sequence-continuation';
// Closed flight-only component fixture. It refuses functions, unknown class
// instances, other actors and other carrier families. It is not a World copier.
import assert from 'node:assert/strict';import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';import {makeSkillInstance,type SkillInstance,type BuffEffect} from '../src/engine/skills';import type {Projectile} from '../src/engine/world';
bootSimEngine();const borrowed=new Map<object,number>();
function content(value:unknown):void{if(!value||typeof value!=='object'||borrowed.has(value))return;borrowed.set(value,borrowed.size);for(const d of Object.values(Object.getOwnPropertyDescriptors(value))){assert(!d.get&&!d.set);content(d.value);}}
for(const value of [...Object.values(SKILLS),...Object.values(SUPPORTS)])content(value);
function seeded<T>(seed:number,fn:()=>T):T{const restore=seedGlobalRandom(seed);try{return fn();}finally{restore();}}
function setup(launch=true){return seeded(0x7737,()=>{
 const w=makeSimWorld('warrior',0x7737),p=w.player;w.actors=[p];w.walk=null;const host=makeSkillInstance(SKILLS.cleave,20);host.treeNodes=['unbound_cleave','long_edge','driving_front'];p.skills=[host];let main:Projectile|undefined;
 if(launch){w.executeSkill(p,host,{x:p.pos.x+200,y:p.pos.y});main=w.projectiles.find(q=>q.inst.sequenceHost===host&&q.inst.sequenceRole==='primary');assert(main);w.attackSequences.flight(main,false);}
 return{w,p,host,main};
});}
type Fixture=ReturnType<typeof setup>;
function handles(h:Fixture){const projectiles=[...h.w.projectiles];if(h.main&&!projectiles.includes(h.main))projectiles.push(h.main);const skills:SkillInstance[]=[];const add=(s:SkillInstance)=>{if(skills.includes(s))return;skills.push(s);if(s.sequenceHost)add(s.sequenceHost);};add(h.host);for(const p of projectiles)add(p.inst);return{skills,projectiles};}
function pack(value:unknown,seen=new Map<object,number>()):unknown{
 if(value===undefined)return{undefined:true};if(typeof value==='number'&&!Number.isFinite(value))return{number:String(value)};if(value===null||typeof value!=='object'){assert.notEqual(typeof value,'function');return value;}
 if(value instanceof Actor)return{actor:value.id};if(borrowed.has(value))return{content:borrowed.get(value)};if(seen.has(value))return{ref:seen.get(value)};seen.set(value,seen.size);
 if(value instanceof Map)return{map:[...value].map(([k,v])=>[pack(k,seen),pack(v,seen)])};if(value instanceof Set)return{set:[...value].map(v=>pack(v,seen))};if(Array.isArray(value))return value.map(v=>pack(v,seen));
 assert.equal(Object.getPrototypeOf(value),Object.prototype);return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pack(v,seen)]));
}
function capture(h:Fixture){const c=h.w.attackSequences as any,{skills,projectiles}=handles(h);return pack({time:h.w.time,serial:c.serial,main:h.main,projectiles:h.w.projectiles,skills,
 actor:{id:h.p.id,pos:h.p.pos,skills:h.p.skills,cooldowns:h.p.cooldowns,totals:h.p.cooldownTotals,locks:h.p.skillRecoveryLocks,buffs:h.p.buffs,statuses:h.p.statuses},
 controller:{states:[...c.states],active:[...c.active],casts:skills.map(i=>c.casts.get(i)),rain:projectiles.map(p=>[p,c.rainAt.has(p),c.rainAt.get(p)]),recoveries:c.recoveries,scheduled:c.scheduled,deferred:c.deferredContacts},flashes:h.w.flashes});}
function detach(source:Fixture):Fixture{
 const before=capture(source),target=setup(false),original=source.w.attackSequences as any;
 assert.equal(source.w.actors.length,1);assert.equal(source.w.pendingRepeats.length+source.w.pendingFuses.length+source.w.pendingSalvos.length+source.w.pendingSteps.length+source.w.pendingFollowUps.length+source.w.zones.length,0,'Other carriers require separate admission');
 assert.equal(original.recoveries.length+original.scheduled.length+original.deferredContacts.length,0,'Contact/retrieval needs its own admitted fixture');
 const actors=new Map([[source.p,target.p]]),copies=new Map<object,any>(actors);
 function copy<T>(value:T):T{
  if(value===null||typeof value!=='object'){assert.notEqual(typeof value,'function','Unadmitted callback');return value;}
  if(copies.has(value))return copies.get(value);if(borrowed.has(value))return value;
  let result:any;
  if(value instanceof Map){result=new Map();copies.set(value,result);for(const[k,v]of value)result.set(copy(k),copy(v));return result;}
  if(value instanceof Set){result=new Set();copies.set(value,result);for(const v of value)result.add(copy(v));return result;}
  assert(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype,'Unadmitted class or actor');result=Array.isArray(value)?[]:{};copies.set(value,result);
  assert.equal(Object.getOwnPropertySymbols(value).length,0);for(const[k,d]of Object.entries(Object.getOwnPropertyDescriptors(value))){assert(!d.get&&!d.set,'Unadmitted accessor');if(k==='length'&&Array.isArray(value))continue;Object.defineProperty(result,k,{...d,value:copy(d.value)});}if(Array.isArray(value))result.length=value.length;return result;
 }
 const {skills:sourceSkills,projectiles:sourceProjectiles}=handles(source),skills=new Map(sourceSkills.map(i=>[i,copy(i)])),projectiles=new Map(sourceProjectiles.map(p=>[p,copy(p)])),buffs=new Map<BuffEffect,BuffEffect>();
 const states=new Set<any>(original.states);for(const i of sourceSkills){const c=original.casts.get(i);if(c)states.add(c.state);}for(const s of states)for(const b of s.buffs.values())buffs.set(b,copy(b));
 const a=source.p,b=target.p;
 for(const key of ['id','life','mana','es','level','dead','downed','tier','team','name','radius','facing','lifespan','untargetable'] as const)(b as any)[key]=a[key];
 b.pos=copy(a.pos);b.skills=copy(a.skills);b.statuses=copy(a.statuses);b.cooldowns=copy(a.cooldowns);b.cooldownTotals=copy(a.cooldownTotals);b.skillRecoveryLocks=copy(a.skillRecoveryLocks);b.buffs=copy(a.buffs);
 for(const id of b.sheet.sourceNames())b.sheet.removeSource(id);for(const id of a.sheet.sourceNames())b.sheet.setSource(id,copy(a.sheet.getSourceMods(id)!));
 const sheet=a.sheet as any;for(const[id,v]of sheet.baseOverrides)b.sheet.setBase(id,v);b.sheet.setConditions([...sheet.conditions]);b.sheet.setGauges([...sheet.gauges]);
 target.host=skills.get(source.host)!;target.main=projectiles.get(source.main!)!;target.w.projectiles=copy(source.w.projectiles);target.w.time=source.w.time;target.w.flashes=copy(source.w.flashes);
 assert.doesNotThrow(()=>copyAttackSequenceState(source.w.attackSequences,target.w.attackSequences,{actors,skills,projectiles,buffs,spec:copy,aim:copy}));
 for(const[p,q]of projectiles){assert.notEqual(p,q);assert.equal(q.caster,target.p);assert.equal(q.inst,skills.get(p.inst));assert.notEqual(q.hits,p.hits);assert.notEqual(q.pos,p.pos);}
 assert.deepEqual(capture(source),before);assert.deepEqual(capture(target),before);return target;
}
let stages=0;
function compare(source:Fixture,target:Fixture,step:(h:Fixture)=>void){const before=capture(source),seed=0x7740+stages;seeded(seed,()=>step(target));assert.deepEqual(capture(source),before,'Private flight changed live state');seeded(seed,()=>step(source));assert.deepEqual(capture(target),capture(source),'Private flight continuation differs');stages++;}
for(const completed of [false,true]){
 const source=setup();source.w.time=.1;if(completed){source.w.projectiles=source.w.projectiles.filter(p=>p!==source.main);source.w.attackSequences.update(0);}
 const target=detach(source);
 compare(source,target,h=>h.w.attackSequences.flight(h.main!,false));
 compare(source,target,h=>{h.w.time=.25;h.w.attackSequences.flight(h.main!,false);});
 compare(source,target,h=>{for(const p of [...h.w.projectiles])if(p!==h.main)h.w.attackSequences.flight(p,false);});
 compare(source,target,h=>{h.w.time=.4;h.w.attackSequences.flight(h.main!,false);});
 compare(source,target,h=>{h.w.time=.5;h.w.attackSequences.flight(h.main!,false);});
 compare(source,target,h=>h.w.attackSequences.clear(h.p,h.host));
 compare(source,target,h=>{h.w.time=1;h.w.attackSequences.flight(h.main!,false);});
}
assert.equal(stages,14);console.log('Sequence private flight continuation: 2 courses, 14 stages passed');
