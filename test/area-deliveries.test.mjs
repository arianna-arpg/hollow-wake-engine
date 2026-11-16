import {test} from 'node:test';import assert from 'node:assert/strict';
import {AreaDeliveries} from '../dist/area-deliveries.js';
import {inAoe} from '../dist/combat-geometry.js';
function setup(){
  const hits=[],flashes=[],aftermath=[],zones=[],projectiles=[],stats={aoeShape:0,meleeReach:1,sweepSpeed:1,sweepRange:1,effectDuration:1};
  const make=(id,x=0,y=0,over={})=>({id,pos:{x,y},radius:2,facing:0,tier:0,team:'enemy',dead:false,untargetable:false,statuses:[],sheet:{get:(key,_t,_m,base)=>stats[key]??base??0},...over});
  const caster=make(1,0,0,{team:'player',radius:10}),actors=[caster],enemies=[];
  const ports={actors:()=>actors,enemiesOf:()=>enemies,projectiles:()=>projectiles,assaultLocked:()=>undefined,resolveHit:(_a,_i,b,m,_d,flat)=>hits.push({id:b.id,m,flat}),
    nearestBody:a=>({pos:a.pos,r:a.radius,seg:-1}),noteBodyHit:(a,seg)=>a.seg=seg,
    inAoeBody:(o,r,s,f,a,arc,pred)=>inAoe(o,r,s,f,a.pos,a.radius,arc)&&pred(a.pos,a.radius)?{pos:a.pos,r:a.radius,seg:-1}:null,
    zone:z=>zones.push(z),flash:f=>flashes.push(f),releaseStruckSummons(){},skillStrikeVoice(){},skillBurstVoice(){},skillBeamVoice(){},skillSelfVoice(){},skillContextTags:()=>new Set(),
    mintAftermath:(...args)=>aftermath.push(args),healAlliesInArea(){},frontSplash(){},strikeSurfaces(){},skillOcclusion:()=> 'free',lineOfFire:()=>true,clipShot:(_a,b)=>b,spawnAftershocks(){}};
  const inst={def:{id:'area',tags:['spell']}},frame={caster,inst,origin:caster.pos,aim:{x:0,y:0},tags:new Set(),extra:[],useMult:2,flatBonus:{fire:5},aoeScale:1,arcScale:1,cosmeticColor:'#fff'};
  return{hits,flashes,aftermath,zones,projectiles,stats,make,caster,actors,enemies,ports,frame,runtime:new AreaDeliveries(ports)};
}
test('nova caps geometric candidates before checking required statuses, preserving original selection order',()=>{
  const h=setup();h.enemies.push(h.make(2,10),h.make(3,20,0,{statuses:[{id:'burn'}]}));
  h.runtime.nova({...h.frame,d:{radius:50,maxTargets:1,requiresStatus:['burn']}});assert.deepEqual(h.hits,[]);
});
test('nova spareCaster also spares attached parts and filters layers even for all-target delivery',()=>{
  const h=setup();h.actors.push(h.make(2,1,0,{partLink:{root:h.caster}}),h.make(3,1,0,{tier:1}),h.make(4,1));
  h.runtime.nova({...h.frame,d:{radius:50,affects:'all',spareCaster:true}});assert.deepEqual(h.hits.map(h=>h.id),[4]);
});
test('melee locked target is not struck twice and reverb uses stable nearest-first selection',()=>{
  const h=setup(),locked=h.make(2,30),near=h.make(3,90),tie=h.make(4,90);h.enemies.push(locked,near,tie);h.ports.assaultLocked=()=>locked;h.stats.meleeReverb=1;
  h.runtime.melee({...h.frame,d:{range:40,arcDeg:90}});assert.deepEqual(h.hits.map(h=>h.id),[2,3]);assert.equal(locked.seg,undefined);
});
test('sweeping melee shares its hit set with the delayed zone so locked and reverberated targets cannot be hit again',()=>{
  const h=setup(),locked=h.make(2,30),next=h.make(3,60);h.enemies.push(locked,next);h.ports.assaultLocked=()=>locked;h.stats.meleeSweep=1;h.stats.meleeReverb=1;
  h.runtime.melee({...h.frame,d:{range:40,arcDeg:90}});assert.deepEqual([...h.zones[0].struck],[2,3]);assert.equal(h.zones[0].caster,h.caster);assert.equal(h.zones[0].inst,h.frame.inst);
});
test('cone terrain occlusion gates contacts and triangle linger origin preserves the authored .33 factor',()=>{
  const h=setup();h.enemies.push(h.make(2,30));h.ports.skillOcclusion=()=> 'blocked';h.ports.lineOfFire=()=>false;
  h.runtime.cone({...h.frame,d:{range:100,arcDeg:90}});assert.equal(h.hits.length,0);
  h.stats.aoeShape=2;const field=h.runtime.cone({...h.frame,d:{range:100,arcDeg:90}});assert.deepEqual(field,{x:33,y:0});
});
test('projectile detonation removes the selected owned projectile before hits but does not multiply aftermath by the consumption bonus',()=>{
  const h=setup(),other={caster:{},inst:h.frame.inst,pos:{x:0,y:0}},picked={caster:h.caster,inst:h.frame.inst,pos:{x:5,y:0}};
  h.projectiles.push(other,picked,{caster:h.caster,inst:h.frame.inst,pos:{x:-5,y:0}});h.enemies.push(h.make(2,6));
  const hit=h.ports.resolveHit;h.ports.resolveHit=(...args)=>{assert(!h.projectiles.includes(picked));hit(...args);};
  const at=h.runtime.detonateProjectile({...h.frame,d:{radius:10,consumeBonus:3}});assert.deepEqual(at,{x:5,y:0});assert.equal(h.hits[0].m,6);assert.equal(h.aftermath[0][6],2);assert.equal(h.projectiles[0],other);
});
