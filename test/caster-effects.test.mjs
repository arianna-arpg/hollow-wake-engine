import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CasterEffects} from '../dist/caster-effects.js';
import {CastSelfEffects} from '../dist/cast-self-effects.js';
import {CastResourceEffects} from '../dist/cast-resource-effects.js';
import {GuardSurge} from '../dist/guard-surge.js';
import {PendingResolutions} from '../dist/pending-resolutions.js';

function setup(){
  const events=[],skill={def:{id:'cast',name:'Cast',color:'#fff',tags:[]}},actor={pos:{x:0,y:0},facing:2,cooldowns:new Map([['other',4]])};
  const ports={time:()=>10,fuse:()=>undefined,guardSurged:()=>events.push('surge')};
  const self=new CastSelfEffects({critical:()=>{events.push('critical');return 2;},stream:(_a,_c,_i,e,_n,critical)=>events.push([e.resource,critical]),
    heal:()=>events.push('heal')});
  const services={self,resource:new CastResourceEffects({cooldownsReduced:()=>events.push('cooldown')})};
  const runtime=new CasterEffects(services,ports),frame={caster:actor,skill,aim:{x:1,y:0},origin:{x:0,y:0},delivery:'self',durationScale:1,areaScale:1,multiplier:1,color:'#fff',tags:new Set(),modifiers:[],chargesSpent:0};
  return{events,skill,actor,ports,services,runtime,frame};
}
test('mixed effects retain authored order and share exactly one lazy pour critical per use',()=>{
  const h=setup();h.runtime.apply(h.frame,[{type:'heal',amount:1},{type:'restoreOverTime',resource:'life'},{type:'reduceCooldowns',seconds:1},{type:'restoreOverTime',resource:'mana'}]);
  assert.deepEqual(h.events,['heal','critical',['life',2],'cooldown',['mana',2]]);assert.equal(h.actor.cooldowns.get('other'),3);
});
test('nested casts have independent pour frames; subsequent use samples again',()=>{
  const h=setup();let nested=false,draw=0;
  h.services.self.ports.critical=()=>++draw;
  h.services.self.ports.stream=(_a,_c,_i,e,_n,critical)=>{h.events.push([e.resource,critical]);if(!nested){nested=true;h.runtime.apply(h.frame,[{type:'restoreOverTime',resource:'es'}]);}};
  h.runtime.apply(h.frame,[{type:'restoreOverTime',resource:'life'},{type:'restoreOverTime',resource:'mana'}]);
  assert.deepEqual(h.events,[['life',1],['es',2],['mana',1]]);h.runtime.apply(h.frame,[{type:'restoreOverTime',resource:'life'}]);assert.equal(draw,3);
});
test('fuse queues the exact skill and buff before tell, and fromFuse applies directly',()=>{
  const h=setup(),queued=[],effect={type:'buff',id:'strength',duration:2,mods:[]};
  h.ports.fuse=()=>({delay:3});h.ports.fuseDelay=()=>.5;h.ports.bankBuff=row=>queued.push(row);h.ports.fuseTell=()=>{assert.equal(queued.length,1);h.events.push('tell');};
  h.services.buffs={apply:(_a,_i,e)=>h.events.push(e)};h.runtime.apply(h.frame,[effect]);assert.equal(queued[0].due,11.5);assert.equal(queued[0].fx,effect);assert.equal(queued[0].inst,h.skill);
  h.runtime.apply({...h.frame,fromFuse:true},[effect]);assert.deepEqual(h.events,['tell',effect]);
});
test('failed handoff falls back to throw using facing inside the strict aim deadzone',()=>{
  const h=setup(),victim={};h.actor.gripping={id:2};h.ports.actorById=()=>victim;h.services.grabs={handoff:()=>false,throw:(...args)=>h.events.push(args)};
  h.runtime.apply(h.frame,[{type:'grabThrow',impulse:50,handoff:{}}]);assert.deepEqual(h.events,[[h.actor,50,2,h.skill,undefined]]);
  h.services.grabs.handoff=()=>true;h.runtime.apply(h.frame,[{type:'grabThrow',impulse:50,handoff:{}}]);assert.equal(h.events.length,1);
});
test('contact-only effects do not replay after delivery, but malformed types fail explicitly',()=>{
  const h=setup();h.runtime.apply({...h.frame,delivery:'projectile'},[{type:'damage'},{type:'tame'},{type:'heal',amount:10},{type:'litePour'}]);assert.deepEqual(h.events,[]);
  assert.throws(()=>h.runtime.apply(h.frame,[{type:'new-unsupported'}]),/Unadmitted caster effect/);
});
test('guard surge spends current mana, overfills guard and preserves stronger fallback pools',()=>{
  const runtime=new GuardSurge({absorbAmount:(_a,_i,n)=>n*2,durationScale:()=>3}),a={mana:100,absorb:80,absorbTimer:20,maxLife:()=>100,casting:{mode:'guard',shield:20,maxShield:30}};
  const fx={type:'guardSurge',manaFraction:.5,ratio:3,unguarded:{capLife:.2,duration:2}};
  assert(runtime.apply(a,{},fx));assert.equal(a.mana,50);assert.equal(a.casting.shield,320);assert.equal(a.casting.maxShield,320);
  a.casting=null;assert(runtime.apply(a,{},fx));assert.equal(a.mana,25);assert.equal(a.absorb,80);assert.equal(a.absorbTimer,20);
  assert.equal(runtime.apply(a,{}, {...fx,unguarded:undefined}),false);assert.equal(a.mana,25);
});
test('fuses use current power, pop before callback, skip dead endpoints and execute newest first',()=>{
  const a={dead:false,pos:{}},i={},rows=[{kind:'buff',due:2,caster:a,inst:i,fx:'old',durScale:1,mult:2},{kind:'hit',due:2,caster:a,inst:i,targetId:9,mult:1,depth:2},{kind:'buff',due:2,caster:a,inst:i,fx:'new',durScale:1,mult:3}],events=[];
  const runtime=new PendingResolutions(rows,[],{time:()=>2,fusePower:()=>4,actorById:()=>({dead:true}),arrived:()=>events.push('arrive'),buff:(_a,_i,fx,_dur,power)=>{assert(!rows.some(row=>row.fx===fx));events.push([fx,power]);}});
  runtime.advance(.1);assert.deepEqual(events,['arrive',['new',12],'arrive',['old',8]]);assert.equal(rows.length,0);
});
test('persistent casts expire before a final pulse and preserve single-beat debt and current position',()=>{
  const a={dead:false,pos:{x:3,y:4}},row={caster:a,inst:{},remaining:10,total:10,timer:0,interval:1,fade:.5,powerMult:2},queue=[row],events=[];
  const runtime=new PendingResolutions([],queue,{copyPosition:p=>({...p}),execute:(...args)=>events.push(args)});
  runtime.advance(2.5);assert.equal(row.timer,-1.5);assert.equal(events.length,1);assert.deepEqual(events[0][3],{dmgMult:1.75,noCooldown:true,noRepeat:true,keepFacing:true});assert.notEqual(events[0][2],a.pos);
  a.pos.x=9;runtime.advance(7.5);assert.equal(events.length,1);assert.equal(queue.length,0);
});
test('fuse callback failure consumes only visited rows without replaying a failed resolution',()=>{
  const a={dead:false},rows=[{kind:'buff',due:0,caster:a},{kind:'buff',due:0,caster:a}];
  const runtime=new PendingResolutions(rows,[],{time:()=>0,fusePower:()=>1,arrived(){throw Error('host');}});assert.throws(()=>runtime.advance(1),/host/);assert.equal(rows.length,1);
});
