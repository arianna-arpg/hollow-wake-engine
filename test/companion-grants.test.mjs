// Independent lifecycle, identity, ordering and callback-failure contracts.
import test from 'node:test';import assert from 'node:assert/strict';
import {CompanionGrants,companionReservationUnit} from '../dist/companion-grants.js';
const definition=(id='golem')=>({id,max:8,delivery:{type:'summon',persistent:{reserve:10,respawnTime:8},poolGroup:'shared',exclusiveGroup:'major',count:3,maxActive:7,position:{x:1,y:2,z:3}}});
function setup(){
 const events=[],owner={dead:false,downed:false,level:3.75,scale:2},state={},def=definition();let serial=0,source='first',key='key';
 const runtime=new CompanionGrants({summon:d=>d.delivery.type==='summon'?d.delivery:undefined,
  maxLevel:d=>{events.push('max');return d.max;},grantedLevel:o=>{events.push('level');return o.level;},
  makeSkill:(d,level,sockets)=>{events.push('make');assert.equal(sockets,0);return {id:++serial,def:d,level};},
  respawnScale:o=>{events.push('scale');return o.scale;}});
 const retire=body=>{events.push(['retire',body.id]);body.dead=true;};
 const refresh=(body,inst)=>events.push(['refresh',body.id,inst.level,inst.grantedBy,inst.relicSource]);
 const derive=(defs=[def],extra={})=>runtime.derive(state,owner,defs,()=>{events.push('source');return source;},extra.retire??retire,extra.refresh??refresh,()=>{events.push('relic');return key;});
 const contains=body=>{events.push(['contains',body.id]);return body.present;};
 const spawn=(inst,d)=>{events.push(['spawn',inst.id,d]);return {id:++serial,dead:false,present:true};};
 const update=(dt=0,extra={})=>runtime.update(state,owner,dt,extra.contains??contains,extra.spawn??spawn,extra.retire??retire);
 return {runtime,owner,state,def,events,derive,update,setSource:(s,k)=>{source=s;key=k;},row:()=>state.grants?.get(def.id)};
}
test('cold admission uses ordered caps and floors, zero sockets, and source provenance',()=>{
 const h=setup();h.derive();assert.deepEqual(h.events,['max','level','make','relic','source']);
 assert.equal(h.row().inst.level,3);assert.equal(h.row().inst.companionGrant,true);assert.equal(h.row().inst.relicSource,'key');
 h.owner.level=100;h.derive();assert.equal(h.row().inst.level,8);h.owner.level=.99;h.derive();assert.equal(h.state.grants,undefined);
});
test('warm derivation retains the skill and living body and refreshes before source-name replacement',()=>{
 const h=setup();h.derive();h.update();const row=h.row(),inst=row.inst,body=row.body;
 h.events.length=0;h.owner.level=6.5;h.setSource('second',undefined);h.derive();
 assert.equal(h.row(),row);assert.equal(row.inst,inst);assert.equal(row.body,body);
 assert.deepEqual(h.events,['max','level','relic',['refresh',body.id,6,'first',undefined],'source']);assert.equal(inst.grantedBy,'second');
 const replacement={...h.def,max:2};h.derive([replacement]);assert.equal(inst.def,h.def);assert.equal(inst.level,2);
});
test('removal retires only living bodies and publishes the replacement map after callbacks',()=>{
 const h=setup(),other=definition('other');h.derive([h.def,other]);h.update();const prior=h.state.grants;
 const dead=prior.get('other').body;dead.dead=true;const live=h.row().body;
 h.derive([],{retire:body=>{assert.equal(h.state.grants,prior);assert.equal(body,live);body.dead=true;}});
 assert.equal(h.state.grants,undefined);assert.equal(dead.dead,true);assert.equal(live.dead,true);
});
test('failed warm refresh retains preceding row writes without publishing a new map',()=>{
 const h=setup();h.derive();h.update();const prior=h.state.grants,row=h.row();h.owner.level=5;h.setSource('later','new-key');
 assert.throws(()=>h.derive([h.def,definition('new')],{refresh:()=>{throw Error('refresh failed');}}),/refresh failed/);
 assert.equal(h.state.grants,prior);assert.equal(row.inst.level,5);assert.equal(row.inst.relicSource,'new-key');assert.equal(row.inst.grantedBy,'first');
 h.derive();assert.equal(h.row(),row);assert.equal(row.inst.grantedBy,'later');
});
test('owner death retires once and resets unscaled authored delay without presence or scale queries',()=>{
 const h=setup();h.derive();h.update();const body=h.row().body;h.owner.dead=true;h.owner.downed=true;h.events.length=0;
 h.update(100);assert.deepEqual(h.events,[['retire',body.id]]);assert.equal(h.row().body,undefined);assert.equal(h.row().remaining,8);
 h.events.length=0;h.update(100);assert.deepEqual(h.events,[]);assert.equal(h.row().remaining,8);
 h.owner.dead=false;h.owner.downed=false;h.update(1);assert.equal(h.row().remaining,7);
});
test('body death scales its timer once and spawns exactly at the elapsed threshold',()=>{
 const h=setup();h.derive();h.update();h.row().body.dead=true;h.events.length=0;h.update(1);
 assert.deepEqual(h.events,['scale']);assert.equal(h.row().remaining,15);assert.equal(h.row().body,undefined);
 h.update(14.75);assert.equal(h.row().remaining,.25);assert.equal(h.row().body,undefined);h.update(.25);assert(h.row().body);assert.equal(h.row().remaining,0);
});
test('downed owners pause timers after detecting dead or missing bodies',()=>{
 const h=setup();h.derive();h.update();h.row().body.dead=true;h.owner.downed=true;h.update(100);assert.equal(h.row().remaining,16);
 h.update(100);assert.equal(h.row().remaining,16);h.owner.downed=false;h.update(16);const body=h.row().body;
 h.owner.downed=true;body.present=false;h.update(100);assert.equal(h.row().body,undefined);assert.equal(h.row().remaining,0);
 h.owner.downed=false;h.update(0);assert(h.row().body);
});
test('presence remains a lazy live observation and missing bodies do not reset an existing timer',()=>{
 const h=setup();h.derive();h.update();const row=h.row();row.remaining=3;
 h.update(100,{contains:()=>{h.owner.downed=true;return false;}});assert.equal(row.body,undefined);assert.equal(row.remaining,3);
 h.owner.downed=false;h.update(2);assert.equal(row.remaining,1);h.update(1);assert(row.body);
});
test('spawn overrides are detached while unrelated delivery fields and nested references survive',()=>{
 const h=setup(),before=JSON.stringify(h.def.delivery);h.derive();let passed;
 h.update(0,{spawn:(_inst,d)=>{passed=d;return null;}});assert.notEqual(passed,h.def.delivery);
 assert.equal(passed.position,h.def.delivery.position);assert.equal(passed.count,1);assert.equal(passed.maxActive,1);
 for(const key of ['persistent','poolGroup','exclusiveGroup']){assert(Object.hasOwn(passed,key));assert.equal(passed[key],undefined);}
 assert.equal(JSON.stringify(h.def.delivery),before);assert.equal(h.row().body,undefined);assert.equal(h.row().remaining,0);
 h.update(0);assert(h.row().body);
});
test('separate owner state can share one runtime without sharing grants or bodies',()=>{
 const a=setup(),state={},owner={dead:false,downed:false,level:2,scale:1};a.derive();a.update();
 a.runtime.derive(state,owner,[a.def],()=>'',()=>{},()=>{});assert.notEqual(state.grants,a.state.grants);assert.notEqual(state.grants.get(a.def.id).inst,a.row().inst);
 a.derive([]);assert.equal(state.grants.size,1);assert.equal(state.grants.get(a.def.id).inst.level,2);
});
test('duplicate definitions retain source behavior for cold construction and warm refreshes',()=>{
 const h=setup();h.derive([h.def,h.def]);assert.equal(h.events.filter(e=>e==='make').length,2);assert.equal(h.state.grants.size,1);
 h.update();const row=h.row();h.events.length=0;h.derive([h.def,h.def]);assert.equal(h.row(),row);
 assert.equal(h.events.filter(e=>Array.isArray(e)&&e[0]==='refresh').length,2);assert(!h.events.includes('make'));
});
test('update callback failures preserve completed writes and remain retryable',()=>{
 const h=setup();h.derive();assert.throws(()=>h.update(0,{spawn:()=>{throw Error('spawn failed');}}),/spawn failed/);
 assert.equal(h.row().remaining,0);assert.equal(h.row().body,undefined);h.update();const body=h.row().body;h.owner.dead=true;
 assert.throws(()=>h.update(0,{retire:()=>{throw Error('retire failed');}}),/retire failed/);assert.equal(h.row().body,body);
 h.update();assert.equal(h.row().body,undefined);assert.equal(h.row().remaining,8);
});
test('changed nonpersistent delivery is skipped by updates but removed by derivation',()=>{
 const h=setup();h.derive();h.update();const body=h.row().body;h.def.delivery={type:'projectile'};h.owner.dead=true;h.events.length=0;
 h.update(100);assert.deepEqual(h.events,[]);assert.equal(h.row().body,body);h.derive();assert.equal(h.state.grants,undefined);assert.equal(body.dead,true);
});
test('reservation captures tags and modifiers once and preserves both live queries even at zero base',()=>{
 const actor={},inst={},tags=new Set(['summon']),mods=[{value:2}],d={persistent:{reserve:3}},events=[];
 const ports={tags:i=>{assert.equal(i,inst);events.push('tags');d.persistent.reserve=5;return tags;},
  modifiers:i=>{assert.equal(i,inst);events.push('mods');d.persistent.reserve=10;return mods;},
  manaCost:(a,t,m)=>{assert.equal(a,actor);assert.equal(t,tags);assert.equal(m,mods);events.push('mana');d.persistent.reserve=100;return 2;},
  reservationMultiplier:(a,i,t,m)=>{assert.equal(a,actor);assert.equal(i,inst);assert.equal(t,tags);assert.equal(m,mods);events.push('reserve');return 3;}};
 assert.equal(companionReservationUnit(actor,inst,d,ports),60);assert.deepEqual(events,['tags','mods','mana','reserve']);events.length=0;
 assert.equal(companionReservationUnit(actor,inst,{},ports),0);assert.deepEqual(events,['tags','mods','mana','reserve']);
});
