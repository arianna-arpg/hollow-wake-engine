import test from 'node:test';import assert from 'node:assert/strict';
import {AttributeBequests,createAttributeBequestState,bequestStat} from '../dist/attribute-bequests.js';
function fixture(){
 const owner={dead:false,team:'blue',companion:false,attributeValues:{might:10,wit:20},life:100,mana:100},recipient={owner,dead:false,team:'blue',companion:true,life:100,mana:90};
 const sources=new Map(),calls=[],shares={gift:.5},points={might:[{stat:'life',kind:'flat',value:2,tags:['body']}],wit:[{stat:'mana',kind:'flat',value:3}]};
 const ports={registerStat:(id,def)=>calls.push(['stat',id,def]),armed:()=>Object.keys(shares),stat:(_,id)=>shares[id.slice(8)],perPoint:id=>points[id],
  setSource:(a,id,mods)=>{calls.push(['set',a,id]);sources.set(id,mods);},removeSource:(a,id)=>{calls.push(['remove',a,id]);sources.delete(id);},maxLife:()=>60,maxMana:()=>40};
 const state=createAttributeBequestState(),runtime=new AttributeBequests(ports,state),def={id:'gift',name:'Gift',attributes:['might','wit'],recipients:'both'};runtime.register(def);
 return{runtime,ports,state,owner,recipient,sources,calls,shares,points,def};
}
test('bequest registries are independent and replacement preserves registration order',()=>{
 const f=fixture(),other=new AttributeBequests(f.ports);assert.notEqual(f.state,other.state);assert.equal(other.state.ids.length,0);const changed={...f.def,name:'New'};f.runtime.register(changed);assert.deepEqual(f.state.ids,['gift']);assert.equal(f.state.definitions.gift,changed);assert.deepEqual(f.calls.at(-1),['stat','bequest_gift',{label:'New',base:0,min:0,percent:true}]);assert.equal(bequestStat('gift'),'bequest_gift');
});
test('bequests use original attributes once, preserve filters and clamp resources after source write',()=>{
 const f=fixture();f.owner.owner={attributeValues:{might:999}};f.runtime.sync(f.recipient,.5);const mods=f.sources.get('bequest');assert.deepEqual(mods,[{...f.points.might[0],value:5},{...f.points.wit[0],value:15}]);assert.equal(f.recipient.bequestSignature,'gift:might:2.5|gift:wit:5');assert.equal(f.recipient.life,60);assert.equal(f.recipient.mana,40);assert.equal(f.points.might[0].value,2);assert.notEqual(mods[0],f.points.might[0]);
});
test('identical signatures avoid source churn and never refill wounds',()=>{
 const f=fixture();f.runtime.sync(f.recipient);const count=f.calls.length;f.recipient.life=7;f.recipient.mana=8;f.runtime.sync(f.recipient);assert.equal(f.calls.length,count);assert.equal(f.recipient.life,7);assert.equal(f.recipient.mana,8);
});
test('share caps apply before batch scale; negative and zero attribute points contribute nothing',()=>{
 const f=fixture();f.def.maxShare=.25;f.shares.gift=2;f.owner.attributeValues.wit=-2;f.runtime.sync(f.recipient,2);assert.equal(f.sources.get('bequest')[0].value,10);assert.equal(f.sources.get('bequest').length,1);f.shares.gift=-1;f.runtime.sync(f.recipient);assert.equal(f.sources.size,0);assert.equal(f.recipient.bequestSignature,undefined);
});
test('recipient kind filters distinguish companions and ordinary minions',()=>{
 const f=fixture();f.def.recipients='minions';f.runtime.sync(f.recipient);assert.equal(f.sources.size,0);f.recipient.companion=false;f.runtime.sync(f.recipient);assert(f.sources.has('bequest'));f.def.recipients='companions';f.runtime.sync(f.recipient);assert.equal(f.sources.size,0);
});
test('death, team mismatch, missing attributes and absent owner clear previous inheritance',()=>{
 for(const mutate of [f=>f.owner.dead=true,f=>f.recipient.team='red',f=>delete f.owner.attributeValues,f=>delete f.recipient.owner]){
  const f=fixture();f.runtime.sync(f.recipient);mutate(f);f.runtime.sync(f.recipient);assert.equal(f.sources.size,0);assert.equal(f.recipient.bequestSignature,undefined);
 }
});
test('empty unarmed recipients avoid all source and resource work; lost grants clear old signature',()=>{
 const f=fixture();delete f.shares.gift;const n=f.calls.length;f.runtime.sync(f.recipient);assert.equal(f.calls.length,n);assert.equal(f.recipient.life,100);f.shares.gift=.5;f.runtime.sync(f.recipient);delete f.shares.gift;f.runtime.sync(f.recipient);assert.equal(f.sources.size,0);
});
test('explicit tags and support-local extras reach the host unchanged',()=>{
 const f=fixture(),tags=new Set(['hound']),extra=[{stat:'gift',value:1}];f.ports.armed=(a,prefix,ids,m)=>{assert.equal(a,f.owner);assert.equal(prefix,'bequest_');assert.equal(ids,f.state.ids);assert.equal(m,extra);return ['gift'];};
 f.ports.stat=(a,id,t,m)=>{assert.equal(a,f.owner);assert.equal(id,'bequest_gift');assert.equal(t,tags);assert.equal(m,extra);return .5;};f.runtime.sync(f.recipient,1,tags,extra);assert(f.sources.has('bequest'));
});
test('host source failures preserve signature write and do not clamp resources afterward',()=>{
 const f=fixture();f.ports.setSource=()=>{throw Error('source rejected');};assert.throws(()=>f.runtime.sync(f.recipient),/source rejected/);assert.equal(f.recipient.bequestSignature,'gift:might:5|gift:wit:10');assert.equal(f.recipient.life,100);assert.equal(f.recipient.mana,90);
});
