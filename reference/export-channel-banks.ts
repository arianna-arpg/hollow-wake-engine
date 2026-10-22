// Raw original persistent-bank observations. No SDK imports or copied algorithms.
// Explicit records/variants exercise boundary states; native courses earn fill.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {makeSkillInstance,type BrimSpec,type SkillDef,type SkillInstance} from '../src/engine/skills';
import {mod,gaugeMod} from '../src/engine/stats';
bootSimEngine();
type Command={kind:string;dt?:number;value?:any;id?:string};
type Course={name:string;skill?:string;gather?:boolean;channelTag?:boolean;brim?:BrimSpec;commands:Command[]};
const press:Command={kind:'press'},release:Command={kind:'release'};
const tick=(dt:number):Command=>({kind:'tick',dt}),world=(dt:number):Command=>({kind:'world',dt});
const bank=(fill:number,spec:Partial<BrimSpec>={},id='bank_probe'):Command=>({kind:'bank',id,value:{fill,spec}});
const courses:Course[]=[
 {name:'absent-bank-stays-lazy',commands:[world(0),world(.1),{kind:'ready'}]},
 {name:'empty-map-retains-identity',commands:[{kind:'empty-map'},world(.1),world(.1)]},
 {name:'native-marrow-birth-interruption-resume',skill:'marrow_communion',commands:[press,tick(.5),{kind:'stun'},tick(.1),{kind:'unstun'},press,tick(.5),release,tick(0)]},
 {name:'native-gather-earned-bank-thin-release',skill:'communion',gather:true,commands:[press,...Array.from({length:11},()=>tick(.02)),release,tick(0),{kind:'ready'}]},
 ...[.149,.15,.151].map(fill=>({name:'gather-cooldown-readiness:'+fill,skill:'communion',gather:true,commands:[bank(fill,{},'communion'),{kind:'cooldown',value:1},{kind:'ready'}]})),
 {name:'new-bank-is-created-on-advance',commands:[press,tick(0),tick(.25),release,tick(0)]},
 {name:'existing-record-is-rebound',commands:[bank(.3),press,tick(0),{kind:'replace-instance'},tick(0),{kind:'replace-spec',value:{fillTime:4,decay:.1,spend:false}},tick(0),release,tick(0)]},
 {name:'thin-release-keeps-earned-fill',brim:{fillTime:2,minRelease:.5},commands:[press,tick(.5),release,tick(0),world(.1)]},
 {name:'spent-record-deleted-by-next-positive-world-step',brim:{fillTime:2},commands:[press,tick(.5),release,tick(0),world(0),world(.01)]},
 {name:'held-same-bank-does-not-decay',commands:[bank(.6,{decay:.25}),press,tick(0),world(.2)]},
 {name:'held-other-bank-decays',commands:[bank(.6,{decay:.25},'other_bank'),press,tick(0),world(.2)]},
 {name:'minimum-fill-rate-before-held-bank-sweep',brim:{fillTime:2,decay:.25},commands:[press,tick(0),{kind:'fill-rate',value:0},world(.1)]},
 {name:'zero-idle-record-deleted-without-query',commands:[bank(0,{decay:.25}),world(.1)]},
 {name:'negative-idle-record-deleted-without-query',commands:[bank(-.1,{decay:.25}),world(.1)]},
 {name:'no-decay-retains-fill',commands:[bank(.4),world(2)]},
 {name:'zero-decay-retains-fill',commands:[bank(.4,{decay:0}),world(2)]},
 {name:'ordinary-decay-then-delete',commands:[bank(.6,{decay:.25}),world(.5),world(2)]},
 {name:'large-frame-retains-negative-final-record-value',commands:[bank(.1,{decay:.25}),world(4)]},
 {name:'exact-plateau-skips-query',commands:[bank(.5,{decay:.25,bankAt:.5}),world(.5)]},
 {name:'above-plateau-skips-query',commands:[bank(.7,{decay:.25,bankAt:.5}),world(.5)]},
 {name:'below-plateau-drains',commands:[bank(.499,{decay:.25,bankAt:.5}),world(.5)]},
 {name:'zero-world-step-skips-sweep',commands:[bank(0,{decay:.25}),world(0),world(.01)]},
 {name:'multiple-delete-order',commands:[bank(.05,{decay:.25},'first'),bank(.6,{decay:.25},'second'),bank(0,{decay:.25},'third'),world(.5),world(2)]},
 {name:'live-global-decay-multiplier',commands:[bank(.8,{decay:.25}),{kind:'decay-rate',value:2},world(.5),{kind:'decay-rate',value:.5},world(.5)]},
 {name:'incompatible-stillwater-socket-keeps-decay',commands:[bank(.8,{decay:.25}),{kind:'socket',value:'stillwater_discipline'},world(.5),{kind:'socket',value:null},world(.5)]},
 {name:'live-stillwater-socket-freezes-then-restores-decay',channelTag:true,commands:[bank(.8,{decay:.25}),{kind:'socket',value:'stillwater_discipline'},world(.5),{kind:'socket',value:null},world(.5)]},
 {name:'skill-context-decay-modifier',commands:[bank(.8,{decay:.25}),{kind:'tagged-decay'},world(.5)]},
 {name:'menu-pause-and-release',commands:[bank(.6,{decay:.25}),{kind:'hold',value:{id:'probe-menu',scale:0,kind:'menu'}},world(1),{kind:'unhold',id:'probe-menu'},world(.5)]},
 {name:'world-slow-time',commands:[bank(.6,{decay:.25}),{kind:'hold',value:{id:'probe-world',scale:.5}},world(.5)]},
 {name:'actor-slow-time',commands:[bank(.6,{decay:.25}),{kind:'hold',value:{id:'probe-actor',scale:.5,actors:{onlyTeam:'player'}}},world(.5)]},
 {name:'combined-world-and-actor-time',commands:[bank(.6,{decay:.25}),{kind:'hold',value:{id:'probe-world',scale:.5}},{kind:'hold',value:{id:'probe-actor',scale:.5,actors:{onlyTeam:'player'}}},world(.5)]},
 {name:'actor-stasis-and-release',commands:[bank(.6,{decay:.25}),{kind:'hold',value:{id:'probe-stasis',scale:0,actors:{onlyTeam:'player'}}},world(.5),{kind:'unhold',id:'probe-stasis'},world(.5)]},
 {name:'publication-precedes-decay-until-next-timer',commands:[bank(.11,{decay:.25}),{kind:'timers'},world(.2),{kind:'timers'},world(.4)]},
];
const results:any[]=[];
for(const course of courses){const restore=seedGlobalRandom(360036);try{
 const w=makeSimWorld('magician',360036),a=w.player,host:any=w;
 w.devIgnoreSkillAttributes=true;w.walk=null;w.actors=[a];a.pos={x:500,y:500};a.aimPos={x:550,y:500};
 a.statuses=[];a.charges.clear();a.brims=undefined;
 a.sheet.setSource('bank-rig',[
  ...['mana','life'].map(id=>mod(id,'override',100000)),
  ...['manaRegen','lifeRegen','energyShield','poise'].map(id=>mod(id,'override',0)),
  ...['castSpeed','attackSpeed','brimFill','effectDuration','cooldownRecovery'].map(id=>mod(id,'override',1)),
  gaugeMod('damage','increased',4,'brim:bank_probe'),
 ]);a.fillResources();a.useLock=0;a.cooldowns.clear();
 const def:SkillDef=course.skill?SKILLS[course.skill]:{...SKILLS.firebolt,id:'bank_probe',manaCost:0,lifeCost:0,cooldown:0,useTime:0,castMode:'channel',delivery:{type:'self'},effects:[],channel:{interval:.5,move:'normal',brim:course.brim??{fillTime:2,decay:.25,spend:false},release:{pulses:false}}};
 if(course.channelTag)def.tags=[...def.tags,'channel'];
 let inst=makeSkillInstance(def,1,1);if(course.gather)inst.sockets[0]={def:SUPPORTS.gathered_casting,level:1};
 a.skills=[inst];w.meta.knownSkills.set(def.id,inst);
 const identities=new WeakMap<object,number>();let nextIdentity=1;
 const identity=(value:object|undefined|null)=>{if(!value)return null;let n=identities.get(value);if(n===undefined){n=nextIdentity++;identities.set(value,n);}return n;};
 const retained:{fill:number;inst:SkillInstance;spec:BrimSpec}[]=[];
 const events:any[]=[];let phase='setup';
 const get=a.sheet.get.bind(a.sheet);a.sheet.get=(id,tags,extra,base)=>{const value=get(id,tags,extra,base);if(id==='brimDecay')events.push({kind:'decay-query',phase,tags:tags?[...tags]:null,extra:JSON.parse(JSON.stringify(extra??null)),value});return value;};
 const publish=a.sheet.setGauges.bind(a.sheet);a.sheet.setGauges=entries=>{events.push({kind:'publish',phase,entries:entries.map(e=>[...e])});publish(entries);};
 const snapshot=()=>({time:w.time,map:identity(a.brims),active:identity(a.casting),mode:a.casting?.mode??null,held:a.casting?.held??null,instance:identity(inst),
  banks:[...(a.brims??[])].map(([id,b])=>({id,record:identity(b),fill:b.fill,instance:identity(b.inst),spec:identity(b.spec),terms:{...b.spec},pips:a.sheet.gauge('brim:'+id)})),
  retained:retained.map(b=>({record:identity(b),fill:b.fill,instance:identity(b.inst),spec:identity(b.spec)})),gauge:a.sheet.gauge('brim:bank_probe'),damage:a.sheet.get('damage')});
 const initial=snapshot(),steps:any[]=[];
 for(const command of course.commands){phase=command.kind;const start=events.length;let result:any=null;
  if(command.kind==='press')result=w.useSkill(a,inst,a.aimPos!);
  else if(command.kind==='tick')host.updateCasting(a,command.dt!);
  else if(command.kind==='world')w.update(command.dt!);
  else if(command.kind==='release'){assert(a.casting,course.name);a.casting.held=false;}
  else if(command.kind==='bank'){
   const bankInst=command.id===def.id?inst:makeSkillInstance({...def,id:command.id!},1,1);
   const b={fill:command.value.fill,inst:bankInst,spec:{fillTime:2,...command.value.spec}};
   (a.brims??=new Map()).set(command.id!,b);retained.push(b);
  }
  else if(command.kind==='empty-map')a.brims=new Map();
  else if(command.kind==='replace-instance'){assert(a.casting);inst=makeSkillInstance(def,2,1);a.skills=[inst];a.casting.inst=inst;}
  else if(command.kind==='replace-spec'){assert(inst.def.channel);inst.def={...inst.def,channel:{...inst.def.channel,brim:command.value}};}
  else if(command.kind==='socket'){inst.sockets[0]=command.value?{def:SUPPORTS[command.value],level:1}:null;}
  else if(command.kind==='fill-rate')a.sheet.setSource('bank-fill',[mod('brimFill','override',command.value)]);
  else if(command.kind==='decay-rate')a.sheet.setSource('bank-decay',[mod('brimDecay','override',command.value)]);
  else if(command.kind==='tagged-decay')a.sheet.setSource('bank-context',[{...mod('brimDecay','more',1),tags:['spell']}]);
  else if(command.kind==='hold')result=w.timeflow.hold(command.value);
  else if(command.kind==='unhold')w.timeflow.release(command.id!);
  else if(command.kind==='timers')a.updateTimers(0);
  else if(command.kind==='cooldown'){a.cooldowns.set(inst.def.id,command.value);a.useLock=0;}
  else if(command.kind==='ready')result=a.canUse(inst);
  else if(command.kind==='stun')a.applyStatus('stun',0,2,'bank baseline');
  else if(command.kind==='unstun')a.statuses=a.statuses.filter(s=>s.id!=='stun');
  else assert.fail('Unknown command '+command.kind);
  steps.push({command,result,after:snapshot(),events:events.slice(start)});
 }
 results.push({name:course.name,skill:def.id,gather:!!course.gather,initial,steps});
}finally{restore();}}
const byName=(name:string)=>results.find(row=>row.name===name)!;
const last=(name:string)=>byName(name).steps.at(-1).after;
assert.equal(last('absent-bank-stays-lazy').map,null);
assert.equal(last('empty-map-retains-identity').banks.length,0);
assert.equal(last('ordinary-decay-then-delete').banks.length,0);
assert.equal(last('exact-plateau-skips-query').banks[0].fill,.5);
assert.equal(last('world-slow-time').banks[0].fill,.6-.25*.25);
assert.equal(last('actor-slow-time').banks[0].fill,.6-.25*.25);
assert.equal(last('combined-world-and-actor-time').banks[0].fill,.6-.25*.125);
assert.equal(byName('live-stillwater-socket-freezes-then-restores-decay').steps[2].after.banks[0].fill,.8);
assert.equal(last('live-stillwater-socket-freezes-then-restores-decay').banks[0].fill,.8-.25*.5);
assert.equal(last('gather-cooldown-readiness:0.149').banks[0].fill,.149);
assert.equal(byName('gather-cooldown-readiness:0.149').steps.at(-1).result,false);
assert.equal(byName('gather-cooldown-readiness:0.15').steps.at(-1).result,true);
assert(results.every(row=>row.steps.filter((step:any)=>step.command.kind==='press').every((step:any)=>step.result===true)));
assert(last('large-frame-retains-negative-final-record-value').retained[0].fill<0);
const schedule=byName('publication-precedes-decay-until-next-timer').steps;
assert.equal(schedule[2].after.gauge,1);assert.equal(schedule[3].after.gauge,0);
fs.writeFileSync(process.argv[2],JSON.stringify({schema:'hollow-wake-channel-bank-reference/v1',courses:results.length,transitions:results.reduce((n,r)=>n+r.steps.length,0),results},null,2)+'\n');
