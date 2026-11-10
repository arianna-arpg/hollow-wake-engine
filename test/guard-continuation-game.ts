// Installed-game component continuation course. The fixture prepares two real
// worlds and copies the explicitly exercised actor fields. This is not a generic
// World copier or the complete private character-build provider.
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance,type SkillInstance} from '../src/engine/skills';
import {mod} from '../src/engine/stats';
import {spendAbsorbLayers} from '../src/engine/absorb';
import {landLifeDamage} from '../src/engine/damage';
bootSimEngine();
const json=(value:unknown)=>JSON.parse(JSON.stringify(value));
function seeded<T>(fn:()=>T):T {const restore=seedGlobalRandom(0x4422);try{return fn();}finally{restore();}}
function setup(nodes:string[]){return seeded(()=>{
 const w=makeSimWorld('warrior',0x4422),p=w.player,meta=w.meta;
 w.actors=[p];w.walk=null;w.doodads=[];w.markDoodadsChanged();meta.equipped={};meta.items=[];meta.containers={};meta.knownSkills.clear();
 for(const stat of ['strength','dexterity','willpower','intelligence'] as const)meta.baseAttrs[stat]=100;
 const inst=makeSkillInstance(SKILLS.shield_up,20,3);inst.treeNodes=[...nodes];p.skills.fill(null);p.skills[0]=inst;meta.knownSkills.set(inst.def.id,inst);w.recalcPlayer();
 p.sheet.setSource('guard-private-rig',[mod('mana','flat',10000),mod('life','flat',10000),mod('armor','override',100),mod('critChance','override',0),mod('blockChance','override',0),mod('lifeRegen','override',0),mod('thorns','override',0)]);p.fillResources();
 const enemy=new Actor('Private guard target','enemy',{x:p.pos.x+8,y:p.pos.y});enemy.sheet.setBase('life',100000);enemy.sheet.setBase('armor',0);enemy.fillResources();w.actors.push(enemy);
 const cast=()=>{p.useLock=0;p.cooldowns.clear();p.mana=p.maxMana();assert(w.useSkill(p,inst,{x:p.pos.x+100,y:p.pos.y},true));};
 const advance=(seconds:number)=>{for(let t=0;t<seconds-1e-9;t+=1/60){const dt=Math.min(1/60,seconds-t);w.time+=dt;w.guardArts.update(dt);p.updateTimers(dt);}};
 return{w,p,inst,enemy,cast,advance,state:()=>w.guardArts.state.owners.get(p)!.get(inst)!};
});}
type Fixture=ReturnType<typeof setup>;
function capture(h:Fixture){const{w,p,enemy}=h,s=h.state();return json({time:w.time,nextSource:w.guardArts.state.nextSource,
 actor:{id:p.id,life:p.life,mana:p.mana,shield:p.es,dead:p.dead,downed:p.downed,pos:p.pos,facing:p.facing,intervention:p.guardIntervention,
  cooldowns:[...p.cooldowns],useLock:p.useLock,casting:p.casting?{...p.casting,inst:p.casting.inst.def.id}:null,
  buffs:[...p.buffs],sources:p.sheet.sourceNames().map(key=>[key,p.sheet.getSourceMods(key)]),
  layers:[...p.absorbLayers].map(([key,l])=>({key,amount:l.amount,remaining:l.remaining,source:l.source.def.id})),interceptors:[...(p.lifeDamageInterceptors?.keys()??[])]},
 state:{key:s.key,policy:s.policy,plates:s.plates,clock:s.plateClock,lastCast:Number.isFinite(s.lastCast)?s.lastCast:null,contacts:[...s.contacts],intact:s.intact,broken:s.broken,blasts:s.blasts},
 visuals:w.guardArts.visuals,flashes:w.flashes,enemy:{id:enemy.id,life:enemy.life,es:enemy.es,dead:enemy.dead,pos:enemy.pos},
 projectiles:w.projectiles.map(q=>({caster:q.caster.id,host:q.inst.guardArtsHost?.def.id,def:q.inst.def.id,pos:q.pos}))});}
function preparePrivate(source:Fixture,nodes:string[]):Fixture {
 const target=setup(nodes),{p,w}=target,before=capture(source),liveState=source.state(),liveCast=source.p.casting,liveLayer=[...source.p.absorbLayers.values()][0];
 w.guardArts.clearAll();
 const skills=new Map<SkillInstance,SkillInstance>();
 const mapSkill=(inst:SkillInstance):SkillInstance=>{
  const found=skills.get(inst);if(found)return found;
  const {def,sockets,grafts,guardArtsHost,...data}=inst;
  for(const key of ['sequenceHost','challengeHost','followUpHost','invocationHost'])assert(!(data as any)[key],'Fixture needs an explicit mapping for this payload owner');
  const copy=inst===source.inst?target.inst:{} as SkillInstance;skills.set(inst,copy);
  const support=(row:NonNullable<SkillInstance['sockets'][number]>)=>{const {def,...value}=row;return{def,...structuredClone(value)};};
  Object.assign(copy,structuredClone(data),{def:inst.guardArtsPayload?structuredClone(def):def,sockets:sockets.map(row=>row&&support(row)),
   ...(grafts?{grafts:grafts.map(support)}:{}),...(guardArtsHost?{guardArtsHost:mapSkill(guardArtsHost)}:{})});return copy;
 };
 mapSkill(source.inst);
 for(const[a,b]of [[source.p,p],[source.enemy,target.enemy]]){
  for(const key of ['id','life','mana','es','dead','downed','invulnerable','radius','tier','team','facing','useLock','recentHurt','gaugeSampleIn'] as const)(b as any)[key]=a[key];
  b.pos={...a.pos};b.since=structuredClone(a.since);b.cooldowns=new Map(a.cooldowns);b.guardIntervention={...a.guardIntervention};
  b.buffs=new Map([...a.buffs].map(([key,value])=>[key,structuredClone(value)]));
  for(const key of b.sheet.sourceNames())b.sheet.removeSource(key);
  for(const key of a.sheet.sourceNames())b.sheet.setSource(key,structuredClone(a.sheet.getSourceMods(key)!));
  const native=a.sheet as any;for(const[key,value]of native.baseOverrides)b.sheet.setBase(key,value);b.sheet.setConditions([...native.conditions]);b.sheet.setGauges([...native.gauges]);
 }
 p.skills=source.p.skills.map(inst=>inst&&mapSkill(inst));p.absorbLayers=new Map();p.lifeDamageInterceptors=new Map();
 p.casting=source.p.casting?{...structuredClone({...source.p.casting,inst:null}),inst:mapSkill(source.p.casting.inst)}:null;
 w.meta.knownSkills=new Map([...source.w.meta.knownSkills].map(([key,inst])=>[key,mapSkill(inst)]));w.time=source.w.time;w.flashes=structuredClone(source.w.flashes);
 const actors=new Map([[source.p,p],[source.enemy,target.enemy]]);
 w.projectiles=source.w.projectiles.map(({caster,inst,emit,suffuse,...data})=>{
  const owner=actors.get(caster);assert(owner,'Fixture needs the projectile caster');assert(!data.parryDamage,'Fixture has no reflected packet graph');
  return{...structuredClone(data),caster:owner,inst:mapSkill(inst),...(emit?{emit:{...structuredClone({...emit,inst:null}),inst:mapSkill(emit.inst)}}:{}),
   ...(suffuse?{suffuse:{...structuredClone({...suffuse,inst:null}),inst:mapSkill(suffuse.inst)}}:{})};
 });
 const controller=w.guardArts;
 assert.equal(source.w.guardArts.copyOwnedStateTo(controller,{actor:a=>{const found=actors.get(a);assert(found);return found;},skill:mapSkill,spec:structuredClone}),controller);
 assert.equal(w.guardArts,controller);
 assert.deepEqual(capture(source),before,'Preparation changed the live guard');assert.equal(source.state(),liveState);assert.equal(source.p.casting,liveCast);assert.equal([...source.p.absorbLayers.values()][0],liveLayer);
 assert.deepEqual(capture(target),before,'Private state does not retain the complete observed guard continuation');
 assert.notEqual(target.state(),liveState);if(liveCast){assert.notEqual(p.casting,liveCast);assert.equal(p.casting!.inst,p.skills[0]);}
 if(liveLayer)assert.notEqual([...p.absorbLayers.values()][0].ended,liveLayer.ended);
 for(let i=0;i<w.projectiles.length;i++){const q=w.projectiles[i],live=source.w.projectiles[i];assert.notEqual(q,live);assert.notEqual(q.inst,live.inst);assert.notEqual(q.hits,live.hits);assert.equal(q.caster,p);if(live.inst.guardArtsHost)assert.equal(q.inst.guardArtsHost,p.skills[0]);}
 return target;
}
let stages=0;
function compareStep(live:Fixture,privateWorld:Fixture,step:(h:Fixture)=>void){
 const before=capture(live);seeded(()=>step(privateWorld));assert.deepEqual(capture(live),before,'Private gameplay changed the live guard');
 seeded(()=>step(live));assert.deepEqual(capture(privateWorld),capture(live),'Forked game continuation differs from the uninterrupted control');stages++;
}
{
 const nodes=['measured_riposte','patient_hand','punishing_reply','loaded_bash','unbroken_answer','hollow_counter'];
 const live=setup(nodes);seeded(()=>{live.cast();live.advance(.1);spendAbsorbLayers(live.p,live.p.absorbTotal/2);});
 const privateWorld=preparePrivate(live,nodes);assert(live.state().blasts.length>0);
 compareStep(live,privateWorld,h=>{spendAbsorbLayers(h.p,h.p.absorbTotal);});assert.equal(privateWorld.state().broken[0].power,2);assert(privateWorld.enemy.life<100000);
 compareStep(live,privateWorld,h=>h.advance(.4));compareStep(live,privateWorld,h=>h.cast());
 const remaining=[...live.p.absorbLayers.values()][0].remaining;compareStep(live,privateWorld,h=>h.advance(remaining+.01));assert.equal(privateWorld.state().intact.at(-1)!.power,1);
 compareStep(live,privateWorld,h=>h.advance(30));assert.equal(privateWorld.state().blasts.length,0);
}
{
 const nodes=['iron_shelter','reinforced_plate','broad_shelter','ready_watch','sheltered_thrust','shield_pump'];
 const live=setup(nodes);seeded(()=>{live.cast();live.advance(2.1);});const privateWorld=preparePrivate(live,nodes);assert(live.state().plates>0);
 compareStep(live,privateWorld,h=>h.advance(.45));compareStep(live,privateWorld,h=>h.w.guardArts.lower(h.p,h.inst));
 compareStep(live,privateWorld,h=>{h.w.guardArts.raised(h.p,h.inst);h.advance(2.1);});
 compareStep(live,privateWorld,h=>{h.inst.level++;h.w.guardArts.sync(h.p);});assert.equal(privateWorld.w.projectiles.length,0);
}
{
 const nodes=['measured_riposte','patient_hand','resetting_stance'];const live=setup(nodes);live.p.life=10;live.p.mana=0;live.p.cooldowns.set('shield_up',999);
 const privateWorld=preparePrivate(live,nodes);
 compareStep(live,privateWorld,h=>assert.equal(landLifeDamage(h.p,20),0));assert(privateWorld.p.guardIntervention.shield_up>0);assert(privateWorld.p.absorbTotal>0);
 compareStep(live,privateWorld,h=>h.advance(.25));
}
assert.equal(stages,11);console.log('Guard private game continuation: 3 courses, 11 stages passed');
