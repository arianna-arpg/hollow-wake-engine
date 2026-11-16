import test from 'node:test';import assert from 'node:assert/strict';import {ConstructLifecycle} from '../dist/construct-lifecycle.js';
function host(){const actors=[],events=[],state={tethers:[],pendingRepeats:[]};let now=0,draws=0;
  const make=(id,x=0,team='player')=>{const stats={damage:1,statusMagnitude:1,aoeRadius:1,effectDuration:1,mirageDamage:1,constructCastRate:1,minionLife:1};const a={id,level:2,pos:{x,y:0},tier:0,radius:10,facing:0,team,dead:false,downed:false,untargetable:false,life:100,mana:20,useLock:1,lifespan:2,shape:'circle',color:'red',cooldowns:new Map(),casting:null,sheet:{get:(k,t,m,base)=>stats[k]??base??0,setSource:(...args)=>events.push(['source',id,...args])},canUse:()=>true,maxLife:()=>100,maxMana:()=>100,skillUseTime:()=>.1,gainCharge:(...args)=>events.push(['charge',...args])};actors.push(a);return a;};
  const owner=make(1),prey=make(2,50,'enemy'),skill={def:{id:'payload',name:'Payload',tags:['spell'],color:'blue',delivery:{type:'projectile'},effects:[{type:'damage'}]}},source={def:{...skill.def,id:'source',delivery:{type:'construct'}}};
  const ports={actors:()=>actors,time:()=>now,random:()=>{draws++;return .5;},enemiesOf:a=>actors.filter(b=>b.team!==a.team&&!b.dead&&b.tier===a.tier),actorById:id=>actors.find(a=>a.id===id),skill:id=>id===skill.def.id?skill.def:undefined,makeSkillInstance:(def,level)=>({def,level}),effectiveSkillLevel:()=>3,instanceMods:()=>[],skillContextTags:()=>new Set(),instanceChargeCost:()=>undefined,instanceTargeting:()=>undefined,instanceAim:()=>undefined,instanceDelivery:i=>i.def.delivery,hostSockets:()=>[],
    resolveHit:(...args)=>events.push(['hit',...args]),executeSkill:(...args)=>{events.push(['execute',...args]);return true;},useSkill:(...args)=>events.push(['use',...args]),kill:a=>{a.dead=true;events.push(['kill',a]);},applyRestore:(...args)=>events.push(['restore',...args]),clampPos:at=>({...at}),teleportActor:(a,at)=>{a.pos=at;events.push(['teleport',a]);},isStealthed:()=>false,presenceMoment:()=>false,flash(){},text(){},
    spawnConstruct:(owner,inst,d,aim,payload)=>{const a=make(actors.length+1);a.owner=owner;a.summonInst=inst;a.construct={kind:d.kind,range:d.range,timer:0,castInst:payload};a.explodeOnDeath=10;return a;}};
  const runtime=new ConstructLifecycle(state,{echoStrikeLifeMax:2},ports),construct=(kind,at=0)=>{const a=make(actors.length+1,at);a.owner=owner;a.summonInst=source;a.construct={kind,range:100,timer:0,castInst:skill};return a;};
  return{actors,events,state,owner,prey,skill,source,ports,runtime,make,construct,get draws(){return draws;},set time(v){now=v;}};
}
test('trap arming crosses zero without firing until the next update; release restores mana then retires',()=>{
  const h=host(),c=h.construct('trap');c.construct.timer=.1;h.runtime.updateConstructs(.2);assert(!c.dead);assert.equal(h.events.length,0);h.runtime.updateConstructs(0);assert(c.dead);assert.equal(c.mana,100);assert.equal(c.useLock,0);assert.equal(h.events[0][0],'execute');assert.equal(h.events[0][1],c);assert.equal(h.events[0][2],h.skill);
});
test('healing totem chooses most wounded eligible ally on its own tier',()=>{
  const h=host(),c=h.construct('totem'),first=h.make(5,40),second=h.make(6,30);c.construct.castInst={def:{...h.skill.def,targeting:{target:'ally'}}};first.life=10;first.tier=1;second.life=20;h.owner.life=50;h.runtime.updateConstructs(.1);assert.equal(h.events[0][0],'use');assert.equal(h.events[0][3],second.pos);
});
test('embed collection applies charge and resource once, then honors its cooldown without destroying the body',()=>{
  const h=host(),c=h.construct('embed');c.construct.embed={runOver:'collect',collect:{charge:'blade',resource:'mana',amount:2,max:4},icd:.5};h.runtime.updateConstructs(.1);assert.equal(h.events.filter(e=>e[0]==='charge').length,1);assert.equal(h.events.filter(e=>e[0]==='restore').length,1);assert.equal(c.construct.embedReadyAt,.5);assert(!c.dead);h.time=.3;h.runtime.updateConstructs(.2);assert.equal(h.events.length,2);
});
test('gate crossing updates both gate timers and uses the existing spatial teleport boundary',()=>{
  const h=host(),a=h.construct('gate'),b=h.construct('gate',200);a.gateLink=b.id;b.gateLink=a.id;h.runtime.updateConstructs(.1);assert.deepEqual(h.owner.pos,{x:230,y:0});assert.equal(a.construct.timer,1.2);assert(Math.abs(b.construct.timer-1.1)<1e-12);assert.equal(h.events.filter(e=>e[0]==='teleport').length,1);
});
test('eruptor retains one cast per update and draws radius after heading; held single use releases before retirement',()=>{
  const h=host(),c=h.construct('eruptor');c.construct.castInterval=.2;h.runtime.updateConstructs(2);assert.equal(h.draws,2);assert.equal(h.events.filter(e=>e[0]==='use').length,1);assert.equal(c.construct.timer,.2);
  c.construct.holdOnce=true;c.construct.started=true;c.casting={held:true};c.lifespan=.1;h.runtime.updateConstructs(.1);assert.equal(c.casting.held,false);c.casting=null;h.runtime.updateConstructs(.1);assert(c.dead);
});
test('hover riders refresh in place without laundering cooldowns and refuse forbidden payloads',()=>{
  const h=host(),spec={mode:'hover',count:2,duration:2};h.runtime.spawnEchoRiders(h.owner,h.source,spec,'source:self',{x:0,y:0},h.skill);const riders=h.actors.filter(a=>a.owner===h.owner);assert.equal(riders.length,2);riders[0].cooldowns.set('payload',3);riders[0].lifespan=.5;
  h.runtime.spawnEchoRiders(h.owner,h.source,{...spec,duration:4},'source:self',{x:0,y:0},h.skill);assert.equal(h.actors.filter(a=>a.owner===h.owner).length,2);assert.equal(riders[0].cooldowns.get('payload'),3);assert.equal(riders[0].lifespan,4);assert.equal(riders[0].construct.castInst,h.skill);assert.equal(riders[0].explodeOnDeath,0);
  h.runtime.spawnEchoRiders(h.owner,h.source,spec,'bad:self',{x:0,y:0},{def:{...h.skill.def,delivery:{type:'summon'}}});assert.equal(h.actors.length,4);
});
test('strike ghosts select distinct nearby prey and cap their chase lifetime',()=>{
  const h=host();const second=h.make(4,70,'enemy');h.runtime.spawnEchoRiders(h.owner,h.source,{mode:'strike',count:2,duration:20,casts:2},'source:self',{x:0,y:0},h.skill);const ghosts=h.actors.filter(a=>a.owner===h.owner);assert.equal(ghosts.length,2);assert.deepEqual(ghosts.map(g=>g.construct.echoPrey),[h.prey.id,second.id]);assert(ghosts.every(g=>g.lifespan===2));
  ghosts[0].pos={x:40,y:0};ghosts[1].pos={x:10,y:0};h.runtime.updateConstructs(.1);assert.equal(ghosts[0].construct.echoCasts,1);assert.equal(h.events.filter(e=>e[0]==='use').length,1);assert.equal(ghosts[1].construct.echoCasts,2);
});
test('mimic dispatch schedules one oldest-ready clone with the original payload identity and copied target point',()=>{
  const h=host();const a=h.construct('echo'),b=h.construct('echo');for(const c of[a,b])c.construct.echo={mode:'mimic',duration:4};a.construct.echoReadyAt=.1;b.construct.echoReadyAt=0;b.construct.echoPower=.4;h.time=1;
  h.runtime.echoToClones(h.owner,h.skill,{x:9,y:9},2,{actor:h.prey});assert.equal(h.state.pendingRepeats.length,1);const queued=h.state.pendingRepeats[0];assert.equal(queued.caster,b);assert.equal(queued.inst,h.skill);assert.deepEqual(queued.aim,h.prey.pos);assert.notEqual(queued.aim,h.prey.pos);assert.equal(queued.dmgMult,.8);assert.equal(b.construct.echoReadyAt,1.9);
});
