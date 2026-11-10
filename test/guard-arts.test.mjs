import test from 'node:test';
import assert from 'node:assert/strict';
import {GuardArts,createGuardArtsState,GUARD_ARTS_LIMITS,resolveGuardArts,guardArtsErrors,guardArtCapacity,guardArtAbsorb} from '../dist/guard-arts.js';

const plates={interval:1,max:3,reduction:.2,label:'Plates'};
const absorb={fraction:.5,duration:4,cooldown:8};
const ram={base:10,thorns:2,weight:3,interval:.5,repeat:.25,reset:2,reach:5,arc:120,push:7};
function skill(spec={},id='guard') {return {def:{id,color:'#abc',tags:['guard'],guard:{shieldLife:100,arcDeg:120},guardArts:spec},level:1,sockets:[],treeNodes:[]};}
function actor(id,skills=[]) {return {id,skills,dead:false,downed:false,life:100,invulnerable:false,pos:{x:0,y:0},radius:2,tier:0,team:'friendly',facing:0,guardIntervention:{},absorbLayers:new Map(),sources:new Map(),buffs:new Map()};}
function fixture(spec={},overrides={}) {
 const inst=skill(spec),a=actor(1,[inst]),world={actors:[a],enemies:[],time:0,scale:1,client:false,lite:false,draw:.1,blocked:new Set(),stats:{blockChance:.5,aoeRadius:1,bashPower:1,thorns:2}};
 const calls={random:0,hits:[],casts:[],retired:[],flashes:[],promotions:[],heals:[],bash:[],absorb:[],cooldown:[],order:[]};
 const ports={
  actors:()=>world.actors,contains:x=>world.actors.includes(x),client:()=>world.client,time:()=>world.time,scale:()=>world.scale,
  spec:i=>i.def.guardArts,bashSpec:()=>({mult:2}),capacity:()=>100,
  absorb:(x,i,power)=>{calls.absorb.push(power);return {amount:50*power,duration:4*power};},
  tags:(i,extra=[])=>new Set([...i.def.tags,...extra]),grantedTags:()=>[],modifiers:()=>[],stat:(x,id)=>world.stats[id]??1,modifier:(stat,kind,value)=>({stat,kind,value}),
  setSource:(x,key,mods)=>x.sources.set(key,mods),removeSource:(x,key)=>x.sources.delete(key),
  addBuff:(x,buff)=>x.buffs.set(buff.id,buff),removeBuff:(x,key)=>x.buffs.delete(key),
  spendAbsorb:(x,value)=>{calls.order.push(['spend',value]);return value-50;},cooldown:(x,i)=>{calls.cooldown.push(i);calls.order.push(['cooldown',i.def.id]);},bash:(...args)=>calls.bash.push(args),
  payload:(i,delivery,flat)=>({...i,host:i,def:{...i.def,delivery,flat,tags:[...i.def.tags]}}),appendTags:(i,tags)=>i.def.tags.push(...tags),
  enemies:()=>world.enemies,lineOfSight:(x,y)=>!world.blocked.has(y),hit:(...args)=>calls.hits.push(args),execute:(...args)=>calls.casts.push(args),
  retireProjectiles:(...args)=>calls.retired.push(args),flash:x=>calls.flashes.push(x),hasLite:()=>world.lite,promote:(...args)=>calls.promotions.push(args),
  weight:()=>2,maxLife:()=>200,heal:(...args)=>calls.heals.push(args),satellite:family=>({skill:'orbit',radius:family==='red'?8:6}),random:()=>{calls.random++;return world.draw;},...overrides,
 };
 const state=createGuardArtsState(),runtime=new GuardArts(ports,state);
 return {runtime,state,ports,world,calls,a,inst,current:()=>state.owners.get(a)?.get(inst),hold(){a.casting={inst,mode:'guard',held:true};runtime.raised(a,inst);}};
}
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

test('state and limits are explicit and each default runtime is independent',()=>{
 const f=fixture();const other=new GuardArts(f.ports);f.runtime.sync(f.a);other.sync(f.a);
 assert.notEqual(f.state,other.state);assert.notEqual(f.current(),other.state.owners.get(f.a).get(f.inst));
 assert.equal(f.state.nextSource,2);assert.equal(other.state.nextSource,2);assert(Object.isFrozen(GUARD_ARTS_LIMITS));
 assert.deepEqual(GUARD_ARTS_LIMITS,{pendingBlasts:16,promotePerFrame:8,maximumReduction:.95});
});
test('client sync is inert; dead and downed owners retire their own state',()=>{
 const f=fixture({absorb});f.world.client=true;f.runtime.sync(f.a);assert.equal(f.state.owners.size,0);
 f.world.client=false;f.runtime.sync(f.a);assert(f.current());f.a.dead=true;f.runtime.sync(f.a);assert.equal(f.current(),undefined);
 f.a.dead=false;f.runtime.sync(f.a);f.a.downed=true;f.runtime.sync(f.a);assert.equal(f.current(),undefined);assert.equal(f.calls.retired.length,2);
});
test('no discipline has no state and cannot cast',()=>{
 const f=fixture();delete f.inst.def.guardArts;f.runtime.sync(f.a);assert.equal(f.runtime.cast(f.a,f.inst),false);
 assert.deepEqual(f.runtime.guardHit(f.a,f.inst,12),{damage:12,restore:0});assert.equal(f.state.owners.size,0);
});
test('same policy retains state; raw node order, supports and level invalidate it',()=>{
 const f=fixture({absorb});f.inst.treeNodes=['b','a'];f.runtime.sync(f.a);let state=f.current();f.runtime.sync(f.a);assert.equal(f.current(),state);
 for(const change of [()=>f.inst.treeNodes.reverse(),()=>f.inst.sockets.push({def:{id:'support'},level:1}),()=>f.inst.level++,()=>f.inst.bonusLevels=2]){
  change();f.runtime.sync(f.a);assert.notEqual(f.current(),state);state=f.current();
 }
 assert.equal(f.calls.retired.length,4);assert.equal(f.state.nextSource,6);
});
test('clear silently removes owned effects and leaves other hosts and held cast intact',()=>{
 const f=fixture({absorb,intervention:{cooldown:3,label:'Recovery'}}),other=skill({absorb},'other');f.a.skills.push(other);f.runtime.sync(f.a);f.runtime.cast(f.a,f.inst);f.runtime.cast(f.a,other);
 const s=f.current(),otherState=f.state.owners.get(f.a).get(other);let ended=0;f.a.absorbLayers.get(s.key).ended=()=>ended++;
 s.blasts.push({remaining:2});s.broken.push({expires:2});s.intact.push({expires:2});f.a.sources.set(s.key+':satellites',[]);f.a.buffs.set(s.key+':plates',{});
 f.a.casting={inst:f.inst,mode:'guard',held:true};const cast=f.a.casting;
 f.runtime.visuals=[{owner:1},{owner:2}];f.runtime.clear(f.a,f.inst);
 assert.equal(ended,0);assert.equal(f.a.casting,cast);assert.equal(f.a.absorbLayers.has(s.key),false);assert(f.a.absorbLayers.has(otherState.key));
 assert.equal(f.a.lifeDamageInterceptors.has(s.key),false);assert.equal(f.a.buffs.size,0);assert.equal(f.a.sources.size,0);
 assert.deepEqual([s.blasts,s.broken,s.intact],[[],[],[]]);assert.deepEqual(f.calls.retired,[[f.a,f.inst]]);assert.deepEqual(f.runtime.visuals,[{owner:2}]);assert.equal(f.current(),undefined);
});
test('roster removal releases owners; rebind discovers surviving bodies; clearAll resets ownership',()=>{
 const f=fixture({absorb});f.runtime.sync(f.a);f.world.actors=[];f.runtime.update(0);assert.equal(f.state.owners.size,0);
 f.world.actors=[f.a];f.runtime.rebind();assert(f.current());f.runtime.clearAll();assert.equal(f.state.owners.size,0);assert.deepEqual(f.runtime.visuals,[]);
});
test('plates grow at most once per update, retain modulo time and use scaled nonnegative elapsed',()=>{
 const f=fixture({plates});f.hold();f.runtime.update(3.25);assert.equal(f.current().plates,1);near(f.current().plateClock,.25);
 f.world.scale=-1;f.runtime.update(10);assert.equal(f.current().plates,1);near(f.current().plateClock,.25);
 f.world.scale=2;f.runtime.update(.375);assert.equal(f.current().plates,2);near(f.current().plateClock,0);
 f.runtime.update(1);f.runtime.update(1);assert.equal(f.current().plates,3);
 assert.equal(f.runtime.visuals[0].plates,3);near(f.runtime.visuals[0].progress,1);
});
test('lower and re-raise reset plates while retaining contact cooldowns and raise bash scale',()=>{
 const f=fixture({plates,raiseBash:1.5});f.hold();f.runtime.update(1);const contact={next:10,seen:1};f.current().contacts.set(8,contact);
 f.runtime.lower(f.a,f.inst);assert.deepEqual([f.current().plates,f.current().plateClock],[0,0]);assert.equal(f.a.buffs.size,0);assert.equal(f.current().contacts.get(8),contact);
 f.runtime.raised(f.a,f.inst);assert.equal(f.current().contacts.get(8),contact);assert.deepEqual(f.calls.bash.map(row=>row[3]),[150,150]);
});
test('plate healing respects ordered alive, body, team, tier, range and sight gates',()=>{
 const f=fixture({plates,plateHeal:{radius:5,lifeFraction:.1}});f.hold();
 const others=Array.from({length:8},(_,i)=>actor(i+2));others[1].dead=true;others[2].downed=true;others[3].construct={};others[4].team='enemy';others[5].tier=1;others[6].pos.x=8;f.world.blocked.add(others[7]);
 f.world.actors.push(...others);f.runtime.update(1);assert.deepEqual(f.calls.heals,[[f.a,20],[others[0],20]]);
});
test('block draw is conditional; block and plate reductions multiply, then one plate is consumed',()=>{
 const f=fixture({plates,passiveBlockReduction:.5,plateRestore:.3});f.hold();f.runtime.update(1);f.runtime.update(1);
 assert.deepEqual(f.runtime.guardHit(f.a,f.inst,0),{damage:0,restore:0});assert.equal(f.calls.random,0);assert.equal(f.current().plates,2);
 assert.deepEqual(f.runtime.guardHit(f.a,f.inst,100),{damage:30,restore:.3});assert.equal(f.calls.random,1);assert.equal(f.current().plates,1);
 f.world.draw=.5;assert.deepEqual(f.runtime.guardHit(f.a,f.inst,100),{damage:80,restore:.3});assert.equal(f.current().plates,0);
 const noBlock=fixture({plates});noBlock.runtime.guardHit(noBlock.a,noBlock.inst,1);assert.equal(noBlock.calls.random,0);
});
test('plate reduction is capped in both buff and damaging interception',()=>{
 const f=fixture({plates:{...plates,reduction:.8}});f.hold();f.runtime.update(1);f.runtime.update(1);
 near([...f.a.buffs.values()][0].mods[0].value,-.95);near(f.runtime.guardHit(f.a,f.inst,100).damage,5);
});
test('patience includes first cast and exact deadline; replacing absorb is silent',()=>{
 const f=fixture({absorb,patience:{seconds:5,multiplier:2}});f.runtime.cast(f.a,f.inst);const key=f.current().key,first=f.a.absorbLayers.get(key);let ended=0;first.ended=()=>ended++;
 assert.deepEqual([first.amount,first.remaining],[100,8]);f.world.time=1;f.runtime.cast(f.a,f.inst);assert.equal(ended,0);
 assert.notEqual(f.a.absorbLayers.get(key),first);f.world.time=6;f.runtime.cast(f.a,f.inst);assert.deepEqual(f.calls.absorb,[2,1,2]);
});
test('nonpositive absorb creates no layer but still schedules authored detonation',()=>{
 const f=fixture({absorb,detonation:{delay:2,radius:5,power:1}},{absorb:()=>({amount:0,duration:4})});assert(f.runtime.cast(f.a,f.inst));assert.equal(f.a.absorbLayers.size,0);assert.equal(f.current().blasts.length,1);assert.equal(f.calls.flashes.length,1);
});
test('outcomes are bounded, use absolute expiry and disappear after policy invalidation',()=>{
 const f=fixture({absorb,brokenSatellite:{family:'red',max:2,duration:3,power:2},intactSatellite:{family:'blue',max:1,duration:7}});
 for(let i=0;i<3;i++){f.world.time=i;f.runtime.cast(f.a,f.inst);f.a.absorbLayers.get(f.current().key).ended('broken');}
 assert.deepEqual(f.current().broken.map(o=>o.expires),[4,5]);assert.equal([...f.a.sources.values()][0][0].value,2);
 f.runtime.cast(f.a,f.inst);const stale=f.a.absorbLayers.get(f.current().key);stale.ended('expired');assert.equal(f.current().intact.length,1);
 f.world.scale=0;f.world.time=4;f.runtime.update(0);assert.deepEqual(f.current().broken.map(o=>o.expires),[5]);
 f.inst.level++;stale.ended('broken');f.runtime.sync(f.a);assert.equal(f.current().broken.length,0);assert.equal(f.a.sources.size,0);
});
test('delayed bursts are capped and use actor elapsed time, not absolute outcome expiry',()=>{
 const f=fixture({absorb,detonation:{delay:2,radius:5,power:1}});const enemy=actor(2);enemy.pos.x=3;f.world.enemies=[enemy];
 for(let i=0;i<20;i++)f.runtime.cast(f.a,f.inst);assert.equal(f.current().blasts.length,16);
 f.world.time=100;f.world.scale=.5;f.runtime.update(2);assert.equal(f.calls.hits.length,0);assert.equal(f.runtime.warnings().length,16);near(f.runtime.warnings()[0].progress,.5);
 f.runtime.update(2);assert.equal(f.calls.hits.length,16);assert.equal(f.current().blasts.length,0);assert.deepEqual(f.runtime.warnings(),[]);
});
test('break burst uses current range, story and sight and stops after caster death',()=>{
 const f=fixture({absorb,breakBurst:{radius:5,power:3}});const enemies=Array.from({length:4},(_,i)=>actor(i+2));enemies[0].tier=1;f.world.blocked.add(enemies[1]);enemies[2].pos.x=7;f.world.enemies=enemies;
 f.ports.hit=(...args)=>{f.calls.hits.push(args);f.a.dead=true;};f.runtime.cast(f.a,f.inst);f.a.absorbLayers.get(f.current().key).ended('broken');
 assert.equal(f.calls.hits.length,1);assert.equal(f.calls.hits[0][2],enemies[2]);assert.deepEqual(f.calls.hits[0][3],{physical:600});
});
test('intervention stamps recovery before reentry, then shares cast, cooldown and absorb spending',()=>{
 const f=fixture({absorb,intervention:{cooldown:9,label:'Recovery'}});f.runtime.sync(f.a);const intercept=f.a.lifeDamageInterceptors.get(f.current().key);
 assert.equal(intercept(99),99);assert.equal(f.a.guardIntervention.guard,undefined);
 const original=f.ports.addBuff;f.ports.addBuff=(a,b)=>{assert.equal(a.guardIntervention.guard,9);assert.equal(intercept(100),100);original(a,b);};
 assert.equal(intercept(120),70);assert.deepEqual(f.calls.order,[['cooldown','guard'],['spend',120]]);assert.equal(f.calls.absorb.length,1);assert.equal(intercept(120),120);
 f.a.guardIntervention.guard=0;f.a.invulnerable=true;assert.equal(intercept(120),120);assert.equal(f.calls.absorb.length,1);
});
test('trusted service exceptions retain preceding borrowed writes',()=>{
 const f=fixture({absorb,intervention:{cooldown:9,label:'Recovery'}},{addBuff:()=>{throw Error('host rejected');}});f.runtime.sync(f.a);
 assert.throws(()=>f.a.lifeDamageInterceptors.get(f.current().key)(100),/host rejected/);assert.equal(f.a.guardIntervention.guard,9);assert.equal(f.a.absorbLayers.size,0);
});
test('ram requires held voluntary movement; contact repeats survive quick lowering and reset after absence',()=>{
 const f=fixture({ram}),enemy=actor(2);enemy.pos.x=5;f.world.enemies=[enemy];f.world.lite=true;
 f.runtime.ram(f.a,1,0);f.hold();f.runtime.ram(f.a,0,0);assert.equal(f.calls.hits.length,0);f.runtime.ram(f.a,1,0);assert.equal(f.calls.hits[0][3].physical,20);assert.equal(f.calls.hits[0][4],7);
 f.world.time=.25;f.runtime.ram(f.a,1,0);assert.equal(f.calls.hits.length,1);f.runtime.lower(f.a,f.inst);f.runtime.raised(f.a,f.inst);f.world.time=.5;f.runtime.ram(f.a,1,0);assert.equal(f.calls.hits[1][3].physical,5);
 f.world.time=3;f.runtime.ram(f.a,1,0);assert.equal(f.calls.hits[2][3].physical,20);assert.deepEqual(f.calls.promotions[0],[f.a,7,8]);
 f.world.client=true;f.runtime.ram(f.a,1,0);assert.equal(f.calls.hits.length,3);
});
test('ram gates facing, travel heading, tier, range and sight; a changed cast stops traversal',()=>{
 const f=fixture({ram});f.hold();const enemies=Array.from({length:7},(_,i)=>actor(i+2));
 enemies[0].pos.x=-1;enemies[1].pos={x:0,y:1};enemies[2].tier=1;enemies[3].pos.x=10;f.world.blocked.add(enemies[4]);enemies[5].pos.x=5;enemies[6].pos.x=5;f.world.enemies=enemies;
 f.ports.hit=(...args)=>{f.calls.hits.push(args);f.a.casting={...f.a.casting};};f.runtime.ram(f.a,1,0);assert.equal(f.calls.hits.length,1);assert.equal(f.calls.hits[0][2],enemies[5]);
});
test('bash waves own scaled payload and preserve direction without paying or repeating',()=>{
 const delivery={type:'projectile',range:10,speed:2,radius:3};const f=fixture({bashWave:{power:.5,delivery}});f.a.pos={x:4,y:5};f.a.facing=Math.PI/2;const flat={fire:20,physical:6};f.runtime.bashWave(f.a,f.inst,flat);
 assert.deepEqual(flat,{fire:20,physical:6});assert.equal(f.calls.casts.length,1);const [,payload,aim,options]=f.calls.casts[0];assert.deepEqual(payload.def.flat,{fire:10,physical:3});assert.equal(payload.host,f.inst);near(aim.x,4);near(aim.y,15);assert.deepEqual(options,{keepFacing:true,noCooldown:true,noRepeat:true,componentUse:true});
});
test('satellite payload flattens host banks in insertion order and selects slot modulo count',()=>{
 const f=fixture({absorb,patience:{seconds:5,multiplier:2},brokenSatellite:{family:'red',max:2,duration:3,power:3}});f.inst.def.tags=['lightning','cold','fire'];
 const second=skill({absorb,brokenSatellite:{family:'blue',max:1,duration:3,power:4}},'second');f.a.skills.push(second);f.runtime.sync(f.a);
 f.runtime.cast(f.a,f.inst);f.a.absorbLayers.get(f.current().key).ended('broken');f.runtime.cast(f.a,second);f.a.absorbLayers.get(f.state.owners.get(f.a).get(second).key).ended('broken');
 const first=f.runtime.satellitePayload(f.a,'orbit',2),next=f.runtime.satellitePayload(f.a,'orbit',3);
 assert.equal(first.host,f.inst);assert.equal(next.host,second);assert.deepEqual(first.def.flat,{fire:1200});assert.deepEqual(next.def.flat,{physical:800});assert.equal(first.def.delivery.radius,8);assert(first.def.tags.includes('satellite:red'));assert(!f.inst.def.tags.includes('satellite'));assert.equal(f.runtime.satellitePayload(f.a,'unknown'),undefined);
});
test('authored patches are distinct, lexical, shallow and suppressed on payloads',()=>{
 const base={armorRatio:1,plates},inst={def:{guardArts:base},treeNodes:['z','a','z']},calls=[];
 const resolved=resolveGuardArts(inst,id=>{calls.push(id);return id==='a'?{armorRatio:2,absorb}:{armorRatio:3};});
 assert.deepEqual(calls,['a','z']);assert.equal(resolved.armorRatio,3);assert.equal(resolved.plates,plates);assert.equal(resolved.absorb,absorb);assert.equal(base.armorRatio,1);
 assert.equal(resolveGuardArts({...inst,treeNodes:[]},()=>undefined),base);assert.equal(resolveGuardArts({...inst,guardArtsPayload:true},()=>assert.fail('Payload queried authored tree')),undefined);
});
test('capacity and absorb preserve tag/modifier read order and clamps',()=>{
 const i=skill({armorRatio:.5,absorb}),a=actor(1),calls=[];let tagCalls=0,modCalls=0;
 const p={spec:x=>{calls.push('spec');return x.def.guardArts;},tags:()=>{calls.push('tags');return new Set([String(++tagCalls)]);},modifiers:()=>{calls.push('mods');return [++modCalls];},stat:(x,id,tags,mods)=>{calls.push([id,[...tags],mods]);return {armor:40,guardStrength:2,absorbPower:3,effectDuration:4}[id];}};
 assert.equal(guardArtCapacity(a,i,p),240);assert.deepEqual(calls,['tags','mods',['armor',['1'],[1]],'spec',['guardStrength',['1'],[1]]]);calls.length=0;tagCalls=0;modCalls=0;
 assert.deepEqual(guardArtAbsorb(a,i,p,2),{amount:720,duration:32});assert.deepEqual(calls,['spec','tags','mods',['armor',['1'],[1]],'spec',['guardStrength',['1'],[1]],'tags','mods',['absorbPower',['2'],[2]],'tags','mods',['effectDuration',['3'],[3]]]);
 p.stat=()=>-1;assert.equal(guardArtCapacity(a,i,p),0);assert.equal(guardArtAbsorb(a,i,p).amount,0);i.def.guardArts={};assert.equal(guardArtAbsorb(a,i,p),undefined);
});
test('authored validation rejects nonfinite amounts, invalid caps and inconsistent ram recovery',()=>{
 assert.deepEqual(guardArtsErrors({plates,absorb,ram}),[]);
 const errors=guardArtsErrors({armorRatio:NaN,plateRestore:2,plates:{...plates,max:1.5},ram:{...ram,reset:.1},brokenSatellite:{family:'',max:0,duration:1,power:Infinity}});
 for(const text of ['armorRatio','fractions exceed one','plate cap','ram payload','satellite family','satellite: values'])assert(errors.some(e=>e.includes(text)),text);
});

function forkFixture(f){
 const c=fixture(structuredClone(f.inst.def.guardArts));
 c.world.time=f.world.time;
 const remap=i=>{assert.equal(i,f.inst);return c.inst;};
 Object.assign(c.a,{...f.a,pos:{...f.a.pos},skills:f.a.skills.map(i=>i&&remap(i)),guardIntervention:{...f.a.guardIntervention},
  sources:new Map([...f.a.sources].map(([k,v])=>[k,structuredClone(v)])),buffs:new Map([...f.a.buffs].map(([k,v])=>[k,structuredClone(v)])),
  absorbLayers:new Map([...f.a.absorbLayers].map(([k,v])=>[k,{...v,source:remap(v.source)}])),
  lifeDamageInterceptors:f.a.lifeDamageInterceptors&&new Map(f.a.lifeDamageInterceptors),casting:f.a.casting?{...f.a.casting,inst:remap(f.a.casting.inst)}:f.a.casting});
 const mapping={actor:a=>{assert.equal(a,f.a);return c.a;},skill:remap,spec:structuredClone};
 const fork=()=>f.runtime.forkOwnedState(c.ports,mapping);
 return{c,mapping,fork};
}
const guardSnapshot=s=>({key:s.key,policy:s.policy,plates:s.plates,clock:s.plateClock,lastCast:s.lastCast,contacts:[...s.contacts],intact:s.intact,broken:s.broken,blasts:s.blasts});
test('private guard fork preserves clocks and owned rows without replaying acquisition',()=>{
 const f=fixture({absorb,patience:{seconds:4,multiplier:2},detonation:{delay:5,radius:7,power:3},intactSatellite:{family:'blue',max:2,duration:6}});
 f.runtime.sync(f.a);f.world.time=20;f.runtime.cast(f.a,f.inst);const s=f.current(),layer=f.a.absorbLayers.get(s.key);
 layer.amount=23;layer.remaining=1.25;s.plates=2;s.plateClock=.3;s.contacts.set(5,{next:22,seen:20});s.intact.push({expires:29,power:.5});s.broken.push({expires:30,power:.8});s.blasts[0].remaining=2;
 f.runtime.visuals=[{owner:1,x:2,y:3,tier:0,radius:4,progress:.5,color:'#abc'}];f.a.casting={inst:f.inst,mode:'guard',held:true,elapsed:.75};
 const {c,fork}=forkFixture(f),next=fork(),ns=next.state.owners.get(c.a).get(c.inst),nl=c.a.absorbLayers.get(s.key);
 assert.deepEqual(guardSnapshot(ns),guardSnapshot(s));assert.equal(next.state.nextSource,f.state.nextSource);assert.deepEqual(next.visuals,f.runtime.visuals);assert.notEqual(next.visuals[0],f.runtime.visuals[0]);
 assert.deepEqual([nl.amount,nl.remaining],[23,1.25]);assert.equal(nl.source,c.inst);assert.notEqual(nl.ended,layer.ended);assert.equal(c.a.casting.elapsed,.75);assert.equal(c.a.casting.inst,c.inst);
 assert.equal(c.calls.absorb.length,0);assert.equal(c.calls.flashes.length,0);assert.equal(c.calls.casts.length,0);assert.equal(c.calls.cooldown.length,0);assert.equal(s.lastCast,20);
 ns.contacts.get(5).next=90;ns.blasts[0].remaining=1;ns.intact[0].power=8;ns.broken[0].expires=200;ns.spec.patience.multiplier=9;
 assert.equal(s.contacts.get(5).next,22);assert.equal(s.blasts[0].remaining,2);assert.equal(s.intact[0].power,.5);assert.equal(s.broken[0].expires,30);assert.equal(s.spec.patience.multiplier,2);
});
test('private expiry reconnects cast-time power without touching live outcomes',()=>{
 const f=fixture({absorb,patience:{seconds:4,multiplier:2},intactSatellite:{family:'blue',max:2,duration:6}});f.runtime.sync(f.a);f.world.time=20;f.runtime.cast(f.a,f.inst);
 const {c,fork}=forkFixture(f),next=fork(),s=f.current(),ns=next.state.owners.get(c.a).get(c.inst);c.world.time=23;c.a.absorbLayers.get(s.key).ended('expired');
 assert.deepEqual(ns.intact,[{expires:29,power:2}]);assert.deepEqual(s.intact,[]);assert.equal(f.a.sources.has(s.key+':satellites'),false);assert.equal(c.a.sources.has(s.key+':satellites'),true);assert.equal(f.calls.absorb.length,1);
});
test('private lethal interception targets the private actor, runtime and services',()=>{
 const f=fixture({absorb,intervention:{cooldown:8,label:'Return'},patience:{seconds:4,multiplier:2}});f.runtime.sync(f.a);f.world.time=20;f.runtime.cast(f.a,f.inst);f.a.life=20;
 const {c,fork}=forkFixture(f),next=fork(),s=f.current(),ns=next.state.owners.get(c.a).get(c.inst);c.world.time=25;const result=c.a.lifeDamageInterceptors.get(s.key)(20);
 assert.equal(result,-30);assert.equal(c.a.guardIntervention.guard,8);assert.equal(f.a.guardIntervention.guard,undefined);assert.equal(ns.lastCast,25);assert.equal(s.lastCast,20);assert.equal(c.calls.cooldown.length,1);assert.equal(f.calls.cooldown.length,0);assert.deepEqual(c.calls.absorb,[2]);assert.equal(c.a.absorbLayers.get(s.key).source,c.inst);
});
test('private updates expire their own delayed bursts without advancing live clocks',()=>{
 const f=fixture({absorb,detonation:{delay:3,radius:10,power:2}});f.runtime.sync(f.a);f.runtime.cast(f.a,f.inst);const {c,fork}=forkFixture(f),next=fork();next.update(1);
 const ns=next.state.owners.get(c.a).get(c.inst);assert.equal(ns.blasts[0].remaining,2);assert.equal(f.current().blasts[0].remaining,3);next.update(2);assert.equal(ns.blasts.length,0);assert.equal(f.current().blasts.length,1);assert.equal(f.calls.casts.length,0);
});
test('recast with no replacement layer retains the preceding cast-time continuation',()=>{
 const f=fixture({absorb,patience:{seconds:4,multiplier:2},intactSatellite:{family:'blue',max:2,duration:6}});f.runtime.sync(f.a);f.runtime.cast(f.a,f.inst);const layer=f.a.absorbLayers.get(f.current().key);
 f.world.time=1;f.ports.absorb=()=>({amount:0,duration:1});f.runtime.cast(f.a,f.inst);assert.equal(f.a.absorbLayers.get(f.current().key),layer);
 const {c,fork}=forkFixture(f),next=fork(),ns=next.state.owners.get(c.a).get(c.inst);c.a.absorbLayers.get(ns.key).ended('expired');assert.equal(ns.intact[0].power,2);assert.equal(f.current().intact.length,0);
});
test('unknown layer callbacks refuse before installing candidate bindings',()=>{
 const f=fixture({absorb,intervention:{cooldown:8,label:'Return'}});f.runtime.sync(f.a);f.runtime.cast(f.a,f.inst);const s=f.current();f.a.absorbLayers.set(s.key,{...f.a.absorbLayers.get(s.key)});
 const {c,fork}=forkFixture(f),before=c.a.absorbLayers.get(s.key),interceptor=c.a.lifeDamageInterceptors.get(s.key);assert.throws(fork,/Unknown guard layer/);assert.equal(c.a.absorbLayers.get(s.key),before);assert.equal(c.a.lifeDamageInterceptors.get(s.key),interceptor);
});
test('unknown interception callbacks and shared actor/skill ownership refuse',()=>{
 const f=fixture({absorb,intervention:{cooldown:8,label:'Return'}});f.runtime.sync(f.a);f.runtime.cast(f.a,f.inst);const s=f.current();f.a.lifeDamageInterceptors.set(s.key,x=>x);
 assert.throws(forkFixture(f).fork,/Unknown guard interception/);f.runtime.sync(f.a);const {c,mapping}=forkFixture(f);
 assert.throws(()=>f.runtime.forkOwnedState(c.ports,{...mapping,actor:()=>f.a}),/detached actor/);
 assert.throws(()=>f.runtime.forkOwnedState(c.ports,{...mapping,skill:i=>i}),/distinct skill/);
 c.a.absorbLayers=f.a.absorbLayers;assert.throws(()=>f.runtime.forkOwnedState(c.ports,mapping),/detached actor/);
});
test('empty retained families and source counters survive a fork',()=>{
 const f=fixture({absorb});f.runtime.sync(f.a);f.runtime.clear(f.a);const {c,fork}=forkFixture(f),next=fork();assert.equal(next.state.owners.size,1);assert.equal(next.state.owners.get(c.a).size,0);assert.equal(next.state.nextSource,f.state.nextSource);next.sync(c.a);assert.equal(next.state.nextSource,f.state.nextSource+1);assert.equal(f.state.owners.get(f.a).size,0);
});
test('changed logical IDs and inconsistent owner indexing refuse before installation',()=>{
 const f=fixture({absorb});f.runtime.sync(f.a);f.runtime.cast(f.a,f.inst);const {c,fork}=forkFixture(f),before=c.a.absorbLayers.get(f.current().key);
 c.a.id=10;assert.throws(fork,/stable actor IDs/);c.a.id=1;c.inst.def.id='replacement';assert.throws(fork,/stable skill definitions/);c.inst.def.id=f.inst.def.id;
 const s=f.current();s.owner=c.a;assert.throws(fork,/Inconsistent guard state/);s.owner=f.a;assert.equal(c.a.absorbLayers.get(s.key),before);
});

test('replaced callbacks on a known layer refuse without altering the candidate',()=>{
 const f=fixture({absorb});f.runtime.sync(f.a);f.runtime.cast(f.a,f.inst);const s=f.current(),layer=f.a.absorbLayers.get(s.key);layer.ended=()=>{};
 const {c,fork}=forkFixture(f),before=c.a.absorbLayers.get(s.key);assert.throws(fork,/Unknown guard layer/);assert.equal(c.a.absorbLayers.get(s.key),before);
});

test('known layers moved between owned guards cannot acquire different callback state',()=>{
 const f=fixture({absorb}),other=skill({absorb},'other');f.a.skills.push(other);f.runtime.sync(f.a);f.runtime.cast(f.a,f.inst);f.runtime.cast(f.a,other);
 const s=f.current(),otherState=f.state.owners.get(f.a).get(other),original=f.a.absorbLayers.get(s.key),foreign=f.a.absorbLayers.get(otherState.key);f.a.absorbLayers.set(s.key,foreign);
 const c=fixture(),otherCopy=skill({absorb},'other');c.a.skills.push(otherCopy);const before={...original,source:c.inst};c.a.absorbLayers.set(s.key,before);
 assert.throws(()=>f.runtime.forkOwnedState(c.ports,{actor:a=>{assert.equal(a,f.a);return c.a;},skill:i=>i===f.inst?c.inst:otherCopy,spec:structuredClone}),/Unknown guard layer/);
 assert.equal(c.a.absorbLayers.get(s.key),before);assert.equal(f.a.absorbLayers.get(s.key),foreign);
});

test('a different live instance with the same definition cannot become the private host',()=>{
 const f=fixture({absorb}),other=skill({absorb},f.inst.def.id);f.a.skills.push(other);f.runtime.sync(f.a);f.runtime.cast(f.a,f.inst);f.runtime.cast(f.a,other);
 const c=fixture(),otherCopy=skill({absorb},other.def.id);c.a.skills=[other,otherCopy];
 assert.throws(()=>f.runtime.forkOwnedState(c.ports,{actor:()=>c.a,skill:i=>i===f.inst?other:otherCopy,spec:structuredClone}),/distinct skill/);
 assert.equal(c.a.absorbLayers.size,0);
});

test('shared intervention cooldown records refuse before reconnecting callbacks',()=>{
 const f=fixture({absorb,intervention:{cooldown:8,label:'Return'}});f.runtime.sync(f.a);f.runtime.cast(f.a,f.inst);
 const {c,fork}=forkFixture(f),before=c.a.lifeDamageInterceptors.get(f.current().key);c.a.guardIntervention=f.a.guardIntervention;
 assert.throws(fork,/detached actor/);assert.equal(c.a.lifeDamageInterceptors.get(f.current().key),before);
});

test('copying into an empty host-owned controller preserves its identity and services',()=>{
 const f=fixture({absorb,patience:{seconds:4,multiplier:2},intactSatellite:{family:'blue',max:2,duration:6}});f.runtime.sync(f.a);f.runtime.cast(f.a,f.inst);
 const {c,mapping}=forkFixture(f),controller=c.runtime;const result=f.runtime.copyOwnedStateTo(controller,mapping);
 assert.equal(result,controller);assert.equal(c.runtime,controller);assert.deepEqual(guardSnapshot(c.current()),guardSnapshot(f.current()));
 c.world.time=11;c.a.absorbLayers.get(c.current().key).ended('expired');assert.deepEqual(c.current().intact,[{expires:17,power:2}]);assert.deepEqual(f.current().intact,[]);
});

test('nonempty, visual-bearing and shared destination controllers refuse without changes',()=>{
 const f=fixture({absorb});f.runtime.sync(f.a);f.runtime.cast(f.a,f.inst);const {c,mapping}=forkFixture(f);c.runtime.sync(c.a);
 const before=guardSnapshot(c.current());assert.throws(()=>f.runtime.copyOwnedStateTo(c.runtime,mapping),/empty private controller/);assert.deepEqual(guardSnapshot(c.current()),before);
 c.runtime.clearAll();c.runtime.visuals=[{owner:1}];assert.throws(()=>f.runtime.copyOwnedStateTo(c.runtime,mapping),/empty private controller/);
 assert.throws(()=>f.runtime.copyOwnedStateTo(f.runtime,mapping),/empty private controller/);
 const sharing=new GuardArts(c.ports,f.state);assert.throws(()=>f.runtime.copyOwnedStateTo(sharing,mapping),/empty private controller/);
 const empty=new GuardArts(f.ports),sharedOwners=new GuardArts(c.ports,{...empty.state});assert.throws(()=>empty.copyOwnedStateTo(sharedOwners,mapping),/empty private controller/);
});

test('different continuation limits refuse before installing bindings',()=>{
 const f=fixture({absorb});f.runtime.sync(f.a);f.runtime.cast(f.a,f.inst);const {c,mapping}=forkFixture(f),before=c.a.absorbLayers.get(f.current().key);
 for(const key of ['pendingBlasts','promotePerFrame','maximumReduction']){
  const target=new GuardArts(c.ports,undefined,{...GUARD_ARTS_LIMITS,[key]:GUARD_ARTS_LIMITS[key]+1});assert.throws(()=>f.runtime.copyOwnedStateTo(target,mapping),/matching limits/);assert.equal(target.state.owners.size,0);assert.equal(c.a.absorbLayers.get(f.current().key),before);
 }
});

test('unchanged sync retains its owned interception callback and repairs external replacement',()=>{
 const f=fixture({absorb,intervention:{cooldown:8,label:'Return'}});f.runtime.sync(f.a);const s=f.current(),original=f.a.lifeDamageInterceptors.get(s.key);
 for(let i=0;i<20;i++)f.runtime.update(1/60);assert.equal(f.a.lifeDamageInterceptors.get(s.key),original);
 f.a.lifeDamageInterceptors.set(s.key,amount=>amount);f.runtime.sync(f.a);const repaired=f.a.lifeDamageInterceptors.get(s.key);assert.notEqual(repaired,original);f.runtime.sync(f.a);assert.equal(f.a.lifeDamageInterceptors.get(s.key),repaired);
 f.inst.level++;f.runtime.sync(f.a);assert.notEqual(f.a.lifeDamageInterceptors.get(f.current().key),repaired);
});
