// Original-only exploratory evidence for companion copy lifetime. Diagnostic
// completion/foreign-caster inputs are explicit; this is not a UI legality or
// complete effect-delivery course.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';import {makeSkillInstance,type SkillInstance} from '../src/engine/skills';import type {Actor} from '../src/engine/actor';
bootSimEngine();const restore=seedGlobalRandom(0x7724),rows:unknown[]=[],ids=new WeakMap<object,number>();let serial=0;
const id=(value:object)=>{if(!ids.has(value))ids.set(value,++serial);return ids.get(value);};
try{
 const w=makeSimWorld('tamer',0x7724);w.grantStartingCompanions();w.walk=null;
 const p=w.player,pet=w.actors.find(a=>a.companion&&a.owner===p);assert(pet);w.actors=[p,pet];
 const host=p.skills.find(i=>i?.def.id==='tame_beast');assert(host);host.level=20;host.treeNodes=['gentle_claim','focused_claim','returning_claim','swift_claim','swift_instinct','swift_pour'];w.recalcPlayer();
 const state=()=>((w.companionBonds as any).states as Map<Actor,any>).get(pet);
 const skill=(i:SkillInstance)=>({identity:id(i),definition:i.def.id,level:i.level,nodes:i.treeNodes,sockets:i.sockets.map(s=>s&&[s.def.id,s.level])});
 const observe=(label:string)=>{const s=state();rows.push(JSON.parse(JSON.stringify({label,time:w.time,host:skill(host),
  body:{id:id(pet),life:pet.life,level:pet.level,downed:pet.downed,dormant:pet.companionDormant,plies:pet.plies,pliesMax:pet.pliesMax,revival:pet.companionReviveRemaining},
  state:s?{identity:id(s),host:skill(s.inst),native:s.native.map((i:SkillInstance|null)=>i&&skill(i)),granted:[...s.granted].map(([key,i]:any)=>[key,skill(i)]),policy:s.policy,echoAt:s.echoAt,issued:[...s.issued].map((i:any)=>skill(i)),pulseUntil:s.pulseUntil,pulseAt:s.pulseAt}:null,
  repeats:w.pendingRepeats.map(r=>({caster:id(r.caster),inst:skill(r.inst),timer:r.timer,remaining:r.n}))})));};
 w.time=state().echoAt;w.companionBonds.onCast(p,makeSkillInstance(SKILLS.claw),p.pos);const owned=w.pendingRepeats.find(r=>r.caster===pet);assert(owned);assert.equal(state().issued.size,1);w.pendingRepeats.push({...owned,caster:p});observe('owned-copy-and-foreign-carrier-share-instance');
 // Simulate completion of the beast's carrier; a foreign carrier and an
 // external reference to that same instance still exist.
 w.pendingRepeats=w.pendingRepeats.filter(r=>r.caster!==pet);w.companionBonds.update(0);assert.equal(state().issued.size,0);assert.equal(w.pendingRepeats.length,1);observe('completed-owned-copy-leaves-issued-set-but-foreign-carrier-remains');
 w.time=state().echoAt+1;const echo=state().echoAt;w.companionBonds.onCast(p,owned.inst,p.pos);assert.equal(state().echoAt,echo);assert.equal(state().issued.size,0);assert.equal(w.pendingRepeats.length,1);observe('foreign-carried-copy-cannot-recursively-echo');
 // Identity, not the definition ID or copied contents, carries suppression.
 const similar={...owned.inst};w.companionBonds.onCast(p,similar,p.pos);assert.equal(state().issued.size,1);assert.equal(w.pendingRepeats.length,2);const active=w.pendingRepeats.find(r=>r.caster===pet)!;w.pendingRepeats.push({...active,caster:p});observe('distinct-unmarked-instance-remains-eligible-with-an-active-foreign-carrier');
 host.treeNodes!.reverse();w.recalcPlayer();assert.equal(state().issued.size,0);assert.equal(w.pendingRepeats.length,2);assert(w.pendingRepeats.every(r=>r.caster===p));assert.equal(w.pendingRepeats[0].inst,owned.inst);assert.equal(w.pendingRepeats[1].inst,active.inst);observe('policy-retirement-keeps-active-and-completed-foreign-carriers-and-copy-history');
 w.time=state().echoAt+1;const afterPolicy=state().echoAt;w.companionBonds.onCast(p,owned.inst,p.pos);assert.equal(state().echoAt,afterPolicy);assert.equal(w.pendingRepeats.length,2);observe('retired-copy-still-cannot-echo-after-policy-change');
 p.skills=p.skills.map(i=>i===host?null:i);w.recalcPlayer();assert.equal(state(),undefined);observe('host-removal-retires-body-state');
 p.skills[0]=host;w.recalcPlayer();assert(state());w.time=state().echoAt+1;w.companionBonds.onCast(p,owned.inst,p.pos);assert.equal(state().issued.size,0);assert.equal(w.pendingRepeats.length,2);observe('controller-copy-history-survives-body-state-recreation');
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-bond-copy-continuation-draft/v1',notes:'Original lifetime/identity observations with diagnostic completion and foreign-caster carrier inputs; no graph-fork implementation or complete delivery claim',rows}),{flag:'wx'});
}finally{restore();}
