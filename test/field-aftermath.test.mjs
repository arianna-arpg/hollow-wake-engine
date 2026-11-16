import {test} from 'node:test';import assert from 'node:assert/strict';
import {FieldAftermath} from '../dist/field-aftermath.js';
function setup(){
  const stats={effectDuration:1,aoeRadius:1,cascadeStep:1},state={zones:[]},events=[],sockets={},bodies=[];
  const actor={pos:{x:10,y:20},facing:0,tier:0,radius:5,sheet:{get:(k,_t,_m,base)=>stats[k]??base??0}},skill={def:{id:'test',color:'red'}};
  const ports={time:()=>7,random:()=>.5,instanceDelivery:()=>({type:'nova'}),skillBurstVoice:()=> 'burst',skillStrikeVoice:()=>undefined,skillMovementVoice:()=>undefined,skillPresenceVoice:()=>undefined,
    socketSpec:(_i,k)=>sockets[k],instancePulsePlan:()=>({appended:[]}),instanceCascadePlan:()=>({recasts:[]}),skillContextTags:()=>new Set(),grantedTags:()=>[],instanceMods:()=>[],instanceSizeOver:()=>undefined,hostSockets:()=>[],maddenBankOf:()=>undefined,
    enemiesOf:()=>bodies,resolveHit:(...args)=>events.push(['hit',...args]),cosmetic:()=>({}),flash:cue=>events.push(['flash',cue]),frontSplash:()=>events.push(['front']),strikeSurfaces:()=>events.push(['surfaces']),skillOcclusion:()=> 'free',clipShot:(_a,b)=>b,occluded:kind=>events.push(['occluded',kind])};
  return{stats,state,events,sockets,bodies,actor,skill,ports,runtime:new FieldAftermath(state,ports)};
}
test('secondary pulse fields retain identities but detach coordinates and pulse queues',()=>{const h=setup(),at={x:30,y:40};
  const appended=[{delay:.1,count:2,interval:.2}];h.ports.instancePulsePlan=()=>({native:{count:2,delay:.5,interval:.25},appended});
  h.runtime.mintAftermath(h.actor,h.skill,at,20,0,0,2,new Set(),[]);const z=h.state.zones[0];
  assert.equal(z.caster,h.actor);assert.equal(z.inst,h.skill);assert.notEqual(z.pos,at);at.x=999;assert.equal(z.pos.x,30);assert.equal(z.pulse.next,7.5);assert.equal(z.pulse.queue.length,2);assert.equal(z.dmgMult,2);assert.equal(z.tickInterval,Infinity);assert.equal(z.fx,'burst');
});
test('recast cascades also mint native marches in original order and consume two draws per random point',()=>{const h=setup();let draws=0;h.ports.random=()=>{draws++;return .5;};
  h.ports.instanceCascadePlan=()=>({native:{count:2,dir:'forward',step:10,dmgStep:.5},recasts:[{count:1,dir:'random',step:20,dmgStep:.8}]});
  h.runtime.mintAftermath(h.actor,h.skill,{x:0,y:0},20,0,0,2,new Set(),[]);assert.equal(draws,2);assert.equal(h.state.zones.length,5);
  assert.deepEqual(h.state.zones.map(z=>z.dmgMult),[1,.5,1.6,.8,.4]);assert.deepEqual(h.state.zones.map(z=>z.pos.x),[10,20,-20,-10,0]);
});
test('healing lingering fields use duration floor and never acquire damaging payloads',()=>{const h=setup();h.stats.lingerField=1;h.stats.effectDuration=2;h.sockets.healField={amount:5};
  h.runtime.dropLingerField(h.actor,h.skill,h.actor.pos,3);const z=h.state.zones[0];assert.equal(z.linger,8);assert.equal(z.healTick,5);assert.equal(z.dmgMult,0);assert.equal(z.forceDamage,false);assert.equal(z.depth,1);assert.notEqual(z.pos,h.actor.pos);
});
test('trails stamp their layer immediately and apply size only once at creation',()=>{const h=setup();h.actor.tier=3;h.runtime.mintTrailPatch(h.actor,h.skill,{radius:10,duration:2,sizeOver:{from:.5,to:2,curve:'linear'}},h.actor.pos,1);
  const z=h.state.zones[0];h.actor.tier=0;assert.equal(z.tier,3);assert.equal(z.radius,5);assert.equal(z.radius0,10);assert.equal(z.tickTimer,.2);assert.equal(z.tickInterval,.4);assert.equal(z.dmgMult,.5);
});
test('movement blasts gate by layer and body edge and preserve contact before presentation',()=>{const h=setup();h.stats.moveExplode=.3;h.stats.departSplash=.2;
  h.bodies.push({id:1,pos:{x:95,y:20},tier:0,radius:1},{id:2,pos:{x:96.1,y:20},tier:0,radius:1},{id:3,pos:h.actor.pos,tier:1,radius:1});
  h.runtime.moveBlast(h.actor,h.skill,h.actor.pos,'depart');assert.deepEqual(h.events.map(e=>e[0]),['hit','flash','front','surfaces']);assert.equal(h.events[0][3].id,1);assert.equal(h.events[0][4],.5);assert.equal(h.events[0][5],1);assert.equal(h.events[0][7],true);
});
test('ground placement clamps reach then clips on the actor layer without mutating the aim',()=>{const h=setup(),aim={x:210,y:20};h.actor.tier=2;h.ports.skillOcclusion=()=> 'blocked';h.ports.clipShot=(a,b,tier)=>{assert.equal(a,h.actor.pos);assert.deepEqual(b,{x:110,y:20});assert.equal(tier,2);return{x:60,y:20};};
  assert.deepEqual(h.runtime.clampGroundTarget(h.actor,aim,{castRange:100},h.skill),{x:60,y:20});assert.deepEqual(aim,{x:210,y:20});assert.deepEqual(h.events,[['occluded','place']]);
});
