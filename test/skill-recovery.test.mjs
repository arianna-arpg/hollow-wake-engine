import test from 'node:test';
import assert from 'node:assert/strict';
import {SkillRecovery} from '../dist/skill-recovery.js';
import {CastSelfEffects} from '../dist/cast-self-effects.js';
import {advanceRestorationStreams} from '../dist/restoration-streams.js';
import {healLife} from '../dist/life-recovery.js';

function setup(){
  const events=[],actors=[],values={critChance:0,critMulti:2,healPower:1,healTaken:1,restorePower:1,effectDuration:1,pourPower_surge:1,pourPower_settle:1};
  let draws=0,roll=.5;
  const make=(id,life=50)=>{const a={id,pos:{x:0,y:0},tier:0,team:'ally',dead:false,downed:false,life,mana:40,es:0,absorb:0,absorbTimer:0,healedSince:0,
    restoreStreams:[],gainEvents:[],sheet:{get:(stat)=>values[stat]??0},maxLife:()=>100,availableMaxMana:()=>80,maxEs:()=>50,
    healBy(n){return healLife(a,n,{ceiling:()=>100,rate:()=>values.healTaken,recent:()=>undefined});},gainEs(n){const before=a.es;a.es=Math.min(50,a.es+n);return a.es-before;},
    cleanseDebuffs:n=>n,applyStatus(...args){events.push(['status',...args]);},endStatus(id){events.push(['shed',id]);},gainWard:n=>{events.push(['ward',n]);return n;}};
    actors.push(a);return a;};
  const actor=make('caster'),skill={def:{id:'mend',name:'Mend',tags:['spell'],feedingCue:'default'}};
  const ports={tags:(s,granted)=>{events.push(['tags',granted]);return new Set(s.def.tags);},modifiers:()=>[],level:()=>4,healOverTime:()=>undefined,
    random(){draws++;events.push(['random']);return roll;},actors:()=>actors,sameLayer:(a,b)=>a.tier===b.tier,distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),
    absorbCue:a=>events.push(['absorb',a.id,a.absorb]),criticalCue:p=>events.push(['critical',p]),healCue:(a,n)=>events.push(['heal',a.id,n]),
    cleanseCue:a=>events.push(['cleanse',a.id]),chainCue:(c,s,a,b)=>events.push(['chain',a.id,b.id]),arrivalCue:(c,s,a)=>events.push(['arrival',a.id]),
    healedAlly:(c,a,n)=>events.push(['ally',a.id,n])};
  const recovery=new SkillRecovery(ports);
  const self=new CastSelfEffects({absorbAmount:(a,s,n)=>n*2,absorb:recovery.absorb.bind(recovery),restore(){},critical:(a,s)=>recovery.critical(a,s,a.pos),
    stream:recovery.stream.bind(recovery),heal:recovery.chain.bind(recovery),cleanse:recovery.cleanse.bind(recovery)});
  const frame={actor,skill,delivery:'self',durationScale:2,useMultiplier:1,chargesSpent:0};
  return {actor,skill,frame,ports,recovery,self,events,actors,values,make,draws:()=>draws,setRoll:n=>{roll=n;}};
}

test('critical chance is read before the draw; even zero chance consumes one draw',()=>{
  const s=setup();let sampled=false;
  s.actor.sheet.get=key=>{if(key==='critChance')sampled=true;return key==='critChance'?0:1;};
  s.ports.random=()=>{assert(sampled);return .5;};assert.equal(s.recovery.critical(s.actor,s.skill),1);
  const t=setup();t.recovery.critical(t.actor,t.skill);assert.equal(t.draws(),1);
});
test('excluded and downed recipients return before queries or random draws',()=>{
  const s=setup();assert.equal(s.recovery.heal(s.actor,s.skill,s.actor,{type:'heal',amount:10,excludeCaster:true}),0);
  s.actor.downed=true;assert.equal(s.recovery.heal(s.actor,s.skill,s.actor,{type:'heal',amount:10}),0);
  assert.deepEqual(s.events,[]);
});
test('instant healing folds received healing once and caps overmend without summing old shields',()=>{
  const s=setup();s.actor.life=95;s.actor.absorb=20;s.values.healTaken=.5;s.values.overheal=2;
  assert.equal(s.recovery.heal(s.actor,s.skill,s.actor,{type:'heal',amount:30}),5);
  assert.equal(s.actor.absorb,20);assert.equal(s.actor.absorbTimer,6);assert.equal(s.actor.gainEvents[0].n,5);
});
test('healing support conversion queues a stream without an immediate heal event',()=>{
  const s=setup();s.ports.healOverTime=()=>({factor:2,seconds:4});
  assert.equal(s.recovery.heal(s.actor,s.skill,s.actor,{type:'heal',amount:10}),0);
  assert.deepEqual(s.actor.restoreStreams,[{resource:'life',perSec:5,remaining:20,feedingCue:'default'}]);
  assert.equal(s.actor.life,50);assert.equal(s.actor.gainEvents.length,0);
});
test('surge skips generic percent restoration; settle includes it once',()=>{
  const s=setup();Object.assign(s.values,{restorePctMax:.1,pourPct_surge:.02,pourPct_settle:.03});
  s.recovery.stream(s.actor,s.actor,s.skill,{type:'restoreOverTime',resource:'life',amount:0,amountPctMax:.05,duration:1,lane:'surge'},0,1);
  s.recovery.stream(s.actor,s.actor,s.skill,{type:'restoreOverTime',resource:'life',amount:10,amountPerLevel:2,duration:2,lane:'settle'},0,1);
  assert.equal(s.actor.restoreStreams[0].remaining,7.000000000000001);
  assert.equal(s.actor.restoreStreams[1].remaining,29);assert.equal(s.draws(),0);
});
test('stream floor, charge minimum and explicit critical factor preserve original arithmetic',()=>{
  const s=setup();s.values.effectDuration=.01;
  s.recovery.stream(s.actor,s.actor,s.skill,{type:'restoreOverTime',resource:'mana',amount:10,duration:1,perCharge:true,feedingCue:false},0,2);
  assert.deepEqual(s.actor.restoreStreams,[{resource:'mana',perSec:100,remaining:20,feedingCue:false}]);
  assert.equal(s.actor.gainEvents[0].dur,.2);assert.equal(s.draws(),0);
});
test('zero-sized streams still evaluate critical chance, while an explicit factor suppresses that draw',()=>{
  const s=setup(),fx={type:'restoreOverTime',resource:'es',amount:0,duration:2};
  s.recovery.stream(s.actor,s.actor,s.skill,fx,0);assert.equal(s.draws(),1);assert.deepEqual(s.actor.restoreStreams,[]);
  s.recovery.stream(s.actor,s.actor,s.skill,fx,0,0);assert.equal(s.draws(),1);
});
test('all pour lanes from one cast share one lazy random result; a new cast gets a new result',()=>{
  const s=setup();s.values.critChance=1;
  const fx={type:'restoreOverTime',resource:'life',amount:10,duration:1};
  s.self.apply(s.frame,{type:'cleanse'});assert.equal(s.draws(),0);
  s.self.apply(s.frame,fx);s.self.apply(s.frame,{...fx,resource:'mana'});
  assert.equal(s.draws(),1);assert.deepEqual(s.actor.restoreStreams.map(x=>x.remaining),[20,20]);
  s.self.apply({...s.frame,pourCritical:undefined},fx);assert.equal(s.draws(),2);
});
test('self routing preserves unconditional self status and delivery-independent shed',()=>{
  const s=setup();s.self.apply(s.frame,{type:'status',status:'frozen',chance:0,magnitude:99,durationOverride:100});
  assert.deepEqual(s.events,[['status','frozen',0,2,'Mend']]);assert.equal(s.draws(),0);
  s.frame.delivery='projectile';s.self.apply(s.frame,{type:'heal',amount:100});s.self.apply(s.frame,{type:'shed',status:'aloft'});
  assert.equal(s.actor.life,50);assert.deepEqual(s.events.at(-1),['shed','aloft']);
});
test('ward scaling uses spent charges with a minimum of one',()=>{
  const s=setup();s.self.apply(s.frame,{type:'ward',amount:7,perCharge:true});s.frame.chargesSpent=3;
  s.self.apply(s.frame,{type:'ward',amount:7,perCharge:true});assert.deepEqual(s.events,[['ward',7],['ward',21]]);
});
test('chain selects the lowest life fraction, preserves ties and uses the current hop position',()=>{
  const s=setup(),a=s.make('a',10),b=s.make('b',10),far=s.make('far',1),other=s.make('other',1);
  a.pos.x=200;b.pos.x=200;far.pos.x=400;other.tier=1;s.actor.life=80;
  s.recovery.chain(s.actor,s.skill,s.actor,{type:'heal',amount:20,chain:3});
  assert.deepEqual(s.events.filter(e=>e[0]==='chain'),[['chain','caster','a'],['chain','a','far'],['chain','far','b']]);
  assert.equal(a.life,25);assert.equal(far.life,12.25);assert.equal(b.life,18.4375);assert.equal(other.life,1);
});
test('reverse stream iteration debits before callbacks, caps large frames and removes completed entries',()=>{
  const s=setup();s.actor.restoreStreams.push({resource:'life',perSec:10,remaining:15},{resource:'mana',perSec:20,remaining:12});
  const order=[];advanceRestorationStreams(s.actor,10,{gain:(a,r,n)=>{order.push([r,n,a.restoreStreams.find(x=>x.resource===r)?.remaining]);}});
  assert.deepEqual(order,[['mana',12,0],['life',15,0]]);assert.equal(s.actor.life,65);assert.equal(s.actor.mana,52);assert.deepEqual(s.actor.restoreStreams,[]);
});
test('stream overmend accumulates only received spill and respects its separate cap and clock',()=>{
  const s=setup();s.actor.life=100;s.values.healTaken=.5;s.values.overheal=2;s.actor.absorb=40;
  s.actor.restoreStreams.push({resource:'life',perSec:20,remaining:40,feedingCue:false});
  const gains=[];advanceRestorationStreams(s.actor,1,{gain:(a,r,n,cue)=>gains.push([r,n,cue])});
  assert.equal(s.actor.absorb,50);assert.equal(s.actor.absorbTimer,6);assert.equal(s.actor.restoreStreams[0].remaining,20);
  assert.deepEqual(gains,[['life',0,false],['absorb',10,false]]);
});
test('a throwing stream callback preserves its debit and gain without advancing earlier entries',()=>{
  const s=setup();s.actor.restoreStreams.push({resource:'life',perSec:5,remaining:10},{resource:'mana',perSec:5,remaining:10});
  assert.throws(()=>advanceRestorationStreams(s.actor,1,{gain(){throw Error('observer');}}),/observer/);
  assert.equal(s.actor.restoreStreams[0].remaining,10);assert.equal(s.actor.restoreStreams[1].remaining,5);assert.equal(s.actor.mana,45);
});
test('event accumulator capacity suppresses only notifications, never the underlying restoration',()=>{
  const s=setup();s.actor.gainEvents=Array(64).fill({kind:'heal'});
  s.recovery.stream(s.actor,s.actor,s.skill,{type:'restoreOverTime',resource:'life',amount:10,duration:1},0,1);
  s.recovery.heal(s.actor,s.skill,s.actor,{type:'heal',amount:10});
  assert.equal(s.actor.gainEvents.length,64);assert.equal(s.actor.restoreStreams.length,1);assert.equal(s.actor.life,60);
});
