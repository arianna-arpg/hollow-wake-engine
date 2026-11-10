// Installed-game component continuation with two real game worlds. This fixture copies
// only its declared graph and refuses other payload families. It is not a World
// copier, save format, or authority to publish a prepared build into a live game.
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import type {Actor} from '../src/engine/actor';
import {makeSkillInstance,type SkillInstance} from '../src/engine/skills';
bootSimEngine();
const json=(value:unknown)=>JSON.parse(JSON.stringify(value));
function seeded<T>(fn:()=>T):T{const restore=seedGlobalRandom(0x7724);try{return fn();}finally{restore();}}
function setup(){return seeded(()=>{
 const w=makeSimWorld('tamer',0x7724);w.grantStartingCompanions();w.walk=null;
 const p=w.player,pet=w.actors.find(a=>a.companion&&a.owner===p);assert(pet);w.actors=[p,pet];
 const host=p.skills.find(i=>i?.def.id==='tame_beast');assert(host);host.level=20;host.treeNodes=['gentle_claim','focused_claim','returning_claim','swift_claim','swift_instinct','swift_pour'];w.recalcPlayer();
 return{w,p,pet,host,state:()=>w.companionBonds.state.bodies.get(pet),advance:(dt:number)=>{w.time+=dt;w.companionBonds.update(dt);}};
});}
type Fixture=ReturnType<typeof setup>;
function capture(h:Fixture){
 const skills:SkillInstance[]=[],skill=(i:SkillInstance|null|undefined)=>{if(!i)return null;let at=skills.indexOf(i);if(at<0){at=skills.length;skills.push(i);}return at;};
 const actors=h.w.actors.map(a=>({id:a.id,owner:a.owner?.id,source:a.sourceSkillId,life:a.life,mana:a.mana,es:a.es,maxLife:a.maxLife(),plies:a.plies,pliesMax:a.pliesMax,level:a.level,dead:a.dead,downed:a.downed,dormant:a.companionDormant,
  revival:a.companionReviveRemaining,dwell:a.companionReviveDwell,pos:a.pos,radius:a.radius,guard:a.guardMode,stance:a.standingOrder,bequest:a.bequestSignature,
  skills:a.skills.map(skill),casting:a.casting?{...a.casting,inst:skill(a.casting.inst)}:null,cooldowns:[...a.cooldowns],buffs:[...a.buffs],statuses:a.statuses,expired:a.expiredStatuses,
  sources:a.sheet.sourceNames().map(key=>[key,a.sheet.getSourceMods(key)])}));
 const bodies=[...h.w.companionBonds.state.bodies].map(([a,s])=>({actor:a.id,inst:skill(s.inst),native:s.native.map(skill),granted:[...s.granted].map(([key,i])=>[key,skill(i)]),spec:s.spec,policy:s.policy,sheet:s.sheet,baseRadius:s.baseRadius,claimedLevel:s.claimedLevel,stance:s.stanceId,
  orbAt:s.orbAt,chargeAt:s.chargeAt,echoAt:s.echoAt,dreadAt:s.dreadAt,exposure:[...s.exposure].map(([target,n])=>[target.id,n]),pulseUntil:s.pulseUntil,pulseAt:s.pulseAt,issued:[...s.issued].map(skill)}));
 const repeats=h.w.pendingRepeats.map(({caster,inst,...data})=>({...data,caster:caster.id,inst:skill(inst)})),known=[...h.w.meta.knownSkills].map(([key,i])=>[key,skill(i)]);skill(h.host);
 return json({time:h.w.time,actors,bodies,repeats,known,flashes:h.w.flashes,skills:skills.map(i=>({def:i.def.id,level:i.level,nodes:i.treeNodes,sockets:i.sockets.map(s=>s&&[s.def.id,s.level]),state:i.state,marked:h.w.companionBonds.state.copies.has(i)}))});
}
function preparePrivate(source:Fixture):Fixture{
 const target=setup(),before=capture(source),liveState=source.state(),controller=target.w.companionBonds;
 assert.equal(source.w.projectiles.length+source.w.pendingFuses.length+source.w.zones.length,0,'Fixture requires explicit mapping for other payload families');
 const actors=new Map<Actor,Actor>([[source.p,target.p],[source.pet,target.pet]]),skills=new Map<SkillInstance,SkillInstance>();
 const skill=(inst:SkillInstance):SkillInstance=>{
  let copy=skills.get(inst);if(copy)return copy;const {def,sockets,grafts,...data}=inst;
  for(const key of ['sequenceHost','challengeHost','followUpHost','invocationHost','guardArtsHost'])assert(!(data as any)[key],'Fixture requires explicit payload-owner mapping');
  copy=inst===source.host?target.host:{} as SkillInstance;skills.set(inst,copy);
  const support=(row:NonNullable<SkillInstance['sockets'][number]>)=>{const{def,...data}=row;return{def,...structuredClone(data)};};
  Object.assign(copy,structuredClone(data),{def,sockets:sockets.map(s=>s&&support(s)),...(grafts?{grafts:grafts.map(support)}:{})});return copy;
 };
 skill(source.host);
 for(const[a,b]of actors){
  for(const key of ['id','life','mana','es','dead','downed','companion','companionDormant','companionReviveRemaining','companionReviveDwell','radius','level','plies','pliesMax','guardMode','bequestSignature','bondGroup','sourceSkillId','defId','rarity','name','spawnScale','passive','ambushArmed','untargetable','aiAwakened','hiveDeathPlies','assaultWardCount','tier','team','facing','useLock'] as const)(b as any)[key]=a[key];
  b.owner=a.owner?actors.get(a.owner):undefined;if(a.owner)assert(b.owner);
  b.pos={...a.pos};b.cooldowns=new Map(a.cooldowns);b.buffs=structuredClone(a.buffs);b.statuses=structuredClone(a.statuses);b.expiredStatuses=structuredClone(a.expiredStatuses);b.plySpec=structuredClone(a.plySpec);b.standingOrder=structuredClone(a.standingOrder);
  b.skills=a.skills.map(i=>i&&skill(i));b.casting=a.casting?{...structuredClone({...a.casting,inst:null}),inst:skill(a.casting.inst)}:null;
  b.summonInst=a.summonInst?skill(a.summonInst):undefined;
  for(const key of b.sheet.sourceNames())b.sheet.removeSource(key);
  for(const key of a.sheet.sourceNames())b.sheet.setSource(key,structuredClone(a.sheet.getSourceMods(key)!));
  const sheet=a.sheet as any;for(const[key,value]of sheet.baseOverrides)b.sheet.setBase(key,value);b.sheet.setConditions([...sheet.conditions]);b.sheet.setGauges([...sheet.gauges]);
 }
 for(const s of source.w.companionBonds.state.bodies.values()){skill(s.inst);s.native.forEach(i=>i&&skill(i));s.granted.forEach(skill);s.issued.forEach(skill);for(const a of s.exposure.keys())assert(actors.has(a),'Unmapped exposure target');}
 target.w.meta.knownSkills=new Map([...source.w.meta.knownSkills].map(([key,i])=>[key,skill(i)]));
 target.w.pendingRepeats=source.w.pendingRepeats.map(({caster,inst,...data})=>{const owner=actors.get(caster);assert(owner);return{...structuredClone(data),caster:owner,inst:skill(inst)};});
 target.w.time=source.w.time;target.w.flashes=structuredClone(source.w.flashes);
 // Discard only this fresh fixture's initial controller records. Actor state is
 // explicitly replaced above; this is not a production controller-reset API.
 controller.state.bodies.clear();assert.equal(source.w.companionBonds.copyOwnedStateTo(controller,{actors,skills,spec:structuredClone}),controller);
 assert.equal(target.w.companionBonds,controller);assert.deepEqual(capture(source),before);assert.equal(source.state(),liveState);assert.deepEqual(capture(target),before);
 if(liveState){assert.notEqual(target.state(),liveState);assert.equal(target.state()!.inst,target.host);}
 for(let n=0;n<target.w.pendingRepeats.length;n++){const live=source.w.pendingRepeats[n],copy=target.w.pendingRepeats[n];assert.notEqual(copy,live);assert.equal(copy.caster,actors.get(live.caster));assert.equal(copy.inst,skills.get(live.inst));assert.notEqual(copy.inst,live.inst);}
 return target;
}
let stages=0;
function compare(live:Fixture,privateGame:Fixture,step:(h:Fixture)=>void){const before=capture(live);seeded(()=>step(privateGame));assert.deepEqual(capture(live),before,'Private operation changed the live companion');seeded(()=>step(live));assert.deepEqual(capture(privateGame),capture(live),'Private companion differs from uninterrupted continuation');stages++;}
function startCopy(h:Fixture){h.w.time=h.state()!.echoAt;h.w.companionBonds.onCast(h.p,makeSkillInstance(SKILLS.claw),h.p.pos);const row=h.w.pendingRepeats.find(r=>r.caster===h.pet);assert(row);h.w.pendingRepeats.push({...row,caster:h.p});return row;}
{
 const live=setup();startCopy(live);live.pet.life=Math.max(1,live.pet.maxLife()/3);live.pet.plies=Math.max(0,live.pet.pliesMax-1);
 const privateGame=preparePrivate(live);
 compare(live,privateGame,h=>{h.w.pendingRepeats=h.w.pendingRepeats.filter(r=>r.caster!==h.pet);h.advance(0);assert.equal(h.state()!.issued.size,0);});
 compare(live,privateGame,h=>{h.w.time=h.state()!.echoAt+1;const at=h.state()!.echoAt;h.w.companionBonds.onCast(h.p,h.w.pendingRepeats[0].inst,h.p.pos);assert.equal(h.state()!.echoAt,at);assert.equal(h.w.pendingRepeats.length,1);});
 compare(live,privateGame,h=>{h.w.companionBonds.onCast(h.p,{...h.w.pendingRepeats[0].inst},h.p.pos);const row=h.w.pendingRepeats.find(r=>r.caster===h.pet);assert(row);h.w.pendingRepeats.push({...row,caster:h.p});assert.equal(h.state()!.issued.size,1);});
 compare(live,privateGame,h=>{h.host.treeNodes!.reverse();h.w.companionBonds.refresh();assert.equal(h.w.pendingRepeats.length,2);assert(h.w.pendingRepeats.every(r=>r.caster===h.p));assert.equal(h.state()!.issued.size,0);});
 compare(live,privateGame,h=>{h.w.time=h.state()!.echoAt+1;h.w.companionBonds.onCast(h.p,h.w.pendingRepeats[0].inst,h.p.pos);assert.equal(h.state()!.issued.size,0);});
 compare(live,privateGame,h=>{h.p.skills=h.p.skills.map(i=>i===h.host?null:i);h.w.companionBonds.refresh();assert.equal(h.state(),undefined);});
 compare(live,privateGame,h=>{h.p.skills[0]=h.host;h.w.companionBonds.refresh();h.w.time=h.state()!.echoAt+1;h.w.companionBonds.onCast(h.p,h.w.pendingRepeats[0].inst,h.p.pos);assert.equal(h.state()!.issued.size,0);});
}
{
 const live=setup();startCopy(live);live.p.skills=live.p.skills.map(i=>i===live.host?null:i);live.w.companionBonds.refresh();assert.equal(live.state(),undefined);
 const privateGame=preparePrivate(live);
 compare(live,privateGame,h=>{h.p.skills[0]=h.host;h.w.companionBonds.refresh();assert(h.state());});
 compare(live,privateGame,h=>{h.w.time=h.state()!.echoAt+1;h.w.companionBonds.onCast(h.p,h.w.pendingRepeats[0].inst,h.p.pos);assert.equal(h.state()!.issued.size,0);assert.equal(h.w.pendingRepeats.length,1);});
 compare(live,privateGame,h=>{h.w.companionBonds.onCast(h.p,makeSkillInstance(SKILLS.claw),h.p.pos);assert.equal(h.state()!.issued.size,1);assert.equal(h.w.pendingRepeats.length,2);});
}
{
 const live=setup();assert(live.state()!.spec.reviveSeconds);live.pet.downed=true;live.pet.life=0;live.pet.companionReviveRemaining=.25;live.pet.applyStatus('poison',2,1,'private fixture');assert(live.pet.statuses.some(s=>s.id==='poison'));
 const privateGame=preparePrivate(live);
 compare(live,privateGame,h=>{h.advance(.1);assert(h.pet.downed);assert.equal(h.pet.companionReviveRemaining,.15);});
 compare(live,privateGame,h=>{h.advance(.15);assert(!h.pet.downed);assert.equal(h.pet.life,h.pet.maxLife());assert(!h.pet.statuses.some(s=>s.id==='poison'));});
}
{
 const live=setup(),native=live.state()!.native.find(i=>i?.def.effects.some(e=>e.type==='damage'));assert(native);
 assert(seeded(()=>live.w.useSkill(live.pet,native,{x:live.pet.pos.x+20,y:live.pet.pos.y},true)));assert(live.pet.casting);assert.equal(live.pet.casting.inst,native);
 live.pet.casting.elapsed=live.pet.casting.total*.35;live.pet.life=live.pet.maxLife()*.4;
 const privateGame=preparePrivate(live);
 const retain=(h:Fixture,change:()=>void)=>{const cast=h.pet.casting;assert(cast);const elapsed=cast.elapsed;change();assert.equal(h.pet.casting,cast);assert.equal(cast.elapsed,elapsed);assert(h.state()!.native.includes(cast.inst));assert(h.pet.skills.includes(cast.inst));};
 compare(live,privateGame,h=>retain(h,()=>h.w.companionBonds.refresh()));
 compare(live,privateGame,h=>retain(h,()=>{h.host.treeNodes!.reverse();h.w.companionBonds.refresh();}));
 compare(live,privateGame,h=>retain(h,()=>{const fraction=h.pet.life/h.pet.maxLife(),level=h.pet.level;h.p.level+=20;h.w.companionBonds.refresh();assert(h.pet.level>level);assert(Math.abs(h.pet.life/h.pet.maxLife()-fraction)<1e-12);}));
}
assert.equal(stages,15);console.log('Companion private game continuation: 4 courses, 15 stages passed');
