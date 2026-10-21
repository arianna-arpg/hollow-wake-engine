// Independent observation of original World casting; never imports the SDK.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {mod} from '../src/engine/stats';
import {makeSkillInstance,instanceStrikeTiming,instanceMods,skillContextTags,CONCENTRATION_CFG,type SkillDef} from '../src/engine/skills';
bootSimEngine();
const wire=(v:any):any=>JSON.parse(JSON.stringify(v));
type Command={type:string;[key:string]:any};
type Course={name:string;skill?:string;variant?:Partial<SkillDef>;sockets?:string[];commands:Command[]};
const press={type:'press'},release={type:'release'},click={type:'click'},tick=(dt:number):Command=>({type:'tick',dt}),frac=(fraction:number):Command=>({type:'tick',fraction});
const focus:Partial<SkillDef>={targeting:{target:'enemy',castRange:400},concentration:{time:2}};
const aim=(where:string):Command=>({type:'aim',where});
const courses:Course[]=[
 {name:'focus-completes-on-boundary',variant:focus,commands:[press,tick(1),tick(1),tick(.1)]},
 {name:'focus-drains-refinds-and-completes',variant:focus,commands:[press,tick(1),aim('away'),tick(.25),aim('target'),tick(1.25)]},
 {name:'focus-drain-fizzles-at-zero',variant:focus,commands:[press,tick(.5),aim('away'),tick(.5),tick(.1)]},
 {name:'focus-button-release-abandons',variant:focus,commands:[press,tick(1),release,tick(0)]},
 {name:'focus-zero-drain-can-recover',variant:{...focus,concentration:{time:2,drainRate:0}},commands:[press,tick(1),aim('away'),tick(10),aim('target'),tick(1)]},
 {name:'focus-cancel-break',variant:{...focus,concentration:{time:2,onBreak:'cancel'}},commands:[press,tick(1),aim('away'),tick(0)]},
 {name:'focus-release-at-threshold',variant:{...focus,concentration:{time:2,onBreak:'release'}},commands:[press,tick(.5),aim('away'),tick(.5)]},
 {name:'focus-release-below-threshold',variant:{...focus,concentration:{time:2,onBreak:'release'}},commands:[press,tick(.499999),aim('away'),tick(.5)]},
 {name:'focus-custom-release-threshold',variant:{...focus,concentration:{time:2,onBreak:'release',minRelease:.6}},commands:[press,tick(1.2),release,tick(0)]},
 {name:'focus-live-break-policy',variant:focus,commands:[press,tick(1),{type:'focus-spec',value:{onBreak:'release',minRelease:.4}},release,tick(0)]},
 {name:'focus-inclusive-slack',variant:focus,commands:[press,aim('edge'),tick(1),aim('outside'),tick(.25),aim('target'),tick(1.25)]},
 {name:'focus-custom-slack',variant:{...focus,concentration:{time:2,slack:0}},commands:[press,aim('edge'),tick(1),aim('outside'),tick(.25),release,tick(0)]},
 {name:'focus-speed-snapshot',variant:focus,commands:[{type:'stat',id:'castSpeed',value:2},press,{type:'stat',id:'castSpeed',value:8},tick(1)]},
 {name:'focus-duration-floor',variant:{...focus,concentration:{time:.01}},commands:[press,tick(.1),tick(.1)]},
 {name:'focus-fizzle-live-cooldown-recovery',variant:focus,commands:[press,tick(.5),{type:'skill-stat',id:'cooldownRecovery',value:2},release,tick(0)]},
 {name:'focus-fizzle-stamps-even-after-press-clock',variant:{...focus,cooldownAt:'press'},commands:[press,tick(.5),release,tick(0)]},
 {name:'focus-zero-cooldown-fizzle',variant:{...focus,cooldown:0},commands:[press,tick(.5),release,tick(0)]},
 {name:'focus-stun-keeps-payment',variant:focus,commands:[press,tick(.5),{type:'stun'},tick(.01)]},
 {name:'focus-caster-death-observation',variant:focus,commands:[press,tick(1),{type:'dead'},tick(1)]},
 {name:'focus-missing-quarry-refuses',variant:focus,commands:[{type:'remove-target'},{type:'press',accepted:false}]},
 {name:'focus-missing-targeting-paid-refusal',variant:{concentration:{time:2}},commands:[{type:'press',accepted:false}]},
 {name:'perfect-edge-one-press',variant:{castMode:'perfect'},commands:[press,frac(.72),click,click,frac(.28)]},
 {name:'perfect-early-press-is-spent',variant:{castMode:'perfect'},commands:[press,frac(.719999),click,frac(.1),click,frac(.2)]},
 {name:'perfect-custom-live-bonus',variant:{castMode:'perfect',timing:{kind:'perfect',bonus:1.1}},commands:[press,frac(.75),click,frac(.25)]},
 {name:'perfect-live-graft-bonus',variant:{castMode:'perfect'},commands:[press,frac(.75),{type:'socket',id:'wandering_mark'},click,frac(.25)]},
 {name:'timed-marker-click',variant:{castMode:'timed'},commands:[press,{type:'tick-marker'},click,click,frac(1)]},
 {name:'timed-missed-click-spent',variant:{castMode:'timed'},commands:[press,click,{type:'tick-marker'},click,frac(1)]},
 {name:'timed-graft-on-ordinary-cast',sockets:['wandering_mark'],commands:[press,{type:'tick-marker'},click,frac(1)]},
 {name:'perfect-graft-on-ordinary-cast',sockets:['perfect_draw'],commands:[press,frac(.72),click,frac(.28)]},
 {name:'multitude-default-press-and-cap',variant:{castMode:'multitude'},commands:[press,{type:'click',count:20},frac(1),click]},
 {name:'multitude-no-extra-press',variant:{castMode:'multitude'},commands:[press,frac(1)]},
 {name:'ordinary-repeat-click-is-ignored',commands:[press,click,frac(1),click]},
 {name:'perfect-stun-denies-delivery',variant:{castMode:'perfect'},commands:[press,frac(.75),click,{type:'stun'},tick(.01)]},
];
for(const flag of ['dead','downed','untargetable','invisible','removed'])courses.push({name:'focus-quarry-'+flag,variant:{...focus,concentration:{time:2,onBreak:'release'}},commands:[press,tick(1),{type:'quarry',flag},tick(0)]});
for(const skill of Object.values(SKILLS).filter(d=>d.concentration))courses.push({name:'authored-focus:'+skill.id,skill:skill.id,commands:[press,frac(.5),aim('away'),tick(.1),aim('target'),frac(1)]});
for(const skill of Object.values(SKILLS).filter(d=>d.castMode==='perfect'||d.castMode==='timed'))courses.push({name:'authored-timing:'+skill.id,skill:skill.id,commands:[press,skill.castMode==='perfect'?frac(.75):{type:'tick-marker'},click,frac(1)]});
const results:any[]=[];
for(const course of courses){
 const restore=seedGlobalRandom(250025);
 try{
  const w=makeSimWorld('magician',250025),aw:any=w,a=w.player;
  w.devIgnoreSkillAttributes=true;w.walk=null;a.pos={x:500,y:500};
  const target=w.createMonster(course.skill==='tame_beast'?'plains_wolf':'zombie',1,'enemy');
  target.pos={x:650,y:500};target.tier=a.tier;target.brain=undefined;w.springAmbush(target,true);target.untargetable=false;w.actors=[a,target];
  for(const actor of [a,target]){actor.sheet.setSource('interactive-rig',[
   ...['life','mana'].map(id=>mod(id,'override',10000)),
   ...['energyShield','lifeRegen','manaRegen','poise','blockChance','evasion','critChance'].map(id=>mod(id,'override',0)),
   ...['castSpeed','attackSpeed','cooldownRecovery','manaCost','manaUseCost','effectDuration'].map(id=>mod(id,'override',1)),
  ]);actor.fillResources();actor.useLock=0;actor.cooldowns.clear();}
  target.life=100;
  const def=course.skill?SKILLS[course.skill]:{...SKILLS.firebolt,manaCost:6,lifeCost:2,cooldown:2,useTime:1,...course.variant};
  const inst=makeSkillInstance(def,1,3);for(const [index,id]of(course.sockets??[]).entries()){assert(SUPPORTS[id],id);inst.sockets[index]={def:SUPPORTS[id],level:1};}
  a.skills=[inst];w.meta.knownSkills.set(def.id,inst);
  let calls:any[]=[];
  const pay=aw.paySkillCost.bind(w),execute=w.executeSkill.bind(w),triggers=aw.rollTriggers.bind(w),mark=aw.markSeatActed.bind(w);
  aw.paySkillCost=(actor:any,skill:any,cost:any)=>{calls.push(wire({kind:'pay',cost,cast:!!actor.casting,before:{mana:actor.mana,life:actor.life}}));return pay(actor,skill,cost);};
  w.executeSkill=(...args:Parameters<typeof w.executeSkill>)=>{const opts=args[3]??{};calls.push(wire({kind:'execute',cast:!!args[0].casting,recovery:args[0].useLock,options:{...opts,targetInfo:opts.targetInfo?{pos:opts.targetInfo.pos,actor:opts.targetInfo.actor===target?'quarry':null}:undefined}}));return execute(...args);};
  aw.rollTriggers=(actor:any,on:any,context:any)=>{calls.push({kind:'trigger',on,empowered:actor.casting?.empowered??null});return triggers(actor,on,context);};
  aw.markSeatActed=(actor:any)=>{calls.push({kind:'acted'});return mark(actor);};
  const snapshot=()=>wire({mana:a.mana,life:a.life,dead:a.dead,recovery:a.useLock,cooldowns:[...a.cooldowns],cooldownTotals:[...a.cooldownTotals],
   cast:a.casting?{...Object.fromEntries(['mode','elapsed','total','held','baseMult','pressUsed','empowered','presses','indicatorAt','focusBroken','paidCost','chargesSpent','aiRecovery'].map(k=>[k,(a.casting as any)[k]??null])),aim:a.casting.aim,quarry:a.casting.quarryId===target.id}:null,
   target:{life:target.life,dead:target.dead,downed:target.downed,untargetable:target.untargetable,companion:target.companion,team:target.team,statuses:target.statuses.map(s=>({id:s.id,remaining:s.remaining,stacks:s.stacks}))},
   projectiles:w.projectiles.map(p=>({mult:p.mult,speed:p.speed})),flashes:w.flashes.map(f=>({radius:f.radius,color:f.color,life:f.life,style:f.combatCue?.style})),repeats:aw.pendingRepeats.length});
  const initial=snapshot(),steps:any[]=[];
  for(const command of course.commands){calls=[];const before=snapshot(),draws:number[]=[];const random=Math.random;Math.random=()=>{const n=random();draws.push(n);return n;};let accepted,dt,beforeCast,terms;
   try{
    if(command.type==='press'){accepted=w.useSkill(a,inst,target.pos);assert.equal(accepted,command.accepted??true,course.name);}
    else if(command.type==='click'){terms=wire({timing:instanceStrikeTiming(inst)});for(let i=0;i<(command.count??1);i++)w.castPress(a);}
    else if(command.type==='release'){assert(a.casting,course.name);a.casting.held=false;}
    else if(command.type==='tick'||command.type==='tick-marker'){
     dt=command.type==='tick-marker'?a.casting!.total*a.casting!.indicatorAt!:command.dt??a.casting!.total*command.fraction;
     w.time+=dt;a.updateTimers(dt);beforeCast=snapshot();const tags=skillContextTags(def),extra=instanceMods(inst);
     terms=wire({concentration:def.concentration,stunned:a.isStunned(),quarryLive:w.actors.includes(target)&&!target.dead&&!target.downed&&!target.untargetable&&target.sheet.get('invisible')<=0,
      distance:a.casting?Math.hypot(a.casting.aim.x-target.pos.x,a.casting.aim.y-target.pos.y):null,radius:target.radius,cooldown:def.cooldown,globalRecovery:a.sheet.get('cooldownRecovery'),skillRecovery:a.sheet.get('cooldownRecovery',tags,extra),timing:instanceStrikeTiming(inst)});
     aw.updateCasting(a,dt);
    }else if(command.type==='aim'){assert(a.casting,course.name);const slack=def.concentration?.slack??CONCENTRATION_CFG.slack;const dx=command.where==='target'?0:command.where==='away'?300:target.radius+slack+(command.where==='outside'?1e-6:0);a.casting.aim={x:target.pos.x+dx,y:target.pos.y};}
    else if(command.type==='stat')a.sheet.setSource('interactive:'+command.id,[mod(command.id,'override',command.value)]);
    else if(command.type==='skill-stat')inst.extraMods=[mod(command.id,'override',command.value)];
    else if(command.type==='focus-spec'){assert(def.concentration);def.concentration={...def.concentration,...command.value};}
    else if(command.type==='socket'){assert(SUPPORTS[command.id]);inst.sockets[0]={def:SUPPORTS[command.id],level:1};}
    else if(command.type==='stun')a.applyStatus('stun',0,1,'interactive');
    else if(command.type==='dead'){a.life=0;a.dead=true;}
    else if(command.type==='remove-target')w.actors=[a];
    else if(command.type==='quarry'){
     if(command.flag==='removed')w.actors=[a];else if(command.flag==='invisible')target.sheet.setSource('invisible',[mod('invisible','override',1)]);
     else if(command.flag==='dead'){target.dead=true;target.life=0;}else(target as any)[command.flag]=true;
    }else throw new Error('Unknown command '+command.type);
   }finally{Math.random=random;}
   steps.push(wire({command,before,beforeCast,terms,dt,accepted,calls,draws,after:snapshot()}));
  }
  results.push(wire({name:course.name,skill:def.id,concentration:def.concentration,timing:instanceStrikeTiming(inst),initial,steps}));
 }finally{restore();}
}
const get=(name:string)=>results.find(c=>c.name===name),last=(name:string)=>get(name).steps.at(-1),executions=(name:string)=>get(name).steps.flatMap((s:any)=>s.calls).filter((c:any)=>c.kind==='execute');
assert.equal(executions('focus-release-at-threshold')[0].options.dmgMult,.25);
assert.equal(executions('focus-release-below-threshold').length,0);
assert.equal(last('focus-fizzle-live-cooldown-recovery').after.cooldowns[0][1],1);
assert.equal(last('focus-missing-quarry-refuses').after.mana,10000);
assert.equal(last('focus-missing-targeting-paid-refusal').after.mana,9994);
assert.equal(executions('focus-caster-death-observation').length,1);
assert.equal(executions('perfect-edge-one-press')[0].options.dmgMult,1.7);
assert.equal(executions('perfect-early-press-is-spent')[0].options.dmgMult,1);
assert.equal(last('multitude-default-press-and-cap').after.projectiles.length,15);
assert.equal(last('authored-focus:tame_beast').after.target.companion,true);
assert(last('authored-focus:transfixing_gaze').after.target.statuses.some((s:any)=>s.id==='seen'));
fs.writeFileSync(process.argv[2],JSON.stringify({scope:'M25 original interactive casting investigation: actual press, timing click, focus, native payment and execution',defaults:CONCENTRATION_CFG,authored:{concentration:Object.values(SKILLS).filter(s=>s.concentration).map(s=>({id:s.id,spec:s.concentration})),timing:Object.values(SKILLS).filter(s=>s.castMode==='perfect'||s.castMode==='timed').map(s=>({id:s.id,mode:s.castMode,timing:s.timing})),timingSupports:Object.values(SUPPORTS).filter(s=>s.strikeTiming).map(s=>({id:s.id,timing:s.strikeTiming}))},courses:results})+'\n',{flag:'wx'});
console.log(JSON.stringify({courses:results.length,transitions:results.reduce((n,c)=>n+c.steps.length,0)}));
