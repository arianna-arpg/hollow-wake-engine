import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Grabs} from '../dist/grab.js';
export const rules={eligibility:{ratio:.8,maxRatio:3.2},holdSec:{carry:[2.8,4.2],drag:[2.4,3.6],pin:[3,4.4],swallow:[2.6,4]},
  holderMove:{carry:.78,drag:.85,pin:0,swallow:0},break:{base:.16,powRatio:.6,severFrac:.12,graceSec:1.4},release:{onHardCC:true},swallow:{burstHurt:.06},
  policy:{normal:1,magic:1,rare:1.75,champion:2.5,crowned:0},seat:{carryDist:.55,dragDist:1.05,pinDist:.7,swallowDist:0},handoff:{range:260},reelSpeed:460,
  markers:{carry:'seized',drag:'seized',pin:'seized',swallow:'swallowed'},labels:{carry:'Carried',drag:'Dragged',pin:'Pinned',swallow:'Swallowed'},physicalColor:'#fff'};
function setup(){
  const actors=[],trace=[];let now=1,draws=0;
  const make=(id,over={})=>{const a={id,team:'ally',pos:{x:0,y:0},radius:10,tier:0,dead:false,passive:false,invulnerable:false,untargetable:false,
    life:100,grabProofUntil:0,facing:0,casting:{},skills:[],statuses:[],weight:1,sheet:{get:()=>0,removeSource:id=>trace.push(['remove',id])},
    effectiveWeight(){return this.weight;},maxLife:()=>100,healBy(n){this.life+=n;return n;},isStunned:()=>false,
    applyStatus(id){trace.push(['status',this.id,id]);if(!this.statuses.some(s=>s.id===id))this.statuses.push({id});},...over};actors.push(a);return a;};
  const holder=make(1),victim=make(2,{team:'enemy'}),skill={def:{id:'grip',effects:[{type:'grabSeize',grab:{verb:'carry'}}]}};holder.skills=[skill];
  const ports={actors:()=>actors,actorById:id=>actors.find(a=>a.id===id),enemies:a=>actors.filter(b=>b.team!==a.team),time:()=>now,
    random:()=>{draws++;return .5;},localActor:()=>holder,tags:()=>new Set(),modifiers:()=>[],dormant:()=>false,hostileTo:(a,b)=>a.team!==b.team,
    lineOfSight:()=>true,clamp:p=>p,unclasp:a=>{trace.push(['unclasp',a.id]);a.clingTo=undefined;},mitigate:(a,n)=>Object.values(n).reduce((s,n)=>s+n,0),
    kill:(a,v,k)=>{trace.push(['kill',a.id,k?.id]);a.dead=true;},hit:(a,s,b)=>trace.push(['hit',a.id,b.id]),
    push:(a,d,n,c)=>trace.push(['push',a.id,d,n,c.id]),text:(p,t)=>trace.push(['text',t]),flash:()=>trace.push('flash'),fail:(a,k)=>trace.push(['fail',k]),
    damaged:(a,b,n)=>trace.push(['damaged',a.id,b.id,n]),dot:(a,n,t)=>trace.push(['dot',a.id,n,t]),leech:(a,b,r,n)=>trace.push(['leech',a.id,b.id,n]),
    seized:(a,b)=>trace.push(['seized',a.id,b.id])};
  return {actors,trace,make,holder,victim,skill,ports,runtime:new Grabs(rules,ports),time:n=>{now=n;},draws:()=>draws};
}
test('grab policy honors structural, mass and rarity gates in source order',()=>{
  const h=setup(),{holder:a,victim:b}=h;
  b.weight=4;assert.equal(h.runtime.refusal(a,b,{verb:'carry'},100),'far too heavy');b.weight=2;assert.equal(h.runtime.refusal(a,b,{verb:'carry'},0),'too heavy');
  assert.equal(h.runtime.refusal(a,b,{verb:'carry'},1),null);b.rarity='crowned';assert.equal(h.runtime.refusal(a,b,{verb:'carry'},1),'too mighty to hold');
  b.grabbable=true;assert.equal(h.runtime.refusal(a,b,{verb:'carry'},1),null);b.flying=true;assert.equal(h.runtime.refusal(a,b,{verb:'carry'},1),'out of reach');
  a.dead=true;assert.equal(h.runtime.refusal(a,b,{verb:'carry'},1),'dead');
});
test('seize clears the cast, establishes both sides and snapshots conceal before callbacks',()=>{
  const h=setup();h.victim.clingTo={};assert(h.runtime.seize(h.holder,h.skill,h.victim,{verb:'swallow'}));
  assert.equal(h.victim.casting,null);assert.equal(h.victim.heldBy,1);assert(h.victim.untargetable);assert.equal(h.holder.gripping.wasUntargetable,false);
  assert.equal(h.draws(),2);assert.equal(h.holder.gripping.until,4.3);assert.equal(h.holder.aiTargetId,2);assert.deepEqual(h.trace[0],['unclasp',2]);
  assert.deepEqual(h.trace.at(-1),['seized',2,1]);
});
test('release restores conceal, removes both markers and preserves longer grace',()=>{
  const h=setup();h.runtime.seize(h.holder,h.skill,h.victim,{verb:'swallow'});h.victim.statuses.push({id:'seized'},{id:'burning'});h.victim.grabProofUntil=20;
  h.runtime.release(h.holder);assert.equal(h.holder.gripping,undefined);assert.equal(h.victim.heldBy,undefined);assert(!h.victim.untargetable);
  assert.deepEqual(h.victim.statuses,[{id:'burning'}]);assert.equal(h.victim.grabProofUntil,20);h.runtime.release(h.holder);
});
test('grace and dormant refusal preserve all body state and consume no random',()=>{
  const h=setup();h.victim.grabProofUntil=2;assert(!h.runtime.seize(h.holder,h.skill,h.victim,{verb:'carry'}));assert(h.victim.casting);assert.equal(h.draws(),0);
  h.victim.grabProofUntil=0;h.ports.dormant=()=>true;assert(!h.runtime.seize(h.holder,h.skill,h.victim,{verb:'carry'}));assert.equal(h.draws(),0);
});
test('handoff selects first nearest eligible kin and carries escape/conceal state without grace',()=>{
  const h=setup();h.runtime.seize(h.holder,h.skill,h.victim,{verb:'swallow'});const old=h.holder.gripping;old.struggle=.7;old.severed=.09;
  const a=h.make(3,{pos:{x:20,y:0},skills:[h.skill]}),b=h.make(4,{pos:{x:-20,y:0},skills:[h.skill]});
  assert(h.runtime.handoff(h.holder,h.victim,{}));assert.equal(h.holder.gripping,undefined);assert.equal(h.victim.heldBy,3);assert.equal(a.gripping.struggle,.7);
  assert.equal(a.gripping.severed,0);assert.equal(a.gripping.bearing,old.bearing);assert(!h.victim.untargetable);assert(!b.gripping);assert.equal(h.victim.grabProofUntil,0);
  assert.deepEqual(h.victim.statuses,[{id:'seized'}]);
});
test('handoff refuses cross-layer, blocked and already occupied hands without disturbing the hold',()=>{
  const h=setup();h.runtime.seize(h.holder,h.skill,h.victim,{verb:'carry'});const hold=h.holder.gripping;
  h.make(3,{tier:1,skills:[h.skill]});h.make(4,{skills:[h.skill],gripping:{id:99}});h.make(5,{skills:[h.skill]});h.ports.lineOfSight=()=>false;
  assert(!h.runtime.handoff(h.holder,h.victim,{}));assert.equal(h.holder.gripping,hold);assert.equal(h.victim.heldBy,1);
});
test('throw releases before placement and hit, skips push on lethal hit, then presents',()=>{
  const h=setup();h.runtime.seize(h.holder,h.skill,h.victim,{verb:'carry'});h.trace.length=0;
  h.ports.hit=()=>{assert.equal(h.victim.heldBy,undefined);assert.equal(h.holder.gripping,undefined);h.victim.dead=true;h.trace.push('hit');};
  h.runtime.throw(h.holder,500,0,h.skill,2);assert.equal(h.victim.pos.x,18);assert.equal(h.victim.facing,Math.PI);
  assert(!h.trace.some(v=>v[0]==='push'));assert.deepEqual(h.trace.slice(-2),['hit','flash']);
});
test('orphan repair removes ghost holds before advancing valid pairs',()=>{
  const h=setup();h.victim.heldBy=99;h.victim.untargetable=true;h.victim.statuses=[{id:'swallowed'},{id:'poison'}];
  h.runtime.advance(.1);assert.equal(h.victim.heldBy,undefined);assert(!h.victim.untargetable);assert.deepEqual(h.victim.statuses,[{id:'poison'}]);
});
test('timer reels to a shared seat, absorbs momentum and accrues passive escape',()=>{
  const h=setup();h.runtime.seize(h.holder,h.skill,h.victim,{verb:'carry'});h.victim.pos={x:100,y:0};h.victim.push={vx:2,vy:3};
  h.runtime.advance(.1);assert.equal(h.victim.pos.x,54);assert.deepEqual(h.victim.push,{vx:0,vy:0});assert.equal(h.holder.gripping.struggle,.016);
  h.runtime.advance(.1);assert.equal(h.victim.pos.x,11);assert.equal(h.holder.gripping.struggle,.032);
});
test('release ladder prioritizes sever over struggle damage and patience',()=>{
  const h=setup();h.runtime.seize(h.holder,h.skill,h.victim,{verb:'swallow'});Object.assign(h.holder.gripping,{severed:.12,struggle:1,until:0});
  h.runtime.advance(.1);assert.equal(h.holder.life,100);assert.equal(h.holder.gripping,undefined);assert(!h.victim.untargetable);
});
test('digestion and invested crush enter ordered mitigation and credited damage ports',()=>{
  const h=setup();h.holder.sheet.get=s=>s==='gripCrush'?.1:0;h.holder.life=50;
  h.runtime.seize(h.holder,h.skill,h.victim,{verb:'swallow',dot:{type:'fire',frac:.2},leech:.5});h.trace.length=0;
  h.runtime.advance(.5);assert.equal(h.victim.life,85);assert.equal(h.holder.life,55);assert.equal(h.holder.gripping.dotAcc,10);
  assert.deepEqual(h.trace.filter(v=>['damaged','dot','leech'].includes(v[0])),[['damaged',2,1,100],['dot',2,10,'fire'],['leech',1,2,5],['damaged',2,1,90],['dot',2,5,'physical']]);
});
test('a lethal digestion release prevents crush and a missing victim drops its holder',()=>{
  const h=setup();h.holder.sheet.get=s=>s==='gripCrush'?100:0;h.runtime.seize(h.holder,h.skill,h.victim,{verb:'swallow',dot:{type:'fire',frac:10}});
  h.runtime.advance(.5);assert(h.victim.dead);assert.equal(h.holder.gripping,undefined);assert.equal(h.trace.filter(v=>v[0]==='dot').length,1);
  h.holder.gripping={id:99};h.runtime.advance(.1);assert.equal(h.holder.gripping,undefined);
});
test('failed status publication retains the established pair and explicit release repairs it',()=>{
  const h=setup();h.victim.applyStatus=()=>{throw Error('status');};
  assert.throws(()=>h.runtime.seize(h.holder,h.skill,h.victim,{verb:'swallow'}),/status/);assert.equal(h.victim.heldBy,1);assert(h.holder.gripping);
  h.runtime.release(h.holder);assert.equal(h.victim.heldBy,undefined);assert(!h.victim.untargetable);
});
