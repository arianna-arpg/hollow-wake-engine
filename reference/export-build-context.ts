// Original-only diagnostic context course. Real authored equipment and casting
// execute unchanged; explicit diagnostic stat inputs expose rebuild dependencies.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {rollItem} from '../src/engine/itemgen';import {BAR_SLOTS,GRANT_CFG,instanceMods,type SkillInstance} from '../src/engine/skills';
import type {World} from '../src/engine/world';
import {serializeCharacter} from '../src/meta/character';import {skillDamageBands} from '../src/engine/damage';
bootSimEngine();const restore=seedGlobalRandom(0x7721),copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const readCast=(world:World)=>world.player.casting;
const rows:unknown[]=[],identities=new WeakMap<object,number>();let serial=0;
const identity=(value:object|null|undefined)=>{if(!value)return null;if(!identities.has(value))identities.set(value,++serial);return identities.get(value);};
try{
 const w=makeSimWorld('magician',0x7721),p=w.player,m=w.meta,seat=w.localSeat,native=w as any;
 w.walk=null;m.knownSkills.clear();m.equipped={};m.items=[];m.containers={};p.skills=Array(BAR_SLOTS).fill(null);
 w.recalcSeat(seat);p.fillResources();p.useLock=0;p.cooldowns.clear();p.casting=null;w.time=100;
 const first=rollItem({ilvl:20,uniqueId:'cindervigil'})!,second=rollItem({ilvl:20,uniqueId:'cindervigil'})!,ring=rollItem({ilvl:20,uniqueId:'emberbrand'})!;
 assert(first&&second&&ring&&GRANT_CFG.sockets>=2);
 first.grantState={firebolt:{sockets:[{supportId:'splitting',level:2,locked:true},...Array(GRANT_CFG.sockets-1).fill(null)]}};
 second.grantState={firebolt:{sockets:[{supportId:'piercing',level:3},...Array(GRANT_CFG.sockets-1).fill(null)]}};
 m.equipped.helmet=first;
 p.sheet.setBase('life',321);p.sheet.setBase('mana',231);p.sheet.setBase('skillgrant_firebolt',2);
 p.sheet.setSource('diagnostic-context',[
  {stat:'skillgrant_firebolt',kind:'flat',value:3,when:'lowLife'},
  {stat:'skillgrant_firebolt',kind:'flat',value:2,gauge:'diagnostic-build'},
  {stat:'life',kind:'flat',value:17,when:'lowLife'},
 ]);
 p.sheet.setConditions([]);p.sheet.setGauges([['diagnostic-build',0]]);w.recalcSeat(seat);p.fillResources();
 const original=seat.grantedInsts?.get('firebolt');assert(original);assert(w.bindSkill(2,'firebolt'));assert.equal(p.skills[2],original);
 const packed=(inst:SkillInstance|null|undefined)=>inst?{identity:identity(inst),id:inst.def.id,level:inst.level,bonus:inst.bonusLevels,
  host:inst.grantedHostUid,sockets:inst.sockets.map(s=>s?{id:s.def.id,level:s.level,locked:s.locked,rolled:s.rolled}:null),
  treeNodes:inst.treeNodes,grafts:inst.grafts?.map(s=>({id:s.def.id,level:s.level})),mods:instanceMods(inst)}:null;
 const deliveries:unknown[]=[],execute=native.executeSkill;
 native.executeSkill=function(actor:any,inst:SkillInstance,aim:any,options:any){
  deliveries.push(copy({time:w.time,inst:packed(inst),casting:identity(actor.casting),life:actor.life,mana:actor.mana,bands:skillDamageBands(actor,inst)}));
  return execute.call(this,actor,inst,aim,options);
 };
 let draws=0;const seeded=Math.random;Math.random=()=>{draws++;return seeded();};
 const observe=(label:string)=>{
  const sheet=p.sheet as any,cast=p.casting,save=serializeCharacter(w);
  rows.push(copy({label,time:w.time,draws,actor:{level:p.level,life:p.life,mana:p.mana,useLock:p.useLock,cooldowns:[...p.cooldowns]},
   rawSheet:{bases:[...sheet.baseOverrides],conditions:[...sheet.conditions],gauges:[...sheet.gauges],sources:p.sheet.sourceNames().map(id=>[id,p.sheet.getSourceMods(id)])},
   reads:Object.fromEntries(['life','mana','damage','accuracy','skillgrant_firebolt'].map(id=>[id,p.sheet.get(id)])),attributes:m.attrs,
   cast:cast?{identity:identity(cast),inst:packed(cast.inst),elapsed:cast.elapsed,total:cast.total,paidCost:cast.paidCost}:null,
   grants:[...(seat.grantedInsts??[])].map(([id,inst])=>[id,packed(inst)]),bar:p.skills.map(packed),equipped:save.equipped,
   deliveries,projectiles:w.projectiles.map(q=>({inst:packed(q.inst),pos:q.pos,dir:q.dir,mult:q.mult}))}));
 };
 observe('cold-build-retains-nonderived-sheet-context');
 assert(w.useSkill(p,original,{x:p.pos.x+100,y:p.pos.y},true));const cast=readCast(w);assert(cast&&cast.inst===original);
 const advance=(dt:number)=>{w.time+=dt;native.updateCasting(p,dt);};advance(cast.total/4);assert.equal(p.casting,cast);
 observe('paid-cast-before-context-change');const initialLevel=original.level;
 p.sheet.setConditions(['lowLife']);p.sheet.setGauges([['diagnostic-build',2]]);
 p.life=p.maxLife()*.4;p.mana=p.maxMana()*.6;p.cooldowns.set('diagnostic-context',2.25);p.useLock=.21;
 observe('context-changes-before-rebuild-grant-still-has-old-level');assert.equal(original.level,initialLevel);
 const frozen={time:w.time,elapsed:cast.elapsed,total:cast.total,paidCost:copy(cast.paidCost??null),draws};
 w.recalcSeat(seat);assert.equal(seat.grantedInsts?.get('firebolt'),original);assert(original.level>initialLevel);
 observe('warm-rebuild-reads-current-context-and-retains-cast');
 assert.equal(w.time,frozen.time);assert.equal(cast.elapsed,frozen.elapsed);assert.equal(cast.total,frozen.total);assert.deepEqual(cast.paidCost??null,frozen.paidCost);assert.equal(draws,frozen.draws);
 p.life=p.maxLife()+40;p.mana=p.maxMana()+40;p.level=23;m.equipped.ring1=ring;w.recalcSeat(seat);
 assert(p.life<=p.maxLife()&&p.mana<=p.maxMana());assert.equal(p.casting,cast);assert.equal(cast.inst,original);
 observe('authored-gear-and-level-rebuild-retains-current-resources');
 p.life=p.maxLife()+40;p.mana=p.maxMana()+40;w.recalcSeat(seat);
 assert.equal(p.life,p.maxLife());assert.equal(p.mana,p.maxMana());assert.equal(p.casting,cast);
 observe('repeated-build-clamps-overfull-current-resources');
 p.sheet.setConditions([]);p.sheet.setGauges([['diagnostic-build',0]]);p.sheet.setBase('skillgrant_firebolt',0);w.recalcSeat(seat);
 assert.equal(seat.grantedInsts?.get('firebolt'),original);assert.equal(p.casting,cast);
 observe('context-retirement-reuses-existing-grant');
 m.equipped.helmet=second;w.recalcSeat(seat);const replacement=seat.grantedInsts?.get('firebolt');assert(replacement&&replacement!==original);
 assert.equal(p.skills[2],replacement);assert.equal(cast.inst,original);observe('new-host-keeps-committed-cast-on-former-instance');
 advance(cast.total);assert.equal(p.casting,null);assert.equal(deliveries.length,1);assert(w.projectiles.some(q=>q.inst===original));
 observe('completion-executes-original-committed-instance');
 // Persisted tree input is valid at the first cold admission. Lowering a live
 // grant's level does not cold-repair its investment; changing its host does.
 // This observes the original loader/rebuild rules, not UI allocation policy.
 const fourPicks=Array(4).fill('flame_studies');
 first.grantState!.firebolt.treeNodes=[...fourPicks];
 p.sheet.setBase('skillgrant_firebolt',17);m.equipped.helmet=first;w.recalcSeat(seat);
 const invested=seat.grantedInsts?.get('firebolt');assert(invested&&invested.level===20);
 assert.deepEqual(invested.treeNodes,fourPicks);observe('high-level-cold-grant-admits-four-authored-tree-ranks');
 p.fillResources();p.useLock=0;p.cooldowns.clear();
 assert(w.useSkill(p,invested,{x:p.pos.x+100,y:p.pos.y},true));const investedCast=readCast(w);assert(investedCast);
 advance(investedCast.total/4);observe('paid-invested-cast-before-grant-level-drop');
 p.sheet.setBase('skillgrant_firebolt',0);w.recalcSeat(seat);
 assert.equal(seat.grantedInsts?.get('firebolt'),invested);assert(invested.level<10);
 assert.deepEqual(invested.treeNodes,fourPicks);assert.deepEqual(first.grantState!.firebolt.treeNodes,fourPicks);
 assert.equal(investedCast.inst,invested);observe('warm-low-level-grant-retains-committed-tree-investment');
 second.grantState!.firebolt.treeNodes=[...fourPicks];m.equipped.helmet=second;w.recalcSeat(seat);
 const repaired=seat.grantedInsts?.get('firebolt');assert(repaired&&repaired!==invested&&repaired.level>=5&&repaired.level<10);
 assert.deepEqual(repaired.treeNodes,['flame_studies']);assert.deepEqual(second.grantState!.firebolt.treeNodes,['flame_studies']);
 assert.deepEqual(invested.treeNodes,fourPicks);assert.equal(investedCast.inst,invested);
 observe('replacement-host-cold-repairs-tree-at-current-context-level');
 advance(investedCast.total);assert.equal(p.casting,null);assert.equal(deliveries.length,2);
 assert(w.projectiles.some(q=>q.inst===invested));observe('invested-cast-completes-with-retained-former-host-picks');
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-live-build-context-diagnostic/v1',authoredItems:['cindervigil','emberbrand'],
  diagnostic:'Explicit base overrides, lowLife condition, diagnostic-build gauge and valid persisted authored tree input; not authored conditional-grant or UI allocation coverage, or durable acknowledgement equivalence',rows}),{flag:'wx'});
}finally{restore();}
