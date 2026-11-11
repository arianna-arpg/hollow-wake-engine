// Closed recovery component fixture. Explicit actor/carrier admission is not a
// general private World builder. New disposable actors consume ordinary mint IDs.
import assert from 'node:assert/strict';import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';import {makeSkillInstance,type SkillInstance,type BuffEffect} from '../src/engine/skills';import {mod} from '../src/engine/stats';
bootSimEngine();const borrowed=new Map<object,number>();
function content(value:unknown):void{if(!value||typeof value!=='object'||borrowed.has(value))return;borrowed.set(value,borrowed.size);for(const d of Object.values(Object.getOwnPropertyDescriptors(value))){assert(!d.get&&!d.set);content(d.value);}}
for(const value of [...Object.values(SKILLS),...Object.values(SUPPORTS)])content(value);
function seeded<T>(seed:number,fn:()=>T):T{const restore=seedGlobalRandom(seed);try{return fn();}finally{restore();}}
function setup(bounce=true){return seeded(0x7742,()=>{
 const w=makeSimWorld('warrior',0x7742),p=w.player;w.actors=[p];w.walk=null;
 const host=makeSkillInstance(SKILLS.cleave,20);host.treeNodes=bounce?['unbound_cleave','long_edge','wide_front']:['unbound_cleave'];p.skills=[host];
 p.sheet.setSource('recovery-observer',[mod('accuracy','override',100000),mod('critChance','override',0)]);
 const target=w.createMonster('zombie',1,'enemy');target.skills=[];target.brain=undefined;target.tier=p.tier;target.pos={x:p.pos.x+180,y:p.pos.y};
 target.sheet.setSource('recovery-observer',[mod('life','flat',100000),mod('evasion','override',0),mod('blockChance','override',0),mod('ailmentResist','override',0)]);target.fillResources();w.actors.push(target);
 w.executeSkill(p,host,target.pos);const main=w.projectiles.find(q=>q.inst.sequenceHost===host&&q.inst.sequenceRole==='primary');assert(main);
 w.attackSequences.beforeContact(main);(w as any).resolveHit(p,main.inst,target,main.mult,0,undefined,false,false,undefined,main.origin,main.tier);assert(w.attackSequences.contact(main,target));
 w.projectiles=w.projectiles.filter(q=>q!==main);assert.equal((w.attackSequences as any).recoveries.length,1);
 return{w,p,target,host,main,actors:[...w.actors]};
});}
type Fixture=ReturnType<typeof setup>;
const actorKeys=['id','life','mana','es','level','dead','downed','tier','team','name','radius','facing','lifespan','untargetable','look','pos','skills','statuses','cooldowns','cooldownTotals','skillRecoveryLocks','buffs','charges','owner','construct','summonInst','sourceSkillId'] as const;
function handles(h:Fixture){const c=h.w.attackSequences as any,projectiles=[...h.w.projectiles];for(const p of [h.main,...c.recoveries.map((r:any)=>r.projectile)])if(!projectiles.includes(p))projectiles.push(p);
 const skills:SkillInstance[]=[];const add=(i:SkillInstance)=>{if(skills.includes(i))return;skills.push(i);if(i.sequenceHost)add(i.sequenceHost);};add(h.host);for(const a of h.actors){for(const i of a.skills)if(i)add(i);if(a.construct?.castInst)add(a.construct.castInst);if(a.summonInst)add(a.summonInst);}for(const p of projectiles)add(p.inst);for(const j of c.scheduled)add(j.inst);for(const cast of c.active)add(cast.inst);return{skills,projectiles};}
function pack(value:unknown,seen=new Map<object,number>()):unknown{
 if(value===undefined)return{undefined:true};if(typeof value==='number'&&!Number.isFinite(value))return{number:String(value)};if(value===null||typeof value!=='object'){assert.notEqual(typeof value,'function');return value;}
 if(value instanceof Actor)return{actor:value.id};if(borrowed.has(value))return{content:borrowed.get(value)};if(seen.has(value))return{ref:seen.get(value)};seen.set(value,seen.size);
 if(value instanceof Map)return{map:[...value].map(([k,v])=>[pack(k,seen),pack(v,seen)])};if(value instanceof Set)return{set:[...value].map(v=>pack(v,seen))};if(Array.isArray(value))return value.map(v=>pack(v,seen));
 assert.equal(Object.getPrototypeOf(value),Object.prototype);return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pack(v,seen)]));
}
function capture(h:Fixture){const c=h.w.attackSequences as any,{skills,projectiles}=handles(h);return pack({time:h.w.time,serial:c.serial,main:h.main,projectiles:h.w.projectiles,skills,roster:h.w.actors,
 actors:h.actors.map(a=>({state:Object.fromEntries(actorKeys.map(k=>[k,a[k]])),sources:a.sheet.sourceNames().map(k=>[k,a.sheet.getSourceMods(k)])})),
 controller:{states:[...c.states],active:[...c.active],casts:skills.map(i=>c.casts.get(i)),rain:projectiles.map(p=>[p,c.rainAt.has(p),c.rainAt.get(p)]),recoveries:c.recoveries,scheduled:c.scheduled,deferred:c.deferredContacts},flashes:h.w.flashes});}
function detach(source:Fixture):Fixture{
 const before=capture(source),w=seeded(0x7742,()=>makeSimWorld('warrior',0x7742)),original=source.w.attackSequences as any;w.walk=null;
 assert.equal(source.w.pendingRepeats.length+source.w.pendingFuses.length+source.w.pendingSalvos.length+source.w.pendingSteps.length+source.w.pendingFollowUps.length+source.w.zones.length,0,'Other carriers require separate admission');assert.equal(original.deferredContacts.length,0,'Deferred contact requires separate admission');
 const actors=new Map(source.actors.map(a=>[a,a===source.p?w.player:new Actor(a.name,a.team,{...a.pos})])),copies=new Map<object,any>(actors);
 function copy<T>(value:T):T{
  if(value===null||typeof value!=='object'){assert.notEqual(typeof value,'function','Unadmitted callback');return value;}if(copies.has(value))return copies.get(value);if(borrowed.has(value))return value;
  let result:any;if(value instanceof Map){result=new Map();copies.set(value,result);for(const[k,v]of value)result.set(copy(k),copy(v));return result;}if(value instanceof Set){result=new Set();copies.set(value,result);for(const v of value)result.add(copy(v));return result;}
  assert(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype,'Unadmitted class or actor');result=Array.isArray(value)?[]:{};copies.set(value,result);
  assert.equal(Object.getOwnPropertySymbols(value).length,0);for(const[k,d]of Object.entries(Object.getOwnPropertyDescriptors(value))){assert(!d.get&&!d.set,'Unadmitted accessor');if(k==='length'&&Array.isArray(value))continue;Object.defineProperty(result,k,{...d,value:copy(d.value)});}if(Array.isArray(value))result.length=value.length;return result;
 }
 const {skills:sourceSkills,projectiles:sourceProjectiles}=handles(source),skills=new Map(sourceSkills.map(i=>[i,copy(i)])),projectiles=new Map(sourceProjectiles.map(p=>[p,copy(p)])),buffs=new Map<BuffEffect,BuffEffect>();
 const states=new Set<any>(original.states);for(const i of sourceSkills){const c=original.casts.get(i);if(c)states.add(c.state);}for(const s of states)for(const b of s.buffs.values())buffs.set(b,copy(b));
 for(const[a,b]of actors){
  for(const key of actorKeys)(b as any)[key]=copy(a[key]);
  for(const id of b.sheet.sourceNames())b.sheet.removeSource(id);for(const id of a.sheet.sourceNames())b.sheet.setSource(id,copy(a.sheet.getSourceMods(id)!));
  const sheet=a.sheet as any;for(const[id,v]of sheet.baseOverrides)b.sheet.setBase(id,v);b.sheet.setConditions([...sheet.conditions]);b.sheet.setGauges([...sheet.gauges]);
 }
 w.actors=copy(source.w.actors);w.projectiles=copy(source.w.projectiles);w.time=source.w.time;w.flashes=copy(source.w.flashes);
 const target={w,p:actors.get(source.p)!,target:actors.get(source.target)!,host:skills.get(source.host)!,main:projectiles.get(source.main)!,actors:copy(source.actors)};
 source.w.attackSequences.copyOwnedStateTo(w.attackSequences,{actors,skills,projectiles,buffs,spec:copy,aim:copy});const c=w.attackSequences as any;
 assert.equal(c.recoveries.length,original.recoveries.length,'Copied recovery count');assert.equal(c.scheduled.length,original.scheduled.length,'Copied scheduled count');
 for(let n=0;n<original.recoveries.length;n++){const a=original.recoveries[n],b=c.recoveries[n];assert.notEqual(a,b);assert.equal(b.projectile,projectiles.get(a.projectile));assert.equal(b.cast,c.casts.get(skills.get(a.cast.inst)));if(a.target)assert.equal(b.target,actors.get(a.target));if(a.marker){assert.equal(b.marker,actors.get(a.marker));assert.equal(b.marker.owner,target.p);}}
 for(let n=0;n<original.scheduled.length;n++){const a=original.scheduled[n],b=c.scheduled[n];assert.notEqual(a,b);assert.equal(b.inst,skills.get(a.inst));assert.notEqual(b.aim,a.aim);}
 assert.deepEqual(capture(source),before);assert.deepEqual(capture(target),before);return target;
}
let stages=0;
function compare(source:Fixture,target:Fixture,step:(h:Fixture)=>void){const before=capture(source),seed=0x7750+stages;seeded(seed,()=>step(target));assert.deepEqual(capture(source),before,'Private recovery changed live state');seeded(seed,()=>step(source));assert.deepEqual(capture(target),capture(source),'Private recovery continuation differs');stages++;}
const advance=(h:Fixture,dt:number)=>{h.w.time+=dt;h.w.attackSequences.update(dt);};
const retrieve=(h:Fixture)=>{const r=(h.w.attackSequences as any).recoveries[0];h.p.pos={...r.at};advance(h,.1);};
for(const mode of ['lodged','airborne','grounded','scheduled'] as const){
 const source=setup(mode!=='lodged');advance(source,mode==='grounded'?2:.1);
 if(mode==='scheduled'){retrieve(source);source.w.projectiles=[];source.w.executeSkill(source.p,source.host,source.target.pos);assert.equal((source.w.attackSequences as any).scheduled.length,1);}
 const target=detach(source);
 if(mode==='scheduled'){
  compare(source,target,h=>{h.w.time=(h.w.attackSequences as any).scheduled[0].due-1e-6;h.w.attackSequences.update(0);});
  compare(source,target,h=>{h.w.time=(h.w.attackSequences as any).scheduled[0].due;h.w.attackSequences.update(0);});
 }else{
  compare(source,target,h=>advance(h,.1));compare(source,target,retrieve);
 }
 compare(source,target,h=>advance(h,.1));compare(source,target,h=>h.w.attackSequences.clear(h.p,h.host));compare(source,target,h=>advance(h,.5));
}
assert.equal(stages,20);console.log('Sequence private recovery continuation: 4 courses, 20 stages passed');
