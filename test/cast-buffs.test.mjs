import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BuffRuntime} from '../dist/buffs.js';
import {CastBuffs} from '../dist/cast-buffs.js';
import {IronWard} from '../dist/iron-ward.js';

function setup(){
  const actors=[],trace=[],skill={def:{tags:['spell']}};
  const make=over=>{const a={team:'ally',dead:false,tier:0,pos:{x:0,y:0},radius:10,buffs:new Map(),gainEvents:[],sheet:{get:s=>s==='offeringShare'?.5:1},
    isMinion(){return !!this.owner;},...over};actors.push(a);return a;};
  const caster=make(),buff={type:'buff',id:'boon',duration:4,mods:[{stat:'damage',kind:'increased',value:2}]};
  const engine=new BuffRuntime({publish(){},removeSource(){},release(){}});
  const ports={actors:()=>actors,tags:(s,g)=>{trace.push(['tags',g]);return new Set(s.def.tags);},tagList:t=>[...t],modifiers:()=>[],hasTreeBuffs:s=>!!s.tree,
    grant:engine.grant.bind(engine),remove:engine.remove.bind(engine),arrival:(c,s,t)=>trace.push(['arrival',c,s,t])};
  return {actors,trace,skill,make,caster,buff,engine,ports,runtime:new CastBuffs(ports)};
}
test('ordinary buffs retain definition identity while gauge and use power compose without mutating content',()=>{
  const h=setup();h.runtime.apply(h.caster,h.skill,h.buff,2);assert.equal(h.caster.buffs.get('boon').def,h.buff);
  h.skill.def.gauge={};h.skill.state={gaugePower:2.2};
  h.runtime.apply(h.caster,h.skill,{...h.buff,powerStacks:2,powerScaled:true,maxStacks:10},1,.25);
  const active=h.caster.buffs.get('boon');assert.equal(active.stacks,5);assert.equal(active.def.mods[0].value,.5);assert.equal(h.buff.mods[0].value,2);
});
test('ally selection respects layer, body radius, living state and excludes constructs',()=>{
  const h=setup(),edge=h.make({pos:{x:30,y:0}}),outside=h.make({pos:{x:30.1,y:0}}),dead=h.make({dead:true}),down=h.make({downed:true}),
    otherLayer=h.make({tier:1}),construct=h.make({construct:{}}),enemy=h.make({team:'enemy'});
  h.runtime.apply(h.caster,h.skill,{...h.buff,affects:'allies',radius:20},1);
  assert(edge.buffs.has('boon'));for(const a of[outside,dead,down,otherLayer,construct,enemy])assert(!a.buffs.size);
  assert.deepEqual(h.trace[0],['tags',false]);
});
test('minion blessings use ownership without ally spatial filters and offering share gets granted tags',()=>{
  const h=setup(),minion=h.make({owner:h.caster,tier:2,downed:true,pos:{x:10000,y:0}}),other=h.make({owner:{}});
  h.runtime.apply(h.caster,h.skill,{...h.buff,affects:'minions'},1,.5);
  assert(minion.buffs.has('boon'));assert(!other.buffs.size);assert.equal(h.caster.buffs.get('boon_shared').def.mods[0].value,1);
  assert(h.trace.some(v=>v[0]==='tags'&&v[1]===true));
});
test('tree captures and follow-up payloads retire by exact caster and host skill identity',()=>{
  const h=setup(),other=h.make(),host={def:{tags:['attack']},tree:true},equal={def:{tags:['attack']},tree:true};
  h.runtime.grant(h.caster,h.caster,host,h.buff,1);
  h.runtime.grant(other,other,equal,h.buff,1);
  assert.notEqual(h.caster.buffs.get('boon').def,h.buff);
  h.runtime.grant(h.caster,other,{def:{tags:['spell']},followUpHost:host},{...h.buff,id:'echo'},1);
  assert.deepEqual(other.gainEvents.at(-1).tags,['attack']);h.runtime.retire(h.caster,host);
  assert(!h.caster.buffs.size);assert(other.buffs.has('boon'));assert(!other.buffs.has('echo'));
});
test('failed presentation retains granted buff and later tree retirement still owns it',()=>{
  const h=setup();h.skill.tree=true;h.ports.arrival=()=>{throw Error('presentation');};
  assert.throws(()=>h.runtime.apply(h.caster,h.skill,h.buff,1),/presentation/);assert(h.caster.buffs.size);
  h.runtime.retire(h.caster,h.skill);assert.equal(h.caster.buffs.size,0);
});
test('buff recipient traversal remains live across grants',()=>{
  const h=setup(),grant=h.ports.grant;let late;
  h.ports.grant=(...args)=>{grant(...args);if(!late)late=h.make();};
  h.runtime.apply(h.caster,h.skill,{...h.buff,affects:'allies',radius:20},1);assert(late.buffs.has('boon'));
});
test('iron ward arms before the buff, caps its bank, clears before burst and preserves original layer',()=>{
  let now=10;const trace=[],actor={pos:{x:1,y:2},team:'ally',tier:5,dead:false,sheet:{get:()=>2}},fx={duration:2,cap:50,ratio:1.5,radius:30,reduce:.2};
  const runtime=new IronWard({time:()=>now,buff:(a,b,d)=>trace.push([a.ironWard.stored,b,d]),burst:(...args)=>{assert.equal(actor.ironWard,undefined);trace.push(args);}});
  runtime.arm(actor,fx,2,3,new Set(),[],'#abc');assert.equal(actor.ironWard.cap,100);assert.equal(actor.ironWard.until,14);
  actor.ironWard.stored=120;now=13;runtime.advance(actor);assert.equal(trace.length,1);now=14;runtime.advance(actor);
  assert.deepEqual(trace[1],[{x:1,y:2},90,150,'physical','#abc','ally',0]);runtime.advance(actor);assert.equal(trace.length,2);
});
test('dead wards expire silently and thrown burst cannot replay the spent bank',()=>{
  const actor={pos:{x:0,y:0},team:'ally',dead:true,ironWard:{until:1,stored:10,cap:10,ratio:1,radius:4}};
  const runtime=new IronWard({time:()=>1,buff(){},burst(){throw Error('burst');}});
  runtime.advance(actor);assert.equal(actor.ironWard,undefined);
  actor.dead=false;actor.ironWard={until:1,stored:10,cap:10,ratio:1,radius:4};assert.throws(()=>runtime.advance(actor),/burst/);
  assert.equal(actor.ironWard,undefined);runtime.advance(actor);
});
