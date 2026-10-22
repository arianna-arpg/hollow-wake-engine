// Original engine observations; no SDK imports or copied lifecycle algorithm.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine, makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {mod} from '../src/engine/stats';
import {makeSkillInstance, guardBashReady, guardBashSpec, instanceMods, skillContextTags, grantedTags, BASH_CFG, TRIGGER_CFG, type SkillDef, type GuardSpec} from '../src/engine/skills';
bootSimEngine();
const wire=(v:any):any=>JSON.parse(JSON.stringify(v));
type Command={type:string;[key:string]:any};
type Course={name:string;skill?:string;guard?:Partial<GuardSpec>;sockets?:string[];nodes?:string[];ai?:boolean;trigger?:boolean;commands:Command[]};
const press={type:'press'}, release={type:'release'},tick=(dt:number):Command=>({type:'tick',dt}),stat=(id:string,value:number):Command=>({type:'stat',id,value}),shield=(fraction:number):Command=>({type:'shield',fraction});
const courses:Course[]=[
 {name:'early-release-before-arm',commands:[press,tick(.25),release,tick(0)]},
 {name:'release-at-arm-boundary',commands:[press,tick(.5),tick(.5),release,tick(0)]},
 {name:'arm-epsilon-under-boundary',commands:[press,tick(1-5e-7),release,tick(0)]},
 {name:'arm-outside-epsilon',commands:[press,tick(1-2e-6),release,tick(0)]},
 {name:'line-inclusive-boundary',commands:[press,tick(1),shield(.25),release,tick(0)]},
 {name:'line-below-boundary',commands:[press,tick(1),shield(.249999),release,tick(0)]},
 {name:'live-floor-and-clock',commands:[press,tick(.5),stat('bashFloor',2),stat('bashArmTime',.5),shield(.4),tick(0),release,tick(0)]},
 {name:'live-floor-clamps',commands:[press,stat('bashFloor',10),tick(.1),stat('bashFloor',-2),tick(.1),release,tick(0)]},
 {name:'zero-authored-arm-time',guard:{bash:{...SKILLS.shield_up.guard!.bash!,armTime:0}},commands:[press,release,tick(0)]},
 {name:'long-authored-arm-time',guard:{bash:{...SKILLS.shield_up.guard!.bash!,armTime:2}},commands:[press,tick(1),release,tick(0)]},
 {name:'inverted-pristine-release',sockets:['hollow_answer'],commands:[press,tick(1),release,tick(0)]},
 {name:'inverted-lost-health-release',sockets:['hollow_answer'],commands:[press,tick(1),shield(.3),release,tick(0)]},
 {name:'inverted-inclusive-line',sockets:['hollow_answer'],commands:[press,tick(1),shield(.75),release,tick(0)]},
 {name:'innate-bash-beats-socket-graft',sockets:['answering_wall'],commands:[press,tick(1),release,tick(0)]},
 {name:'mute-wall-taught-bash',skill:'spiked_bulwark',sockets:['answering_wall'],commands:[press,tick(1),release,tick(0)]},
 {name:'socket-added-while-held',skill:'spiked_bulwark',commands:[press,tick(.5),{type:'socket',id:'answering_wall'},tick(.5),release,tick(0)]},
 {name:'socket-removed-while-held',skill:'spiked_bulwark',sockets:['answering_wall'],commands:[press,tick(.5),{type:'unsocket'},tick(.5),release,tick(0)]},
 {name:'one-trigger-and-pulse-per-large-frame',skill:'defiant_bulwark',commands:[press,tick(5),tick(0),tick(0),release,tick(0)]},
 {name:'pulse-inclusive-boundary',skill:'defiant_bulwark',commands:[press,tick(1),tick(.75),release,tick(0)]},
 {name:'pulse-still-runs-on-release-frame',skill:'defiant_bulwark',commands:[press,tick(1),release,tick(.75)]},
 {name:'pulse-offered-before-death-cleanup',skill:'defiant_bulwark',commands:[press,tick(1),{type:'dead'},tick(.75)]},
 {name:'timed-stance-boundary',skill:'riposte',commands:[press,tick(.3),tick(.3)]},
 {name:'timed-stance-live-duration-addition',skill:'riposte',commands:[press,stat('guardHoldTime',.4),tick(.6),tick(.4)]},
 {name:'timed-stance-minimum-floor',skill:'riposte',commands:[press,stat('guardHoldTime',-5),tick(.025),tick(.025)]},
 {name:'timed-pulse-before-forced-release',guard:{maxDuration:1,pulse:{skillId:'taunt_pulse',interval:1}},commands:[press,tick(1)]},
 {name:'grafted-shell-release',sockets:['grafted_carapace'],commands:[press,tick(1),release,tick(0)]},
 {name:'release-stamps-scoped-cooldown',commands:[press,tick(1),{type:'stat',id:'cooldownRecovery',value:2,tags:['guard']},stat('addedCooldown',1),release,tick(0)]},
 {name:'grafted-shell-stun',sockets:['grafted_carapace'],commands:[press,tick(.5),{type:'stun'},tick(.1)]},
 {name:'death-denies-bash',commands:[press,tick(1),{type:'dead'},tick(0)]},
 {name:'live-heavy-turning',commands:[press,{type:'aim',x:500,y:700},tick(.1),tick(.2),release,tick(0)]},
 {name:'ai-arm-wait-warning',ai:true,commands:[press,{type:'policy',hold:.25,windup:.2},tick(.5),tick(.3),tick(.2),tick(.2)]},
 {name:'ai-early-policy-no-bash',ai:true,commands:[press,{type:'policy',hold:.25,windup:.2,early:true},tick(.25),tick(.01)]},
 {name:'ai-warning-dearmed-before-release',ai:true,commands:[press,{type:'policy',hold:1,windup:.2},tick(.8),shield(.1),tick(.2)]},
 {name:'ai-warning-locks-facing',ai:true,commands:[press,{type:'policy',hold:1,windup:.2},tick(.8),{type:'aim',x:500,y:700},tick(.1),tick(.1)]},
 {name:'controlled-seat-rebinding-clears-warning',ai:true,commands:[press,{type:'policy',hold:1,windup:.2},tick(.8),{type:'seat'},tick(.1),release,tick(0)]},
 {name:'native-possession-interrupts-warning',ai:true,commands:[press,{type:'policy',hold:1,windup:.2},tick(.8),{type:'possess'},tick(.1)]},
 {name:'native-ice-break-before-arm',skill:'ice_shield',commands:[press,tick(.1),{type:'block',damage:10000}]},
 {name:'native-parry-ends-riposte',skill:'riposte',commands:[press,tick(.1),{type:'block',damage:20},tick(.1)]},
 {name:'parry-graft-retains-shield',sockets:['perfect_timing'],commands:[press,tick(.1),{type:'block',damage:20},tick(1),release,tick(0)]},
 {name:'ordinary-block-dearms-release',commands:[press,tick(1),{type:'block',damage:50},release,tick(0)]},
 {name:'native-plates-cleared-before-release',nodes:['iron_shelter','reinforced_plate'],commands:[press,{type:'arts',dt:2},{type:'arts',dt:2},{type:'arts',dt:2},tick(1),release,tick(0)]},
 {name:'native-aegis-mends-on-release-frame',skill:'aegis_of_dawn',commands:[{type:'wound-ally'},press,tick(.5),release,tick(.5)]},
 {name:'native-raise-and-release-waves',nodes:['iron_shelter','ready_watch','sheltered_thrust','shield_pump'],commands:[press,tick(1),release,tick(0)]},
 {name:'guard-beat-buff-refreshes-next-frame',trigger:true,commands:[press,tick(1),tick(0),release,tick(0)]},
];
for(const def of Object.values(SKILLS).filter(d=>d.guard))courses.push({name:'native:'+def.id,skill:def.id,commands:[press,tick(.25),tick(.75),release,tick(0)]});
const results:any[]=[];
for(const course of courses){const restore=seedGlobalRandom(280028);try{
 const w=makeSimWorld('guardian',280028),aw:any=w,hero=w.player;w.devIgnoreSkillAttributes=true;w.walk=null;
 const foe=w.createMonster('zombie',1,'enemy');foe.brain=undefined;foe.tier=hero.tier;w.springAmbush(foe,true);foe.untargetable=false;
 w.actors=[hero,foe];const a=course.ai?foe:hero,target=course.ai?hero:foe;
 a.pos={x:500,y:500};target.pos={x:540,y:500};a.aimPos={...target.pos};a.facing=0;target.facing=Math.PI;
 for(const actor of [a,target]){actor.sheet.setSource('guard-rig',[
  ...['life','mana'].map(id=>mod(id,'override',100000)),...['energyShield','lifeRegen','manaRegen','poise','critChance','blockChance','evasion','armor'].map(id=>mod(id,'override',0)),
  ...['guardStrength','damage','cooldownRecovery'].map(id=>mod(id,'override',1)),mod('accuracy','override',100000)]);
  for(const id of ['bashPower','bashFloor','bashArmTime','damageTaken'])actor.sheet.setBase(id,1);actor.sheet.setBase('guardParry',0);
  actor.fillResources();actor.useLock=0;actor.cooldowns.clear();}
 const base=SKILLS[course.skill??'shield_up'];assert(base);
 const def:SkillDef=course.guard?{...base,guard:{...base.guard!,...course.guard}}:base;
 const inst=makeSkillInstance(def,1,3);inst.treeNodes=course.nodes??[];for(const[i,id]of(course.sockets??[]).entries()){assert(SUPPORTS[id],id);inst.sockets[i]={def:SUPPORTS[id],level:1};}
 a.skills=[inst];if(!course.ai)w.meta.knownSkills.set(def.id,inst);
 if(course.trigger){const trigger=makeSkillInstance({...SKILLS.firebolt,id:'guard_probe_buff',manaCost:0,cooldown:0,useTime:0,delivery:{type:'self'},effects:[{type:'buff',id:'guard_probe_buff',duration:10,mods:[mod('bashFloor','override',2),mod('guardHoldTime','override',2)]}]},1,1);trigger.sockets[0]={def:SUPPORTS.cast_while_guarding,level:1};a.skills.push(trigger);}
 let calls:any[]=[];
 const cast=()=>a.casting?wire({...Object.fromEntries(['mode','elapsed','total','held','baseMult','channelTime','shield','maxShield','guardPulseT','bashAt','bashLow','bashArmAt','trigBeat','aiHold','aiGuardWindup','aiGuardReleaseAt','aiGuardFacing','aiGuardEarly'].map(k=>[k,(a.casting as any)[k]??null])),aim:a.casting.aim}):null;
 const actorState=()=>({cast:cast(),dead:a.dead,recovery:a.useLock,shell:!!a.shellGuard,damageTaken:a.sheet.get('damageTaken')});
 const lower=w.guardArts.lower.bind(w.guardArts);w.guardArts.lower=(actor,skill)=>{if(actor===a)calls.push(wire({kind:'lower',before:actorState()}));lower(actor,skill);if(actor===a)calls.push(wire({kind:'lowered',after:actorState()}));};
 const bash=w.guardBash.bind(w);w.guardBash=(actor,skill,spec,payload)=>{if(actor===a)calls.push(wire({kind:'bash',payload,spec,before:actorState()}));return bash(actor,skill,spec,payload);};
 const supports=aw.tickChannelSupports.bind(w);aw.tickChannelSupports=(...args:any[])=>{calls.push({kind:'supports',before:cast()});return supports(...args);};
 const triggers=aw.rollTriggers.bind(w);aw.rollTriggers=(actor:any,event:any,context:any)=>{if(actor===a)calls.push(wire({kind:'trigger',event,before:actorState()}));return triggers(actor,event,context);};
 const stamp=aw.stampSkillCooldown.bind(w);aw.stampSkillCooldown=(actor:any,skill:any,duration:any)=>{if(actor===a)calls.push(wire({kind:'cooldown',duration,before:actorState()}));return stamp(actor,skill,duration);};
 const execute=w.executeSkill.bind(w);w.executeSkill=(...args:Parameters<typeof w.executeSkill>)=>{if(args[0]===a)calls.push(wire({kind:'execute',skill:args[1].def.id,options:args[3],before:actorState()}));return execute(...args);};
 const snapshot=()=>wire({time:w.time,mana:a.mana,life:a.life,dead:a.dead,recovery:a.useLock,facing:a.facing,aiPlantUntil:a.aiPlantUntil,cast:cast(),shell:a.shellGuard,cooldowns:[...a.cooldowns],cooldownTotals:[...a.cooldownTotals],charges:[...a.charges],damageTaken:a.sheet.get('damageTaken'),bashFloor:a.sheet.get('bashFloor'),target:{life:target.life,statuses:target.statuses.map(s=>({id:s.id,remaining:s.remaining})),dead:target.dead},projectiles:w.projectiles.map(p=>({mult:p.mult,guardWave:!!p.inst.guardArtsHost})),flashes:w.flashes.map(f=>({radius:f.radius,color:f.color,life:f.life}))});
 const initial=snapshot(),steps:any[]=[];
 for(const command of course.commands){calls=[];const before=snapshot(),draws:number[]=[],random=Math.random;Math.random=()=>{const n=random();draws.push(n);return n;};let accepted:boolean|undefined,beforeCast:any,terms:any;
  try{switch(command.type){
   case 'press': accepted=w.useSkill(a,inst,{...target.pos},!!course.ai);assert(accepted,course.name+' press');assert.equal(a.casting?.mode,'guard',course.name+' active guard');break;
   case 'release':if(a.casting)a.casting.held=false;break;
   case 'tick':{w.time+=command.dt;a.updateTimers(command.dt);beforeCast=snapshot();const cs=a.casting;if(cs){const bash=guardBashSpec(inst),tags=skillContextTags(inst.def,grantedTags(inst)),extra=instanceMods(inst);terms=wire({spec:def.guard,bash,seat:!!w.seatOf(a),holdTime:a.sheet.get('guardHoldTime',skillContextTags(inst),extra),floor:a.sheet.get('bashFloor',tags,extra),invert:a.sheet.get('bashInvert',tags,extra),armTime:a.sheet.get('bashArmTime',tags,extra),cooldown:def.cooldown,aiHold:aw.aiHoldOf(cs)});}aw.updateCasting(a,command.dt);break;}
   case 'stat':a.sheet.setSource('guard-'+command.id,[mod(command.id,'override',command.value,command.tags)]);break;
   case 'shield':assert(a.casting);a.casting.shield=a.casting.maxShield!*command.fraction;break;
   case 'socket':inst.sockets[0]={def:SUPPORTS[command.id],level:1};break;
   case 'unsocket':inst.sockets[0]=null;break;
   case 'aim':a.aimPos={x:command.x,y:command.y};if(a.casting)a.casting.aim={...a.aimPos};break;
   case 'stun':a.statuses.push({id:'stun',remaining:20,source:a} as any);break;
   case 'dead':a.dead=true;break;
   case 'wound-ally':target.team=a.team;target.life=target.maxLife()/2;break;
   case 'policy':assert(a.casting);a.casting.aiHold=command.hold;a.casting.aiGuardWindup=command.windup;a.casting.aiGuardEarly=command.early?true:undefined;break;
   case 'seat':w.localSeat.actor=a;aw.indexSeats();break;
   case 'possess':a.life=a.maxLife()*.25;assert.equal(w.devPossess(a),null);assert.equal(a.casting,null);break;
   case 'block':accepted=aw.tryGuardBlock(a,target,{...target.pos},command.damage);assert(accepted,course.name+' block');break;
   case 'arts':w.time+=command.dt;w.guardArts.update(command.dt);break;
   default:throw new Error(command.type);
  }}finally{Math.random=random;}
  steps.push(wire({command,before,beforeCast,terms,accepted,calls,draws,after:snapshot()}));
 }
 results.push({name:course.name,skill:def.id,guard:def.guard,sockets:course.sockets??[],nodes:course.nodes??[],ai:!!course.ai,initial,steps});
 }finally{restore();}}
const readiness:any[]=[];
for(const arm of [undefined,0,1,2])for(const held of [undefined,0,.5,1-2e-6,1-5e-7,1,2])for(const low of [false,true])for(const fraction of [0,.249999,.25,.75,1]){
 const input={channelTime:held,shield:fraction*60,maxShield:60,bashAt:low ? .75 : .25,bashLow:low,bashArmAt:arm};readiness.push({input,result:guardBashReady(input)});
}
for(const input of [{},{shield:0,maxShield:0,bashAt:0},{shield:5,maxShield:0,bashAt:1},{channelTime:3,shield:60,maxShield:60}])readiness.push({input,result:guardBashReady(input)});
const find=(name:string)=>results.find(c=>c.name===name),last=(name:string)=>find(name).steps.at(-1),bashes=(name:string)=>find(name).steps.flatMap((s:any)=>s.calls.filter((c:any)=>c.kind==='bash'));
assert.equal(bashes('early-release-before-arm').length,0);assert.equal(bashes('release-at-arm-boundary').length,1);assert.equal(bashes('arm-epsilon-under-boundary').length,1);assert.equal(bashes('arm-outside-epsilon').length,0);
assert.equal(bashes('line-inclusive-boundary').length,1);assert.equal(bashes('line-below-boundary').length,0);assert.equal(bashes('inverted-pristine-release').length,0);assert.equal(bashes('inverted-lost-health-release').length,1);
assert.equal(bashes('socket-removed-while-held').length,0);assert.equal(bashes('socket-added-while-held').length,1);
assert.equal(last('grafted-shell-release').after.shell,undefined);assert.equal(last('grafted-shell-stun').after.cast,null);assert.equal(last('grafted-shell-stun').after.shell,undefined);assert.equal(bashes('death-denies-bash').length,0);
assert.equal(bashes('native-ice-break-before-arm').length,1);assert.equal(last('native-ice-break-before-arm').after.recovery,.3);assert.equal(last('native-parry-ends-riposte').after.cast,null);
assert.equal(bashes('native-raise-and-release-waves').length,2);assert.equal(last('native-raise-and-release-waves').after.projectiles.filter((p:any)=>p.guardWave).length,2);
const plates=last('native-plates-cleared-before-release');assert(plates.calls.find((c:any)=>c.kind==='lower').before.damageTaken<1);assert.equal(plates.calls.find((c:any)=>c.kind==='lowered').after.damageTaken,1);assert.equal(plates.calls.find((c:any)=>c.kind==='lower').before.cast.mode,'guard');
const parry=find('parry-graft-retains-shield').steps.find((s:any)=>s.command.type==='block');assert.equal(parry.after.cast.shield,parry.before.cast.shield);assert(parry.after.target.life<parry.before.target.life);
const beat=find('guard-beat-buff-refreshes-next-frame').steps;assert.equal(beat[1].after.cast.bashAt,.25);assert.equal(beat[1].after.bashFloor,2);assert.equal(beat[2].after.cast.bashAt,.5);
assert.equal(bashes('ai-arm-wait-warning').length,1);assert.equal(bashes('ai-early-policy-no-bash').length,0);assert.equal(bashes('ai-warning-dearmed-before-release').length,0);
const locked=find('ai-warning-locks-facing').steps;assert.equal(locked[2].after.cast.aiGuardReleaseAt,1);assert.equal(locked[4].after.facing,locked[2].after.facing);
assert.equal(find('controlled-seat-rebinding-clears-warning').steps[4].after.cast.aiGuardReleaseAt,null);
assert.deepEqual(last('release-stamps-scoped-cooldown').after.cooldowns,[['shield_up',3]]);
const mend=last('native-aegis-mends-on-release-frame');assert(mend.after.target.life>mend.before.target.life);assert.equal(mend.after.cast,null);
const deadPulse=last('pulse-offered-before-death-cleanup').calls;assert(deadPulse.findIndex((c:any)=>c.kind==='execute'&&c.skill==='taunt_pulse')<deadPulse.findIndex((c:any)=>c.kind==='lower'));
const pulses=find('one-trigger-and-pulse-per-large-frame').steps.filter((s:any)=>s.command.type==='tick').map((s:any)=>s.calls.filter((c:any)=>c.kind==='execute'&&c.skill==='taunt_pulse').length);assert.deepEqual(pulses,[1,1,0,0]);
const output={schemaVersion:1,source:'original-engine',config:{bash:BASH_CFG,beat:TRIGGER_CFG.guardInterval},census:Object.values(SKILLS).filter(d=>d.guard).map(d=>({id:d.id,mode:d.castMode,guard:d.guard})),readiness,courses:results};
fs.writeFileSync(process.argv[2],JSON.stringify(output,null,2)+'\n');console.log('Guard draft: '+results.length+' courses, '+results.reduce((n,c)=>n+c.steps.length,0)+' transitions, '+readiness.length+' readiness cases.');
