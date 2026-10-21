import test from 'node:test';import assert from 'node:assert/strict';import {SupportActions} from '../dist/support-actions.js';
function setup(){
 const events=[],gem={id:'gem',level:3,rolled:{axis:'row'},locked:true},item={uid:1,gem},skill={def:{id:'skill'},sockets:[null,null]},stored={skillId:'stored',sockets:[gem]},seat={items:[item],known:new Map([['skill',skill]]),granted:new Map(),full:false,refusal:null};
 const ports={bagItem:(s,uid)=>s.items.find(i=>i.uid===uid),support:i=>i.gem,known:(s,id)=>s.known.get(id),granted:(s,id)=>s.granted.get(id),fits:()=>true,
  refusal:s=>s.refusal,fail:(_s,key,reason)=>events.push(['fail',key,reason]),remove:(s,uid)=>{events.push(['remove',skill.sockets[0]===gem]);s.items.splice(s.items.findIndex(i=>i.uid===uid),1);},
  give:(s,g)=>{events.push(['give',skill.sockets.includes(g),stored.sockets.includes(g)]);if(s.full)return false;s.items.push({uid:2,gem:g});events.push(['give-dirty']);return true;},
  recalculate:s=>events.push(['recalculate',s.items.length,skill.sockets.map(Boolean)]),resync:i=>events.push(['resync',i===skill]),dirty:()=>events.push(['dirty']),
  stored:i=>i.payload,storedSupport:(i,index)=>i.payload?.sockets[index],
 };
 return {events,gem,item,skill,stored,seat,ports,make:()=>new SupportActions(ports)};
}
test('socket commit retains gem identity and completes removal, rebuild, creature sync and dirty notification in order',()=>{
 const f=setup(),actions=f.make();assert.equal(actions.socket(f.seat,1,'skill'),true);assert.equal(f.skill.sockets[0],f.gem);assert.equal(f.seat.items.length,0);
 assert.deepEqual(f.events,[['remove',true],['recalculate',0,[true,false]],['resync',true],['dirty']]);assert.equal(actions.socket(f.seat,1,'skill'),false);
});
test('unsocket refuses a full bag before clearing custody, then performs the original notification order',()=>{
 const f=setup(),actions=f.make();f.skill.sockets[1]=f.gem;f.seat.items=[];f.seat.full=true;
 assert.equal(actions.unsocket(f.seat,'skill',1),false);assert.equal(f.skill.sockets[1],f.gem);assert.deepEqual(f.events,[['give',true,true]]);
 f.seat.full=false;f.events.length=0;assert.equal(actions.unsocket(f.seat,'skill',1),true);assert.equal(f.seat.items[0].gem,f.gem);assert.equal(f.skill.sockets[1],null);
 assert.deepEqual(f.events,[['give',true,true],['give-dirty'],['recalculate',1,[false,false]],['resync',true]]);
});
test('known skills take precedence over granted skills and granted-only supports remain actionable',()=>{
 const f=setup(),other={def:{id:'skill'},sockets:[null]};f.seat.granted.set('skill',other);const actions=f.make();assert(actions.socket(f.seat,1,'skill'));assert.equal(other.sockets[0],null);
 f.skill.sockets[0]=null;f.seat.items=[f.item];f.seat.known.clear();assert(actions.socket(f.seat,1,'skill'));assert.equal(other.sockets[0],f.gem);
});
test('compatibility, occupancy and discipline refuse without custody changes',()=>{
 const f=setup();let fits=false;f.ports.fits=()=>fits;const actions=f.make(),before=JSON.stringify(f.seat.items);
 assert.equal(actions.socket(f.seat,1,'skill'),false);fits=true;f.skill.sockets.fill(f.gem);assert.equal(actions.socket(f.seat,1,'skill'),false);
 f.skill.sockets.fill(null);f.seat.refusal='hot';assert.equal(actions.socket(f.seat,1,'skill'),false);assert.deepEqual(f.events,[['fail','skill:discipline','hot']]);assert.equal(JSON.stringify(f.seat.items),before);
 f.skill.sockets[0]=f.gem;assert.equal(actions.unsocket(f.seat,'skill',0),false);assert.equal(f.skill.sockets[0],f.gem);
});
test('stored-skill cargo returns before its saved socket is cleared, without an actor rebuild',()=>{
 const f=setup();f.item.payload=f.stored;delete f.item.gem;const actions=f.make();assert(actions.unsocketStored(f.seat,1,0));assert.equal(f.stored.sockets[0],null);assert.equal(f.seat.items[1].gem,f.gem);
 assert.deepEqual(f.events,[['give',false,true],['give-dirty'],['dirty']]);assert.equal(actions.unsocketStored(f.seat,1,0),false);
});
test('malformed addresses refuse before ports and independent hosts never share a busy flag',()=>{
 const f=setup();let reads=0;f.ports.bagItem=()=>{reads++;throw new Error('unexpected read');};const a=f.make();
 for(const n of [-1,NaN,Infinity,.5,Number.MAX_SAFE_INTEGER+1]){assert.equal(a.socket(f.seat,n,'skill'),false);assert.equal(a.unsocket(f.seat,'skill',n),false);assert.equal(a.unsocketStored(f.seat,1,n),false);}
 assert.equal(reads,0);const b=setup();assert(b.make().socket(b.seat,1,'skill'));
});
test('ports bind once and action reentry is rejected before mutation',()=>{
 const f=setup();let actions;f.ports.fits=()=>{assert.throws(()=>actions.socket(f.seat,1,'skill'),/Reentrant/);return true;};actions=f.make();f.ports.remove=()=>{throw new Error('replacement invoked');};
 assert(actions.socket(f.seat,1,'skill'));assert.equal(f.seat.items.length,0);assert.equal(actions.unsocket(f.seat,'unknown',0),false);
 assert.throws(()=>new SupportActions({...f.ports,give:undefined}),/give port/);
});
