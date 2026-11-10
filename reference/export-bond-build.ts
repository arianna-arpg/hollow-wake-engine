// Original-only exploratory capture. Not an accepted baseline or SDK contract.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';
import {makeSkillInstance,type SkillInstance} from '../src/engine/skills';import {mod} from '../src/engine/stats';
import type {Actor} from '../src/engine/actor';
bootSimEngine();const restore=seedGlobalRandom(0x7723),rows:unknown[]=[];
const ids=new WeakMap<object,number>();let serial=0;const id=(x:object|null|undefined)=>{if(!x)return null;if(!ids.has(x))ids.set(x,++serial);return ids.get(x);};
const near=(a:number,b:number)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const readCast=(a:Actor)=>a.casting;
try{
 const w=makeSimWorld('tamer',0x7723);w.grantStartingCompanions();w.walk=null;
 const p=w.player,pet=w.actors.find(a=>a.companion&&a.owner===p);assert(pet);w.actors=[p,pet];
 const inst=p.skills.find(s=>s?.def.id==='tame_beast');assert(inst);
 inst.level=20;inst.treeNodes=['gentle_claim','focused_claim','returning_claim','swift_claim','swift_instinct','swift_pour'];
 w.recalcPlayer();const state=()=>((w.companionBonds as any).states as Map<Actor,any>).get(pet);
 const packed=(s:SkillInstance|null|undefined)=>s?{identity:id(s),def:s.def.id,level:s.level,bonus:s.bonusLevels,nodes:s.treeNodes,
  sockets:s.sockets.map(r=>r&&{id:r.def.id,level:r.level})}:null;
 const actor=(a:Actor)=>({identity:id(a),def:a.defId,level:a.level,life:a.life,maxLife:a.maxLife(),plies:a.plies,pliesMax:a.pliesMax,
  radius:a.radius,guard:a.guardMode,dead:a.dead,downed:a.downed,dormant:a.companionDormant,owner:id(a.owner),bondGroup:a.bondGroup,
  standingOrder:a.standingOrder,skills:a.skills.map(packed),cooldowns:[...a.cooldowns],buffs:[...a.buffs],
  cast:a.casting?{identity:id(a.casting),inst:packed(a.casting.inst),elapsed:a.casting.elapsed,total:a.casting.total,paid:a.casting.paidCost}:null,
  sources:a.sheet.sourceNames().map(key=>[key,a.sheet.getSourceMods(key)])});
 const observe=(label:string)=>{const s=state();rows.push(JSON.parse(JSON.stringify({label,time:w.time,owner:actor(p),beasts:w.actors.filter(a=>a.companion).map(actor),
  state:s?{identity:id(s),host:packed(s.inst),native:s.native.map(packed),granted:[...s.granted].map(([key,i]:any)=>[key,packed(i)]),
   policy:s.policy,baseRadius:s.baseRadius,claimedLevel:s.claimedLevel,stance:s.stanceId,echoAt:s.echoAt,issued:[...s.issued].map((i:any)=>packed(i)),pulseUntil:s.pulseUntil}:null,
  repeats:w.pendingRepeats.map(r=>({caster:id(r.caster),inst:packed(r.inst),timer:r.timer,remaining:r.n})),
  projectiles:w.projectiles.map(q=>({caster:id(q.caster),inst:packed(q.inst)}))})));};
 const cast=(art:SkillInstance)=>{pet.useLock=0;pet.cooldowns.clear();pet.casting=null;pet.fillResources();assert(w.useSkill(pet,art,{x:pet.pos.x+60,y:pet.pos.y},true));assert(readCast(pet));};
 const art=pet.skills.find(s=>s?.def.id==='beast_hound_art');assert(art);observe('authored-bond-grants-family-art-at-body-level');
 cast(art);pet.life=pet.maxLife()*.5;const firstCast=readCast(pet);pet.cooldowns.set(art.def.id,7.25);observe('family-art-cast-before-keeper-growth');
 w.recalcPlayer();assert.equal(readCast(pet),firstCast);assert.equal(state().granted.get(art.def.id),art);observe('same-level-rebuild-retains-granted-cast');
 p.level=12;w.recalcPlayer();assert.equal(readCast(pet),null);assert.notEqual(state().granted.get(art.def.id),art);
 assert.equal(pet.cooldowns.get(art.def.id),7.25);near(pet.life/pet.maxLife(),.5);observe('keeper-growth-remints-granted-art-cancels-its-cast-and-retains-cooldown');
 const newer=state().granted.get(art.def.id) as SkillInstance;cast(newer);pet.cooldowns.set(newer.def.id,4.5);
 inst.treeNodes=inst.treeNodes!.filter(n=>n!=='returning_claim');w.recalcPlayer();assert.equal(readCast(pet),null);assert(!pet.cooldowns.has(newer.def.id));
 observe('removed-art-cancels-cast-and-removes-its-cooldown');
 const native=state().native.find((s:SkillInstance|null)=>s&&s.def.tags.includes('attack')) as SkillInstance;assert(native);
 cast(native);pet.life=pet.maxLife()*.4;const nativeCast=readCast(pet);
 inst.sockets[0]={def:SUPPORTS.vital_bond,level:1};p.sheet.setSource('bond-build-rig',[mod('minionLife','increased',.5),mod('minionPlies','flat',2)]);w.recalcPlayer();
 assert.equal(readCast(pet),nativeCast);near(pet.life/pet.maxLife(),.4);observe('policy-change-preserves-native-cast-and-life-fraction');
 pet.plies=1;w.recalcPlayer();assert.equal(pet.plies,1);assert.equal(readCast(pet),nativeCast);observe('repeated-rebuild-does-not-refill-native-state');
 // Exercise the original completed-attack callback with authored Claw. This
 // is a diagnostic callback input, not a claim that the keeper learned Claw.
 w.companionBonds.onCast(p,makeSkillInstance(SKILLS.claw),p.pos);assert.equal(state().issued.size,0);observe('policy-change-delays-new-echo-until-original-cooldown');
 w.time=state().echoAt;w.companionBonds.onCast(p,makeSkillInstance(SKILLS.claw),p.pos);assert.equal(state().issued.size,1);assert(w.pendingRepeats.some(r=>r.caster===pet));
 const issued=w.pendingRepeats.find(r=>r.caster===pet)!;w.pendingRepeats.push({...issued,caster:p});observe('owned-echo-and-diagnostic-foreign-caster-row');
 inst.treeNodes!.reverse();w.recalcPlayer();assert(!w.pendingRepeats.some(r=>r.caster===pet));assert(w.pendingRepeats.some(r=>r.caster===p));assert.equal(readCast(pet),nativeCast);
 observe('policy-change-clears-only-owned-echo-and-preserves-native-cast');
 const second=w.createMonster('shepherds_hound',1,'enemy');w.actors.push(second);w.tameCompanion(p,second,inst.def.id);w.recalcPlayer();
 assert(!second.companionDormant);observe('second-distinct-bond-with-capacity');
 inst.treeNodes=inst.treeNodes!.filter(n=>n!=='swift_claim');w.recalcPlayer();assert(second.companionDormant&&second.downed&&second.life===0);
 observe('capacity-loss-makes-second-bond-dormant-and-removes-inheritance');
 inst.treeNodes.push('swift_claim');w.recalcPlayer();assert(!second.companionDormant&&second.downed&&second.life===0);
 observe('restored-capacity-does-not-revive-downed-beast');
 p.skills=p.skills.map(s=>s===inst?null:s);w.recalcPlayer();assert.equal(state(),undefined);assert(!pet.sheet.hasSource('companionBond'));
 observe('unbound-host-restores-native-bar-and-retires-bond-sources');
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-bond-build-diagnostic-draft/v1',notes:'Original World rebuilds; persisted authored trees and diagnostic callback/foreign-caster queue inputs; no UI allocation or complete effect-execution claim',rows}),{flag:'wx'});
}finally{restore();}
