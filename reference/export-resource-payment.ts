// Investigation only: observations from the original Actor, not an accepted SDK fixture.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {Actor} from '../src/engine/actor';
import {mod} from '../src/engine/stats';
import {makeSkillInstance,skillContextTags,instanceMods} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {seedGlobalRandom} from '../src/sim/rng';
bootSimEngine();
type Command={op:string;[key:string]:any};
type Course={name:string;commands:Command[]};
const set=(values:Record<string,any>):Command=>({op:'set',values});
const stat=(id:string,value:number):Command=>({op:'stat',id,value});
const open=(lane:'mana'|'life',debt=0,idle=0):Command=>({op:'open',lane,debt,idle});
const pay=(mana:number,life=0):Command=>({op:'pay',cost:{mana,life}});
const quote=(mana:number,life=0):Command=>({op:'quote',cost:{mana,life}});
const tick=(dt:number):Command=>({op:'tick',dt});
const socket=(lane:'mana'|'life',id:string|null):Command=>({op:'socket',lane,id});
const courses:Course[]=[
 {name:'zero-life-zero-price-is-not-an-admission-gate',commands:[set({mana:0,es:0,life:0,dead:true}),quote(0),pay(0)]},
 {name:'mana-optional-terms-defaults',commands:[open('mana',20,0),{op:'defaults',lane:'mana'},set({mana:0,es:0}),pay(5),tick(2.5)]},
 {name:'life-optional-terms-defaults',commands:[open('life',20,0),{op:'defaults',lane:'life'},set({life:5}),pay(0,10),tick(2.5)]},
 {name:'missing-raw-spec-denies-new-debt-but-repayment-defaults-remain',commands:[open('mana',20,0),{op:'defaults',lane:'mana',removeSpec:true},set({mana:0,es:0}),quote(1),tick(.5)]},
 {name:'zero-price-with-empty-pools',commands:[set({mana:0,es:0,life:1}),quote(0),pay(0)]},
 {name:'mana-exact-price',commands:[set({mana:40,es:0}),quote(40),pay(40)]},
 {name:'no-lane-refuses-shortfall',commands:[set({mana:10,es:0}),quote(11),pay(11)]},
 {name:'mana-before-usable-energy-shield',commands:[stat('esToMana',.5),set({mana:10,es:60}),quote(40),pay(40)]},
 {name:'only-converted-es-fraction-is-available',commands:[stat('esToMana',.5),set({mana:0,es:60}),quote(30),quote(31),pay(20)]},
 {name:'mana-debt-after-both-pools',commands:[open('mana'),stat('esToMana',.5),set({mana:5,es:20}),quote(60),pay(60)]},
 {name:'reservation-contention-exact-boundary',commands:[open('mana'),set({reservedMana:90,mana:0,es:0}),quote(10),quote(10.0001),pay(10),quote(.001)]},
 {name:'mana-cap-boundary',commands:[open('mana',30,1),set({mana:0,es:0}),quote(20),quote(20.0001),pay(20),quote(.001)]},
 {name:'ordinary-life-price-must-leave-life',commands:[set({life:20}),quote(0,19),quote(0,20),pay(0,19)]},
 {name:'life-exact-price-borrows-whole',commands:[open('life'),set({life:20}),quote(0,20),pay(0,20)]},
 {name:'life-short-price-borrows-whole',commands:[open('life'),set({life:10}),quote(0,25),pay(0,25)]},
 {name:'life-headroom-prices-the-whole-cost',commands:[open('life',30,1),set({life:10}),quote(0,15),quote(0,10),pay(0,10)]},
 {name:'payable-life-price-spends-blood-with-lane',commands:[open('life',10,1),set({life:50}),pay(0,20)]},
 {name:'both-lanes-book-independently',commands:[open('mana'),open('life'),set({mana:0,es:0,life:10}),pay(30,20),tick(1),tick(2)]},
 {name:'pool-paid-cost-does-not-rearm-delay',commands:[open('mana',20,.2),set({mana:30}),pay(10),tick(.1)]},
 {name:'new-booking-rearms-live-delay',commands:[open('mana',10,.2),stat('overdriveIdleDelay',5),set({mana:0,es:0}),pay(10)]},
 {name:'repayment-before-idle-boundary',commands:[open('mana',20,.25),tick(.1),tick(.1)]},
 {name:'repayment-at-idle-boundary',commands:[open('mana',20,.25),tick(.25)]},
 {name:'crossing-idle-boundary-uses-whole-frame',commands:[open('mana',20,.1),tick(.2)]},
 {name:'zero-debt-still-advances-idle',commands:[open('mana',0,.5),tick(1)]},
 {name:'zero-frame-does-not-repay',commands:[open('mana',20,0),tick(0)]},
 {name:'large-frame-repays-to-exact-zero',commands:[open('mana',2,0),tick(10)]},
 {name:'controlled-burn-early-flow',commands:[open('mana',20,2),socket('mana','controlled_burn'),tick(.5),socket('mana',null),tick(.5)]},
 {name:'life-metabolism-and-speed',commands:[open('life',30,0),set({life:40}),stat('attackSpeed',2),tick(.5)]},
 {name:'controlled-burn-taxes-life-repayment',commands:[open('life',30,2),socket('life','controlled_burn'),tick(.5),tick(2)]},
 {name:'life-regenerates-before-debt-release',commands:[open('life',20,0),set({life:80}),tick(.5),tick(.5)]},
 {name:'healing-reduction-does-not-tax-repayment',commands:[open('life',20,0),set({life:40}),stat('healTaken',.5),tick(.5)]},
 {name:'regen-diversion-does-not-tax-repayment',commands:[open('life',20,0),set({life:40,es:0}),stat('lifeRegenToEs',1),tick(.5)]},
 {name:'dead-actor-does-not-advance-loan',commands:[open('mana',20,.5),set({dead:true}),tick(1),set({dead:false}),tick(.5)]},
 {name:'downed-actor-does-not-advance-loan',commands:[open('life',20,.5),set({downed:true}),tick(1),set({downed:false}),tick(.5)]},
 {name:'lowered-cap-refuses-new-debt-but-repays',commands:[open('mana',30,0),set({mana:0,es:0}),stat('overdriveCap',.1),quote(1),tick(1)]},
 {name:'zero-flow-holds-live-clock',commands:[open('mana',20,2),stat('overdriveFlow',0),tick(.5),stat('overdriveFlow',.5),tick(.5)]},
 {name:'unchecked-unaffordable-call-is-not-atomic',commands:[set({mana:3,es:0,life:20}),{op:'unchecked',cost:{mana:10,life:5}}]},
];
const wire=(v:any):any=>JSON.parse(JSON.stringify(v));
function run(course:Course,index:number){
 const restore=seedGlobalRandom(290000+index);
 try{
  const a:any=new Actor('Payment control','player',{x:0,y:0});
  for(const[id,value]of Object.entries({life:100,mana:100,energyShield:60,lifeRegen:8,manaRegen:0,lifeRegenPct:0,manaRegenPct:0,esRechargeRate:0,esToMana:0,poise:0,healTaken:1,attackSpeed:1}))a.sheet.setBase(id,value);
  a.fillResources();let events:any[]=[];
  const snapshot=()=>wire({mana:a.mana,life:a.life,es:a.es,reservedMana:a.reservedMana,reservedLife:a.reservedLife,maxMana:a.maxMana(),maxLife:a.maxLife(),availableMana:a.availableMaxMana(),lifeCeiling:a.lifeCeiling(),dead:a.dead,downed:!!a.downed,
   lanes:Object.fromEntries(['mana','life'].map(lane=>{const od=a.overdrive[lane];return[lane,od?{id:od.inst.def.id,debt:od.debt,idle:od.idle,headroom:a.overdraftHeadroom(lane)}:null];}))});
  a.onLifeSpent=(amount:number)=>events.push({kind:'spent',amount,at:snapshot()});
  a.onLifeHealed=(amount:number,silent:boolean)=>events.push({kind:'healed',amount,silent,at:snapshot()});
  const initial=snapshot(),steps:any[]=[];
  for(const command of course.commands){events=[];const before=snapshot();let result:any=null;
   switch(command.op){
    case 'set':Object.assign(a,command.values);break;
    case 'stat':a.sheet.setSource('payment-investigation:'+command.id,[mod(command.id,'override',command.value)]);break;
    case 'open':{const inst=makeSkillInstance(SKILLS[command.lane==='mana'?'overclock':'blood_mortgage'],1,1);a.overdrive[command.lane]={inst,debt:command.debt,idle:command.idle};a[command.lane==='mana'?'reservedMana':'reservedLife']+=command.debt;a.mana=Math.min(a.mana,a.availableMaxMana());a.life=Math.min(a.life,a.lifeCeiling());break;}
    case 'defaults':{const od=a.overdrive[command.lane],delivery={...od.inst.def.delivery};
     if(command.removeSpec)delete delivery.overdrive;else delivery.overdrive={lane:command.lane,cap:delivery.overdrive.cap};
     od.inst.def={...od.inst.def,delivery};break;}
    case 'socket':assert(a.overdrive[command.lane]);a.overdrive[command.lane].inst.sockets[0]=command.id?{def:SUPPORTS[command.id],level:1}:null;break;
    case 'quote':result=a.canAfford(command.cost);break;
    case 'pay':result=a.canAfford(command.cost);if(result)a.payCost(command.cost);break;
    case 'unchecked':result=a.canAfford(command.cost);a.payCost(command.cost);break;
    case 'tick':a.updateTimers(command.dt);break;
    default:throw Error('Unknown command '+command.op);
   }
   const terms:any={esToMana:a.sheet.get('esToMana'),lifeRegen:a.sheet.get('lifeRegen'),lifeRegenPct:a.sheet.get('lifeRegenPct'),attackSpeed:a.sheet.get('attackSpeed')};
   for(const lane of ['mana','life']){const od=a.overdrive[lane];if(!od)continue;const tags=skillContextTags(od.inst.def),extra=instanceMods(od.inst),spec=od.inst.def.delivery.overdrive;
    terms[lane]={spec,cap:a.sheet.get('overdriveCap',tags,extra,spec?.cap),flow:a.sheet.get('overdriveFlow',tags,extra),recovery:a.sheet.get('overdriveRecovery',tags,extra,lane==='mana'?(spec?.recoveryPct??.15):1),flat:a.sheet.get('overdriveRecoveryFlat',tags,extra,spec?.recoveryFlat??2),lifeFactor:a.sheet.get('overdriveLifeFactor',tags,extra,spec?.regenFactor??.75),idleDelay:a.sheet.get('overdriveIdleDelay',tags,extra,spec?.idleDelay??2.5)};
   }
   steps.push(wire({command,before,result,after:snapshot(),events,terms}));
  }
  if(course.name==='zero-life-zero-price-is-not-an-admission-gate')assert.equal(steps.find(s=>s.command.op==='quote')!.result,true);
  if(course.name==='mana-optional-terms-defaults'){assert.equal(steps.find(s=>s.command.op==='pay')!.after.lanes.mana.idle,2.5);assert.equal(a.overdrive.mana.debt,10.625);}
  if(course.name==='life-optional-terms-defaults'){assert.equal(steps.find(s=>s.command.op==='pay')!.after.lanes.life.idle,2.5);assert.equal(a.overdrive.life.debt,15);}
  if(course.name==='missing-raw-spec-denies-new-debt-but-repayment-defaults-remain'){assert.equal(steps.find(s=>s.command.op==='quote')!.result,false);assert.equal(a.overdrive.mana.debt,17.5);}
  if(course.name==='new-booking-rearms-live-delay')assert.equal(a.overdrive.mana.idle,5);
  if(course.name==='lowered-cap-refuses-new-debt-but-repays'){assert.equal(steps.find(s=>s.command.op==='quote')!.result,false);assert(a.overdrive.mana.debt<30);}
  if(course.name==='mana-before-usable-energy-shield'){assert.equal(a.mana,0);assert.equal(a.es,30);}
  if(course.name==='life-exact-price-borrows-whole'){assert.equal(a.overdrive.life.debt,20);assert.equal(a.life,20);assert(!events.some(e=>e.kind==='spent'));}
  if(course.name==='large-frame-repays-to-exact-zero'){assert.equal(a.overdrive.mana.debt,0);assert.equal(a.reservedMana,0);}
  return {name:course.name,initial,steps};
 }finally{restore();}
}
const result={status:'investigation, not accepted',scope:'Original Actor primitive and timer observations with explicitly injected lane records. Native aura admission, shared casting, wards, teardown and unlearning require additional game courses before acceptance.',courses:courses.map(run)};
fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('Investigated '+result.courses.length+' original payment courses, '+result.courses.reduce((n,c)=>n+c.steps.length,0)+' transitions.');
