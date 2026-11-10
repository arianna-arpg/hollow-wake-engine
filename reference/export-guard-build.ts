// Original-only exploratory capture. Not an accepted baseline or SDK contract.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';
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
  const h=setup(['iron_shelter','reinforced_plate','broad_shelter','ready_watch','sheltered_thrust','shield_pump']),{w,p,inst}=h;
  h.cast();h.advance(2.1);assert(p.buffs.size>0);assert(w.projectiles.some(q=>q.inst.guardArtsHost===inst));
  const held=p.casting,state=h.family().get(inst);assert(held&&state.plates>0);h.observe('held-guard-with-plates-and-authored-wave');
  w.recalcPlayer();assert.equal(p.casting,held);assert.equal(h.family().get(inst),state);h.observe('same-policy-rebuild-retains-guard-clock-and-wave');
  p.sheet.setConditions(['lowLife']);p.sheet.setGauges([['diagnostic-guard',2]]);w.recalcPlayer();
  assert.equal(h.family().get(inst),state);h.observe('stat-context-change-does-not-change-policy-identity');
  inst.treeNodes!.reverse();w.recalcPlayer();assert.notEqual(h.family().get(inst),state);assert.equal(p.casting,held);
  assert(!w.projectiles.some(q=>q.inst.guardArtsHost===inst));h.observe('tree-order-change-retires-effects-but-retains-held-cast');
  h.advance(2.1);h.observe('retained-held-cast-can-rebuild-new-plates');
  inst.sockets[0]={def:SUPPORTS.widening,level:1};w.recalcPlayer();assert.equal(p.casting,held);h.observe('socket-policy-change-retires-plate-state');
  p.skills.fill(null);w.recalcPlayer();assert.equal(h.family().size,0);h.observe('unbound-guard-clears-state');
 }
 {
  const h=setup(['measured_riposte','loaded_bash','unbroken_answer','hollow_counter']),{w,p,inst}=h;
  h.cast();h.advance(.1);h.watchEnds();const state=h.family().get(inst),layer=[...p.absorbLayers.values()][0];assert(layer);h.observe('absorb-cast-has-owned-layer-and-delayed-blast');
  w.recalcPlayer();assert.equal(h.family().get(inst),state);assert.equal([...p.absorbLayers.values()][0],layer);h.observe('same-policy-rebuild-retains-layer-and-delayed-blast');
  spendAbsorbLayers(p,p.absorbTotal);assert.equal(h.ended(),1);assert(p.sheet.get('satelliteCount_shelter_thorns')>0);h.observe('broken-layer-grants-authored-outcome');
  h.cast();h.watchEnds();inst.level++;w.recalcPlayer();assert.equal(p.absorbLayers.size,0);assert.equal(h.ended(),1);
  assert.equal(p.sheet.get('satelliteCount_shelter_thorns'),0);h.observe('level-change-clears-layer-outcomes-and-blast-without-end-callback');
  h.cast();h.watchEnds();p.downed=true;w.recalcPlayer();assert.equal(h.family().size,0);assert.equal(p.absorbLayers.size,0);assert.equal(h.ended(),1);h.observe('downed-rebuild-clears-owned-effects-without-outcome-rewards');
  p.downed=false;w.recalcPlayer();h.cast();p.dead=true;w.recalcPlayer();assert.equal(h.family().size,0);h.observe('dead-rebuild-clears-owned-effects');
 }
 {
  const h=setup(['measured_riposte','patient_hand','resetting_stance']),{w,p,inst}=h;
  p.life=10;p.mana=0;p.cooldowns.set('shield_up',999);w.recalcPlayer();assert(p.lifeDamageInterceptors?.size);h.observe('rebuild-installs-lethal-interceptor');
  assert.equal(landLifeDamage(p,20),0);assert.equal(p.guardIntervention.shield_up,300);h.observe('intervention-stamps-durable-recovery-before-emergency-cast');
  inst.treeNodes=['measured_riposte'];w.recalcPlayer();assert.equal(p.lifeDamageInterceptors?.size,0);assert.equal(p.guardIntervention.shield_up,300);h.observe('removing-intervention-retires-hook-without-resetting-recovery');
  inst.treeNodes=['measured_riposte','patient_hand','resetting_stance'];w.recalcPlayer();assert(p.lifeDamageInterceptors?.size);assert.equal(p.guardIntervention.shield_up,300);h.observe('restoring-intervention-retains-recovery');
 }
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-guard-build-diagnostic-draft/v1',notes:'Original World rebuilds with authored Shield Up disciplines and explicit persisted tree/rigger inputs; not UI legality or full combat extraction',rows}),{flag:'wx'});
}finally{restore();}
