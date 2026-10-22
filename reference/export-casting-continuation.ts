// Independent original casting-continuation observations. No SDK imports.
// Seeded setup is explicit; forwarding observers execute real game decisions.
// Run only in an isolated reference/candidate game. Accepted fixtures are immutable.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {makeSkillInstance} from '../src/engine/skills';
import {mod,ATTRIBUTE_IDS} from '../src/engine/stats';
import {GridWalkField} from '../src/world/gridWalk';
import {CLASSES} from '../src/data/classes';
import {NullInput} from '../src/net/intent';
bootSimEngine();
type Command={kind:string;dt?:number;fraction?:number;value?:any};
type Course={name:string;role?:'ai'|'seat';skill?:string;variant?:any;supports?:string[];commands:Command[]};
const press:Command={kind:'press'},tick=(dt:number):Command=>({kind:'tick',dt}),fraction=(n:number):Command=>({kind:'tick',fraction:n});
const state=(value:any):Command=>({kind:'state',value}),actor=(value:any):Command=>({kind:'actor',value});
const courses:Course[]=[
 {name:'idle-update',commands:[tick(0),tick(.1),{kind:'click'}]},
 {name:'ordinary-exact-completion',commands:[press,fraction(.5),fraction(.5),tick(0)]},
 {name:'ordinary-interrupted-shell-same-source',commands:[press,{kind:'shell',value:'same'},{kind:'stun'},tick(0)]},
 {name:'ordinary-interrupted-shell-other-source',commands:[press,{kind:'shell',value:'other'},{kind:'stun'},tick(0)]},
 {name:'guard-interrupt-order',skill:'shield_up',supports:['grafted_carapace'],commands:[press,{kind:'stun'},tick(.01)]},
 {name:'ordinary-live-aim',variant:{castAim:'live'},commands:[press,{kind:'aim',value:{x:700,y:550}},tick(0),fraction(1)]},
 {name:'ordinary-stamped-aim',commands:[press,{kind:'aim',value:{x:700,y:550}},tick(0),fraction(1)]},
 {name:'live-aim-resolved-target-stays-stamped',variant:{castAim:'live',targeting:{target:'enemy',castRange:400}},commands:[press,{kind:'aim',value:{x:700,y:550}},tick(0)]},
 {name:'live-aim-dead-body-stays-stamped',variant:{castAim:'live'},commands:[press,actor({dead:true}),{kind:'aim',value:{x:700,y:550}},tick(0)]},
 {name:'live-aim-downed-body-stays-stamped',variant:{castAim:'live'},commands:[press,actor({downed:true}),{kind:'aim',value:{x:700,y:550}},tick(0)]},
 {name:'live-aim-locked-cast-stays-stamped',variant:{castAim:'live'},commands:[press,state({lockedAim:{x:640,y:500}}),{kind:'aim',value:{x:700,y:550}},tick(0)]},
 {name:'live-aim-nonfinite-refused',variant:{castAim:'live'},commands:[press,{kind:'aim',value:{x:Infinity,y:550}},tick(0)]},
 {name:'live-aim-missing-refused',variant:{castAim:'live'},commands:[press,{kind:'aim',value:null},tick(0)]},
 {name:'clinger-tracks-live-target',role:'ai',commands:[press,{kind:'cling'},{kind:'target-pos',value:{x:710,y:530}},tick(0)]},
 {name:'clinger-dead-target-retains-aim',role:'ai',commands:[press,{kind:'cling'},{kind:'target',value:{dead:true}},{kind:'target-pos',value:{x:710,y:530}},tick(0)]},
 {name:'seated-clinger-retains-input-aim',commands:[press,{kind:'cling'},{kind:'target-pos',value:{x:710,y:530}},tick(0)]},
 {name:'clinger-after-live-aim-update',role:'ai',variant:{castAim:'live'},commands:[press,{kind:'cling'},{kind:'aim',value:{x:720,y:560}},{kind:'target-pos',value:{x:710,y:530}},tick(0)]},
 {name:'ai-charge-caps-hold-before-advance',role:'ai',skill:'lightning_blast',commands:[press,state({aiHold:100}),fraction(1),tick(0)]},
 {name:'player-charge-keeps-held-at-cap',skill:'lightning_blast',commands:[press,state({aiHold:100}),fraction(1),tick(0),state({held:false}),tick(0)]},
 {name:'ai-guard-hold-fold',role:'ai',skill:'shield_up',commands:[press,state({aiHold:.1}),tick(.1),tick(0)]},
 {name:'ai-gather-require-full-hold',role:'ai',variant:{castMode:'channel',channel:{interval:.4,maxHold:2,release:{requireFull:true,pulses:false}}},commands:[press,tick(0),tick(.25)]},
 {name:'ai-brim-hold',role:'ai',variant:{castMode:'channel',channel:{interval:.4,brim:{fillTime:2,minRelease:.2}}},commands:[press,tick(0),tick(.25)]},
 {name:'ai-channel-random-hold-once',role:'ai',skill:'infernal_ray',commands:[press,tick(0),tick(.1),tick(.1)]},
 {name:'perfect-player-click-once',variant:{castMode:'perfect'},commands:[press,fraction(.8),{kind:'click'},{kind:'click'},fraction(.2)]},
 {name:'timed-player-click-once',variant:{castMode:'timed'},commands:[press,{kind:'marker'}, {kind:'click'},{kind:'click'},fraction(1)]},
 {name:'multitude-player-presses',skill:'infinite_slashes',commands:[press,{kind:'click'},{kind:'click'},fraction(1)]},
 {name:'ai-perfect-no-practice',role:'ai',variant:{castMode:'perfect'},commands:[press,fraction(.9),tick(0),fraction(.1)]},
 {name:'ai-perfect-success',role:'ai',variant:{castMode:'perfect'},commands:[{kind:'finesse',value:1},press,tick(0),fraction(.97),tick(0),fraction(.03)]},
 {name:'ai-perfect-fumble',role:'ai',variant:{castMode:'perfect'},commands:[{kind:'finesse',value:0},press,tick(0),fraction(.65),tick(0),fraction(.35)]},
 {name:'ai-timed-success-roll-large-frame-misses',role:'ai',variant:{castMode:'timed'},commands:[{kind:'finesse',value:1},press,tick(0),fraction(.97),tick(0),fraction(.03)]},
 {name:'ai-timed-success-at-rolled-click',role:'ai',variant:{castMode:'timed'},commands:[{kind:'finesse',value:1},press,tick(0),{kind:'ai-marker'},tick(0),fraction(1)]},
 {name:'ai-perfect-success-at-rolled-click',role:'ai',variant:{castMode:'perfect'},commands:[{kind:'finesse',value:1},press,tick(0),{kind:'ai-marker'},tick(0),fraction(1)]},
 {name:'ai-timed-fumble',role:'ai',variant:{castMode:'timed'},commands:[{kind:'finesse',value:0},press,tick(0),fraction(.97),tick(0),fraction(.03)]},
 {name:'ai-perfect-exact-click-threshold',role:'ai',variant:{castMode:'perfect'},commands:[press,state({aiClickAt:.8,elapsed:.8}),tick(0),fraction(.2)]},
 {name:'ai-perfect-used-click-does-not-roll',role:'ai',variant:{castMode:'perfect'},commands:[{kind:'finesse',value:1},press,state({pressUsed:true}),tick(0),fraction(1)]},
];
const focus={targeting:{target:'enemy',castRange:400},concentration:{time:2,onBreak:'release',minRelease:.25}};
courses.push(
 {name:'focus-player-live-target-move-break',variant:focus,commands:[press,tick(1),{kind:'target-pos',value:{x:750,y:500}},tick(0)]},
 {name:'focus-ai-tracks-live-target',role:'ai',variant:focus,commands:[press,tick(1),{kind:'target-pos',value:{x:750,y:500}},tick(1)]},
 {name:'focus-cancel-clears-recovery',variant:{...focus,concentration:{time:2,onBreak:'cancel'}},commands:[press,state({aiRecovery:3}),tick(1),state({held:false}),tick(0)]},
 {name:'focus-fizzle-live-cooldown-context',variant:{...focus,concentration:{time:2,onBreak:'cancel'}},commands:[press,{kind:'stat',value:{id:'cooldownRecovery',value:2}},state({held:false}),tick(0)]},
 {name:'clinger-missing-target-retains-aim',role:'ai',commands:[press,{kind:'cling'},{kind:'remove-target'},tick(0)]},
 {name:'totem-placement-completes',commands:[{kind:'stat',value:{id:'castAsTotem',value:1}},press,fraction(1)]},
 {name:'totem-placement-skips-live-aim',variant:{castAim:'live'},commands:[{kind:'stat',value:{id:'castAsTotem',value:1}},press,{kind:'aim',value:{x:700,y:550}},tick(0),fraction(1)]},
 {name:'persistent-channel-vessel-completes',skill:'infernal_ray',commands:[{kind:'stat',value:{id:'channelPersist',value:2}},press,fraction(1)]},
 {name:'overcharge-release',supports:['overcharge'],commands:[press,fraction(1),state({held:false}),tick(0)]},
 {name:'ai-overcharge-release',role:'ai',supports:['overcharge'],commands:[press,state({aiHold:0}),tick(0)]},
);
for(const flag of ['dead','downed','untargetable','invisible','removed'])courses.push({name:'focus-quarry-'+flag,variant:focus,commands:[press,tick(1),flag==='invisible'?{kind:'target-invisible'}:flag==='removed'?{kind:'remove-target'}:{kind:'target',value:{[flag]:true}},tick(0)]});
const blockedStart:Command[]=[press,state({aiHold:10,pulseTimer:10}),{kind:'ai-target'},{kind:'wall',value:true}];
courses.push(
 {name:'ai-channel-wall-below-grace-holds',role:'ai',skill:'infernal_ray',commands:[...blockedStart,tick(.89999),tick(0)]},
 {name:'ai-channel-wall-exact-grace-releases',role:'ai',skill:'infernal_ray',commands:[...blockedStart,state({losLost:.9}),tick(0)]},
 {name:'ai-channel-clear-line-resets-grace',role:'ai',skill:'infernal_ray',commands:[...blockedStart,tick(.4),{kind:'wall',value:false},tick(0)]},
 {name:'ai-channel-dead-prey-resets-grace',role:'ai',skill:'infernal_ray',commands:[...blockedStart,tick(.4),{kind:'target',value:{dead:true}},tick(0)]},
 {name:'ai-channel-missing-prey-resets-grace',role:'ai',skill:'infernal_ray',commands:[...blockedStart,tick(.4),{kind:'remove-target'},tick(0)]},
 {name:'ai-channel-no-fireline-contract-resets-grace',role:'ai',variant:{castMode:'channel',channel:{interval:.4},delivery:{type:'self'},effects:[]},commands:[...blockedStart,state({losLost:.4}),tick(0)]},
 {name:'secondary-seat-charge-uses-nonprimary-hold-rule',role:'seat',skill:'lightning_blast',commands:[press,state({aiHold:100}),fraction(1),tick(0)]},
 {name:'secondary-seat-finesse-needs-manual-click',role:'seat',variant:{castMode:'perfect'},commands:[{kind:'finesse',value:1},press,tick(0),fraction(.8),tick(0),{kind:'click'},fraction(.2)]},
 {name:'secondary-seat-clinger-retains-input-aim',role:'seat',commands:[press,{kind:'cling'},{kind:'target-pos',value:{x:710,y:530}},tick(0)]},
 {name:'secondary-seat-focus-does-not-auto-track',role:'seat',variant:focus,commands:[press,tick(1),{kind:'target-pos',value:{x:750,y:500}},tick(0)]},
);
const fields=['mode','elapsed','total','held','baseMult','channelTime','pulseTimer','hitSpool','stage','sinceStage','sparkWindow','shield','maxShield','guardPulseT','bashAt','bashLow','bashArmAt','aiHold','aiRecovery','aiClickAt','aiGuardWindup','aiGuardReleaseAt','aiGuardEarly','losLost','pressUsed','empowered','presses','indicatorAt','focusBroken','paidCost','chargesSpent','ventRounds','plantTotem','plantChannel','quarryId'];
const wire=(v:any):any=>JSON.parse(JSON.stringify(v,(_key,value)=>typeof value==='number'&&!Number.isFinite(value)?{number:String(value)}:value));
const results:any[]=[];
for(const course of courses){
 const restore=seedGlobalRandom(350035);
 try{
  const w=makeSimWorld('magician',350035),aw:any=w;
  const a:any=course.role==='ai'?w.createMonster('zombie',1,'player'):course.role==='seat'?w.addSeat('continuation-seat',CLASSES.find(c=>c.id==='magician')!,new NullInput(),{startingCompanions:false,startingFlasks:false}).actor:w.player;
  const target:any=w.createMonster('zombie',1,'enemy');
  w.devIgnoreSkillAttributes=true;w.walk=null;a.pos={x:500,y:500};target.pos={x:650,y:500};target.tier=a.tier;
  w.springAmbush(target,true);target.untargetable=false;w.actors=[...new Set([w.player,a,target])];
  for(const body of [a,target]){
   body.brain=undefined;body.setAttributes(Object.fromEntries(ATTRIBUTE_IDS.map(key=>[key,40])));
   body.sheet.setSource('continuation-rig',[
    ...['life','mana'].map(id=>mod(id,'override',10000)),
    ...['energyShield','lifeRegen','manaRegen','poise','blockChance','evasion','critChance'].map(id=>mod(id,'override',0)),
    ...['castSpeed','attackSpeed','cooldownRecovery','manaCost','manaUseCost','effectDuration'].map(id=>mod(id,'override',1)),
   ]);body.fillResources();body.useLock=0;body.cooldowns.clear();
  }
  target.life=100;
  const source=SKILLS[course.skill??'firebolt'];assert(source,course.name);
  const def=course.skill?source:{...source,manaCost:6,lifeCost:2,cooldown:2,useTime:1,...course.variant};
  const inst=makeSkillInstance(def,1,3);
  for(const[index,id]of(course.supports??[]).entries()){assert(SUPPORTS[id],id);inst.sockets[index]={def:SUPPORTS[id],level:1};}
  a.skills=[inst];const seat=w.seatOf(a);if(seat)seat.meta.knownSkills.set(def.id,inst);
  const label=(body:any)=>body===a?'caster':body===target?'target':body===w.player?'primary':body?body.id:null;
  const targetView=(info:any)=>info?{pos:info.pos,actor:label(info.actor)}:null;
  const castView=(cs:any)=>cs?wire({...Object.fromEntries(fields.map(key=>[key,cs[key]??null])),aim:cs.aim,lockedAim:cs.lockedAim??null,targetInfo:targetView(cs.targetInfo),instanceSame:cs.inst===inst}):null;
  let calls:any[]=[];
  const mark=aw.markSeatActed.bind(w),click=w.castPress.bind(w),execute=w.executeSkill.bind(w),trigger=aw.rollTriggers.bind(w),lower=aw.guardArts.lower.bind(aw.guardArts),hold=aw.aiHoldOf.bind(w),plant=aw.plantSpiritTotem.bind(w),spawn=aw.spawnConstruct.bind(w),fire=w.lineOfFire.bind(w),needsFire=w.aiNeedsFireLine.bind(w);
  aw.markSeatActed=(body:any)=>{calls.push({kind:'acted',actor:label(body),active:!!body.casting});return mark(body);};
  w.castPress=(body:any)=>{calls.push({kind:'click',actor:label(body),cast:castView(body.casting)});return click(body);};
  w.executeSkill=(...args:Parameters<typeof w.executeSkill>)=>{const options=args[3]??{};calls.push(wire({kind:'execute',actor:label(args[0]),active:!!args[0].casting,recovery:args[0].useLock,aim:args[2],options:{...options,targetInfo:targetView(options.targetInfo)}}));return execute(...args);};
  aw.rollTriggers=(body:any,on:any,context:any)=>{calls.push({kind:'trigger',actor:label(body),on,active:!!body.casting,empowered:body.casting?.empowered??null});return trigger(body,on,context);};
  aw.guardArts.lower=(body:any,skill:any)=>{calls.push({kind:'guard-lower',active:!!body.casting,shell:body.shellGuard?.fromAura??null});return lower(body,skill);};
  aw.aiHoldOf=(cs:any)=>{const value=hold(cs);calls.push({kind:'hold',value});return value;};
  aw.plantSpiritTotem=(...args:any[])=>{calls.push(wire({kind:'plant-totem',active:!!args[0].casting,recovery:args[0].useLock,aim:args[2]}));return plant(...args);};
  aw.spawnConstruct=(...args:any[])=>{calls.push(wire({kind:'spawn-construct',active:!!args[0].casting,recovery:args[0].useLock,spec:args[2],aim:args[3]}));return spawn(...args);};
  w.lineOfFire=(...args:Parameters<typeof w.lineOfFire>)=>{const value=fire(...args);calls.push({kind:'line-of-fire',value});return value;};
  w.aiNeedsFireLine=(...args:Parameters<typeof w.aiNeedsFireLine>)=>{const value=needsFire(...args);calls.push({kind:'needs-fire-line',value});return value;};
  const snapshot=()=>wire({time:w.time,actor:label(a),mana:a.mana,life:a.life,dead:a.dead,downed:a.downed,useLock:a.useLock,aimPos:a.aimPos,cast:castView(a.casting),shell:a.shellGuard??null,cooldowns:[...a.cooldowns],cooldownTotals:[...a.cooldownTotals],target:{life:target.life,dead:target.dead,downed:target.downed,untargetable:target.untargetable,invisible:target.sheet.get('invisible'),present:w.actors.includes(target),pos:target.pos},actors:w.actors.map(body=>({id:body.id,team:body.team,construct:body.construct?.kind,holdOnce:body.construct?.holdOnce,mode:body.casting?.mode})),projectiles:w.projectiles.map(p=>({mult:p.mult,speed:p.speed})),flashes:w.flashes.map(f=>({radius:f.radius,color:f.color,life:f.life,style:f.combatCue?.style})),repeats:aw.pendingRepeats.length});
  const initial=snapshot(),steps:any[]=[];
  for(const command of course.commands){
   calls=[];const before=snapshot(),previous=a.casting,priorAim=previous?.aim,draws:number[]=[];
   const random=Math.random;Math.random=()=>{const n=random();draws.push(n);return n;};let accepted,dt;
   try{
    if(command.kind==='press'){accepted=w.useSkill(a,inst,target.pos,true);assert(accepted,course.name);}
    else if(command.kind==='tick'){dt=command.fraction!==undefined?(a.casting?.total??0)*command.fraction:command.dt!;w.time+=dt;aw.updateCasting(a,dt);}
    else if(command.kind==='click')w.castPress(a);
    else if(command.kind==='state'){assert(a.casting,course.name);Object.assign(a.casting,command.value);}
    else if(command.kind==='actor')Object.assign(a,command.value);
    else if(command.kind==='target')Object.assign(target,command.value);
    else if(command.kind==='target-invisible')target.sheet.setSource('continuation-invisible',[mod('invisible','override',1)]);
    else if(command.kind==='remove-target')w.actors=w.actors.filter(body=>body!==target);
    else if(command.kind==='ai-target')a.aiTargetId=target.id;
    else if(command.kind==='wall'){
     const grid=new GridWalkField(1000,1000,25);grid.fillRect(0,0,999,999,true);
     if(command.value)grid.fillRect(575,450,599,550,false);w.walk=grid;
     assert.equal(fire(a.pos,target.pos,a.tier),!command.value,course.name+' native wall setup');
    }
    else if(command.kind==='stat')a.sheet.setSource('continuation:'+command.value.id,[mod(command.value.id,'override',command.value.value)]);
    else if(command.kind==='target-pos')target.pos={...command.value};
    else if(command.kind==='aim')a.aimPos=command.value?{...command.value}:null;
    else if(command.kind==='finesse')a.brain={type:'basic',skillUse:{finesse:{chance:command.value}}};
    else if(command.kind==='cling')a.clingTo={id:target.id};
    else if(command.kind==='stun')a.applyStatus('stun',0,1,'continuation rig');
    else if(command.kind==='shell')a.shellGuard={side:'rear',arcDeg:200,max:10,pool:10,regenDelay:4,regenRate:2,lastHitAt:-999,broken:false,color:'blue',fromAura:command.value==='same'?def.id:'another-skill'};
    else if(command.kind==='marker'){assert(a.casting);dt=a.casting.total*a.casting.indicatorAt-a.casting.elapsed;assert(dt>=0);w.time+=dt;aw.updateCasting(a,dt);}
    else if(command.kind==='ai-marker'){assert(a.casting);dt=a.casting.total*a.casting.aiClickAt-a.casting.elapsed;assert(dt>=0);w.time+=dt;aw.updateCasting(a,dt);}
    else throw new Error('Unknown continuation command '+command.kind);
   }finally{Math.random=random;}
   steps.push(wire({command,before,dt,accepted,calls,draws,after:snapshot(),previousCastAfter:castView(previous),sameActiveCast:!!previous&&a.casting===previous,sameAim:!!previous&&previous.aim===priorAim}));
  }
  results.push(wire({name:course.name,role:course.role??'player',skill:def.id,variant:course.variant??null,initial,steps}));
 }finally{restore();}
}
const find=(name:string)=>{const result=results.find(c=>c.name===name);assert(result,name);return result;};
const events=(name:string,kind:string)=>find(name).steps.flatMap((s:any)=>s.calls).filter((c:any)=>c.kind===kind);
assert.equal(events('ai-timed-success-roll-large-frame-misses','trigger').length,0);
assert.equal(events('ai-timed-success-at-rolled-click','trigger').length,1);
assert.equal(events('ai-perfect-success-at-rolled-click','trigger').length,1);
assert.equal(events('ai-perfect-used-click-does-not-roll','click').length,0);
assert.equal(find('ai-charge-caps-hold-before-advance').steps[2].after.cast.held,true);
assert.equal(find('ai-charge-caps-hold-before-advance').steps[3].after.cast,null);
assert.equal(find('secondary-seat-charge-uses-nonprimary-hold-rule').steps.at(-1).after.cast,null);
assert.equal(find('secondary-seat-finesse-needs-manual-click').steps[4].after.cast.aiClickAt,null);
assert.equal(events('secondary-seat-finesse-needs-manual-click','click').length,1);
assert.equal(find('focus-cancel-clears-recovery').steps.at(-1).previousCastAfter.aiRecovery,null);
assert.equal(events('totem-placement-completes','plant-totem').length,1);
assert(events('persistent-channel-vessel-completes','spawn-construct').some((c:any)=>c.spec.kind==='eruptor'));
assert.equal(find('ai-channel-wall-below-grace-holds').steps.at(-1).after.cast.held,true);
assert.equal(find('ai-channel-wall-exact-grace-releases').steps.at(-1).after.cast,null);
for(const name of ['ai-channel-clear-line-resets-grace','ai-channel-dead-prey-resets-grace','ai-channel-missing-prey-resets-grace','ai-channel-no-fireline-contract-resets-grace'])assert.equal(find(name).steps.at(-1).after.cast.losLost,0,name);
fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Casting continuation: native requests/updates and explicitly seeded actor/cast states',courses:results})+'\n',{flag:'wx'});
console.log(JSON.stringify({courses:results.length,transitions:results.reduce((sum,c)=>sum+c.steps.length,0)}));
