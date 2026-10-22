// Raw original observations. No SDK import or extracted algorithm here.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';import {mod} from '../src/engine/stats';
import {makeSkillInstance,instanceChannel,instanceMods,instanceTargeting,skillContextTags,TRIGGER_CFG,type SkillDef,type ChannelSpec} from '../src/engine/skills';
bootSimEngine();const wire=(v:any):any=>JSON.parse(JSON.stringify(v));
type Command={type:string;[key:string]:any};type Course={name:string;skill?:string;channel?:Partial<ChannelSpec>;variant?:Partial<SkillDef>;sockets?:string[];trigger?:'channelBeat'|'channelFinish';commands:Command[]};
const press={type:'press'},release={type:'release'},tick=(dt:number):Command=>({type:'tick',dt}),stat=(id:string,value:number):Command=>({type:'stat',id,value});
const courses:Course[]=[
 {name:'pulse-boundary-and-manual-release',commands:[press,tick(.25),tick(.25),release,tick(0)]},
 {name:'one-pulse-and-event-per-large-frame',commands:[press,tick(5),tick(0),tick(0),release,tick(0)]},
 {name:'zero-windup-first-update',channel:{windup:0},commands:[press,tick(0),release,tick(0)]},
 {name:'tap-before-windup',channel:{windup:1},commands:[press,tick(.25),release,tick(.25)]},
 {name:'initial-speed-snapshot-live-pricing',commands:[stat('castSpeed',2),press,stat('castSpeed',4),tick(.25),tick(.25),release,tick(0)]},
 {name:'cost-ramp-and-one-paid-beat',channel:{costRamp:{per:.5,max:4,curve:'quadratic'}},commands:[press,tick(2),tick(0),release,tick(0)]},
 {name:'unaffordable-beat-releases-on-next-update',channel:{release:{minHold:0,pulses:false}},commands:[press,{type:'mana',value:0},tick(.5),tick(0)]},
 {name:'release-before-next-payment',channel:{release:{minHold:0,pulses:false}},commands:[press,tick(.25),release,tick(.25)]},
 {name:'release-under-minimum',channel:{release:{minHold:1,pulses:false}},commands:[press,tick(.5),release,tick(0)]},
 {name:'release-on-minimum',channel:{release:{minHold:1,pulses:false,dmgRamp:{per:.5,max:3}}},commands:[press,tick(1),release,tick(0)]},
 {name:'cap-completion-and-required-full',channel:{maxHold:1,release:{requireFull:true,pulses:false},cooldownOnEnd:true},commands:[press,tick(.5),tick(.5),tick(0)]},
 {name:'early-release-denies-required-full',channel:{maxHold:1,release:{requireFull:true,pulses:false}},commands:[press,tick(.5),release,tick(0)]},
 {name:'live-duration-scales-cap',channel:{maxHold:1,release:{requireFull:true,pulses:false}},commands:[press,stat('effectDuration',2),tick(1),tick(1)]},
 {name:'stun-denies-completion',channel:{maxHold:1,release:{requireFull:true,pulses:false}},commands:[press,tick(.5),{type:'stun'},tick(1)]},
 {name:'death-denies-payoff',channel:{release:{pulses:false}},commands:[press,tick(.5),{type:'dead'},tick(.5)]},
 {name:'jitter-only-after-paid-pulse',channel:{intervalJitter:[.5,1.5]},commands:[press,tick(.25),tick(.25),tick(1),{type:'mana',value:0},tick(1),tick(0)]},
 {name:'missing-target-holds-without-payment',variant:{targeting:{target:'enemy',castRange:400}},commands:[press,{type:'target-off'},tick(.5),{type:'target-on'},tick(.5),release,tick(0)]},
 {name:'missing-target-does-not-draw-jitter',variant:{targeting:{target:'enemy',castRange:400}},channel:{intervalJitter:[.5,1.5]},commands:[press,{type:'target-off'},tick(.5),{type:'target-on'},tick(.5),release,tick(0)]},
 {name:'live-ramp-with-snapshotted-interval',commands:[press,{type:'channel',value:{interval:2,ramp:{per:.5,max:3}}},tick(.5),tick(.5),release,tick(0)]},
 {name:'live-aim-lock-uses-initial-mark',channel:{trackAim:true},commands:[press,{type:'aim',x:500,y:700},stat('channelLockAim',1),tick(.5),release,tick(0)]},
 {name:'locked-aim-survives-controller-change',channel:{trackAim:false},commands:[press,{type:'aim',x:500,y:700},tick(.5),release,tick(0)]},
 {name:'limited-turn-and-auto-spin',channel:{trackAim:true,turnRate:1},commands:[press,{type:'aim',x:500,y:700},tick(.25),stat('channelAutoSpin',2),tick(.5),release,tick(0)]},
 {name:'ramp-and-spooling',channel:{ramp:{per:.5,max:3},rampAoe:{per:-.5,max:0},rampArc:{per:-.5,max:0}},commands:[stat('channelSpool',2),stat('channelSpoolCap',3),press,tick(2),release,tick(0)]},
 {name:'persist-on-release-and-expiry',channel:{ramp:{per:.5,max:2},persist:{perHeldSec:2,maxDuration:4,minHold:.5,fade:.25}},commands:[press,tick(1),release,tick(0),{type:'repeats',dt:.5},{type:'repeats',dt:1.5}]},
 {name:'persist-cancelled-on-death',channel:{persist:{perHeldSec:2}},commands:[press,tick(1),release,tick(0),{type:'dead'},{type:'repeats',dt:.1}]},
 {name:'brim-fills-autoreleases-and-spends',channel:{brim:{fillTime:1,autoRelease:true},release:{pulses:false}},commands:[press,tick(.5),tick(.5),tick(0)]},
 {name:'brim-thin-fizzle-retains-fill',channel:{brim:{fillTime:2,minRelease:.5},release:{pulses:false}},commands:[press,tick(.5),release,tick(0)]},
 {name:'brim-no-spend-and-live-fill-rate',channel:{brim:{fillTime:2,spend:false},release:{pulses:false}},commands:[press,stat('brimFill',2),tick(.5),release,tick(0)]},
 {name:'brim-and-cap-single-finish',channel:{brim:{fillTime:1,autoRelease:true},maxHold:1,release:{pulses:false}},commands:[press,tick(1),tick(0)]},
 {name:'native-healing-target-and-self-fallback',skill:'healing_stream',commands:[press,tick(.15),{type:'target-off'},tick(.3),release,tick(0)]},
 {name:'native-lifedrain-damages-and-heals',skill:'lifedrain',commands:[{type:'wound'},press,tick(.15),tick(.25),release,tick(0)]},
 {name:'native-reload-fills-actual-drum',skill:'reload_shells',commands:[{type:'empty-scattergun'},press,tick(.4),tick(.55),tick(.55),tick(0)]},
 {name:'native-arcswarm-release-detonates',skill:'arcswarm',commands:[press,tick(0),tick(.28),release,tick(0)]},
 {name:'native-amalgam-eats-and-releases',skill:'the_amalgam',commands:[{type:'minions',count:2},press,tick(.2),tick(.4),release,tick(0)]},
 {name:'native-hailcrown-persists-earned-power',skill:'hailcrown',commands:[press,...Array.from({length:8},()=>tick(.5)),release,tick(0),{type:'repeats',dt:.5},{type:'repeats',dt:1},{type:'repeats',dt:10}]},
 {name:'native-surgewind-full-bank-release',skill:'surgewind',commands:[press,...Array.from({length:11},()=>tick(.5)),release,tick(0)]},
 {name:'native-marrow-bank-across-interruption',skill:'marrow_communion',commands:[press,tick(.5),{type:'stun'},tick(.1),{type:'unstun'},press,tick(.5),release,tick(0)]},
 {name:'native-jitter-live-socket',skill:'unstable_barrage',commands:[press,tick(.5),{type:'socket',id:'patient_fury'},tick(.5),tick(.5),release,tick(0)]},
 {name:'finish-trigger-changes-later-brim-fill',trigger:'channelFinish',channel:{maxHold:.5,brim:{fillTime:2,spend:false},release:{pulses:false}},commands:[press,tick(.5)]},
 {name:'beat-trigger-changes-later-pulse-ramp',trigger:'channelBeat',commands:[press,tick(1),release,tick(0)]},
 {name:'native-finish-tap-banks-charges',skill:'kindled_ruin',sockets:['culminant_frenzy'],commands:[press,...Array.from({length:8},()=>tick(.5))]},
 {name:'brim-world-decay-retains-held-bank',channel:{brim:{fillTime:2,decay:.25,spend:false},release:{pulses:false}},commands:[press,tick(.5),{type:'world',dt:.5},release,tick(0),{type:'world',dt:.5},{type:'world',dt:3}]},
 {name:'brim-world-bank-at-plateau',channel:{brim:{fillTime:2,decay:.25,bankAt:.5,spend:false},release:{pulses:false}},commands:[press,tick(1),release,tick(0),{type:'world',dt:.5}]},
 {name:'brim-world-removes-spent-entry',channel:{brim:{fillTime:2},release:{pulses:false}},commands:[press,tick(.5),release,tick(0),{type:'world',dt:0},{type:'world',dt:.01}]},
 {name:'gather-funded-bank-through-cooldown',variant:{castMode:'cast',channel:undefined,useTime:1},sockets:['gathered_casting'],commands:[press,tick(.5),{type:'stun'},tick(.1),{type:'unstun'},{type:'cooldown',value:3},press,release,tick(0)]},
];
const gather=Object.values(SUPPORTS).find(d=>d.gather)!;
courses.push({name:'gathered-casting-conversion',variant:{castMode:'cast',channel:undefined,useTime:1},sockets:[gather.id],commands:[press,tick(.5),tick(.5),release,tick(0)]});
for(const def of Object.values(SKILLS).filter(d=>d.channel))courses.push({name:'native:'+def.id,skill:def.id,commands:[press,tick(.25),tick(.75),release,tick(0)]});
const results:any[]=[];
for(const course of courses){const restore=seedGlobalRandom(270027);try{
 const w=makeSimWorld('magician',270027),aw:any=w,a=w.player;w.devIgnoreSkillAttributes=true;w.walk=null;a.pos={x:500,y:500};a.aimPos={x:650,y:500};
 const target=w.createMonster('zombie',1,'enemy');target.pos={x:650,y:500};target.brain=undefined;target.tier=a.tier;w.springAmbush(target,true);target.untargetable=false;w.actors=[a,target];
 a.sheet.setSource('channel-rig',[...['mana','life'].map(id=>mod(id,'override',100000)),...['energyShield','manaRegen','lifeRegen','poise','critChance'].map(id=>mod(id,'override',0)),...['castSpeed','attackSpeed','effectDuration','brimFill','brimPower','cooldownRecovery'].map(id=>mod(id,'override',1))]);a.fillResources();a.useLock=0;a.cooldowns.clear();
 const def=course.skill?SKILLS[course.skill]:{...SKILLS.firebolt,manaCost:4,lifeCost:0,cooldown:2,useTime:0,castMode:'channel' as const,channel:{interval:.5,move:'normal' as const,...course.channel},...course.variant};
 if(def.targeting?.target==='ally'){target.team=a.team;target.life=Math.max(1,target.life/2);}
 const inst=makeSkillInstance(def,1,3);for(const[i,id]of(course.sockets??[]).entries())inst.sockets[i]={def:SUPPORTS[id],level:1};a.skills=[inst];w.meta.knownSkills.set(def.id,inst);
 let calls:any[]=[];const targetWire=(ti:any)=>ti?{pos:ti.pos,self:ti.self,actor:ti.actor===a?'caster':ti.actor===target?'target':ti.actor?'other':undefined}:undefined;
 if(course.trigger){const triggered=makeSkillInstance({...SKILLS.firebolt,id:'channel_probe_buff',useTime:0,cooldown:0,manaCost:0,delivery:{type:'self'},effects:[{type:'buff',id:'channel_probe_buff',duration:10,mods:[mod('brimFill','override',2),mod('channelRamp','override',.5)]}]},1,1);triggered.sockets[0]={def:SUPPORTS[course.trigger==='channelBeat'?'cast_while_channeling':'culmination'],level:1};a.skills.push(triggered);}
 const pay=aw.paySkillCost.bind(w),execute=w.executeSkill.bind(w),triggers=aw.rollTriggers.bind(w),tap=aw.tapCharges.bind(w),rune=aw.bankRune.bind(w),supports=aw.tickChannelSupports.bind(w),explode=aw.explodeProjectile.bind(w);
 aw.paySkillCost=(actor:any,skill:any,cost:any)=>{calls.push(wire({kind:'pay',cost,before:{mana:actor.mana,life:actor.life},cast:!!actor.casting}));return pay(actor,skill,cost);};
 w.executeSkill=(...args:Parameters<typeof w.executeSkill>)=>{calls.push(wire({kind:'execute',skill:args[1].def.id,options:{...args[3],targetInfo:targetWire(args[3]?.targetInfo)},aim:args[2],cast:!!args[0].casting,recovery:args[0].useLock}));return execute(...args);};
 aw.explodeProjectile=(p:any,...args:any[])=>{calls.push({kind:'explode',skill:p.inst.def.id,mult:p.mult});return explode(p,...args);};
 aw.rollTriggers=(actor:any,on:any,context:any)=>{calls.push(wire({kind:'trigger',on,cast:!!actor.casting,held:actor.casting?.held,hitCap:actor.casting?.hitCap}));return triggers(actor,on,context);};
 aw.tapCharges=(...args:any[])=>{calls.push({kind:'tap',on:args[1]});return tap(...args);};
 aw.bankRune=(...args:any[])=>{calls.push({kind:'rune'});return rune(...args);};
 aw.tickChannelSupports=(...args:any[])=>{calls.push({kind:'supports'});return supports(...args);};
 const snapshot=()=>wire({mana:a.mana,life:a.life,dead:a.dead,recovery:a.useLock,facing:a.facing,cooldowns:[...a.cooldowns],cooldownTotals:[...a.cooldownTotals],runes:a.runes,banks:[...a.skillChargeState],charges:[...a.charges],rates:{brimFill:a.sheet.get('brimFill'),channelRamp:a.sheet.get('channelRamp')},
  cast:a.casting?{...Object.fromEntries(['mode','elapsed','total','held','baseMult','channelTime','pulseTimer','hitCap','finishRolled','trigBeat','runeTick','burstTimer','stormTimer','hitSpool','amalgamFed'].map(k=>[k,(a.casting as any)[k]??null])),aim:a.casting.aim,lockedAim:a.casting.lockedAim}:null,
  brims:[...(a.brims??[])].map(([id,b])=>({id,fill:b.fill})),persists:w.pendingPersists.map(p=>({interval:p.interval,timer:p.timer,remaining:p.remaining,total:p.total,powerMult:p.powerMult,fade:p.fade})),
  projectiles:w.projectiles.map(p=>({mult:p.mult,speed:p.speed})),zones:w.zones.map(z=>({pos:z.pos,radius:z.radius,mult:z.dmgMult,delay:z.delay})),actors:w.actors.map(x=>({kind:x.kind,team:x.team,life:x.life,dead:x.dead,source:x.sourceSkillId})),flashes:w.flashes.map(f=>({radius:f.radius,color:f.color,life:f.life}))});
 const initial=snapshot(),steps:any[]=[];
 for(const command of course.commands){calls=[];const before=snapshot(),draws:number[]=[],random=Math.random;Math.random=()=>{const n=random();draws.push(n);return n;};let accepted:boolean|undefined,beforeCast:any,terms:any;
  try{if(command.type==='press')accepted=w.useSkill(a,inst,target.pos);
   else if(command.type==='release'){if(a.casting)a.casting.held=false;}
   else if(command.type==='tick'){w.time+=command.dt;a.updateTimers(command.dt);beforeCast=snapshot();
    const cs=a.casting;if(cs?.mode==='channel'){const tags=skillContextTags(cs.inst.def),extra=instanceMods(cs.inst);terms=wire({
      channel:cs.gather??instanceChannel(cs.inst),gather:cs.gather,stunned:a.isStunned(),construct:!!a.construct,
      cost:a.skillCost(cs.inst),speed:a.speedFactor(cs.inst),cooldown:cs.inst.def.cooldown,beatInterval:TRIGGER_CFG.channelInterval,
      stats:Object.fromEntries(['effectDuration','brimFill','brimPower','channelRamp','channelSpool','channelHitSpool','channelSpoolCap'].map(id=>[id,a.sheet.get(id,tags,extra)])),
      targeting:instanceTargeting(cs.inst)?targetWire(aw.resolveTargeting(a,cs.inst,cs.aim))??null:undefined,
    });}aw.updateCasting(a,command.dt);}
   else if(command.type==='repeats'){w.time+=command.dt;aw.updatePendingPersists(command.dt);}
   else if(command.type==='world')w.update(command.dt);
   else if(command.type==='empty-scattergun'){const gun=makeSkillInstance(SKILLS.scattergun,1);a.skills.push(gun);a.skillChargeBank(gun)!.count=0;inst.hostSkillId=gun.def.id;}
   else if(command.type==='minions')for(let i=0;i<command.count;i++){const m=w.createMonster('zombie',1,a.team,a);m.pos={x:510+i*5,y:500};m.brain=undefined;w.actors.push(m);}
   else if(command.type==='wound')a.life=a.maxLife()/2;
   else if(command.type==='cooldown')a.cooldowns.set(def.id,command.value);
   else if(command.type==='socket')inst.sockets[1]={def:SUPPORTS[command.id],level:1};
   else if(command.type==='unstun')a.statuses=a.statuses.filter(s=>s.id!=='stun');
   else if(command.type==='stat')a.sheet.setSource('channel-stat:'+command.id,[mod(command.id,'override',command.value)]);
   else if(command.type==='mana')a.mana=command.value;
   else if(command.type==='target-off')w.actors=w.actors.filter(x=>x!==target);
   else if(command.type==='target-on')w.actors.push(target);
   else if(command.type==='channel')inst.def.channel={...inst.def.channel!,...command.value};
   else if(command.type==='stun')a.applyStatus('stun',0,10,'channel-investigation');
   else if(command.type==='dead'){a.life=0;a.dead=true;}
   else if(command.type==='aim'){a.aimPos={x:command.x,y:command.y};if(a.casting)a.casting.aim={...a.aimPos};}
   else throw new Error('Unhandled channel command');
  }finally{Math.random=random;}
  steps.push(wire({command,before,beforeCast,terms,accepted,calls,draws,after:snapshot()}));
 }
 results.push(wire({name:course.name,skill:def.id,channel:instanceChannel(inst),initial,steps}));
}finally{restore();}}
const rejected=results.filter(r=>r.steps.find((s:any)=>s.command.type==='press')?.accepted!==true).map(r=>r.name);
assert.deepEqual(rejected,[]);
const courseOf=(name:string)=>results.find(c=>c.name===name),callsOf=(name:string,kind:string)=>courseOf(name).steps.flatMap((s:any)=>s.calls).filter((c:any)=>c.kind===kind),last=(name:string)=>courseOf(name).steps.at(-1);
for(const c of results){const active=c.steps.find((s:any)=>s.command.type==='press').after.cast;
 if(c.name==='native:sparklattice'||c.name==='native:choir_of_light'){assert.equal(SKILLS[c.skill].castMode,undefined);assert.equal(active,null,c.name+' retains its original instant mode despite authored channel data');}
 else assert.equal(active?.mode,'channel',c.name);
}
assert.equal(callsOf('pulse-boundary-and-manual-release','execute').length,1);
assert.equal(courseOf('pulse-boundary-and-manual-release').steps[1].calls.filter((c:any)=>c.kind==='execute').length,0);
assert.equal(courseOf('one-pulse-and-event-per-large-frame').steps[1].calls.filter((c:any)=>c.kind==='execute').length,1);
assert.equal(callsOf('zero-windup-first-update','execute').length,1);
assert.equal(callsOf('tap-before-windup','pay').length,0);
assert.equal(callsOf('unaffordable-beat-releases-on-next-update','pay').length,0);
assert.equal(courseOf('unaffordable-beat-releases-on-next-update').steps[2].after.cast.held,false);
assert.equal(callsOf('unaffordable-beat-releases-on-next-update','execute').length,1);
assert.equal(callsOf('release-under-minimum','execute').length,0);
assert.equal(callsOf('release-on-minimum','execute')[0].options.dmgMult,1.5);
assert.equal(callsOf('early-release-denies-required-full','execute').length,0);
assert.equal(callsOf('stun-denies-completion','execute').length,0);
assert.equal(callsOf('stun-denies-completion','trigger').filter((c:any)=>c.on==='channelFinish').length,0);
assert.equal(callsOf('brim-and-cap-single-finish','trigger').filter((c:any)=>c.on==='channelFinish').length,1);
assert.equal(callsOf('death-denies-payoff','execute').length,0);
assert.equal(last('persist-on-release-and-expiry').after.persists.length,0);
assert.equal(last('persist-cancelled-on-death').after.persists.length,0);
assert.equal(last('brim-fills-autoreleases-and-spends').after.brims[0].fill,0);
assert.equal(last('brim-thin-fizzle-retains-fill').after.brims[0].fill,.25);
assert.equal(last('brim-no-spend-and-live-fill-rate').after.brims[0].fill,.5);
const jitter=courseOf('jitter-only-after-paid-pulse').steps;
assert.deepEqual(jitter.map((s:any)=>s.draws.length),[0,0,1,1,0,0,0]);
for(const name of ['missing-target-holds-without-payment','missing-target-does-not-draw-jitter']){
 const missed=courseOf(name).steps[2];assert.equal(missed.after.cast.pulseTimer,.5);assert.equal(missed.after.cast.held,true);assert.equal(missed.draws.length,0);assert.equal(missed.calls.filter((c:any)=>c.kind==='pay'||c.kind==='execute').length,0);assert.equal(callsOf(name,'execute').length,1);
}
assert.equal(callsOf('live-ramp-with-snapshotted-interval','execute').length,2);
assert.equal(callsOf('live-ramp-with-snapshotted-interval','execute')[0].options.dmgMult,1.25);
assert.deepEqual(callsOf('live-aim-lock-uses-initial-mark','execute')[0].aim,{x:650,y:500});
assert.equal(callsOf('native-healing-target-and-self-fallback','execute')[0].options.targetInfo.actor,'target');
assert.equal(callsOf('native-healing-target-and-self-fallback','execute')[1].options.targetInfo.self,true);
assert(last('native-lifedrain-damages-and-heals').after.life>50000);
assert(last('native-lifedrain-damages-and-heals').after.actors[1].life<36);
assert.deepEqual(courseOf('native-reload-fills-actual-drum').steps.map((s:any)=>s.after.banks[0][1].count),[0,0,1,2,3,3]);
assert.equal(last('native-reload-fills-actual-drum').after.cast,null);
assert.deepEqual(callsOf('native-arcswarm-release-detonates','explode').map((c:any)=>c.mult),[2.1,2.1]);
assert.equal(last('native-arcswarm-release-detonates').after.projectiles.length,0);
assert.equal(courseOf('native-amalgam-eats-and-releases').steps[3].after.cast.amalgamFed,2);
assert.equal(last('native-amalgam-eats-and-releases').after.actors.filter((a:any)=>a.source==='the_amalgam'&&!a.dead).length,1);
assert.equal(courseOf('native-hailcrown-persists-earned-power').steps[10].after.persists.length,1);
assert.equal(last('native-hailcrown-persists-earned-power').after.persists.length,0);
assert.equal(callsOf('native-surgewind-full-bank-release','trigger').filter((c:any)=>c.on==='channelFinish').length,1);
assert.equal(callsOf('native-surgewind-full-bank-release','execute').at(-1).options.dmgMult,1);
assert.equal(courseOf('native-marrow-bank-across-interruption').steps[6].after.brims[0].fill,2/7);
assert.equal(last('finish-trigger-changes-later-brim-fill').after.brims[0].fill,.5);
assert.equal(callsOf('beat-trigger-changes-later-pulse-ramp','execute').find((c:any)=>c.skill==='firebolt').options.dmgMult,1.5);
assert.deepEqual(last('native-finish-tap-banks-charges').after.charges,[['frenzy',2]]);
assert.equal(courseOf('brim-world-decay-retains-held-bank').steps[2].after.brims[0].fill,.5);
assert.equal(courseOf('brim-world-decay-retains-held-bank').steps[5].after.brims[0].fill,.375);
assert.equal(last('brim-world-decay-retains-held-bank').after.brims.length,0);
assert.equal(last('brim-world-bank-at-plateau').after.brims[0].fill,.5);
assert.equal(courseOf('brim-world-removes-spent-entry').steps[4].after.brims.length,1,'World.update(0) skips the actor sweep');
assert.equal(last('brim-world-removes-spent-entry').after.brims.length,0);
assert.equal(courseOf('gather-funded-bank-through-cooldown').steps[6].accepted,true);
assert.equal(callsOf('gather-funded-bank-through-cooldown','execute').length,1);
fs.writeFileSync(process.argv[2],JSON.stringify({format:'hollow-wake-channel-observations/v1',courses:results,rejected})+'\n',{flag:'wx'});
console.log(JSON.stringify({courses:results.length,transitions:results.reduce((n,c)=>n+c.steps.length,0),rejected}));
