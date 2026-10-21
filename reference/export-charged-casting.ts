// Investigation only: runs in the original game and never imports the SDK.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine, makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {mod} from '../src/engine/stats';
import {makeSkillInstance, instanceOvercharge, instanceStrikeTiming, instanceMods, skillContextTags, type SkillDef} from '../src/engine/skills';

bootSimEngine();
const wire=(value:any):any=>JSON.parse(JSON.stringify(value));
type Command={type:string; [key:string]:any};
type Course={name:string; skill?:string; variant?:Partial<SkillDef>; sockets?:string[]; commands:Command[]};
const press={type:'press'},release={type:'release'},tick=(dt:number):Command=>({type:'tick',dt});
const fraction=(value:number):Command=>({type:'tick',fraction:value});
const charge:Partial<SkillDef>={castMode:'charge',chargeUp:{maxTime:2}};
const staged:Partial<SkillDef>={castMode:'overcharge',overcharge:{stages:3,time:.8,perStage:.4,aoePerStage:.12}};
const courses:Course[]=[
 {name:'charge-zero-release-and-duplicate-update',variant:charge,commands:[press,release,tick(0),tick(1)]},
 {name:'charge-half-release',variant:charge,commands:[press,fraction(.5),release,tick(.5)]},
 {name:'charge-caps-without-auto-release',variant:charge,commands:[press,tick(5),tick(2),release,tick(0)]},
 {name:'charge-duration-snapshot',variant:charge,commands:[{type:'stat',id:'effectDuration',value:2},press,{type:'stat',id:'effectDuration',value:.25},{type:'stat',id:'castSpeed',value:8},tick(1),release,tick(0)]},
 {name:'charge-duration-floor',variant:{...charge,chargeUp:{maxTime:.01}},commands:[press,tick(.1),release,tick(0)]},
 {name:'charge-stun-keeps-press-price',variant:{...charge,cooldownAt:'press'},commands:[press,tick(.1),{type:'stun'},tick(.01)]},
 {name:'charge-death-transition',variant:charge,commands:[press,tick(.5),{type:'dead'},tick(.1)]},
 {name:'overcharge-one-stage-per-large-frame',variant:staged,commands:[press,tick(5),tick(5),tick(5),tick(5),release,tick(0),tick(1)]},
 {name:'overcharge-unpaid-full-bar-can-retry',variant:staged,commands:[press,{type:'resources',mana:0,life:100},tick(1),tick(.2),{type:'resources',mana:100,life:100},tick(0),release,tick(0)]},
 {name:'overcharge-no-surcharge',variant:{...staged,overcharge:{...staged.overcharge!,costPerStage:0}},commands:[press,{type:'resources',mana:0,life:1},tick(2),release,tick(0)]},
 {name:'overcharge-midbar-release',variant:staged,commands:[press,tick(.8),tick(.4),release,tick(0)]},
 {name:'overcharge-live-stage-limit',variant:staged,commands:[press,tick(.8),{type:'stat',id:'overchargeStages',value:1},tick(2),{type:'stat',id:'overchargeStages',value:2.9},tick(.8),release,tick(0)]},
 {name:'overcharge-live-cost-and-speed-snapshot',variant:staged,commands:[press,{type:'stat',id:'castSpeed',value:8},{type:'stat',id:'manaCost',value:2},tick(.8),release,tick(0)]},
 {name:'overcharge-stun-keeps-paid-stages',variant:staged,commands:[press,tick(.8),{type:'stun'},tick(.01)]},
 {name:'overcharge-death-denies-execution',variant:staged,commands:[press,tick(.8),{type:'dead'},tick(.1)]},
 {name:'overcharge-spark-on-boundary',variant:{...staged,overcharge:{...staged.overcharge!,window:.25,windowBonus:.6}},commands:[press,tick(.8),release,tick(.25)]},
 {name:'overcharge-spark-expired',variant:{...staged,overcharge:{...staged.overcharge!,window:.25}},commands:[press,tick(.8),release,tick(.250000001)]},
 {name:'overcharge-window-snapshot-bonus-live',variant:{...staged,overcharge:{...staged.overcharge!,window:.25}},commands:[press,tick(.8),{type:'stat',id:'sparkWindow',value:0},{type:'stat',id:'sparkBonus',value:.9},release,tick(.1)]},
 {name:'grafted-overcharge-with-perfect-release',variant:{castMode:'perfect'},sockets:['overcharge'],commands:[press,tick(.8),fraction(.72),release,tick(0)]},
 {name:'grafted-overcharge-before-perfect-window',variant:{castMode:'perfect'},sockets:['overcharge'],commands:[press,fraction(.719999),release,tick(0)]},
 {name:'grafted-overcharge-timed-marker-rerolls',variant:{castMode:'timed'},sockets:['overcharge'],commands:[press,tick(.8),{type:'tick-to-marker'},release,tick(0)]},
 {name:'grafted-overcharge-at-stage-cap-no-timing',variant:{castMode:'perfect'},sockets:['overcharge'],commands:[press,tick(.8),tick(.8),tick(.8),release,tick(0)]},
 {name:'overcharge-stage-floor',variant:staged,commands:[{type:'stat',id:'overchargeStages',value:0},press,tick(.8),tick(.8),release,tick(0)]},
];
for(const def of Object.values(SKILLS))if(def.chargeUp){
 courses.push({name:'authored-charge:'+def.id,skill:def.id,commands:[press,fraction(.5),release,tick(0)]});
}
const results:any[]=[];
for(const course of courses){
 const restore=seedGlobalRandom(240024);
 try{
  const w=makeSimWorld('magician',240024),aw:any=w,a=w.player;
  w.devIgnoreSkillAttributes=true;w.actors=[a];a.pos={x:500,y:500};
  a.sheet.setSource('held-cast-rig',[
   ...['life','mana'].map(id=>mod(id,'override',1000)),
   ...['energyShield','lifeRegen','manaRegen','poise'].map(id=>mod(id,'override',0)),
   ...['castSpeed','attackSpeed','cooldownRecovery','manaCost','manaUseCost','effectDuration'].map(id=>mod(id,'override',1)),
  ]);
  a.fillResources();a.useLock=0;a.cooldowns.clear();
  const def=course.skill?SKILLS[course.skill]:{...SKILLS.firebolt,manaCost:6,lifeCost:2,cooldown:2,...course.variant};
  const inst=makeSkillInstance(def,1,3);
  for(const [index,id]of (course.sockets??[]).entries()){assert(SUPPORTS[id],id);inst.sockets[index]={def:SUPPORTS[id],level:1};}
  a.skills=[inst];
  let calls:any[]=[];
  const pay=aw.paySkillCost.bind(w),execute=w.executeSkill.bind(w),triggers=aw.rollTriggers.bind(w);
  aw.paySkillCost=(actor:any,skill:any,cost:any)=>{calls.push(wire({kind:'pay',cost,before:{mana:actor.mana,life:actor.life},cast:!!actor.casting}));return pay(actor,skill,cost);};
  w.executeSkill=(...args:Parameters<typeof w.executeSkill>)=>{calls.push(wire({kind:'execute',options:args[3]??{},cast:!!args[0].casting,recovery:args[0].useLock}));return execute(...args);};
  aw.rollTriggers=(actor:any,on:any,context:any)=>{calls.push({kind:'trigger',on,stage:actor.casting?.stage??null});return triggers(actor,on,context);};
  const snapshot=()=>wire({mana:a.mana,life:a.life,dead:a.dead,recovery:a.useLock,cooldowns:[...a.cooldowns],cooldownTotals:[...a.cooldownTotals],
   cast:a.casting?Object.fromEntries(['mode','elapsed','total','held','baseMult','channelTime','stage','sinceStage','sparkWindow','indicatorAt','paidCost','chargesSpent','aiHold'].map(key=>[key,(a.casting as any)[key]??null])):null,
   projectiles:w.projectiles.map(p=>({mult:p.mult,speed:p.speed})),flashes:w.flashes.map(f=>({radius:f.radius,color:f.color,life:f.life}))});
  const initial=snapshot(),steps:any[]=[];
  for(const command of course.commands){
   calls=[];const before=snapshot(),draws:number[]=[];const random=Math.random;Math.random=()=>{const n=random();draws.push(n);return n;};
   let accepted:boolean|undefined,dt:number|undefined,beforeCast:any,terms:any;
   try{
    if(command.type==='press'){accepted=w.useSkill(a,inst,{x:900,y:500});assert(accepted,course.name+' must start');}
    else if(command.type==='release'){assert(a.casting,course.name);a.casting.held=false;}
    else if(command.type==='tick'||command.type==='tick-to-marker'){
     dt=command.type==='tick-to-marker'?a.casting!.total*a.casting!.indicatorAt!:command.dt??a.casting!.total*command.fraction;
     w.time+=dt!;a.updateTimers(dt!);beforeCast=snapshot();
     const oc=instanceOvercharge(inst),tags=skillContextTags(def),extra=instanceMods(inst);
     terms=wire({cost:a.skillCost(inst),stageBase:oc?a.sheet.get('overchargeStages',tags,extra,oc.stages):null,
      sparkBonus:oc?a.sheet.get('sparkBonus',tags,extra,oc.windowBonus??.35):null,stunned:a.isStunned()});
     aw.updateCasting(a,dt);
    }else if(command.type==='stat')a.sheet.setSource('held-stat:'+command.id,[mod(command.id,'override',command.value)]);
    else if(command.type==='resources'){a.mana=command.mana;a.life=command.life;}
    else if(command.type==='stun')a.applyStatus('stun',0,1,'held-investigation');
    else if(command.type==='dead'){a.life=0;a.dead=true;}
    else throw new Error('Unhandled held-casting command');
   }finally{Math.random=random;}
   steps.push(wire({command,before,beforeCast,terms,dt,accepted,calls,draws,after:snapshot()}));
  }
  results.push(wire({name:course.name,skill:def.id,charge:def.chargeUp??null,overcharge:instanceOvercharge(inst)??null,timing:instanceStrikeTiming(inst)??null,initial,steps}));
 }finally{restore();}
}
const authored={charges:Object.values(SKILLS).filter(s=>s.chargeUp).map(s=>({id:s.id,spec:s.chargeUp})),overchargeSkills:Object.values(SKILLS).filter(s=>s.overcharge).map(s=>({id:s.id,spec:s.overcharge})),overchargeSupports:Object.values(SUPPORTS).filter(s=>s.overcharge).map(s=>({id:s.id,spec:s.overcharge}))};
const last=(name:string)=>results.find(c=>c.name===name).steps.at(-1);
assert.equal(last('charge-zero-release-and-duplicate-update').after.projectiles.length,1);
assert.equal(last('charge-half-release').calls.find((c:any)=>c.kind==='execute').options.dmgMult,1.25);
assert.equal(last('charge-death-transition').calls.filter((c:any)=>c.kind==='execute').length,1);
assert.equal(last('overcharge-death-denies-execution').calls.filter((c:any)=>c.kind==='execute').length,0);
assert.equal(results.find(c=>c.name==='overcharge-one-stage-per-large-frame').steps[1].after.cast.stage,1);
assert.equal(results.find(c=>c.name==='overcharge-one-stage-per-large-frame').steps[1].after.cast.elapsed,0);
assert.equal(last('overcharge-spark-on-boundary').calls.find((c:any)=>c.kind==='execute').options.dmgMult,1.4*1.6);
assert.equal(last('overcharge-spark-expired').calls.find((c:any)=>c.kind==='execute').options.dmgMult,1.4);
fs.writeFileSync(process.argv[2],JSON.stringify({scope:'M24 held charge/overcharge investigation; original press, update, payment and execution',authored,courses:results})+'\n',{flag:'wx'});
console.log(JSON.stringify({courses:results.length,transitions:results.reduce((n,c)=>n+c.steps.length,0),authoredCharges:authored.charges.length,authoredOverchargeSupports:authored.overchargeSupports.length}));
