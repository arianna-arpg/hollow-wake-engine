// Component-only fixture. Two disposable Worlds supply engine services; this
// does not construct a production private character or preserve global mint IDs.
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {SKILLS} from '../src/data/skills';import {makeSkillInstance,type SkillInstance,type BuffEffect} from '../src/engine/skills';
bootSimEngine();
function setup(prepare=true){const restore=seedGlobalRandom(0x7736);try{
 const w=makeSimWorld('warrior',0x7736),p=w.player,t=new Actor('Sequence target','enemy',{x:p.pos.x+10,y:p.pos.y});w.actors=[p,t];w.walk=null;t.tier=p.tier;t.life=1000;p.buffs.clear();
 const host=makeSkillInstance(SKILLS.cleave,20);host.treeNodes=['readied_cleave','deep_notches'];p.skills=[host];const handles:SkillInstance[]=[host];
 if(prepare){const cast=w.attackSequences.prepare(p,host,t.pos);handles.push(cast,w.attackSequences.forTarget(p,cast,t,0),w.attackSequences.forTarget(p,cast,t,0));}
 return{w,p,t,handles};
}finally{restore();}}
type Fixture=ReturnType<typeof setup>;
function capture(h:Fixture){
 const c=h.w.attackSequences as any,states:any[]=[...c.states],casts:any[]=[];
 for(const handle of h.handles){const cast=c.casts.get(handle);if(cast&&!casts.includes(cast))casts.push(cast);if(cast&&!states.includes(cast.state))states.push(cast.state);}
 const skill=(i:SkillInstance)=>{const index=h.handles.indexOf(i);assert(index>=0);return index;};
 return JSON.parse(JSON.stringify({time:h.w.time,serial:c.serial,actorIds:[h.p.id,h.t.id],
  states:states.map(s=>({key:s.key,retired:s.retired,listed:c.states.has(s),host:skill(s.host),owner:s.owner.id,policy:s.policy,spec:s.spec,caught:s.caught,stacks:[...s.stacks].map(([a,n]:any)=>[a.id,n]),buffs:[...s.buffs].map(([a,b]:any)=>[a.id,b,a.buffs.get(b.id)?.def===b])})),
  casts:casts.map(s=>({state:states.indexOf(s.state),primary:skill(s.inst),caught:s.caught,connected:s.connected,done:s.done,receipt:s.receipt?{target:s.receipt.target.id,dealt:s.receipt.dealt,physical:s.receipt.physical}:null})),
  aliases:h.handles.map(i=>casts.indexOf(c.casts.get(i))),buffs:[...h.p.buffs],flashes:h.w.flashes,
  sources:h.p.sheet.sourceNames().map(key=>[key,h.p.sheet.getSourceMods(key)]),bar:h.p.skills.map(i=>i&&skill(i)),locks:[...h.p.skillRecoveryLocks]}));
}
function detach(source:Fixture):Fixture{
 const before=capture(source),target=setup(false),original=source.w.attackSequences as any;
 assert.equal(source.w.projectiles.length+source.w.pendingRepeats.length+source.w.pendingFuses.length+source.w.zones.length,0,'Fixture requires other carrier mapping');
 assert.equal(original.recoveries.length+original.scheduled.length+original.deferredContacts.length,0,'Fixture requires thrown/delayed continuation course');
 const actors=new Map([[source.p,target.p],[source.t,target.t]]),skills=new Map<SkillInstance,SkillInstance>(),definitions=new Map();
 const rows=source.handles.map(i=>{for(const key of ['challengeHost','followUpHost','invocationHost','guardArtsHost'] as const)assert(!i[key],'Fixture requires other provenance mapping');const{def,sequenceHost,...rest}=i;return rest;});
 const copied=structuredClone(rows);source.handles.forEach((i,n)=>{
  let def=definitions.get(i.def);if(!def){def=SKILLS[i.def.id]===i.def?i.def:structuredClone(i.def);definitions.set(i.def,def);}
  skills.set(i,{...copied[n],def});
 });
 for(const[sourceSkill,copy]of skills)if(sourceSkill.sequenceHost){assert(skills.has(sourceSkill.sequenceHost));copy.sequenceHost=skills.get(sourceSkill.sequenceHost);}
 const sourceBuffs=new Set<BuffEffect>();for(const state of original.states)for(const b of state.buffs.values())sourceBuffs.add(b);
 for(const i of source.handles){const cast=original.casts.get(i);if(cast)for(const b of cast.state.buffs.values())sourceBuffs.add(b);}
 for(const a of actors.keys())for(const b of a.buffs.values())sourceBuffs.add(b.def);
 const originals=[...sourceBuffs],copies=structuredClone(originals),buffs=new Map(originals.map((b,n)=>[b,copies[n]]));
 for(const[a,b]of actors){
  b.id=a.id;b.life=a.life;b.mana=a.mana;b.es=a.es;b.level=a.level;b.dead=a.dead;b.downed=a.downed;b.tier=a.tier;b.pos={...a.pos};b.skills=a.skills.map(i=>i?skills.get(i)!:null);b.statuses=structuredClone(a.statuses);
  b.cooldowns=new Map(a.cooldowns);b.cooldownTotals=new Map(a.cooldownTotals);b.skillRecoveryLocks=new Set(a.skillRecoveryLocks);b.buffs=new Map([...a.buffs].map(([id,row])=>[id,{...structuredClone({...row,def:null}),def:buffs.get(row.def)!}]));
  for(const id of b.sheet.sourceNames())b.sheet.removeSource(id);for(const id of a.sheet.sourceNames())b.sheet.setSource(id,structuredClone(a.sheet.getSourceMods(id)!));
  const sheet=a.sheet as any;for(const[id,value]of sheet.baseOverrides)b.sheet.setBase(id,value);b.sheet.setConditions([...sheet.conditions]);b.sheet.setGauges([...sheet.gauges]);
 }
 target.handles=source.handles.map(i=>skills.get(i)!);target.w.time=source.w.time;target.w.flashes=structuredClone(source.w.flashes);
 assert.doesNotThrow(()=>assert.equal(source.w.attackSequences.copyOwnedStateTo(target.w.attackSequences,{actors,skills,projectiles:new Map(),buffs,spec:structuredClone,aim:()=>assert.fail('Fixture requires explicit aim mapping')}),target.w.attackSequences));
 for(const[liveSkill,privateSkill]of skills){
  const liveCast=(source.w.attackSequences as any).casts.get(liveSkill),privateCast=(target.w.attackSequences as any).casts.get(privateSkill);
  if(!liveCast){assert.equal(privateCast,undefined);continue;}
  assert(privateCast);assert.notEqual(privateCast,liveCast);assert.notEqual(privateCast.state,liveCast.state);
  assert.equal(privateCast.inst,skills.get(liveCast.inst));assert.equal(privateCast.state.owner,actors.get(liveCast.state.owner));assert.equal(privateCast.state.host,skills.get(liveCast.state.host));
  if(liveCast.receipt){assert(privateCast.receipt);assert.notEqual(privateCast.receipt,liveCast.receipt);assert.equal(privateCast.receipt.target,actors.get(liveCast.receipt.target));}
  for(const[a,b]of liveCast.state.buffs)assert.equal(privateCast.state.buffs.get(actors.get(a)),buffs.get(b));
 }

 assert.deepEqual(capture(source),before);assert.deepEqual(capture(target),before);return target;
}
let stages=0;
function compare(source:Fixture,target:Fixture,step:(h:Fixture)=>void){const before=capture(source);step(target);assert.deepEqual(capture(source),before,'Private sequence changed live state');step(source);assert.deepEqual(capture(target),capture(source),'Private continuation differs');stages++;}
const land=(h:Fixture)=>h.w.attackSequences.landed(h.p,h.handles[2],h.t,12,9,0);
for(const initial of ['partial','buff','retired'] as const){
 const source=setup();for(let n=0;n<(initial==='partial'?1:4);n++)land(source);if(initial==='retired')source.w.attackSequences.clear(source.p,source.handles[0]);
 const target=detach(source);
 compare(source,target,land);compare(source,target,land);
 compare(source,target,h=>h.w.attackSequences.clear(h.p,h.handles[0]));
 compare(source,target,land);
 compare(source,target,h=>{const next=h.w.attackSequences.prepare(h.p,h.handles[0],h.t.pos);h.handles.push(next);});
 compare(source,target,h=>h.w.attackSequences.landed(h.p,h.handles.at(-1)!,h.t,9,7,0));
 compare(source,target,land);
}
assert.equal(stages,21);console.log('Sequence private component continuation: 3 courses, 21 stages passed');
