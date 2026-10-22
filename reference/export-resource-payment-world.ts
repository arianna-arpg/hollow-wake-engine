// Investigation only. Native aura admission, spending, repayment and locks.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {makeSkillInstance,skillContextTags,instanceMods} from '../src/engine/skills';import {ATTRIBUTE_IDS,mod} from '../src/engine/stats';
import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';
bootSimEngine();
type Command={op:string;[key:string]:any};type Course={name:string;commands:Command[]};
const press=(id:string):Command=>({op:'press',id}),set=(values:Record<string,number|boolean>):Command=>({op:'set',values});
const frames=(count:number,dt=1/60):Command=>({op:'frames',count,dt}),stat=(id:string,value:number):Command=>({op:'stat',id,value});
const costs=(id:string,key:'mana'|'life',add=0):Command=>({op:'pool-at-price',id,key,add});
const courses:Course[]=[
 {name:'native-no-lane-refusal-then-mana-overdraft',commands:[set({mana:0,es:0}),press('convocation'),press('overclock'),frames(3),set({mana:0,es:0}),press('convocation'),press('overclock'),{op:'unlearn',id:'overclock'},frames(60)]},
 {name:'native-mana-pays-first-and-debt-rearms',commands:[press('overclock'),frames(3),costs('convocation','mana',-5),set({es:0}),press('convocation'),frames(60),costs('convocation','mana',-5),press('convocation')]},
 {name:'native-controlled-burn-trickles-before-idle',commands:[{op:'socket',skill:'overclock',id:'controlled_burn'},press('overclock'),frames(3),set({mana:0,es:0}),press('convocation'),frames(30),{op:'capture-flow',lane:'mana'}]},
 {name:'native-life-blood-then-whole-debt',commands:[press('blood_mortgage'),frames(3),press('sanguine_burst'),costs('sanguine_burst','life'),press('sanguine_burst'),press('blood_mortgage'),{op:'unlearn',id:'blood_mortgage'},frames(180)]},
 {name:'native-exact-repayment-releases-locks',commands:[press('overclock'),frames(3),set({mana:0,es:0}),press('convocation'),stat('overdriveRecoveryFlat',1000),frames(180),press('overclock'),{op:'unlearn',id:'overclock'}]},
 {name:'native-mana-ward-excludes-debt',commands:[stat('costWard_mana',2),press('overclock'),frames(3),set({mana:5,es:0,absorb:0}),press('convocation'),{op:'expect-ward',positive:true}]},
 {name:'native-mana-ward-excludes-es',commands:[stat('costWard_mana',2),stat('esToMana',1),stat('energyShield',100),set({mana:0,es:100,absorb:0}),press('convocation'),{op:'expect-ward',positive:false}]},
 {name:'native-life-ward-excludes-borrowing',commands:[stat('costWard_life',2),press('blood_mortgage'),frames(3),costs('sanguine_burst','life'),set({absorb:0}),press('sanguine_burst'),{op:'expect-ward',positive:false}]},
 {name:'native-life-ward-pays-for-blood',commands:[stat('costWard_life',2),set({absorb:0}),press('sanguine_burst'),{op:'expect-ward',positive:true}]},
 {name:'native-death-teardown-clears-debt',commands:[press('overclock'),frames(3),set({mana:0,es:0}),press('convocation'),set({dead:true}),{op:'deactivate',id:'overclock'}]},
];
const wire=(v:any):any=>JSON.parse(JSON.stringify(v));
function run(course:Course,index:number){const restore=seedGlobalRandom(291000+index);
 try{
  const w=makeSimWorld('warrior',291000+index),a=w.player,aw:any=w;
  for(const id of ATTRIBUTE_IDS)w.localSeat.meta.baseAttrs[id]=40;w.recalcSeat(w.localSeat);w.actors=[a];aw.walk=null;
  for(const id of ['overclock','blood_mortgage']){const item=w.grantSkillGemItem(w.localSeat,makeSkillInstance(SKILLS[id],1,1));assert(item&&w.learnSkill(item.uid,w.localSeat),'Native loan must be learned');}
  const instances=new Map(['overclock','blood_mortgage'].map(id=>[id,w.localSeat.meta.knownSkills.get(id)!]));
  for(const id of ['convocation','sanguine_burst'])instances.set(id,makeSkillInstance(SKILLS[id],1,1));
  w.update(0);let calls:any[]=[];
  const state=()=>wire({mana:a.mana,life:a.life,es:a.es,reservedMana:a.reservedMana,reservedLife:a.reservedLife,maxMana:a.maxMana(),maxLife:a.maxLife(),maxEs:a.maxEs(),availableMana:a.availableMaxMana(),lifeCeiling:a.lifeCeiling(),dead:a.dead,downed:a.downed,absorb:a.absorb,absorbTimer:a.absorbTimer,
   casting:a.casting?{id:a.casting.inst.def.id,mode:a.casting.mode,elapsed:a.casting.elapsed}:null,
   auras:[...a.activeAuras.keys()],knownLoans:['overclock','blood_mortgage'].filter(id=>w.localSeat.meta.knownSkills.has(id)),
   lanes:Object.fromEntries((['mana','life'] as const).map(lane=>{const od=a.overdrive[lane];return[lane,od?{id:od.inst.def.id,debt:od.debt,idle:od.idle}:null];}))});
  const nativePay=a.payCost.bind(a);a.payCost=cost=>{const row={kind:'pay',cost:wire(cost),before:state()};nativePay(cost);calls.push({...row,after:state()});};
  const nativeSpent=a.onLifeSpent;a.onLifeSpent=amount=>{calls.push({kind:'spent',amount,at:state()});nativeSpent?.(amount);};
  const initial=state(),steps:any[]=[];
  for(const command of course.commands){calls=[];const before=state();let result:any=null;
   switch(command.op){
    case 'set':Object.assign(a,command.values);if(command.values.es!==undefined)assert(a.es<=a.maxEs(),'Seeded ES exceeds its actual capacity');break;
    case 'stat':a.sheet.setSource('payment-investigation:'+command.id,[mod(command.id,'override',command.value)]);break;
    case 'pool-at-price':{const price=a.skillCost(instances.get(command.id)!);assert(price[command.key as 'mana'|'life']>0);(a as any)[command.key]=price[command.key as 'mana'|'life']+command.add;result=price;break;}
    case 'press':{a.casting=null;a.useLock=0;a.cooldowns.clear();w.time+=10;result=w.useSkill(a,instances.get(command.id)!,{x:a.pos.x+60,y:a.pos.y});break;}
    case 'frames':for(let i=0;i<command.count;i++)w.update(command.dt);break;
    case 'socket':{const gem=w.grantSupportGemItem(w.localSeat,{def:SUPPORTS[command.id],level:1});assert(gem&&w.socketSupport(gem.uid,command.skill));break;}
    case 'unlearn':result=w.unlearnSkill(command.id,w.localSeat);break;
    case 'capture-flow':{const od=a.overdrive[command.lane as 'mana'|'life'];assert(od);result=a.sheet.get('overdriveFlow',skillContextTags(od.inst.def),instanceMods(od.inst));assert(result>0);break;}
    case 'expect-ward':assert.equal(a.absorb>0,command.positive,'Unexpected native ward '+course.name);break;
    case 'deactivate':aw.deactivateAura(a,command.id);assert(!a.activeAuras.has(command.id));assert(!a.overdrive.mana);assert.equal(a.reservedMana,0);break;
    default:throw Error('Unknown native operation '+command.op);
   }
   steps.push(wire({command,before,result,after:state(),calls}));
  }
  if(course.name.includes('refusal')){assert.equal(steps.find(s=>s.command.id==='convocation')!.result,false);assert(a.overdrive.mana!.debt>0);}
  if(course.name==='native-exact-repayment-releases-locks'){assert(!a.overdrive.mana);assert(!w.localSeat.meta.knownSkills.has('overclock'));}
  return{name:course.name,initial,steps};
 }finally{restore();}
}
const result={status:'investigation, not accepted',scope:'Native World admission and shared payment with real learned Overclock/Blood Mortgage, Convocation/Sanguine Burst, socketed Controlled Burn, real actor timers, debt locks, native cost wards and explicit post-death aura teardown. Presses reset unrelated cooldown/input state; no source behavior changed.',courses:courses.map(run)};
fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log('Investigated '+result.courses.length+' native payment courses, '+result.courses.reduce((n,c)=>n+c.steps.length,0)+' transitions.');
