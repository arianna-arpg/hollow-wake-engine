import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {gunzipSync} from 'node:zlib';
import {CharacterProgression} from '../../dist/character-progression.js';import {progressionPack} from '../../scripts/compile-progression-content.mjs';
import {planExperience,ExperiencePlanEffects} from 'candidate/experience-plan';
const root=process.argv[2],copy=x=>JSON.parse(JSON.stringify(x)),pack=progressionPack(),observed=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-eighteen/character-progression.json.gz'))));
const project=state=>({seats:state.seats.map(s=>({id:s.id,level:s.level,controlledLevel:s.home?s.controlledLevel:s.level,xp:s.xp,xpNeeded:s.xpNeeded,points:s.points,life:s.life,mana:s.mana})),ledger:state.ledger,dirty:state.dirty});
let checked=0,privatePlans=0,sharedLedgers=0;
for(const scenario of observed.scenarios){
 const data=copy(pack);if(scenario.name==='live-tuning')Object.assign(data.tuning,{passivePointsPerLevel:3,lifePerLevel:7,manaPerLevel:2});const policy=new CharacterProgression(data);
 for(const row of scenario.rows){
  const seats=copy(row.before.seats),dirty=new Set(row.before.dirty);let ledger=Object.fromEntries(row.before.ledger),at=0;
  const state=()=>({seats,ledger:Object.entries(ledger),dirty:[...dirty]});
  const check=(name,phase,seat)=>{const expected=row.events[at++],message='original experience publication mismatch: '+scenario.name+'/'+row.name+'/'+name+'/'+phase;assert(expected,message);assert.equal(expected.name,name,message);assert.equal(expected.phase,phase,message);assert.equal(expected.seat,seat,message);assert.deepEqual(project(state()),project(expected.state),message);return expected;};
  const effect=(name,s,work)=>{check(name,'before',name==='text'||name==='resyncMercenary'?undefined:s?.id);work?.();check(name,'after');};
  for(const s of seats){
   const before=copy(state()),ownedLedger=Object.freeze({...ledger}),input=Object.freeze({level:s.level,xp:s.xp,xpNeeded:s.xpNeeded,passivePoints:s.points,classId:s.classId,ledger:ownedLedger});
   const plan=planExperience(policy,input,row.amount,{eligible:!s.dead&&!s.merc,blessing:row.before.blessing>0?.05:0,multiplier:['relic-fraction','blessing-before-relic'].includes(row.name)?.98:1,local:s.local,accountOwned:s.local||s.couch});
   assert.deepEqual(state(),before,'preparation advanced the live experience state');assert(Object.isFrozen(plan)&&Object.isFrozen(plan.events)&&Object.isFrozen(plan.ledgerAfter));
   if(JSON.stringify(plan.ledgerBefore)===JSON.stringify(plan.ledgerAfter)){assert.equal(plan.ledgerBefore,plan.ledgerAfter,'unchanged milestone ledger must remain shared');sharedLedgers++;}
   new ExperiencePlanEffects({
    read:()=>({level:s.level,xp:s.xp,xpNeeded:s.xpNeeded,passivePoints:s.points}),ledger:()=>ledger,
    write:value=>{s.level=value.level;s.xp=value.xp;s.xpNeeded=value.xpNeeded;s.points=value.passivePoints;},writeLedger:value=>{ledger={...value};},
    markDirty:()=>effect('markMetaDirty',s,()=>dirty.add(s.id)),
    recalculate:()=>effect('recalcSeat',s,()=>{const expected=row.events[at].state.seats.find(other=>other.id===s.id);assert.deepEqual(policy.levelModifiers(s.level),expected.levelMods);Object.assign(s,{life:expected.life,mana:expected.mana,maxLife:expected.maxLife,maxMana:expected.maxMana});}),
    downed:()=>!!s.downed,fillResources:()=>effect('fillResources',s,()=>{s.life=s.maxLife;s.mana=s.maxMana;}),announce:()=>effect('text',s),resyncMercenary:()=>effect('resyncMercenary')
   }).play(plan);privatePlans++;
  }
  assert.equal(at,row.events.length);assert.deepEqual(project(state()),project(row.after),scenario.name+'/'+row.name+'/final');checked++;
 }
}
assert.equal(checked,744);
const policy=new CharacterProgression(pack),observation={eligible:true,blessing:0,multiplier:1,local:true,accountOwned:true};
function fixture(level=1){
 let value={level,xp:0,xpNeeded:policy.experienceForLevel(level),passivePoints:100},ledger={},downed=false,life=2;const calls=[];
 const ports={read:()=>({...value}),ledger:()=>ledger,write:next=>{value={...next};},writeLedger:next=>{ledger={...next};},markDirty:()=>{calls.push('dirty');},recalculate:()=>{calls.push('recalculate');},downed:()=>downed,fillResources:()=>{life=10;calls.push('fill');},announce:()=>{calls.push('announce');},resyncMercenary:()=>{calls.push('merc');}};
 return{ports,calls,read:()=>({...value,ledger:copy(ledger),downed,life}),input:()=>({...value,classId:'warrior',ledger:Object.freeze({...ledger})}),downed:v=>{downed=v;},change:fn=>fn(value)};
}
for(const downedAfterRebuild of [true,false]){
 const f=fixture(),plan=planExperience(policy,f.input(),45,observation);f.downed(!downedAfterRebuild);const rebuild=f.ports.recalculate;f.ports.recalculate=()=>{rebuild();f.downed(downedAfterRebuild);};new ExperiencePlanEffects(f.ports).play(plan);
 assert.equal(f.read().life,downedAfterRebuild?2:10,'level-up fill must read current downed state after rebuild');
}
{
 const f=fixture(5),input=f.input(),first=planExperience(policy,input,0,observation);assert.notEqual(first.ledgerBefore,first.ledgerAfter);assert.deepEqual(input.ledger,{});assert.equal(first.ledgerAfter.reached_level_5,1);
 new ExperiencePlanEffects(f.ports).play(first);const nextInput=f.input(),second=planExperience(policy,nextInput,0,observation);assert.equal(second.ledgerAfter,nextInput.ledger,'unchanged milestone ledger must remain shared');
}
{
 const f=fixture(),plan=planExperience(policy,f.input(),45,observation),before=f.read();f.change(s=>{s.xp=1;});assert.throws(()=>new ExperiencePlanEffects(f.ports).play(plan),/Stale experience/);assert.deepEqual(f.calls,[]);assert.equal(f.read().xp,1);assert.equal(before.xp,0);
}
{
 const f=fixture(),plan=planExperience(policy,f.input(),45,observation);f.ports.recalculate=()=>{throw Error('rebuild failed');};assert.throws(()=>new ExperiencePlanEffects(f.ports).play(plan),/rebuild failed/);assert.equal(f.read().level,2);assert.deepEqual(f.read().ledger,{});assert.deepEqual(f.calls,['dirty']);
}
{
 const f=fixture(),before=f.read();assert.throws(()=>planExperience(policy,f.input(),Number.MAX_SAFE_INTEGER,observation),/work limit/);assert.deepEqual(f.read(),before);assert.deepEqual(f.calls,[]);
 for(const amount of [NaN,Infinity])assert.throws(()=>planExperience(policy,f.input(),amount,observation));
}
{
 const custom=copy(pack);custom.milestones=[{level:1,key:'constructor'}];const rules=new CharacterProgression(custom),f=fixture(),plan=planExperience(rules,f.input(),0,observation);assert(Object.hasOwn(plan.ledgerAfter,'constructor'));assert.equal(plan.ledgerAfter.constructor,1);
}
console.log({passed:true,originalTransitions:checked,privatePlans,sharedLedgers,additionalCases:7,fullWorldBuildQualified:false,durableRunAuthorityQualified:false});
