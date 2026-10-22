// Investigation only: complete original World query and press paths, no SDK imports.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {makeSkillInstance} from '../src/engine/skills';
import {ATTRIBUTE_IDS,mod} from '../src/engine/stats';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
bootSimEngine();
type Command={op:string;id?:string;[key:string]:any};
type Course={name:string;skills:string[];sockets?:Record<string,string[]>;definitions?:Record<string,any>;commands:Command[]};
const query=(id:string):Command[]=>['actor','hud','press-query'].map(op=>({op,id}));
const press=(id:string,expected?:boolean):Command=>({op:'press',id,expected});
const set=(values:any):Command=>({op:'set',values});
const frames=(count:number):Command=>({op:'frames',count});
const courses:Course[]=[
 {name:'empty-gun-press-is-native-reload',skills:['scattergun'],commands:[{op:'bank',id:'scattergun',count:0},...query('scattergun'),press('scattergun',true),{op:'expect-cast',id:'reload_shells',mode:'channel'},frames(90)]},
 {name:'unaffordable-hud-is-supplementary',skills:['ruin'],commands:[set({mana:0,es:0}),...query('ruin'),press('ruin',false),set({mana:1000}),...query('ruin'),press('ruin',true),frames(90)]},
 {name:'reflex-flask-preserves-running-cast',skills:['ruin','life_flask'],commands:[press('ruin',true),set({life:800}),{op:'charge',id:'flask_life',amount:1},...query('life_flask'),press('life_flask',true),{op:'expect-cast',id:'ruin',mode:'cast'},press('life_flask',false),frames(90)]},
 {name:'native-guard-combo-retains-hold',skills:['shield_up','phalanx_thrust','transgression'],commands:[...query('phalanx_thrust'),press('phalanx_thrust',false),press('shield_up',true),...query('phalanx_thrust'),press('phalanx_thrust',true),{op:'expect-cast',id:'shield_up',mode:'guard'},...query('transgression'),press('transgression',false),frames(10),...query('transgression'),press('transgression',true),{op:'expect-cast',id:'shield_up',mode:'guard'}]},
 {name:'trigger-button-arms-without-casting',skills:['firebolt'],sockets:{firebolt:['cast_on_crit']},commands:[...query('firebolt'),{op:'ai-press',id:'firebolt',expected:false},press('firebolt',true),press('firebolt',true)]},
 {name:'cast-seal-precedes-trigger-toggle',skills:['firebolt'],sockets:{firebolt:['cast_on_crit']},commands:[{op:'seal',value:{}},...query('firebolt'),press('firebolt',false),{op:'seal',value:null},press('firebolt',true)]},
 {name:'qualified-enemy-hud-refuses-without-status',skills:['expunge'],commands:[...query('expunge'),press('expunge',false),{op:'target-status',id:'poison'},...query('expunge'),press('expunge',true),frames(60)]},
 {name:'corpse-hud-never-resolves-side-effects',skills:['corpse_explosion'],sockets:{corpse_explosion:['sacrificial_rites']},definitions:{corpse_explosion:{targeting:{...SKILLS.corpse_explosion.targeting,requiresStatus:'poison'}}},commands:[{op:'minion'},...query('corpse_explosion'),{op:'expect-minion-alive'},press('corpse_explosion'),frames(60)]},
 {name:'native-golem-swap-replaces-reservation',skills:['summon_fire_golem','summon_ice_golem'],commands:[press('summon_fire_golem',true),frames(100),{op:'reset-body'},...query('summon_ice_golem'),press('summon_ice_golem',true),frames(100),{op:'reset-body'},set({mana:0}),...query('summon_ice_golem'),press('summon_ice_golem',true)]},
 {name:'world-gate-note-before-unaffordable-actor-check',skills:['life_flask'],commands:[...query('life_flask'),press('life_flask',false),set({life:800}),...query('life_flask'),press('life_flask',false),{op:'charge',id:'flask_life',amount:1},press('life_flask',true)]},
 {name:'reserve-refusal-does-not-spend-mana',skills:['ruin'],commands:[{op:'reserve',amount:1},...query('ruin'),press('ruin',false),{op:'reserve',amount:2},...query('ruin'),press('ruin',true),frames(90)]},
];
const wire=(value:any):any=>JSON.parse(JSON.stringify(value));
function run(course:Course,index:number){
 const restore=seedGlobalRandom(301000+index);
 try{
  const w=makeSimWorld('warrior',301000+index),a=w.player,aw:any=w;
  for(const id of ATTRIBUTE_IDS)w.localSeat.meta.baseAttrs[id]=40;
  w.recalcSeat(w.localSeat);aw.walk=null;
  const foe=w.createMonster('zombie',1,'enemy');foe.brain=undefined;foe.tier=a.tier;w.springAmbush(foe,true);foe.untargetable=false;
  w.actors=[a,foe];a.pos={x:500,y:500};foe.pos={x:560,y:500};a.aimPos={...foe.pos};
  for(const actor of [a,foe]){actor.sheet.setSource('admission-investigation',[
   mod('life','override',1000),mod('mana','override',1000),mod('energyShield','override',0),mod('lifeRegen','override',0),mod('manaRegen','override',0),mod('poise','override',0),mod('critChance','override',0),mod('accuracy','override',100000),
  ]);actor.fillResources();}
  const instances=new Map(course.skills.map(id=>{assert(SKILLS[id],id);const inst=makeSkillInstance({...SKILLS[id],...course.definitions?.[id]},1,3);
   for(const[n,support]of(course.sockets?.[id]??[]).entries()){assert(SUPPORTS[support],support);inst.sockets[n]={def:SUPPORTS[support],level:1};}
   w.localSeat.meta.knownSkills.set(id,inst);return[id,inst] as const;
  }));
  a.skills=[...instances.values()];a.useLock=0;a.cooldowns.clear();
  let calls:any[]=[];let minion:any;
  const actorMethods=['canUse','unmetGate','payCost'] as const;
  for(const name of actorMethods){const original=(a as any)[name].bind(a);(a as any)[name]=(...args:any[])=>{calls.push({method:name,skill:args[0]?.def?.id,cost:name==='payCost'?wire(args[0]):undefined});return original(...args);};}
  for(const name of ['castSealed','resolveTargeting','executeSkill','failNote']){const original=aw[name].bind(w);aw[name]=(...args:any[])=>{if(args[0]===a)calls.push(wire({method:name,skill:args[1]?.def?.id,note:name==='failNote'?args[2]:undefined}));return original(...args);};}
  const state=()=>wire({time:w.time,mana:a.mana,life:a.life,es:a.es,reservedMana:a.reservedMana,useLock:a.useLock,reflexLock:a.reflexLock,
   casting:a.casting?{id:a.casting.inst.def.id,hostSkillId:a.casting.inst.hostSkillId,mode:a.casting.mode,elapsed:a.casting.elapsed,held:a.casting.held,shield:a.casting.shield}:null,
   cooldowns:[...a.cooldowns],banks:[...a.skillChargeState],charges:[...a.charges],reserves:a.reserves?[...a.reserves]:null,
   contracts:[...a.summonToggles].map(([id,c])=>({id,reserved:c.reserved,slots:c.slots})),
   instances:[...instances].map(([id,i])=>({id,state:i.state})),
   target:{life:foe.life,dead:foe.dead,statuses:foe.statuses.map(s=>({id:s.id,remaining:s.remaining}))},
   minion:minion?{dead:minion.dead,life:minion.life}:null,
   corpses:w.corpses.map(c=>({pos:c.pos,defId:c.defId,maxLife:c.maxLife,remaining:c.remaining})),
   actors:w.actors.map(body=>({owner:body.owner===a,dead:body.dead,kind:body.kind})),
   projectiles:w.projectiles.map(p=>({skill:p.inst.def.id,mult:p.mult})),
  });
  const initial=state(),steps:any[]=[];
  for(const command of course.commands){calls=[];const before=state();let result:any=null;const inst=command.id?instances.get(command.id):undefined;
   switch(command.op){
    case 'set':Object.assign(a,command.values);break;
    case 'bank':assert(inst);a.skillChargeBank(inst).count=command.count;break;
    case 'charge':a.charges.set(command.id!,command.amount);break;
    case 'actor':assert(inst);result=a.canUse(inst);break;
    case 'hud':assert(inst);result=w.skillUsable(a,inst);if(course.name==='corpse-hud-never-resolves-side-effects')assert(!calls.some(c=>c.method==='resolveTargeting'));break;
    case 'press-query':assert(inst);result=w.pressUsable(a,inst);break;
    case 'press':case 'ai-press':assert(inst);result=w.useSkill(a,inst,{...foe.pos},command.op==='press');if(command.expected!==undefined)assert.equal(result,command.expected,course.name+':'+command.id);break;
    case 'expect-cast':assert.equal(a.casting?.inst.def.id,command.id,course.name);assert.equal(a.casting?.mode,command.mode);break;
    case 'frames':for(let i=0;i<command.count;i++)w.update(1/60);break;
    case 'seal':aw.zone={...w.zone,castSeal:command.value??undefined};break;
    case 'reset-body':a.casting=null;a.useLock=0;a.reflexLock=0;a.cooldowns.clear();break;
    case 'target-status':foe.statuses.push({id:command.id,remaining:10,magnitude:1,source:a} as any);break;
    case 'minion':minion=w.createMonster('zombie',1,'player');minion.owner=a;minion.brain=undefined;minion.pos={x:550,y:500};w.actors.push(minion);break;
    case 'expect-minion-alive':assert(minion&&!minion.dead);break;
    case 'reserve':a.reserveSpecs=[{id:'investigation',max:2,perCast:2}] as any;a.reserves=new Map([['investigation',{cur:command.amount,ventUntil:0} as any]]);break;
    default:throw Error(command.op);
   }
   steps.push(wire({command,before,result,after:state(),calls}));
  }
  if(course.name==='empty-gun-press-is-native-reload'){assert.equal(steps.find(s=>s.command.op==='actor')!.result,false);assert.equal(steps.find(s=>s.command.op==='press-query')!.result,true);assert(a.skillChargeBank(instances.get('scattergun')!).count>0);}
  if(course.name==='trigger-button-arms-without-casting'){assert.equal(steps.find(s=>s.command.op==='hud')!.result,false);assert(!steps.some(s=>s.calls.some((c:any)=>c.method==='payCost'||c.method==='executeSkill')));}
  if(course.name==='native-golem-swap-replaces-reservation')assert.equal(a.summonToggles.size,0);
  return {name:course.name,skills:course.skills,sockets:course.sockets,definitions:course.definitions,initial,steps};
 }finally{restore();}
}
const result={status:'investigation, not accepted',scope:'Native World query/press/update paths with explicit pooled-resource, ammunition, status, reserve and minion setup. Existing skills and real trigger/reload/guard/reflex/summon behavior; one derived corpse target qualifies the side-effect exclusion. This is not mounted UI or device evidence.',courses:courses.map(run)};
fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('Investigated '+result.courses.length+' native admission courses and '+result.courses.reduce((n,c)=>n+c.steps.length,0)+' transitions.');
