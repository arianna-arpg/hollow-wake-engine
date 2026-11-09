// Original-only continuity course. Observers delegate to the real execution
// method; no cast, grant, socket, input or projectile rule is replaced here.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {BAR_SLOTS,GRANT_CFG,makeSkillInstance,instanceMods,instanceDelivery,type SkillInstance} from '../src/engine/skills';
import {rollItem} from '../src/engine/itemgen';
import {skillDamageBands} from '../src/engine/damage';
import {serializeCharacter} from '../src/meta/character';
import type {World} from '../src/engine/world';

bootSimEngine();
const rows:unknown[]=[],scenarios=['socket','unsocket','same-host-level','replace-host','learned-takeover','remove-grant','unbind','held-same-host','held-replace-host'];
const json=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const readCast=(world:World)=>world.player.casting;
for(const [caseIndex,scenario] of scenarios.entries()){
 const restore=seedGlobalRandom(0x2f11+caseIndex);
 try{
  const w=makeSimWorld('magician',0x2f11+caseIndex),seat=w.localSeat,p=seat.actor,m=seat.meta;
  // These original private methods are exercised through their actual bodies.
  const native=w as any;
  w.walk=null;m.knownSkills.clear();m.equipped={};m.items=[];m.containers={};p.skills=Array(BAR_SLOTS).fill(null);
  w.recalcSeat(seat);p.fillResources();p.useLock=0;p.cooldowns.clear();p.casting=null;w.time=100;
  const ids=new WeakMap<object,number>();let serial=0;
  const identity=(value:object|null|undefined)=>{if(!value)return null;if(!ids.has(value))ids.set(value,++serial);return ids.get(value);};
  const packed=(inst:SkillInstance|null|undefined):unknown=>inst?{identity:identity(inst),id:inst.def.id,level:inst.level,bonus:inst.bonusLevels,
   sockets:inst.sockets.map(s=>s?{id:s.def.id,level:s.level,locked:s.locked,rolled:s.rolled}:null),treeNodes:inst.treeNodes,
   grafts:inst.grafts?.map(s=>({id:s.def.id,level:s.level})),host:inst.grantedHostUid,mods:instanceMods(inst),delivery:instanceDelivery(inst)}:null;
  const held=scenario.startsWith('held-');
  const first=rollItem({ilvl:20,uniqueId:'cindervigil'})!,second=rollItem({ilvl:20,uniqueId:'cindervigil'})!,ring=rollItem({ilvl:20,uniqueId:'emberbrand'})!;
  assert(first&&second&&ring&&GRANT_CFG.sockets>=2);
  const support=held?'gathered_casting':'splitting';
  first.grantState={firebolt:{sockets:Array(GRANT_CFG.sockets).fill(null)}};
  if(scenario!=='socket')first.grantState.firebolt.sockets[0]={supportId:support,level:2,locked:true};
  second.grantState={firebolt:{sockets:[{supportId:'piercing',level:3},...Array(GRANT_CFG.sockets-1).fill(null)]}};
  m.equipped.helmet=first;w.recalcSeat(seat);
  const original=seat.grantedInsts?.get('firebolt');assert(original);
  assert(w.bindSkill(2,'firebolt'));assert.equal(p.skills[2],original);p.fillResources();
  const delivered:any[]=[];
  const execute=native.executeSkill;
  native.executeSkill=function(actor:any,inst:SkillInstance,aim:any,options:any){
   delivered.push(json({instance:packed(inst),active:identity(actor.casting),time:w.time,life:actor.life,mana:actor.mana,
    aim,options,bands:skillDamageBands(actor,inst)}));
   return execute.call(this,actor,inst,aim,options);
  };
  const aim={x:p.pos.x+100,y:p.pos.y};
  assert(w.useSkill(p,original,aim,true));const cast=readCast(w);assert(cast);
  assert.equal(cast.inst,original);assert.equal(cast.mode,held?'channel':'cast');
  const advance=(dt:number)=>{w.time+=dt;native.updateCasting(p,dt);};
  advance(held?.4:cast.total/4);assert.equal(p.casting,cast);
  const clock={time:w.time,elapsed:cast.elapsed,channelTime:cast.channelTime,total:cast.total,paidCost:json(cast.paidCost??null)};
  const beforeSave=json(serializeCharacter(w));
  let draws=0;const seeded=Math.random;Math.random=()=>{draws++;return seeded();};
  const observe=(name:string,check:()=>void)=>{
   try{check();}catch(error){throw new Error(scenario+': '+name,{cause:error});}
   const save=serializeCharacter(w);
   rows.push(json({scenario,name,clock:w.time,draws,life:p.life,mana:p.mana,useLock:p.useLock,cooldowns:[...p.cooldowns],
    cast:p.casting?{identity:identity(p.casting),instance:packed(p.casting.inst),mode:p.casting.mode,held:p.casting.held,
     elapsed:p.casting.elapsed,channelTime:p.casting.channelTime,total:p.casting.total,paidCost:p.casting.paidCost}:null,
    bar:p.skills.map(packed),known:[...m.knownSkills].map(([id,inst])=>[id,packed(inst)]),
    grants:[...(seat.grantedInsts??[])].map(([id,inst])=>[id,packed(inst)]),
    items:save.items,equipped:save.equipped,learnedSave:save.knownSkills,barSave:save.bar,
    originalItem:first,delivery:delivered,
    projectiles:w.projectiles.map(q=>({instance:packed(q.inst),pos:q.pos,dir:q.dir,speed:q.speed,range:q.range,pierce:q.pierce,chains:q.chains,mult:q.mult}))}));
  };
  observe('active cast owns the granted instance',()=>assert.equal(cast.inst,original));
  if(scenario==='socket'){
   const item=w.grantSupportGemItem(seat,{def:SUPPORTS.splitting,level:2,locked:true});assert(item);
   assert(w.socketSupport(item.uid,'firebolt'));
   observe('socket surgery updates the casting instance and item residence',()=>{
    assert.equal(seat.grantedInsts?.get('firebolt'),original);assert.equal(cast.inst.sockets[0]?.def.id,'splitting');
    assert.equal(first.grantState?.firebolt.sockets[0]?.supportId,'splitting');assert(!m.items.some(i=>i.uid===item.uid));
   });
  }else if(scenario==='unsocket'){
   assert(w.unsocketSupport('firebolt',0));
   observe('unsocket surgery returns custody and updates the casting instance',()=>{
    assert.equal(cast.inst.sockets[0],null);assert.equal(first.grantState?.firebolt.sockets[0],null);
    assert.equal(m.items.filter(i=>i.gem?.kind==='support'&&i.gem.supportId==='splitting').length,1);
   });
  }else if(scenario==='same-host-level'||scenario==='held-same-host'){
   const level=original.level;m.equipped.ring1=ring;w.recalcSeat(seat);
   observe('same host retains identity while the cast sees the changed level',()=>{
    assert.equal(seat.grantedInsts?.get('firebolt'),original);assert(original.level>level);assert.equal(cast.inst.level,original.level);
   });
  }else if(scenario==='replace-host'||scenario==='held-replace-host'){
   m.equipped.helmet=second;w.recalcSeat(seat);
   observe('replacement changes the bar but the cast retains the former host',()=>{
    const next=seat.grantedInsts?.get('firebolt');assert(next&&next!==original);assert.equal(p.skills[2],next);
    assert.equal(next.grantedHostUid,second.uid);assert.equal(next.sockets[0]?.def.id,'piercing');
    assert.equal(cast.inst,original);assert.equal(original.grantedHostUid,first.uid);assert.equal(original.sockets[0]?.def.id,support);
   });
  }else if(scenario==='learned-takeover'){
   const learned=makeSkillInstance(SKILLS.firebolt,5,1);learned.sockets[0]={def:SUPPORTS.piercing,level:3};m.knownSkills.set('firebolt',learned);w.recalcSeat(seat);
   observe('learned takeover preserves separate casting and item investment',()=>{
    assert.equal(p.skills[2],learned);assert.equal(cast.inst,original);assert.equal(seat.grantedInsts?.get('firebolt'),original);
    assert.equal(first.grantState?.firebolt.sockets[0]?.supportId,'splitting');assert.equal(learned.sockets[0]?.def.id,'piercing');
   });
  }else if(scenario==='remove-grant'){
   m.equipped={};w.recalcSeat(seat);
   observe('retiring a grant clears its bar without cancelling its committed cast',()=>{assert(!seat.grantedInsts);assert.equal(p.skills[2],null);assert.equal(cast.inst,original);});
  }else{
   assert(w.bindSkill(2,null));
   observe('unbinding retains owned grant and committed cast',()=>{assert.equal(p.skills[2],null);assert.equal(seat.grantedInsts?.get('firebolt'),original);assert.equal(cast.inst,original);});
  }
  observe('build edit preserves cast identity clock payment and random continuation',()=>{
   assert.equal(p.casting,cast);assert.equal(w.time,clock.time);assert.equal(cast.elapsed,clock.elapsed);assert.equal(cast.channelTime,clock.channelTime);
   assert.equal(cast.total,clock.total);assert.deepEqual(cast.paidCost??null,clock.paidCost);assert.equal(draws,0);
  });
  if(held){
   const buttons=Array(BAR_SLOTS).fill(false);buttons[2]=true;
   w.applyInputs(new Map([[seat.id,{dx:0,dy:0,aim,held:buttons,edge:Array(BAR_SLOTS).fill(false)}]]),1/60);
   observe('held input follows exact identity rather than a replacement with the same id',()=>assert.equal(cast.held,scenario==='held-same-host'));
   // Release through the original input path, then let its native channel rule resolve.
   w.applyInputs(new Map([[seat.id,{dx:0,dy:0,aim,held:Array(BAR_SLOTS).fill(false),edge:Array(BAR_SLOTS).fill(false)}]]),1/60);
   advance(1/60);
  }else advance(cast.total);
  observe('completion executes the committed instance through the original projectile path',()=>{
   assert.equal(p.casting,null);assert.equal(delivered.length,1);assert.equal(delivered[0].instance.identity,identity(original));
   assert.equal(delivered[0].active,null);
   assert(w.projectiles.length>0,'completion must launch a projectile');
   // Cindervigil can also fire its authored Pyroclast proc. Record all flights,
   // but distinguish that separate payload from this committed Firebolt.
   const primary=w.projectiles.filter(q=>q.inst.def.id===original.def.id);
   assert(primary.length>0,'completion must launch the committed skill');
   assert.deepEqual(primary.map(q=>identity(q.inst)),primary.map(()=>identity(original)),'committed projectile instance identities');
  });
  observe('earlier exported save is detached from later investment and simulation',()=>{
   assert.equal(beforeSave.equipped?.helmet?.uid,first.uid);assert.equal(beforeSave.knownSkills.length,0);assert.equal(beforeSave.bar[2],'firebolt');
   assert.equal(beforeSave.equipped?.helmet?.grantState?.firebolt.sockets[0]?.supportId,scenario==='socket'?undefined:support);
  });
 }finally{restore();}
}
assert.equal(rows.length,47);
writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,scope:'Original equipment investment, active cast identity, actual input hold and projectile completion; no durable/native-host publication or hardware acceptance',scenarios,rows})+'\n',{flag:'wx'});
