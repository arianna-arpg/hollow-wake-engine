import test from 'node:test';import assert from 'node:assert/strict';
import {MinionInheritanceResolver,applyMinionPlyBonus} from '../dist/minion-inheritance.js';
const near=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const mod=(stat,kind,value)=>({stat,kind,value});
function fixture(){
 const caster={},inst={def:{}},stats={minionThreat:1,minionLife:1,minionHaste:1,minionRegenRate:1,minionDamage:1,minionDamageTaken:1,minionMoveSpeed:1,minionDetectionRange:1,minionSize:1};
 const config={ordinary:.25,avoidance:.8,threat:.1,armor:2,lifeScale:undefined},extra=[],tags=new Set(['summon']),reads=[];
 const ports={tags:()=>tags,modifiers:()=>extra,bodyContext:(input,id)=>new Set([...input,...(id?[id]:[])]),combat:i=>i.def.combat??{},
  stat:(a,id,t,m)=>{reads.push([a,id,t,m]);return stats[id]??0;},base:id=>['minionThreat','minionLife','minionHaste','minionRegenRate','minionDamage','minionDamageTaken','minionMoveSpeed','minionDetectionRange','minionSize'].includes(id)?1:0,
  ordinaryStats:()=>config.ordinary,maxAreaAvoidance:()=>config.avoidance,minThreat:()=>config.threat,armorFloor:()=>config.armor,lifeScale:()=>config.lifeScale,
  modifier:mod,statusIds:['burn','chill'],armed:()=>['burn','chill']};
 const runtime=new MinionInheritanceResolver(ports);return{runtime,caster,inst,stats,config,extra,tags,reads,ports,resolve:(scale=1)=>runtime.resolve(caster,inst,'hound',scale)};
}
const value=(rows,stat,kind)=>rows.find(m=>m.stat===stat&&m.kind===kind)?.value;
test('minion contexts include body tags and retain caller extra modifiers',()=>{
 const f=fixture(),r=f.resolve();assert.deepEqual([...r.tags],['summon','hound']);assert.equal(r.extra,f.extra);assert.notEqual(r.tags,f.tags);assert(f.reads.every(([a,,t,m])=>a===f.caster&&t===r.tags&&m===f.extra));assert.equal(r.guard,false);assert.equal(r.size,1);
});
test('life trade and echo both use original investment, with stable threshold rounding',()=>{
 const f=fixture();Object.assign(f.stats,{minionLife:1.3,minionLifePlyTrade:.1,minionLifePlyEcho:.15,minionPlies:1.6});const r=f.resolve(.5);
 assert.equal(r.plyBonus,7);near(value(r.ownerMods,'life','more'),0);f.stats.minionLife=.8;const negative=f.resolve();near(value(negative.ownerMods,'life','more'),-.2);assert.equal(negative.plyBonus,2);
});
test('batch scale applies once to contributions and keeps regeneration rate undivided',()=>{
 const f=fixture();Object.assign(f.stats,{minionDamage:2,minionLife:3,minionDamageTaken:.5,minionHaste:2,minionMoveSpeed:1.5,minionDetectionRange:3,minionRegen:20,minionRegenPct:.1,minionRegenRate:3,minionSize:2,minionGuard:1,minionPlies:3});const r=f.resolve(.25);
 assert.equal(value(r.ownerMods,'damage','more'),.25);assert.equal(value(r.ownerMods,'life','more'),.5);assert.equal(value(r.ownerMods,'damageTaken','more'),-.125);
 assert.equal(value(r.ownerMods,'moveSpeed','more'),.5);assert.equal(value(r.ownerMods,'attackSpeed','more'),.25);assert.equal(value(r.ownerMods,'castSpeed','more'),.25);assert.equal(value(r.ownerMods,'lifeRegen','flat'),5);assert.equal(value(r.ownerMods,'lifeRegen','increased'),2);assert.equal(value(r.ownerMods,'lifeRegenPct','increased'),2);assert.equal(r.size,2);assert(r.guard);assert.equal(r.plyBonus,3);
 f.config.lifeScale=.1;assert.equal(value(f.resolve(.25).ownerMods,'life','more'),.2);
});
test('relic scaling is centered on each base and re-reads current host configuration',()=>{
 const f=fixture();f.inst.relicSource={};f.stats.minionDamage=3;f.stats.minionDamageTaken=.5;f.stats.minionSize=2;
 let r=f.resolve();assert.equal(value(r.ownerMods,'damage','more'),.5);assert.equal(value(r.ownerMods,'damageTaken','more'),-.125);assert.equal(r.size,1.25);
 f.config.ordinary=.5;r=f.resolve();assert.equal(value(r.ownerMods,'damage','more'),1);assert.equal(r.size,1.5);
});
test('authored avoidance is not relic-scaled and clamps to current combat limits',()=>{
 const f=fixture();f.inst.def.combat={areaAvoidance:.4};f.inst.relicSource={};f.stats.minionAreaAvoidance=1;
 near(f.runtime.areaAvoidanceOf(f.caster,f.inst),.65);f.stats.minionAreaAvoidance=9;assert.equal(f.runtime.areaAvoidanceOf(f.caster,f.inst),.8);
 f.stats.minionAreaAvoidance=-9;assert.equal(f.runtime.areaAvoidanceOf(f.caster,f.inst),0);
});
test('throng armor and threat modifiers apply to combat independently of batch scale',()=>{
 const f=fixture();f.inst.def.throng={};f.inst.def.combat={threat:2};f.stats.minionThreat=.01;const r=f.resolve(.1);
 assert.equal(value(r.combatMods,'armorDamageFloor','flat'),2);near(value(r.combatMods,'threatGen','more'),-.9);near(value(r.combatMods,'targetPriority','more'),-.9);
 delete f.inst.def.throng;f.inst.def.hivecall={};assert.equal(value(f.resolve().combatMods,'armorDamageFloor','flat'),2);delete f.inst.def.hivecall;assert.equal(value(f.resolve().combatMods,'armorDamageFloor','flat'),0);
});
test('socket damage filters survive; overrides retain identity; unrelated extras do not inherit',()=>{
 const f=fixture(),filtered={...mod('damage','increased',.8),tags:['spell'],when:'moving'},override=mod('damage','override',7);f.extra.push(filtered,override,mod('life','more',2));
 const r=f.resolve(.25),copied=r.ownerMods.find(m=>m.when==='moving');assert.deepEqual(copied,{...filtered,value:.2});assert.notEqual(copied,filtered);assert(r.ownerMods.includes(override));assert.equal(f.extra[0].value,.8);assert.equal(r.ownerMods.filter(m=>m.stat==='life').length,1);
});
test('positive armed status investment carries once; zero and negative grants do not',()=>{
 const f=fixture();f.stats.minionApply_burn=.6;f.stats.minionApply_chill=-1;const r=f.resolve(.5);assert.equal(value(r.ownerMods,'apply_burn','flat'),.3);assert(!r.ownerMods.some(m=>m.stat==='apply_chill'));
});
test('ply refresh preserves spent armor and includes runtime gifts without refilling',()=>{
 const a={hiveDeathPlies:1,assaultWardCount:2,plySpec:{count:2,perLevel:.5},level:5,pliesMax:4,plies:1};applyMinionPlyBonus(a,3);assert.equal(a.pliesMax,10);assert.equal(a.plies,7);applyMinionPlyBonus(a,3);assert.equal(a.plies,7);applyMinionPlyBonus(a,0);assert.equal(a.pliesMax,7);assert.equal(a.plies,4);
});
test('zero-capacity bodies remain without a ply spec until a gift creates one',()=>{
 const a={hiveDeathPlies:0,assaultWardCount:0,level:1,pliesMax:0,plies:0};applyMinionPlyBonus(a,0);assert.equal(a.plySpec,undefined);applyMinionPlyBonus(a,2);assert.deepEqual(a.plySpec,{count:0});assert.equal(a.plies,2);a.plies=0;applyMinionPlyBonus(a,0);assert.equal(a.plies,0);assert.equal(a.pliesMax,0);
});
