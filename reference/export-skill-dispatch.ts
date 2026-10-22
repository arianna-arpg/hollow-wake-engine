// Investigation only. Execute the original request pipeline; do not import the SDK.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {makeSkillInstance} from '../src/engine/skills';
import {makeReserve} from '../src/engine/reserves';
import {mod,ATTRIBUTE_IDS} from '../src/engine/stats';
bootSimEngine();
type Setup=(w:any,a:any,i:any,f:any)=>void;
type Course={name:string;skill?:string;variant?:any;supports?:string[];setup?:Setup;actions?:string[];seatPress?:boolean;expectedMode?:string;expected?:boolean};
const fuel=(amount=4,cost=2,vent=0):Setup=>(_w,a,i)=>{const spec={id:'fuel',pool:8,costs:{[i.def.id]:cost}};a.reserveSpecs=[spec];a.reserves=new Map([[spec.id,{...makeReserve(spec),cur:amount,ventUntil:vent}]]);};
const stat=(id:string,value:number):Setup=>(_w,a)=>a.sheet.setSource('dispatch:'+id,[mod(id,'override',value)]);
const ailment=(id:string,power:number):Setup=>(_w,a)=>{a.applyStatus(id,0,20,'dispatch rig');a.statuses.find((s:any)=>s.id===id).power=power;};
const kit=(w:any,a:any)=>{for(const id of ['ruin','frostbolt','life_flask','overclock']){assert(SKILLS[id],id);const inst=makeSkillInstance(SKILLS[id],1,3);a.skills.push(inst);w.localSeat.meta.knownSkills.set(id,inst);}};
const auraFuel=(amount=4,cost=2,vent=0):Setup=>(w,a,i,f)=>{assert(w.useSkill(a,i,a.pos,true));assert(a.activeAuras.has(i.def.id));a.useLock=0;a.cooldowns.clear();fuel(amount,cost,vent)(w,a,i,f);};
const courses:Course[]=[
 {name:'ordinary-native-cast',expected:true,expectedMode:'cast'},
 {name:'reserve-paid-before-ordinary-cast',setup:fuel(),expected:true},
 {name:'reserve-exact-price',setup:fuel(2),expected:true},
 {name:'reserve-short-refusal',setup:fuel(1),expected:false},
 {name:'reserve-missing-bank-refusal',setup:(w,a,i,f)=>{fuel()(w,a,i,f);a.reserves.clear();},expected:false},
 {name:'reserve-positive-vent-stamp-refuses-until-sweep',setup:fuel(4,2,10),expected:false},
 {name:'reserve-vent-after-time-is-shut',setup:fuel(4,2,10.000001),expected:false},
 {name:'reserve-zero-named-price-beats-default',setup:(w,a,i,f)=>{fuel(0,0,20)(w,a,i,f);a.reserveSpecs[0].perCast=5;},expected:true},
 {name:'reserve-negative-price-floors-zero',setup:fuel(0,-2,20),expected:true},
 {name:'reserve-second-short-bank-does-not-partially-spend',setup:(w,a,i,f)=>{fuel()(w,a,i,f);const spec={id:'second',pool:3,perCast:5};a.reserveSpecs.push(spec);a.reserves.set(spec.id,makeReserve(spec));},expected:false},
 {name:'reserve-default-price',setup:(w,a,i,f)=>{fuel()(w,a,i,f);a.reserveSpecs[0].costs={};a.reserveSpecs[0].perCast=3;},expected:true},
 {name:'aura-release-reserve-vent-end-is-inclusive',skill:'overclock',setup:auraFuel(4,2,10),expected:true},
 {name:'aura-release-reserve-vent-after-time-refuses',skill:'overclock',setup:auraFuel(4,2,10.000001),expected:false},
 {name:'aura-release-reserve-short-refuses-at-world',skill:'overclock',setup:auraFuel(1),expected:false},
 {name:'aura-release-two-pool-check-before-any-spend',skill:'overclock',setup:(w,a,i,f)=>{auraFuel()(w,a,i,f);const spec={id:'second',pool:3,perCast:5};a.reserveSpecs.push(spec);a.reserves.set(spec.id,makeReserve(spec));},expected:false},
 {name:'reserve-paid-before-target-refusal',variant:{targeting:{target:'enemy',castRange:10}},setup:fuel(),expected:false},
 {name:'reserve-paid-before-no-quarry-refusal',variant:{concentration:{time:1},targeting:undefined},setup:fuel(),expected:false},
 {name:'combo-base-arms-cursor',skill:'trisect',expected:true},
 {name:'combo-window-end-inclusive',skill:'trisect',setup:(w,_a,i)=>{i.state={comboIdx:1,comboAt:w.time-2};},expected:true},
 {name:'combo-expired-resets-to-base',skill:'trisect',setup:(w,_a,i)=>{i.state={comboIdx:1,comboAt:w.time-2.000001};},expected:true},
 {name:'combo-last-step-wraps',skill:'trisect',setup:(w,_a,i)=>{i.state={comboIdx:2,comboAt:w.time};},expected:true},
 {name:'combo-repeated-host-keeps-instance',skill:'one_two',setup:(w,_a,i)=>{i.state={comboIdx:1,comboAt:w.time};},expected:true},
 {name:'combo-invalid-step-falls-through',skill:'trisect',setup:(w,_a,i)=>{i.def={...i.def,comboChain:{skills:['missing-dispatch-skill'],window:2}};i.state={comboIdx:1,comboAt:w.time};},expected:true},
 {name:'combo-refused-step-keeps-cursor',skill:'trisect',setup:(w,a,i)=>{i.state={comboIdx:1,comboAt:w.time};a.cooldowns.set('bisect_cut',10);},expected:false},
 {name:'combo-host-and-step-each-spend-reserve',skill:'trisect',setup:(w,a,i,f)=>{fuel(6)(w,a,i,f);a.reserveSpecs[0].perCast=1;i.state={comboIdx:1,comboAt:w.time};},expected:true},
 {name:'combo-host-spend-survives-step-refusal',skill:'trisect',setup:(w,a,i,f)=>{fuel(2)(w,a,i,f);a.reserveSpecs[0].perCast=1;i.state={comboIdx:1,comboAt:w.time};},expected:false},
 {name:'construct-does-not-restamp-aim',setup:(_w,a)=>{a.construct={kind:'totem'};},expected:true},
 {name:'pierced-reflex-keeps-running-cast-and-aim',skill:'life_flask',setup:(_w,a)=>{a.life=500;a.charges.set('flask_life',1);a.casting={inst:makeSkillInstance(SKILLS.firebolt,1),mode:'cast',aim:{x:123,y:456},elapsed:.2,total:1,held:true,baseMult:1};},expected:true,expectedMode:'cast'},
 {name:'fumble-native-zero-power-does-not-interrupt',setup:ailment('befuddlement',0),expected:true},
 {name:'fumble-native-high-power-capped',setup:ailment('befuddlement',100)},
 {name:'fumble-after-reserve-spend',setup:(w,a,i,f)=>{fuel()(w,a,i,f);ailment('retching',100)(w,a,i,f);}},
 {name:'scramble-native-own-bar',setup:(w,a,i,f)=>{kit(w,a);ailment('addled',100)(w,a,i,f);}},
 {name:'scramble-one-button-keeps-original',setup:ailment('addled',100),expected:true},
 {name:'scramble-meta-instance-exempt',setup:(w,a,i,f)=>{kit(w,a);ailment('addled',100)(w,a,i,f);i.hostSkillId='dispatch-host';},expected:true},
 {name:'scramble-latch-exempts-nested-request',setup:(w,a,i,f)=>{kit(w,a);ailment('addled',100)(w,a,i,f);w.scrambleLatch=true;},expected:true},
 {name:'scramble-reflex-exempt',skill:'life_flask',setup:(w,a,i,f)=>{kit(w,a);ailment('addled',100)(w,a,i,f);a.life=500;a.charges.set('flask_life',1);},expected:true},
 {name:'scramble-ai-only-pool',setup:(w,a,i,f)=>{a.aiActionInsts=new Map([['ruin',makeSkillInstance(SKILLS.ruin,1)],['frostbolt',makeSkillInstance(SKILLS.frostbolt,1)]]);ailment('addled',100)(w,a,i,f);}},
 {name:'scramble-filters-trigger-aura-reflex-and-current-id',setup:(w,a,i,f)=>{kit(w,a);a.skills[1].sockets[0]={def:SUPPORTS.cast_on_crit,level:1};a.cooldowns.set('frostbolt',10);a.skills.push(makeSkillInstance(SKILLS.firebolt,1));ailment('addled',100)(w,a,i,f);},expected:true},
 {name:'active-aura-second-press-releases',skill:'overclock',actions:['press','recover','press'],expected:true},
 {name:'summon-contract-second-press-dismisses',skill:'summon_rubblekin',actions:['press','finish','recover','press'],expected:true},
 {name:'strobe-seat-on-off',skill:'restless_earth',actions:['press','recover','press'],expected:true},
 {name:'strobe-ai-does-not-toggle-off',skill:'restless_earth',actions:['press','recover','press'],seatPress:false},
 {name:'strobe-reservation-exceeds-cap',skill:'restless_earth',setup:(_w,a)=>{a.reservedMana=900;},expected:false},
 {name:'hexbrand-seat-on-off',skill:'befuddlement',supports:['curse_on_hit'],actions:['press','recover','press'],expected:true},
 {name:'hexbrand-ai-keeps-drawn',skill:'befuddlement',supports:['curse_on_hit'],actions:['press','recover','press'],seatPress:false},
 {name:'hexbrand-reservation-exceeds-cap',skill:'befuddlement',supports:['curse_on_hit'],setup:(_w,a)=>{a.reservedMana=900;},expected:false},
 {name:'miasma-follow-second-press-expires-zone',skill:'befuddlement',supports:['miasma'],actions:['press','finish','recover','press'],expected:true},
 {name:'spirit-totem-conversion',setup:stat('castAsTotem',1),expected:true,expectedMode:'cast'},
 {name:'construct-refuses-nested-spirit-totem',setup:(w,a,i,f)=>{stat('castAsTotem',1)(w,a,i,f);a.construct={kind:'totem'};},expected:true},
 {name:'self-nonguard-does-not-convert-to-totem',skill:'life_flask',setup:(w,a,i,f)=>{stat('castAsTotem',1)(w,a,i,f);a.life=500;a.charges.set('flask_life',1);},expected:true},
 {name:'guard-can-plant-spirit-totem',skill:'shield_up',setup:stat('castAsTotem',1),expected:true,expectedMode:'cast'},
 {name:'targeted-cast-has-resolved-target',variant:{targeting:{target:'enemy',castRange:400}},expected:true},
 {name:'target-missing-aim-fallback-continues',variant:{targeting:{target:'enemy',castRange:10,fallback:'aim'}},expected:true},
 {name:'native-channel-start',skill:'infernal_ray',expected:true,expectedMode:'channel'},
 {name:'channel-persistence-plants-cast',skill:'infernal_ray',setup:stat('channelPersist',1),expected:true,expectedMode:'cast'},
 {name:'construct-skips-channel-persistence',skill:'infernal_ray',setup:(w,a,i,f)=>{stat('channelPersist',1)(w,a,i,f);a.construct={kind:'totem'};},expected:true,expectedMode:'channel'},
 {name:'gather-graft-starts-channel',supports:['gathered_casting'],expected:true,expectedMode:'channel'},
 {name:'gather-graft-skips-fast-cast',supports:['gathered_casting'],variant:{useTime:.1},expected:true,expectedMode:'cast'},
 {name:'concentration-with-quarry',variant:{targeting:{target:'enemy',castRange:400},concentration:{time:1,onBreak:'drain',drainRate:1}},expected:true,expectedMode:'concentration'},
 {name:'concentration-no-quarry-pays-before-refusal',variant:{concentration:{time:1},targeting:undefined},expected:false},
 {name:'native-guard-start',skill:'shield_up',expected:true,expectedMode:'guard'},
 {name:'guard-grafted-shell-start',skill:'shield_up',supports:['grafted_carapace'],expected:true,expectedMode:'guard'},
 {name:'native-charge-start',skill:'lightning_blast',expected:true,expectedMode:'charge'},
 {name:'overcharge-graft-start',supports:['overcharge'],expected:true,expectedMode:'overcharge'},
 {name:'overcharge-timed-graft-start',supports:['overcharge','wandering_mark'],expected:true,expectedMode:'overcharge'},
 {name:'perfect-graft-start',supports:['perfect_draw'],expected:true,expectedMode:'perfect'},
 {name:'timed-graft-start',supports:['wandering_mark'],expected:true,expectedMode:'timed'},
 {name:'native-multitude-start',skill:'infinite_slashes',expected:true,expectedMode:'multitude'},
 {name:'synthetic-instant-delivers-at-press',variant:{useTime:0},expected:true},
 {name:'synthetic-instant-threshold-inclusive',variant:{useTime:.001},expected:true},
 {name:'synthetic-above-instant-threshold-builds-bar',variant:{useTime:.00100001},expected:true,expectedMode:'cast'},
 {name:'cooldown-starts-at-press',variant:{cooldown:3,cooldownAt:'press'},expected:true},
 {name:'construct-does-not-record-ceremonial-paid-cost',setup:(_w,a)=>{a.construct={kind:'totem'};},expected:true},
];
courses.push(
 {name:'ammunition-bank-spends-and-resets-rest',variant:{useCharges:{max:3,recharge:2}},setup:(_w,a,i)=>{const b=a.skillChargeBank(i);b.count=2;b.timer=1.9;},expected:true},
 {name:'ammunition-last-round-stamps-magazine',variant:{cooldown:3,useCharges:{max:3,magazine:true}},setup:(w,a,i,f)=>{a.skillChargeBank(i).count=1;stat('finalRoundDamage',2)(w,a,i,f);},expected:true},
 {name:'ammunition-empower-adds-multiplier',variant:{useCharges:{max:3,empower:.4}},expected:true},
 {name:'ammunition-empty-empower-casts-plain',variant:{useCharges:{max:3,empower:.4}},setup:(_w,a,i)=>{a.skillChargeBank(i).count=0;},expected:true},
 {name:'ammunition-vent-captures-whole-bank',variant:{useCharges:{max:3,ventAll:true}},expected:true},
 {name:'ammunition-steps-captured-before-instant-spend',variant:{useTime:0,useCharges:{max:3,stepsFromBank:true}},expected:true},
 {name:'gauge-partial-spend-scales-cast',variant:{gauge:{need:10,partial:{minFrac:.2},lockoutSec:3}},setup:(_w,_a,i)=>{i.state={gauge:5};},expected:true},
 {name:'gauge-overflow-spend-scales-cast',variant:{gauge:{need:10,bankMult:2,overflow:true,lockoutSec:3}},setup:(_w,_a,i)=>{i.state={gauge:15};},expected:true},
 {name:'charge-cost-composes-with-round-and-gauge',variant:{chargeCost:{charge:'fury',amount:'all',optional:true,damagePerCharge:.25},useCharges:{max:3,empower:.4},gauge:{need:10,partial:{minFrac:.2},lockoutSec:3}},setup:(_w,a,i)=>{a.charges.set('fury',4);i.state={gauge:5};},expected:true},
 {name:'concentration-refusal-retains-paid-gauge-and-charge',variant:{concentration:{time:1},targeting:undefined,cooldown:3,cooldownAt:'press',chargeCost:{charge:'fury',amount:'all',optional:true,damagePerCharge:.25},gauge:{need:10}},setup:(_w,a,i)=>{a.charges.set('fury',4);i.state={gauge:10};},expected:false},
 {name:'channel-press-pays-charge-but-not-gauge-or-mana',variant:{castMode:'channel',channel:{interval:.4},chargeCost:{charge:'fury',amount:'all',optional:true,damagePerCharge:.25},gauge:{need:10}},setup:(_w,a,i)=>{a.charges.set('fury',4);i.state={gauge:10};},expected:true,expectedMode:'channel'}
);
courses.push(
 {name:'targeted-seize-variant-promotes-light-body-before-payment',skill:'seize',variant:{targeting:{target:'enemy',castRange:400}},setup:(w,a,_i,f)=>{w.actors=[a];const kind=w.liteKindOf('vermin_tide');assert(kind>=0);w.lite.spawn(kind,f.pos.x,f.pos.y,0,0,1);w.update(1/60);a.useLock=0;assert.equal(w.lite.liveCount,1);},expected:true},
 {name:'primed-flask-banks-after-cost',skill:'life_flask',setup:(w,a,i,f)=>{stat('pourPrime',1)(w,a,i,f);a.charges.set('flask_life',3);},expected:true},
 {name:'primed-flask-life-cost-demotes-to-ordinary-pour',skill:'life_flask',variant:{lifeCost:1},setup:(w,a,i,f)=>{stat('pourPrime',1)(w,a,i,f);a.charges.set('flask_life',3);},expected:true},
 {name:'pierced-hold-combo-keeps-guard-and-original-facing',variant:{useTime:0,usableWhileGuarding:true},supports:['overcharge','wandering_mark'],setup:(_w,a)=>{a.casting={inst:makeSkillInstance(SKILLS.shield_up,1),mode:'guard',aim:{x:123,y:456},elapsed:.2,total:1,held:true,baseMult:1,shield:100,maxShield:100};},expected:true,expectedMode:'guard'}
);
const wire=(value:any):any=>JSON.parse(JSON.stringify(value,(_k,v)=>typeof v==='number'&&!Number.isFinite(v)?{$number:String(v)}:v));
function run(course:Course,index:number){
 const restore=seedGlobalRandom(340000+index);
 try{
  const w=makeSimWorld('warrior',340000+index),aw:any=w,a:any=w.player;
  for(const id of ATTRIBUTE_IDS)w.localSeat.meta.baseAttrs[id]=40;
  w.recalcSeat(w.localSeat);aw.walk=null;w.time=10;
  const foe:any=w.createMonster('zombie',1,'enemy');foe.brain=undefined;w.actors=[a,foe];a.pos={x:500,y:500};foe.pos={x:540,y:500};a.aimPos={x:111,y:222};a.facing=.7;
  a.sheet.setSource('dispatch-rig',[...['life','mana'].map(id=>mod(id,'override',1000)),...['energyShield','critChance','poise'].map(id=>mod(id,'override',0)),...['castSpeed','attackSpeed','manaCost','manaUseCost','effectDuration'].map(id=>mod(id,'override',1))]);
  a.fillResources();a.useLock=0;a.cooldowns.clear();
  const base=SKILLS[course.skill??'firebolt'];assert(base,course.skill??'firebolt');const inst:any=makeSkillInstance(course.variant?{...base,...course.variant}:base,1,3);
  for(const[n,id]of(course.supports??[]).entries()){assert(SUPPORTS[id],id);inst.sockets[n]={def:SUPPORTS[id],level:1};}
  a.skills=[inst];w.localSeat.meta.knownSkills.set(inst.def.id,inst);course.setup?.(w,a,inst,foe);
  const ids=new Map<any,string>();let serial=0;const identity=(i:any)=>{if(!ids.has(i))ids.set(i,'instance-'+serial++);return ids.get(i);};
  for(const i of a.skills)if(i)identity(i);for(const i of a.aiActionInsts?.values()??[])identity(i);if(a.casting)identity(a.casting.inst);
  const skill=(i:any)=>({identity:identity(i),id:i.def.id,level:i.level,hostSkillId:i.hostSkillId,state:i.state,sameAsPressed:i===inst});
  const target=(t:any)=>t?{...t,actor:t.actor?{id:t.actor.id,pos:t.actor.pos}:undefined}:t;
  const cast=()=>a.casting?{...a.casting,inst:skill(a.casting.inst),targetInfo:target(a.casting.targetInfo)}:null;
  let calls:any[]=[];
  for(const name of ['useSkill','paySkillCost','executeSkill','failNote','resolveTargeting','litePromoteNearest','stampSkillCooldown','consumeChargeCost','deactivateAura','dismissSummonToggle','expireZone','refreshGuardBash']){
   const original=aw[name].bind(w);aw[name]=(...args:any[])=>{
    calls.push(wire({method:name,skill:args[1]?.def?skill(args[1]):undefined,seatPress:name==='useSkill'?(args[3]??false):undefined,note:name==='failNote'?{key:args[1],text:args[2]}:undefined,cost:name==='paySkillCost'?args[2]:undefined,options:name==='executeSkill'?{...args[3],targetInfo:target(args[3]?.targetInfo)}:undefined,at:{mana:a.mana,reservedMana:a.reservedMana,castMode:a.casting?.mode,reserves:a.reserves?[...a.reserves]:undefined,charges:[...a.charges],state:inst.state}}));
    return original(...args);
   };
  }
  for(const [owner,name]of [[aw.attackSequences,'opening'],[aw.assaults,'lock'],[aw.guardArts,'raised']] as const){const original=owner[name].bind(owner);owner[name]=(...args:any[])=>{calls.push({method:name,skill:args[1]?.def?.id});return original(...args);};}
  const snapshot=()=>wire({mana:a.mana,life:a.life,shield:a.es,reservedMana:a.reservedMana,useLock:a.useLock,reflexLock:a.reflexLock,facing:a.facing,aimPos:a.aimPos,cast:cast(),pressed:skill(inst),reserves:a.reserves?[...a.reserves]:null,banks:[...a.skillChargeState],charges:[...a.charges],cooldowns:[...a.cooldowns],cooldownTotals:[...a.cooldownTotals],shell:a.shellGuard,statuses:a.statuses.map((s:any)=>({id:s.id,power:s.power,remaining:s.remaining,duration:s.statusDuration,stacks:s.stacks})),auras:[...a.activeAuras.keys()],summonToggles:[...a.summonToggles.keys()],strobes:[...a.strobes].map(([k,v]:any)=>[k,{...v,inst:skill(v.inst)}]),hexes:[...a.hexToggles].map(([k,v]:any)=>[k,{...v,inst:skill(v.inst)}]),zones:w.zones.map((z:any)=>({id:z.id,skill:z.inst?.def.id,toggled:z.toggled,follow:z.follow,reserved:z.reserved,life:z.life})),projectiles:w.projectiles.map((p:any)=>({skill:p.inst?.def.id,pos:p.pos,mult:p.mult})),ownedActors:w.actors.filter((x:any)=>x.owner===a).map((x:any)=>({id:x.id,skill:x.summonInst?.def.id,dead:x.dead})),meta:[...a.metaInsts].map(([k,v]:any)=>[k,skill(v)]),scrambleLatch:aw.scrambleLatch,primedPours:a.primedPours.length,restoreStreams:a.restoreStreams.map((s:any)=>({resource:s.resource,remaining:s.remaining,perSec:s.perSec})),liteCount:w.lite.liveCount,texts:w.texts.map(t=>t.text)});
  const steps:any[]=[];
  for(const action of course.actions??['press']){
   calls=[];const before=snapshot(),draws:number[]=[];const random=Math.random;Math.random=()=>{const value=random();draws.push(value);return value;};
   let result:boolean|undefined;
   try{
    if(action==='press')result=w.useSkill(a,inst,{...foe.pos},course.seatPress??true);
    else if(action==='recover'){a.useLock=0;a.reflexLock=0;a.cooldowns.clear();a.skillRecoveryLocks.clear();}
    else if(action==='finish'){for(let n=0;n<600&&a.casting;n++)w.update(1/60);assert(!a.casting,'uncompleted setup cast: '+course.name);}
    else throw new Error('Unhandled command '+action);
   }finally{Math.random=random;}
   const after=snapshot();steps.push({action,before,result,after,calls,draws});
   if(action==='press'&&course.expected!==undefined)assert.equal(result,course.expected,course.name);
   if(action==='press'&&course.expectedMode)assert.equal(after.cast?.mode,course.expectedMode,course.name);
  }
  const presses=steps.filter(s=>s.action==='press'),first=presses[0],last=presses.at(-1),after=last.after,has=(method:string)=>first.calls.some((c:any)=>c.method===method);
  if(course.name==='reserve-paid-before-target-refusal'){assert.equal(after.reserves[0][1].cur,2);assert.equal(after.mana,1000);assert(!has('paySkillCost'));}
  if(course.name.includes('two-pool-check'))assert.deepEqual(after.reserves,first.before.reserves);
  if(course.name==='aura-release-reserve-vent-end-is-inclusive'){assert.equal(after.auras.length,0);assert.equal(after.reserves[0][1].lastSpendAt,10);}
  if(course.name==='combo-host-and-step-each-spend-reserve')assert.equal(after.reserves[0][1].cur,3);
  if(course.name==='combo-host-spend-survives-step-refusal'){assert.equal(after.reserves[0][1].cur,0);assert.equal(after.pressed.state.comboIdx,1);}
  if(course.name==='combo-window-end-inclusive'){assert.equal(after.cast.inst.id,'bisect_cut');assert.equal(first.calls.filter((c:any)=>c.method==='useSkill')[1].seatPress,false);}
  if(course.name==='combo-repeated-host-keeps-instance'){assert(after.cast.inst.sameAsPressed);assert.equal(after.pressed.state.comboIdx,2);}
  if(course.name==='combo-last-step-wraps')assert.equal(after.pressed.state.comboIdx,0);
  if(course.name==='construct-does-not-restamp-aim')assert.deepEqual(after.aimPos,first.before.aimPos);
  if(course.name==='pierced-reflex-keeps-running-cast-and-aim'){assert.deepEqual(after.cast,first.before.cast);assert.deepEqual(after.aimPos,first.before.aimPos);assert.equal(after.facing,first.before.facing);assert(after.reflexLock>0);}
  if(course.name==='fumble-after-reserve-spend'){assert.equal(first.result,false);assert.equal(after.reserves[0][1].cur,2);assert(after.statuses.some((s:any)=>s.id==='stun'));assert(!has('paySkillCost'));}
  if(['scramble-native-own-bar','scramble-ai-only-pool'].includes(course.name)){assert.equal(first.calls.filter((c:any)=>c.method==='useSkill').length,2);assert.equal(after.scrambleLatch,false);assert(!after.cast.inst.sameAsPressed);}
  if(course.name==='scramble-filters-trigger-aura-reflex-and-current-id')assert(after.cast.inst.sameAsPressed);
  if(course.name==='strobe-ai-does-not-toggle-off'||course.name==='hexbrand-ai-keeps-drawn'){assert.equal(last.result,false);assert.equal(after.reservedMana,last.before.reservedMana);}
  if(course.name==='strobe-seat-on-off'||course.name==='hexbrand-seat-on-off'){assert.equal(after.reservedMana,0);assert(first.after.reservedMana>0);assert.equal(after.mana,last.before.mana);}
  if(course.name==='summon-contract-second-press-dismisses'){assert(last.before.summonToggles.includes(inst.def.id));assert(!after.summonToggles.includes(inst.def.id));assert(last.calls.some((c:any)=>c.method==='dismissSummonToggle'));}
  if(course.name==='miasma-follow-second-press-expires-zone'){assert(last.before.zones.some((z:any)=>z.toggled&&z.follow));assert.equal(after.zones.length,0);assert(last.calls.some((c:any)=>c.method==='expireZone'));}
  if(course.name==='spirit-totem-conversion'||course.name==='guard-can-plant-spirit-totem')assert(after.cast.plantTotem);
  if(course.name==='construct-refuses-nested-spirit-totem')assert(!after.cast.plantTotem);
  if(course.name==='channel-persistence-plants-cast')assert(after.cast.plantChannel);
  if(course.name==='gather-graft-starts-channel')assert(after.cast.gather?.brim);
  if(course.name==='guard-grafted-shell-start')assert.equal(after.shell.fromAura,inst.def.id);
  if(course.name==='concentration-no-quarry-pays-before-refusal'){assert(has('paySkillCost'));assert(has('opening'));assert(after.mana<first.before.mana);}
  if(course.name==='overcharge-timed-graft-start'||course.name==='timed-graft-start'){assert(after.cast.indicatorAt>=.3&&after.cast.indicatorAt<=.85);assert.equal(first.draws.length,1);}
  if(course.name==='cooldown-starts-at-press')assert.deepEqual(after.cooldowns,[[inst.def.id,3]]);
  if(course.name==='construct-does-not-record-ceremonial-paid-cost')assert.equal(after.cast.paidCost,undefined);
  if(course.name==='ammunition-bank-spends-and-resets-rest'){assert.equal(after.banks[0][1].count,1);assert.equal(after.banks[0][1].timer,0);}
  if(course.name==='ammunition-last-round-stamps-magazine'){assert(after.banks[0][1].reloading);assert.equal(after.cast.baseMult,2);assert.deepEqual(after.cooldowns,[[inst.def.id,3]]);}
  if(course.name==='ammunition-empower-adds-multiplier')assert.equal(after.cast.baseMult,1.4);
  if(course.name==='ammunition-empty-empower-casts-plain')assert.equal(after.cast.baseMult,1);
  if(course.name==='ammunition-vent-captures-whole-bank'){assert.equal(after.cast.ventRounds,3);assert.equal(after.banks[0][1].count,0);}
  if(course.name==='ammunition-steps-captured-before-instant-spend')assert.equal(first.calls.find((c:any)=>c.method==='executeSkill').options.repeat,3);
  if(course.name==='gauge-partial-spend-scales-cast')assert.equal(after.cast.baseMult,.5);
  if(course.name==='gauge-overflow-spend-scales-cast')assert.equal(after.cast.baseMult,1.5);
  if(course.name==='charge-cost-composes-with-round-and-gauge')assert.equal(after.cast.baseMult,1.4);
  if(course.name==='concentration-refusal-retains-paid-gauge-and-charge'){assert.equal(after.pressed.state.gauge,0);assert.equal(after.charges.find((x:any)=>x[0]==='fury')[1],0);assert.equal(after.pressed.state.pressAt,10);assert(has('opening'));}
  if(course.name==='channel-press-pays-charge-but-not-gauge-or-mana'){assert.equal(after.mana,1000);assert.equal(after.pressed.state.gauge,10);assert.equal(after.charges.find((x:any)=>x[0]==='fury')[1],0);}
  if(course.name==='targeted-seize-variant-promotes-light-body-before-payment'){assert(has('litePromoteNearest'));assert.equal(first.calls.filter((c:any)=>c.method==='resolveTargeting').length,2);assert.equal(after.liteCount,0);assert(after.cast.targetInfo.actor);}
  if(course.name==='primed-flask-banks-after-cost'){assert.equal(after.primedPours,1);assert.equal(after.restoreStreams.length,0);assert(first.calls.find((c:any)=>c.method==='executeSkill').options.primed);}
  if(course.name==='primed-flask-life-cost-demotes-to-ordinary-pour'){assert.equal(after.primedPours,0);assert.equal(after.restoreStreams.length,2);assert.equal(first.calls.find((c:any)=>c.method==='executeSkill').options.primed,undefined);}
  if(course.name==='pierced-hold-combo-keeps-guard-and-original-facing'){assert.deepEqual(after.cast,first.before.cast);assert.equal(after.facing,first.before.facing);assert.deepEqual(after.aimPos,first.before.aimPos);assert.equal(after.useLock,.12);}
  return {name:course.name,skill:inst.def.id,syntheticDefinition:!!course.variant,steps};
 }finally{restore();}
}
assert.equal(new Set(courses.map(c=>c.name)).size,courses.length);
const result={scope:'Investigation of the complete original post-preflight request path: reserve spending, combo redirects, fumble/scramble, toggles, targeting, ammunition commitment and paid casting preparation. Seeded banks, attributes, statuses and explicitly synthetic definitions are setup, not gameplay-earned claims. Full delivery and ongoing cast updates remain separate capabilities.',courses:courses.map(run)};
fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({courses:result.courses.length,transitions:result.courses.reduce((n,c)=>n+c.steps.length,0)}));
