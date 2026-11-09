import test from 'node:test';import assert from 'node:assert/strict';
import {SkillBarActions,restoreSkillSlotMemory,rememberSkillSlot,planSkillSlots} from '../dist/skill-bar.js';
const skill=(id,flask=false)=>({def:{id},flask});
function fixture(){
 const make=()=>{const hero={skills:[null,null,null]},actor={skills:[null]};return{hero,actor,known:new Map(),provisioning:false};};
 const local=make(),guest=make(),memory={},events=[];
 const ports={hero:s=>s.hero,actor:s=>s.actor,resolve:(s,id)=>{events.push('resolve:'+id);return s.known.get(id)??null;},
  remember:(s,t)=>{events.push(['remember',t.map(i=>i?.def.id??null),s.hero.skills.slice()]);actions.remember(s,t);},
  rebind:(s,t)=>{events.push(['rebind',t.map(i=>i?.def.id??null),s.hero.skills.slice()]);actions.rebind(s,t);},
  recalculate:()=>events.push('recalculate'),isFlask:i=>i.flask,
  clearFields:(body,i)=>events.push(['clear',body,i]),resync:i=>events.push(['resync',i]),
  localSeat:()=>local,provisioning:s=>s.provisioning,
  rememberSlot:(i,slot,overwrite)=>rememberSkillSlot(memory,i,slot,overwrite,x=>x.flask),preferencesDirty:()=>events.push('dirty')};
 const actions=new SkillBarActions(ports);return{local,guest,events,memory,ports,actions};
}
test('binding changes references and retains off-bar ownership and independent bodies',()=>{
 const f=fixture(),a=skill('a'),b=skill('b');f.local.known.set('a',a);f.local.known.set('b',b);f.local.actor.skills=[b];
 assert(f.actions.bind(f.local,0,'a'));assert.equal(f.local.hero.skills[0],a);
 f.local.hero.skills[1]=skill('a');assert(f.actions.bind(f.local,2,'a'));assert.deepEqual(f.local.hero.skills,[null,null,a]);
 assert(f.actions.bind(f.local,2,'a'));assert.deepEqual(f.local.hero.skills,[null,null,null]);assert.equal(f.local.known.get('a'),a);assert.deepEqual(f.local.actor.skills,[b]);
});
test('invalid or unowned binding is lazy; clearing an empty slot still rebuilds',()=>{
 const f=fixture();assert.equal(f.actions.bind(f.local,-1,'missing'),false);assert.equal(f.actions.bind(f.local,3,'missing'),false);assert.deepEqual(f.events,[]);
 assert.equal(f.actions.bind(f.local,0,'missing'),false);assert.deepEqual(f.events,['resolve:missing']);f.events.length=0;
 assert(f.actions.bind(f.local,0,null));assert.equal(f.events.filter(e=>e==='recalculate').length,1);assert(!f.events.some(e=>typeof e==='string'&&e.startsWith('resolve:')));
});
test('lookup precedes remembering and remembering sees the old bar before mutation',()=>{
 const f=fixture(),a=skill('a'),b=skill('b');f.local.hero.skills[1]=a;f.local.known.set('b',b);
 assert(f.actions.bind(f.local,1,'b'));assert.equal(f.events[0],'resolve:b');
 assert.deepEqual(f.events[1],['remember',['a'],[null,a,null]]);assert.deepEqual(f.events[2],['rebind',['a','b'],[null,b,null]]);
 assert.equal(f.local.known.get('b'),b);
});
test('remember failure precedes mutation; rebuild failure retains a completed bind',()=>{
 const f=fixture(),a=skill('a');f.local.known.set('a',a);f.ports.remember=()=>{throw Error('remember');};
 assert.throws(()=>f.actions.bind(f.local,0,'a'),/remember/);assert.equal(f.local.hero.skills[0],null);
 f.ports.remember=()=>{};f.ports.recalculate=()=>{throw Error('recalculate');};assert.throws(()=>f.actions.bind(f.local,0,'a'),/recalculate/);assert.equal(f.local.hero.skills[0],a);
});
test('swapping preserves both instances, leaves empty swaps silent, and never resolves IDs',()=>{
 const f=fixture(),a=skill('a'),b=skill('b');f.local.hero.skills=[a,b,null];f.ports.resolve=()=>{throw Error('resolve');};
 assert(f.actions.swap(f.local,0,1));assert.deepEqual(f.local.hero.skills,[b,a,null]);assert(f.actions.swap(f.local,1,2));assert.deepEqual(f.local.hero.skills,[b,null,a]);
 f.local.hero.skills=[null,null,a];f.events.length=0;assert(f.actions.swap(f.local,0,1));assert.equal(f.actions.swap(f.local,0,0),false);assert.equal(f.actions.swap(f.local,0,3),false);assert.deepEqual(f.events,[]);
});
test('rebuild uses current controlled-body occupancy and deduplicates exact touched identities',()=>{
 const f=fixture(),a=skill('flask',true),b=skill('flask',true);f.local.actor.skills=[a];const replacement={skills:[b]};
 f.ports.recalculate=()=>{f.events.push('recalculate');f.local.actor=replacement;};f.actions.rebind(f.local,[a,null,a,undefined,b]);
 const clears=f.events.filter(e=>Array.isArray(e)&&e[0]==='clear'),resyncs=f.events.filter(e=>Array.isArray(e)&&e[0]==='resync');
 assert.deepEqual(clears,[['clear',replacement,a]]);assert.deepEqual(resyncs,[['resync',a],['resync',b]]);
});
test('field retirement failure stops resync while keeping the completed bar change',()=>{
 const f=fixture(),a=skill('flask',true);f.local.hero.skills[0]=a;f.ports.clearFields=()=>{throw Error('clear');};
 assert.throws(()=>f.actions.bind(f.local,0,null),/clear/);assert.equal(f.local.hero.skills[0],null);assert(!f.events.some(e=>Array.isArray(e)&&e[0]==='resync'));
});
test('one service keeps two owners separate and respects local/provisioning preference gates',()=>{
 const f=fixture(),a=skill('flask',true),b=skill('flask',true);f.local.known.set('flask',a);f.guest.known.set('flask',b);
 assert(f.actions.bind(f.local,1,'flask'));assert.equal(f.memory.flask,1);f.events.length=0;
 assert(f.actions.bind(f.guest,2,'flask'));assert.equal(f.memory.flask,1);assert.equal(f.guest.hero.skills[2],b);assert.equal(f.local.hero.skills[1],a);assert(!f.events.includes('dirty'));
 f.local.provisioning=true;assert(f.actions.bind(f.local,0,'flask'));assert.equal(f.memory.flask,1);
 f.local.provisioning=false;f.actions.remember(f.local,[a],false);assert.equal(f.memory.flask,1);f.actions.remember(f.local);assert.equal(f.memory.flask,0);
});
test('default preference selection queries the hero before guest refusal and captures a stable bar',()=>{
 const f=fixture(),calls=[];f.ports.hero=s=>{calls.push(s);return s.hero;};f.actions.remember(f.guest);assert.deepEqual(calls,[f.guest]);calls.length=0;
 const a=skill('a',true),b=skill('b',true);f.local.hero.skills=[a,b,null];
 f.ports.preferencesDirty=()=>{f.local.hero.skills=[b,null,a];};f.actions.remember(f.local,[a,b]);
 assert.deepEqual(calls,[f.local]);assert.deepEqual(f.memory,{a:0,b:1});
});
test('preference repair is detached and eligibility remains lazy and live',()=>{
 const raw={a:0,b:4,c:-1,d:1.5,e:'2','':2},copy=restoreSkillSlotMemory(raw);assert.deepEqual(copy,{a:0,b:4});copy.a=2;assert.equal(raw.a,0);assert.deepEqual(restoreSkillSlotMemory([]),{});
 const a=skill('a'),memory={};let enabled=false,reads=0;const eligible=()=>{reads++;return enabled;};
 assert.equal(rememberSkillSlot(memory,a,-1,true,eligible),false);assert.equal(reads,0);
 assert.equal(rememberSkillSlot(memory,a,0,true,eligible),false);enabled=true;assert(rememberSkillSlot(memory,a,0,true,eligible));
 assert.equal(rememberSkillSlot(memory,a,0,true,eligible),false);assert.equal(rememberSkillSlot(memory,a,1,false,eligible),false);assert.deepEqual(memory,{a:0});
});
test('preference reservation precedes fallbacks and preserves caller inputs',()=>{
 const ids=['a','b','a','c'],bar=['occupied',null,null],memory={a:0,b:2,c:1};
 assert.deepEqual([...planSkillSlots(ids,bar,memory)],[['b',2],['c',1],['a',-1]]);assert.deepEqual(bar,['occupied',null,null]);assert.deepEqual(memory,{a:0,b:2,c:1});
 assert.deepEqual([...planSkillSlots(['a','a','b'],['a',null],{})],[['a',0],['b',1]]);
});
