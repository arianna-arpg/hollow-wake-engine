// Raw original observations. No SDK import or extracted algorithm here.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {mod} from '../src/engine/stats';
import {makeSkillInstance,instanceUseCharges,instanceMods,skillContextTags,type SkillDef,type SkillInstance} from '../src/engine/skills';
bootSimEngine();
const wire=(x:any):any=>JSON.parse(JSON.stringify(x));
type Command={type:string;[key:string]:any};
type Course={name:string;skill?:string;variant?:Partial<SkillDef>;sockets?:string[];commands:Command[]};
const press={type:'press'},tick=(dt:number):Command=>({type:'tick',dt}),bank=(count:number,timer=0,reloading=false):Command=>({type:'bank',count,timer,reloading});
const reload=(scope='host',amount?:number):Command=>({type:'reload',scope,amount});
const courses:Course[]=[
 {name:'trickle-rest-clock',variant:{useCharges:{max:3,recharge:2}},commands:[bank(2,1.9),press,tick(.1),tick(1.9),tick(2)]},
 {name:'trickle-at-most-one-per-frame',variant:{useCharges:{max:4,recharge:2}},commands:[bank(0),tick(10),tick(0),tick(0),tick(0)]},
 {name:'manual-no-passive-recovery',variant:{useCharges:{max:3}},commands:[bank(0),tick(20),press,reload(),press,tick(1)]},
 {name:'magazine-last-round-and-refill',variant:{cooldown:2,useCharges:{max:3,magazine:true}},commands:[press,tick(.13),press,tick(.13),press,tick(1),tick(1),press]},
 {name:'magazine-partial-refill',variant:{cooldown:2,useCharges:{max:3,magazine:{refill:1}}},commands:[bank(1),press,tick(2),tick(5)]},
 {name:'drip-one-per-frame',variant:{cooldown:2,useCharges:{max:4,magazine:{refill:1,drip:true}}},commands:[bank(1),tick(10),tick(0),tick(0)]},
 {name:'drip-emptying-clock-and-rest',variant:{cooldown:2,useCharges:{max:3,magazine:{refill:1,drip:true}}},commands:[bank(2,1.9),press,tick(.13),press,tick(2),tick(2)]},
 {name:'active-reload-beats-magazine',variant:{cooldown:4,useCharges:{max:3,magazine:true}},commands:[bank(1),press,tick(1),reload('host',1),tick(10)]},
 {name:'active-reload-full-refunds-itself',variant:{cooldown:4,useCharges:{max:3,magazine:true}},commands:[reload(),tick(0)]},
 {name:'active-reload-keeps-rest-clock',variant:{useCharges:{max:3,recharge:2}},commands:[bank(0,1.5),reload('host',1),tick(.5)]},
 {name:'empower-funded-and-dry',variant:{useCharges:{max:1,recharge:2,empower:.4}},commands:[press,tick(.13),press,tick(2),press]},
 {name:'vent-funded-and-dry',variant:{useCharges:{max:3,recharge:2,ventAll:true}},commands:[press,tick(.13),press,tick(2),press]},
 {name:'steps-captured-before-spend',variant:{useCharges:{max:3,recharge:2,stepsFromBank:true}},commands:[press,tick(.13),press]},
 {name:'moving-bleed-fractional-carry',variant:{useCharges:{max:4,recharge:2,still:{bleed:.5}}},commands:[bank(3,1),{type:'moving'},tick(.5),{type:'moving'},tick(.5),{type:'moving'},tick(.01),{type:'still'},tick(1)]},
 {name:'moving-large-frame-empties-bank',variant:{useCharges:{max:4,recharge:2,still:{bleed:.5}}},commands:[bank(4,.5),{type:'moving'},tick(100),tick(0)]},
 {name:'moving-manual-keeps-bank',variant:{useCharges:{max:4,still:{bleed:1}}},commands:[bank(3),{type:'moving'},tick(100)]},
 {name:'moving-drip-uses-cooldown-period',variant:{cooldown:2,useCharges:{max:4,magazine:{refill:1,drip:true},still:{bleed:.5}}},commands:[bank(3,1),{type:'moving'},tick(1.1),{type:'still'},tick(1)]},
 {name:'expired-magazine-refills-before-moving-bleed',variant:{cooldown:2,useCharges:{max:4,magazine:true,recharge:2,still:{bleed:1}}},commands:[bank(0,0,true),{type:'moving'},tick(1)]},
 {name:'live-cap-shrink-retains-excess-until-reload',variant:{useCharges:{max:4,recharge:2}},commands:[{type:'stat',id:'skillCharges',value:-3},tick(1),reload(),press]},
 {name:'live-charge-rate',variant:{useCharges:{max:4,recharge:2}},commands:[bank(0),{type:'stat',id:'skillChargeRate',value:2},tick(1)]},
 {name:'live-drip-rates',variant:{cooldown:4,useCharges:{max:4,magazine:{drip:true}}},commands:[bank(0),{type:'stat',id:'skillChargeRate',value:2},{type:'stat',id:'cooldownRecovery',value:2},tick(1)]},
 {name:'no-bank-restoration-no-refund',variant:{useCharges:undefined},commands:[reload()]},
 {name:'all-banks-reload',variant:{useCharges:{max:3}},commands:[bank(0),{type:'add-bank',patient:false},reload('all',1)]},
 {name:'patient-only-reload',variant:{useCharges:{max:3,still:{bleed:.5}}},commands:[bank(0),{type:'add-bank',patient:false},reload('still',1)]},
 {name:'patient-other-bank-reload',variant:{useCharges:{max:3}},commands:[bank(0),{type:'add-bank',patient:true},reload('still',1)]},
 {name:'unaffordable-empower-does-not-mint-bank',variant:{useCharges:{max:3,recharge:2,empower:.4}},commands:[{type:'empty-resources'},press]},
 {name:'unaffordable-vent-does-not-mint-bank',variant:{useCharges:{max:3,recharge:2,ventAll:true}},commands:[{type:'empty-resources'},press]},
 {name:'unaffordable-ammunition-retains-lazy-bank',variant:{useCharges:{max:3}},commands:[{type:'empty-resources'},press]},
 {name:'fractional-restoration-and-movement-bleed',variant:{useCharges:{max:3,recharge:2,still:{bleed:1}}},commands:[bank(0),reload('host',.5),{type:'moving'},tick(.1),{type:'still'},tick(2)]},
 {name:'native-scattergun-automatic-shell-reload',skill:'scattergun',commands:[bank(1),press,tick(1),tick(.2),press,...Array.from({length:10},()=>tick(.5))]},
 {name:'native-arquebus-powder-reload',skill:'arquebus',commands:[bank(1),press,tick(1),tick(.2),press,...Array.from({length:10},()=>tick(.5))]},
];
for(const def of Object.values(SKILLS).filter(d=>d.useCharges))courses.push({name:'authored-bank:'+def.id,skill:def.id,commands:[bank(0),tick(1),tick(10),reload('host',1),tick(.5)]});
for(const support of Object.values(SUPPORTS).filter(s=>s.munition||s.useChargeGraft))for(const cooldown of [0,2])courses.push({name:'graft:'+support.id+':'+cooldown,sockets:[support.id],variant:{cooldown,useCharges:undefined},commands:[bank(1,1),press,tick(4),reload(),tick(1)]});
const results:any[]=[];
for(const course of courses){
 const restore=seedGlobalRandom(260026);
 try{
  const w=makeSimWorld('magician',260026),aw:any=w,a=w.player;w.devIgnoreSkillAttributes=true;w.walk=null;a.pos={x:500,y:500};w.actors=[a];
  a.sheet.setSource('ammo-rig',[...['life','mana'].map(id=>mod(id,'override',10000)),...['lifeRegen','manaRegen','energyShield','critChance'].map(id=>mod(id,'override',0)),...['castSpeed','attackSpeed','cooldownRecovery','skillChargeRate','finalRoundDamage'].map(id=>mod(id,'override',1)),mod('skillCharges','override',0)]);a.fillResources();a.useLock=0;a.cooldowns.clear();a.idleFor=100;
  const def=course.skill?SKILLS[course.skill]:{...SKILLS.firebolt,manaCost:6,lifeCost:2,cooldown:0,useTime:0,castMode:'cast' as const,...course.variant};
  const inst=makeSkillInstance(def,1,3);for(const[index,id]of(course.sockets??[]).entries())inst.sockets[index]={def:SUPPORTS[id],level:1};a.skills=[inst];w.meta.knownSkills.set(def.id,inst);
  let calls:any[]=[];
  const bankMethod=a.skillChargeBank.bind(a),execute=w.executeSkill.bind(w),pay=aw.paySkillCost.bind(w),refund=aw.refundCooldown.bind(w),stamp=aw.stampSkillCooldown.bind(w);
  w.executeSkill=(...args:Parameters<typeof w.executeSkill>)=>{calls.push(wire({kind:'execute',skill:args[1].def.id,options:args[3]??{},banks:[...a.skillChargeState]}));return execute(...args);};
  aw.paySkillCost=(actor:any,skill:any,cost:any)=>{calls.push(wire({kind:'pay',skill:skill.def.id,cost}));return pay(actor,skill,cost);};
  aw.refundCooldown=(actor:any,id:any)=>{calls.push({kind:'refund',id});return refund(actor,id);};
  aw.stampSkillCooldown=(actor:any,skill:any,time:any)=>{calls.push({kind:'stamp',skill:skill.def.id,time,bank:wire(bankMethod(skill))});return stamp(actor,skill,time);};
  const snapshot=()=>wire({banks:[...a.skillChargeState],mana:a.mana,life:a.life,lock:a.useLock,clocks:[...a.cooldowns],totals:[...a.cooldownTotals],idle:a.idleFor,casting:a.casting?{mode:a.casting.mode,held:a.casting.held,elapsed:a.casting.elapsed,total:a.casting.total}:null,projectiles:w.projectiles.map(p=>({mult:p.mult,speed:p.speed})),repeats:aw.pendingRepeats.map((p:any)=>({left:p.left,t:p.t,remaining:p.remaining,mult:p.mult})),flashes:w.flashes.map(f=>({radius:f.radius,life:f.life,color:f.color}))});
  const initial=snapshot(),steps:any[]=[];
  for(const command of course.commands){calls=[];const before=snapshot();let accepted,terms,afterTimer;
   if(command.type==='bank')Object.assign(bankMethod(inst),{count:command.count,timer:command.timer,reloading:command.reloading});
   else if(command.type==='press')accepted=w.useSkill(a,inst,{x:600,y:500});
   else if(command.type==='tick'){
    terms=wire(a.skills.filter((s):s is SkillInstance=>!!s).map(s=>({skill:s.def.id,spec:instanceUseCharges(s),cap:a.skillChargeCap(s),cooldown:s.def.cooldown,still:a.skillBankStill(),rate:a.sheet.get('skillChargeRate',skillContextTags(s.def),instanceMods(s)),recovery:a.sheet.get('cooldownRecovery',skillContextTags(s.def),instanceMods(s))})));
    w.time+=command.dt;a.updateTimers(command.dt);afterTimer=snapshot();aw.updateCasting(a,command.dt);
   }
   else if(command.type==='moving')a.idleFor=0;
   else if(command.type==='still')a.idleFor=100;
   else if(command.type==='empty-resources'){a.mana=0;a.life=1;}
   else if(command.type==='stat')a.sheet.setSource('ammo:'+command.id,[mod(command.id,'override',command.value)]);
   else if(command.type==='add-bank'){const other=makeSkillInstance({...SKILLS.bolt_repeater,id:'ammo-other',useCharges:{max:3,...(command.patient?{still:{bleed:.5}}:{})}},1,3);a.skills.push(other);bankMethod(other).count=0;}
   else if(command.type==='reload'){
    const rack=makeSkillInstance({...SKILLS.re_energize,id:'ammo-reload',effects:[{type:'restoreSkillCharges',scope:command.scope,amount:command.amount}]},1,3);rack.hostSkillId=inst.def.id;
    a.cooldowns.set(rack.def.id,3);a.cooldownTotals.set(rack.def.id,3);w.executeSkill(a,rack,a.pos,{noCooldown:true});
   }else throw new Error(command.type);
   steps.push(wire({command,before,accepted,terms,afterTimer,calls,after:snapshot()}));
  }
  results.push(wire({name:course.name,skill:def.id,spec:instanceUseCharges(inst),initial,steps}));
 }finally{restore();}
}
const last=(name:string)=>results.find(c=>c.name===name).steps.at(-1),count=(name:string)=>last(name).after.banks[0][1].count;
assert.equal(count('trickle-at-most-one-per-frame'),4);assert.equal(count('moving-manual-keeps-bank'),3);assert.equal(count('moving-large-frame-empties-bank'),0);
for(const name of ['magazine-last-round-and-refill','empower-funded-and-dry','vent-funded-and-dry','steps-captured-before-spend'])for(const step of results.find(c=>c.name===name).steps)if(step.command.type==='press')assert.equal(step.accepted,true,name);
assert.equal(count('magazine-last-round-and-refill'),2);
assert.equal(count('native-scattergun-automatic-shell-reload'),3);
assert.equal(count('native-arquebus-powder-reload'),1);
assert.deepEqual(last('all-banks-reload').after.banks.map((r:any)=>r[1].count),[1,1]);
assert.deepEqual(last('patient-only-reload').after.banks.map((r:any)=>r[1].count),[1,0]);
assert.deepEqual(last('patient-other-bank-reload').after.banks.map((r:any)=>r[1].count),[0,1]);
assert.equal(count('active-reload-keeps-rest-clock'),2);
for(const name of ['unaffordable-empower-does-not-mint-bank','unaffordable-vent-does-not-mint-bank']){assert.equal(last(name).accepted,false);assert.deepEqual(last(name).after.banks,[]);}
assert.equal(last('unaffordable-ammunition-retains-lazy-bank').accepted,false);assert.equal(count('unaffordable-ammunition-retains-lazy-bank'),3);
const fractionCourse=results.find(c=>c.name==='fractional-restoration-and-movement-bleed');assert.equal(fractionCourse.steps[3].after.banks[0][1].count,-.5);assert.equal(fractionCourse.steps[5].after.banks[0][1].count,.5);
const output={schemaVersion:1,courses:results,authoredBanks:Object.values(SKILLS).filter(d=>d.useCharges).map(d=>({id:d.id,spec:d.useCharges})),grafts:Object.values(SUPPORTS).filter(s=>s.munition||s.useChargeGraft).map(s=>({id:s.id,munition:s.munition,graft:s.useChargeGraft}))};
fs.writeFileSync(process.argv[2],JSON.stringify(output,null,2)+'\n');console.log(results.length+' use-charge courses / '+results.reduce((n,c)=>n+c.steps.length,0)+' transitions.');
