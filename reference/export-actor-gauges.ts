// Raw original gauge publication. Record-only courses seed explicit boundary
// state and call the original publisher; the Communion course uses native APIs.
// No SDK imports, copied change detector, or generated expected outcome.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {makeSkillInstance} from '../src/engine/skills';
import {StatSheet,mod,gaugeMod} from '../src/engine/stats';
bootSimEngine();
type Command={kind:string;value?:any;id?:string};
type Course={name:string;diagnostic?:boolean;commands:Command[]};
const refresh:Command={kind:'refresh'};
const set=(kind:string,id:string,value:number):Command=>({kind,id,value});
const clear:Command={kind:'clear'};
const courses:Course[]=[
 {name:'empty-and-unchanged',commands:[refresh,refresh,refresh]},
 {name:'all-five-sources',commands:[set('status','poison',2),set('charge','communion',3),set('brim','firebolt',.4),set('reserve','wick',4),set('derived','nearbyEnemies',5),refresh,refresh,clear,refresh]},
 {name:'status-stack-change',commands:[set('status','poison',1),refresh,set('status','poison',2),refresh,set('status','poison',0),refresh]},
 {name:'charge-change-and-removal',commands:[set('charge','communion',1),refresh,set('charge','communion',4),refresh,set('charge','communion',0),refresh]},
 {name:'brim-quantization-thresholds',commands:[...([0,.099,.1,.101,.299,.3,.5,.7,.9,1] as const).flatMap(value=>[set('brim','firebolt',value),refresh])]},
 {name:'stable-quantized-brim-keeps-publication',commands:[set('brim','firebolt',.21),refresh,set('brim','firebolt',.22),refresh,set('brim','firebolt',.28),refresh]},
 {name:'brim-map-removal',commands:[set('brim','firebolt',.6),refresh,{kind:'remove-brims'},refresh,refresh]},
 {name:'reserve-pips-and-removal',commands:[set('reserve','wick',3),refresh,set('reserve','wick',2),refresh,set('reserve','wick',0),refresh]},
 {name:'derived-change-and-removal',commands:[set('derived','nearbyEnemies',3),refresh,set('derived','nearbyEnemies',1),refresh,set('derived','nearbyEnemies',0),refresh]},
 {name:'nonpositive-records-do-not-publish',commands:[set('status','poison',0),set('charge','communion',-1),set('brim','firebolt',-.1),set('reserve','wick',0),set('derived','nearbyEnemies',-1),refresh]},
 {name:'charge-order-changes',commands:[set('charge','communion',1),set('charge','frenzy',2),refresh,{kind:'reverse-charges'},refresh,refresh]},
 {name:'brim-order-changes',commands:[set('brim','firebolt',.2),set('brim','communion',.4),refresh,{kind:'reverse-brims'},refresh]},
 {name:'equal-content-new-map',commands:[set('charge','communion',1),set('brim','firebolt',.2),refresh,{kind:'copy-maps'},refresh]},
 {name:'changed-sheet-republishes',commands:[set('charge','communion',2),set('brim','firebolt',.6),refresh,{kind:'replace-sheet'},refresh,refresh]},
 {name:'clear-then-refill-same-value',commands:[set('charge','communion',1),refresh,clear,refresh,set('charge','communion',1),refresh]},
 {name:'simultaneous-same-raw-id-different-namespaces',commands:[set('status','communion',1),set('charge','communion',2),set('brim','communion',.6),set('reserve','communion',4),set('derived','communion',5),refresh,clear,refresh]},
];
for(const [from,to]of [['status','charge'],['charge','brim'],['brim','reserve'],['reserve','derived'],['derived','status']]){
 courses.push({name:'namespace-exchange:'+from+'-to-'+to,diagnostic:true,commands:[set(from,'communion',from==='brim'?.2:1),refresh,clear,set(to,'communion',to==='brim'?.2:1),refresh,refresh]});
}
courses.push({name:'native-communion-earned-bank-namespace-exchange',diagnostic:true,commands:[{kind:'timers'},{kind:'gain-charge'},{kind:'timers'},{kind:'native-gather'},{kind:'spend-charge'},{kind:'timers'},{kind:'publish-native-brim-directly'}]});
const keys=['status:poison','status:communion','charge:communion','charge:frenzy','brim:firebolt','brim:communion','reserve:wick','reserve:communion','nearbyEnemies','communion'];
const results:any[]=[];
for(const course of courses){const restore=seedGlobalRandom(360037);try{
 const world=makeSimWorld('magician',360037),actor=world.player,host:any=world;
 world.devIgnoreSkillAttributes=true;world.walk=null;world.actors=[actor];actor.pos={x:500,y:500};actor.aimPos={x:550,y:500};
 actor.statuses=[];actor.charges.clear();actor.brims=undefined;actor.reserves=undefined;actor.derivedGauges=null;
 const rig=[mod('mana','override',100000),mod('life','override',100000),mod('manaRegen','override',0),mod('lifeRegen','override',0),mod('castSpeed','override',1),mod('brimFill','override',1),gaugeMod('damage','increased',1,'charge:communion'),gaugeMod('damage','increased',4,'brim:communion')];
 actor.sheet.setSource('gauge-rig',rig);actor.fillResources();actor.useLock=0;actor.cooldowns.clear();
 const inst=makeSkillInstance(SKILLS.communion,1,1);inst.sockets[0]={def:SUPPORTS.gathered_casting,level:1};actor.skills=[inst];world.meta.knownSkills.set(inst.def.id,inst);
 let sheetId=0,phase='initial';const publications:any[]=[];
 const observe=()=>{sheetId++;const id=sheetId,set=actor.sheet.setGauges.bind(actor.sheet);actor.sheet.setGauges=entries=>{publications.push({phase,sheet:id,entries:entries.map(entry=>[...entry])});set(entries);};};observe();
 const sample=()=>({sheet:sheetId,damage:actor.sheet.get('damage'),gauges:keys.map(key=>[key,actor.sheet.gauge(key)]),
  statuses:actor.statuses.map(s=>[s.id,s.stacks]),charges:[...actor.charges],brims:[...(actor.brims??[])].map(([id,b])=>[id,b.fill]),reserves:[...(actor.reserves??[])].map(([id,r])=>[id,r.pips]),derived:[...(actor.derivedGauges??[])],mode:actor.casting?.mode??null,publicationCount:publications.length});
 const initial=sample(),steps:any[]=[];
 for(const command of course.commands){phase=command.kind;const start=publications.length;let result:any=null;
  if(command.kind==='refresh')actor['refreshConditions']();
  else if(command.kind==='timers')actor.updateTimers(0);
  else if(command.kind==='status'){
   // Only the publication boundary reads these seeded status fields. Native
   // timers are reserved for the separately named native-operation course.
   const st=actor.statuses.find(s=>s.id===command.id);
   if(st)st.stacks=command.value;else actor.statuses.push({id:command.id!,stacks:command.value,remaining:10,dps:0,sourceName:'gauge baseline'});
  }
  else if(command.kind==='charge')actor.charges.set(command.id!,command.value);
  else if(command.kind==='brim')(actor.brims??=new Map()).set(command.id!,{fill:command.value,inst,spec:{fillTime:2}});
  else if(command.kind==='reserve')(actor.reserves??=new Map()).set(command.id!,{pips:command.value,cur:command.value,max:10,lastSpendAt:0,ventUntil:0});
  else if(command.kind==='derived')(actor.derivedGauges??=new Map()).set(command.id!,command.value);
  else if(command.kind==='clear'){actor.statuses=[];actor.charges.clear();actor.brims=undefined;actor.reserves=undefined;actor.derivedGauges=null;}
  else if(command.kind==='remove-brims')actor.brims=undefined;
  else if(command.kind==='reverse-charges')actor.charges=new Map([...actor.charges].reverse());
  else if(command.kind==='reverse-brims')actor.brims=new Map([...(actor.brims??[])].reverse());
  else if(command.kind==='copy-maps'){actor.charges=new Map(actor.charges);actor.brims=new Map(actor.brims);}
  else if(command.kind==='replace-sheet'){actor.sheet=new StatSheet();actor.sheet.setSource('gauge-rig',rig);observe();}
  else if(command.kind==='gain-charge')actor.gainCharge('communion',1,5);
  else if(command.kind==='spend-charge')actor.spendCharge('communion',1);
  else if(command.kind==='native-gather'){
   assert(world.useSkill(actor,inst,actor.aimPos));assert.equal(actor.casting?.mode,'channel');
   const current=()=>actor.brims?.get('communion');let updates=0;
   while(Math.round((current()?.fill??0)*5)<1&&updates<200){host.updateCasting(actor,.02);updates++;}
   assert(current());assert.equal(Math.round(current()!.fill*5),1);result={updates,seededBrimFill:false};
  }
  else if(command.kind==='publish-native-brim-directly')actor.sheet.setGauges([['brim:communion',1]]);
  else assert.fail('Unknown command '+command.kind);
  steps.push({command,result,after:sample(),publications:publications.slice(start)});
 }
 results.push({name:course.name,diagnostic:!!course.diagnostic,initial,steps});
}finally{restore();}}
fs.writeFileSync(process.argv[2],JSON.stringify({schema:'hollow-wake-actor-gauge-reference/v1',courses:results.length,transitions:results.reduce((n,r)=>n+r.steps.length,0),results},null,2)+'\n');
