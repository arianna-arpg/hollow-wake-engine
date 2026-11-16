import {test} from 'node:test';import assert from 'node:assert/strict';
import {MovementDeliveries} from '../dist/movement-deliveries.js';import {UtilityDeliveries} from '../dist/utility-deliveries.js';import {ProjectileSchedules} from '../dist/projectile-schedules.js';
function setup(){
  const events=[],bodies=[],enemies=[],blinks=[],stats={effectDuration:2},make=(over={})=>({name:'caster',dead:false,team:'player',pos:{x:0,y:0},radius:10,tier:0,facing:0,facingPrev:0,untargetable:false,useLock:0,
    sheet:{get:key=>stats[key]??0,setBase:(key,n)=>events.push(['base',key,n])},maxLife:()=>100,fillResources:()=>events.push('fill'),
    applyStatus:(...args)=>events.push(['status',...args]),endStatus:id=>events.push(['end-status',id]),...over});
  const caster=make(),skill={def:{id:'move',name:'Move',color:'red'}},ports={createActor:(name,team,pos)=>make({name,team,pos}),addActor:a=>bodies.push(a),
    forgetMotion:()=>events.push('forget'),moment:(_a,_i,phase)=>events.push(['moment',phase]),blast:(_a,_i,at,phase)=>events.push(['blast',{...at},phase]),status:()=>({duration:4}),
    clamp:p=>p,afforded:(_a,_i,p)=>p,grants:(_a,_t,_m,base)=>[...base??[]],conjure:()=>events.push('cloud'),trailSpec:n=>({radius:10,duration:2,damageScale:n}),trail:(_a,_i,_s,p)=>events.push(['trail',{...p}]),
    teleport:(a,p)=>{a.pos={...p};events.push('teleport');},linger:()=>events.push('linger'),enemies:()=>enemies,hit:(_a,_i,b,m)=>events.push(['hit',b,m]),surfaces:()=>events.push('surfaces'),flash:()=>events.push('flash'),voice:()=>undefined};
  const runtime=new MovementDeliveries(blinks,{radius:20,radiusPer:2,hold:3,holdPer:1},ports),frame={caster,skill,aim:{x:100,y:0},tags:new Set(),modifiers:[],areaScale:2,multiplier:3,color:'blue'};
  return{events,bodies,enemies,blinks,stats,make,caster,skill,ports,runtime,frame};
}
test('dash replaces carom quietly, keeps skill identity, scales speed without changing distance and owns fresh hit memory',()=>{
  const h=setup();h.caster.caromRun={status:'caroming'};h.caster.caromSkill=h.skill;
  h.runtime.dash({...h.frame,speedMultiplier:.5},{speed:200,distance:100,phase:true});
  assert.deepEqual(h.caster.dash,{dir:0,speed:100,remaining:1});assert.equal(h.caster.dashSkill,h.skill);assert.equal(h.caster.caromRun,null);assert.equal(h.caster.caromSkill,undefined);
  assert.deepEqual(h.events.slice(0,4),[['end-status','caroming'],'forget',['moment','depart'],['status','phasing',0,.3125,'Move']]);assert(h.caster.dashHits instanceof Set);
});
test('dash decoy inherits appearance by reference, fills after life setup and is published last',()=>{
  const h=setup();h.caster.look={id:'look'};h.runtime.dash(h.frame,{speed:100,distance:100,decoyDuration:3});const body=h.bodies[0];
  assert.equal(body.look,h.caster.look);assert.equal(body.owner,h.caster);assert.equal(body.summonInst,h.skill);assert.equal(body.lifespan,6);assert.deepEqual(h.events.slice(0,2),[['base','life',45],'fill']);
});
test('delayed blink holds until due, clears cue and queue before teleport and faces only a target on the current layer',()=>{
  const h=setup(),target=h.make({pos:{x:100,y:0}});h.runtime.blink({...h.frame,target:{actor:target,pos:target.pos}},{range:200,behindTarget:true,delay:1});
  const row=h.blinks[0];assert.equal(row.faceTarget,target);h.runtime.advanceBlinks(.5);assert.equal(h.caster.pos.x,0);target.tier=1;
  h.ports.teleport=(a,p)=>{assert.equal(h.blinks.length,0);assert.equal(row.visual.life,0);a.pos=p;};h.runtime.advanceBlinks(.5);assert.equal(h.caster.pos.x,70);assert.equal(h.caster.facing,0);assert.equal(h.events.at(-1),'linger');
});
test('dead delayed blink clears its cue without movement or arrival effects',()=>{
  const h=setup();h.runtime.blink(h.frame,{range:100,delay:1});const visual=h.blinks[0].visual;h.caster.dead=true;h.events.length=0;h.runtime.advanceBlinks(0);assert.equal(visual.life,0);assert.equal(h.blinks.length,0);assert.deepEqual(h.events,[]);
});
test('leap startup retains prior targeting state while repeat delivery resolves impact without creating another leap',()=>{
  const h=setup(),enemy=h.make({pos:{x:30,y:0}});h.enemies.push(enemy);h.caster.untargetable=true;
  const d={range:100,radius:20,airTime:1,telegraph:true};h.runtime.leap(h.frame,d);assert.equal(h.caster.leap.wasUntargetable,true);assert.equal(h.caster.leap.inst,h.skill);assert.equal(h.caster.useLock,1.1);
  const previous=h.caster.leap;h.runtime.leap({...h.frame,noRepeat:true},d);assert.equal(h.caster.leap,previous);assert(h.events.some(e=>e[0]==='hit'&&e[2]===3));
});
test('carom end clears state before status removal, emits arrival only when alive and nonquiet',()=>{
  const h=setup();h.runtime.carom(h.frame,{speed:100,duration:2});h.events.length=0;h.caster.endStatus=id=>{assert.equal(h.caster.caromRun,null);assert.equal(h.caster.caromSkill,undefined);h.events.push(id);};
  h.runtime.endCarom(h.caster);assert.deepEqual(h.events,['caroming',['moment','arrive'],['blast',{x:0,y:0},undefined],'linger']);
});
test('mine detonation bypasses cast delay, refills before executing and consumes the queue before death',()=>{
  const caster={},skill={def:{id:'mine'}},mine={owner:caster,dead:false,construct:{kind:'mine',castInst:skill},pos:{x:2,y:3},tier:1,useLock:5,mana:0,maxMana:()=>20,cooldowns:new Map([['mine',1]])},queue=[],events=[];
  const runtime=new UtilityDeliveries(queue,{actors:()=>[mine],prepareMine:(_a,_i,t)=>({life:t,pos:{x:0,y:0}}),released(){},execute:(a,i,p,opts)=>{assert.equal(queue.length,0);assert.equal(a.useLock,0);assert.equal(a.mana,20);assert.equal(a.cooldowns.size,0);events.push([i,p,opts]);},kill:a=>a.dead=true});
  runtime.detonate(caster,skill,'red');const visual=queue[0].visual;runtime.advanceDetonations(.05);assert.equal(mine.dead,true);assert.equal(visual.life,0);assert.deepEqual(visual.pos,mine.pos);assert.deepEqual(events,[[skill,mine.pos,{keepFacing:true}]]);
});
test('mark clears only after a successful physical teleport, retaining retry state when the host throws',()=>{
  const actor={pos:{x:0,y:0},facing:0},skill={def:{id:'mark'}},runtime=new UtilityDeliveries([],{clamp:p=>p,marked(){},teleport(){throw Error('blocked');}});
  runtime.mark(actor,skill,{x:100,y:0},50,'red');assert.deepEqual(skill.state.markPos,{x:50,y:0});assert.throws(()=>runtime.mark(actor,skill,{x:0,y:0},50,'red'),/blocked/);assert.deepEqual(skill.state.markPos,{x:50,y:0});
});
test('salvos track live aim, honor time scale and emit at most one overdue shot per update',()=>{
  const actor={dead:false,pos:{x:10,y:0},aimPos:{x:10,y:10}},row={caster:actor,inst:{},aim:{x:0,y:0},origin:null,shots:3,timer:.1,interval:.1,mult:2},events=[];
  const runtime=new ProjectileSchedules([row],[],{timeScale:()=>0,spawn:(...args)=>events.push(args)});runtime.advanceSalvos(5);assert.equal(events.length,0);
  runtime.ports.timeScale=()=>1;runtime.advanceSalvos(.5);assert.equal(events.length,1);assert.equal(events[0][3],Math.PI/2);assert.equal(row.shots,2);assert(row.timer<0);
});
test('ambush release rereads arrow positions, removes the bank before deaths, and shares a detached patrol among emitted shots',()=>{
  const actor={dead:false,sheet:{get:()=>0}},skill={def:{color:'red',delivery:{type:'projectile',count:2}}},arrows=[{dead:false,pos:{x:5,y:0}},{dead:false,pos:{x:10,y:0}}],queue=[{caster:actor,inst:skill,arrowIds:[0,1]}],shots=[];
  const runtime=new ProjectileSchedules([],queue,{actorById:n=>arrows[n],kill:a=>{assert.equal(queue.length,0);a.dead=true;},tags:()=>new Set(),modifiers:()=>[],spawn:(...args)=>shots.push(args),released(){},random:()=>assert.fail('fixed count')});
  runtime.trigger(0,3);assert.equal(shots.length,2);assert.equal(shots[0][4].patrol,shots[1][4].patrol);assert.notEqual(shots[0][4].patrol[0],arrows[0].pos);assert.equal(shots[0][4].mult,3);assert.throws(()=>runtime.trigger(-1,1),/Unknown/);
});
