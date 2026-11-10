// Original-only exploratory capture. Not an accepted baseline or SDK contract.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {makeSkillInstance,type SkillInstance} from '../src/engine/skills';
import {mod} from '../src/engine/stats';import {spendAbsorbLayers} from '../src/engine/absorb';
import {landLifeDamage} from '../src/engine/damage';import {serializeCharacter} from '../src/meta/character';
bootSimEngine();const restore=seedGlobalRandom(0x7722),rows:unknown[]=[];
const ids=new WeakMap<object,number>();let serial=0;const id=(x:object|null|undefined)=>{if(!x)return null;if(!ids.has(x))ids.set(x,++serial);return ids.get(x);};
function setup(nodes:string[]){
 const w=makeSimWorld('warrior',0x7722),p=w.player,meta=w.meta;
 w.actors=[p];w.walk=null;w.doodads=[];w.markDoodadsChanged();meta.equipped={};meta.items=[];meta.containers={};meta.knownSkills.clear();
 for(const stat of ['strength','dexterity','willpower','intelligence'] as const)meta.baseAttrs[stat]=100;
 const inst=makeSkillInstance(SKILLS.shield_up,20,3);inst.treeNodes=[...nodes];p.skills.fill(null);p.skills[0]=inst;meta.knownSkills.set(inst.def.id,inst);w.recalcPlayer();
 p.sheet.setSource('guard-build-rig',[mod('mana','flat',10000),mod('life','flat',10000),mod('armor','override',100),
  mod('critChance','override',0),mod('blockChance','override',0),mod('lifeRegen','override',0),mod('thorns','override',0)]);p.fillResources();
 const packed=(s:SkillInstance|null|undefined)=>s?{identity:id(s),def:s.def.id,level:s.level,bonus:s.bonusLevels,nodes:s.treeNodes,
  sockets:s.sockets.map(r=>r&&{id:r.def.id,level:r.level}),guardHost:id(s.guardArtsHost)}:null;
 const family=()=>((w.guardArts as any).states.get(p)??new Map()) as Map<SkillInstance,any>;
 let ended=0;
 const observe=(label:string)=>rows.push(JSON.parse(JSON.stringify({label,actor:id(p),time:w.time,dead:p.dead,downed:p.downed,life:p.life,mana:p.mana,
  casting:p.casting?{identity:id(p.casting),inst:packed(p.casting.inst),mode:p.casting.mode,held:p.casting.held,shield:p.casting.shield,elapsed:p.casting.elapsed}:null,
  bar:p.skills.map(packed),states:[...family()].map(([host,s])=>({identity:id(s),host:packed(host),key:s.key,policy:s.policy,
   plates:s.plates,plateClock:s.plateClock,lastCast:Number.isFinite(s.lastCast)?s.lastCast:null,contacts:[...s.contacts],intact:s.intact,broken:s.broken,blasts:s.blasts})),
  absorb:[...p.absorbLayers].map(([key,r])=>({key,identity:id(r),amount:r.amount,remaining:r.remaining,source:packed(r.source)})),
  interceptors:[...(p.lifeDamageInterceptors?.keys()??[])],buffs:[...p.buffs],sources:p.sheet.sourceNames().map(key=>[key,p.sheet.getSourceMods(key)]),
  visuals:w.guardArts.visuals,projectiles:w.projectiles.map(q=>({identity:id(q),owner:id(q.caster),inst:packed(q.inst)})),
  cooldowns:[...p.cooldowns],intervention:p.guardIntervention,savedIntervention:serializeCharacter(w).guardIntervention,ended})));
 const cast=()=>{p.useLock=0;p.cooldowns.clear();p.mana=p.maxMana();assert(w.useSkill(p,inst,{x:p.pos.x+100,y:p.pos.y},true));};
 const advance=(seconds:number)=>{for(let t=0;t<seconds-1e-9;t+=1/60){const dt=Math.min(1/60,seconds-t);w.time+=dt;w.guardArts.update(dt);p.updateTimers(dt);}};
 const watchEnds=()=>{for(const layer of p.absorbLayers.values()){const before=layer.ended;layer.ended=reason=>{ended++;before?.(reason);};}};
 return{w,p,inst,observe,cast,advance,family,watchEnds,ended:()=>ended};
}
try{
 {
  const h=setup(['measured_riposte','patient_hand','punishing_reply','loaded_bash','unbroken_answer','hollow_counter']),{w,p,inst}=h;
  h.cast();h.watchEnds();const state=h.family().get(inst),first=[...p.absorbLayers.values()][0];assert(first);h.observe('boosted-first-cast-layer-and-blast');
  h.advance(.4);const before=first.amount;assert.equal(spendAbsorbLayers(p,before/2),0);assert.equal(first.amount,before/2);h.observe('partial-spend-and-elapsed-time');
  w.recalcPlayer();assert.equal(h.family().get(inst),state);assert.equal([...p.absorbLayers.values()][0],first);h.observe('same-policy-retains-active-layer-identity');
  spendAbsorbLayers(p,p.absorbTotal);assert.equal(h.ended(),1);assert(state.broken.length>0);assert.equal(state.broken[0].power,2);h.observe('ending-original-layer-retains-cast-time-patience');
  h.cast();h.watchEnds();const second=[...p.absorbLayers.values()][0];assert(second&&second!==first);h.observe('immediate-recast-uses-current-patience-clock');
  h.advance(second.remaining+.01);assert.equal(h.ended(),2);assert(state.intact.length>0);assert.equal(state.intact.at(-1).power,1);h.observe('unboosted-layer-expires-intact-after-delayed-burst');
  h.advance(30);assert.equal(state.intact.length+state.broken.length,0);assert.equal(state.blasts.length,0);h.observe('outcomes-expire-and-blasts-drain');
  h.cast();h.watchEnds();assert([...p.absorbLayers.values()][0]);h.observe('patience-recovers-for-later-cast');
 }
 {
  const h=setup(['iron_shelter','reinforced_plate','broad_shelter','ready_watch','sheltered_thrust','shield_pump']),{w,p,inst}=h;
  h.cast();h.advance(2.1);const held=p.casting,state=h.family().get(inst);assert(held&&state.plates>0);h.observe('held-guard-continuation-start');
  w.recalcPlayer();h.advance(.45);assert.equal(p.casting,held);assert.equal(h.family().get(inst),state);h.observe('held-clock-and-plates-continue-after-rebuild');
  w.guardArts.lower(p,inst);h.observe('explicit-lower-resets-plates-without-cast-replacement');
  w.guardArts.raised(p,inst);h.advance(2.1);assert.equal(p.casting,held);h.observe('re-raised-guard-retains-held-identity');
 }
 {
  const h=setup(['measured_riposte','patient_hand','resetting_stance']),{w,p,inst}=h;
  p.life=10;p.mana=0;p.cooldowns.set('shield_up',999);w.recalcPlayer();assert.equal(landLifeDamage(p,20),0);h.observe('emergency-layer-and-durable-recovery');
  const state=h.family().get(inst),layer=[...p.absorbLayers.values()][0];assert(layer);h.advance(.25);w.recalcPlayer();assert.equal(h.family().get(inst),state);assert.equal([...p.absorbLayers.values()][0],layer);assert(p.guardIntervention.shield_up<300);h.observe('emergency-layer-continues-with-current-recovery');
 }
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-guard-continuation-draft/v1',notes:'Original synchronous continuation before a future private guard-state fork; diagnostic persisted inputs, not UI legality or a candidate-derived oracle',rows}),{flag:'wx'});
}finally{restore();}
