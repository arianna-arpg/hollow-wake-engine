import test from 'node:test';import assert from 'node:assert/strict';import {Tethers} from '../dist/tethers.js';import {isBurstTarget} from '../dist/combat-target-policy.js';
function host(){const actors=[],state={tethers:[]},events=[];let now=0;const make=(id,x,team='player')=>{const a={id,pos:{x,y:0},radius:2,team,tier:0,dead:false,downed:false,untargetable:false,invulnerable:false,life:50,hitFlash:0,sheet:{get:k=>['damage','tetherDamage','aoeRadius','tetherWidth','effectDuration'].includes(k)?1:0},healBy(n){this.life+=n;return n;}};actors.push(a);return a;};const a=make(1,0),b=make(2,100),enemy=make(3,50,'enemy'),i={def:{id:'tether',delivery:{}}};
  const ports={actors:()=>actors,time:()=>now,tags:()=>new Set(),modifiers:()=>[],grantedTags:()=>[],specs:()=>[],packSpec:()=>undefined,applyConversion(){},mitigate:(_a,v)=>Object.values(v).reduce((n,v)=>n+v,0),dominantType:()=> 'physical',bodyWhere:(a,test)=>test(a.pos,a.radius,-1)?{seg:-1}:null,lineOfFire:()=>true,isBurstTarget,stampSegment(){},damageCue(){},kill:a=>{a.dead=true;events.push(a.id);}};
  const rules={tick:.4,memoTtl:.25,memoJitter:.7,links:{target:'blocked',network:'blocked',caster:'blocked',pack:'blocked'},colors:{physical:'gray',fire:'red',cold:'blue',lightning:'yellow',chaos:'purple'}},runtime=new Tethers(state,rules,ports);return{actors,state,events,a,b,enemy,i,ports,rules,runtime,make,set time(v){now=v;}};
}
test('pair refresh keeps only the new band and snapshots damage without copying endpoint identities',()=>{
  const h=host();h.runtime.add(h.a,h.b,{link:'target',dps:10},h.i,h.a);const first=h.state.tethers[0];h.runtime.add(h.b,h.a,{link:'target',dps:20},h.i,h.a);assert.equal(h.state.tethers.length,1);assert.notEqual(h.state.tethers[0],first);assert.equal(h.state.tethers[0].a,h.b);assert.equal(h.state.tethers[0].amounts.physical,20);
});
test('healing advances each frame, damage advances only one chunk while retaining elapsed debt',()=>{
  const h=host();h.runtime.add(h.a,h.b,{link:'target',dps:10,healPerSec:5,affects:'all',duration:10},h.i,h.a);h.runtime.advance(1.2);assert.equal(h.a.life,56);assert.equal(h.enemy.life,46);assert(h.state.tethers[0].tickTimer<0);h.runtime.advance(0);assert.equal(h.enemy.life,42);assert.equal(h.a.life,56);
});
test('dead endpoints and exact expiry retire before either damage or healing',()=>{
  const h=host();h.runtime.add(h.a,h.b,{link:'target',dps:10,duration:.4,healPerSec:5,affects:'all'},h.i,h.a);h.runtime.advance(.4);assert.equal(h.state.tethers.length,0);assert.equal(h.enemy.life,50);assert.equal(h.a.life,50);
  h.runtime.add(h.a,h.b,{link:'caster',dps:10},h.i,h.a);h.b.dead=true;h.runtime.advance(.4);assert.equal(h.state.tethers.length,0);
});
test('visibility caches each body segment and evicts old entries within the original bound',()=>{
  const h=host();h.runtime.add(h.a,h.b,{link:'target',dps:10},h.i,h.a);const t=h.state.tethers[0];let rays=0;h.ports.lineOfFire=()=>{rays++;return true;};h.runtime.sees(t,h.enemy,h.enemy.pos,-1);assert.equal(rays,2);h.runtime.sees(t,h.enemy,h.enemy.pos,-1);assert.equal(rays,2);
  h.runtime.sees(t,h.enemy,h.enemy.pos,0);assert.equal(rays,4);h.time=1;h.runtime.sees(t,h.enemy,h.enemy.pos,-1);assert.equal(rays,6);
  for(let id=10;id<620;id++)h.runtime.sees(t,{id},{x:50,y:0},-1);assert(t.los.size<=513);assert(!t.los.has(h.enemy.id*128));assert.equal(h.runtime.sees(t,h.a,h.a.pos,-1),true);
});
test('band attitude is resolved once, body geometry runs before rays, and layered victims remain separate',()=>{
  const h=host();h.runtime.add(h.a,h.b,{link:'target',dps:10},h.i,h.a);h.enemy.tier=1;let rays=0;h.ports.lineOfFire=()=>{rays++;return false;};h.runtime.advance(.4);assert.equal(h.enemy.life,50);assert.equal(rays,0);
  h.enemy.tier=0;h.runtime.advance(.4);assert.equal(rays,1);h.a.sheet.get=()=>1;h.runtime.advance(.1);assert.equal(h.state.tethers[0].phase,false);assert.equal(h.enemy.life,50);
});
test('pack linking uses nearest unlinked peers on the same tier and original scan/duty cadence',()=>{
  const h=host();for(const a of h.actors){a.team='enemy';a.defId='pack';}h.ports.packSpec=()=>({dps:4,period:6,duty:3});h.runtime.advancePacks(.1);assert.equal(h.state.tethers.length,1);assert.equal(h.state.tethers[0].a,h.a);assert.equal(h.state.tethers[0].b,h.enemy);
  h.state.tethers.length=0;h.time=4;h.runtime.advancePacks(1);assert.equal(h.state.tethers.length,0);h.time=6;h.runtime.advancePacks(.5);assert.equal(h.state.tethers.length,1);assert.equal(h.state.tethers[0].remaining,3);
});
