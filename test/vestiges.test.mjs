import test from 'node:test';
import assert from 'node:assert/strict';
import pack from '@hollow-wake/engine/content/vestiges.json' with {type:'json'};
import {VestigeCatalogue} from '@hollow-wake/engine/items/vestiges/catalogue';
import {VestigeInlays} from '@hollow-wake/engine/items/vestiges';
const catalogue=new VestigeCatalogue(pack);
const actions=new VestigeInlays({vestige:id=>catalogue.vestige(id),word:(i,s)=>catalogue.word(i.rarity,i.category,s)});
function setup(){
  const item={uid:4294967301,baseId:'gloves_armor',category:'gloves',name:'gloves',rarity:'common',sockets:['sylph',null]};
  return {item,owner:{items:[],equipped:{hands:item},vestiges:{sylph:2,thal:1}}};
}
test('whole-item inlay uses the first empty socket and refuses a full word without consuming',()=>{
  const {owner,item}=setup();const before=structuredClone(owner);
  const preview=actions.preview(owner,item.uid,undefined,'sylph');
  assert.equal(preview.epitaph,'wuthering');assert.deepEqual(owner,before);
  const events=[];
  actions.inlay(owner,item.uid,undefined,'sylph',{inlaid:()=>events.push('inlaid'),awakened:w=>events.push(w.id),
    recalculate:()=>events.push('recalculate'),dirty:()=>events.push('dirty')});
  assert.deepEqual(events,['inlaid','wuthering','recalculate','dirty']);
  assert.equal(actions.inlay(owner,item.uid,undefined,'thal').reason,'sockets-full');assert.equal(owner.vestiges.thal,1);
});
test('aimed replacement consumes one, never refunds, and can reactivate the same word',()=>{
  const {owner,item}=setup();item.sockets[1]='sylph';const events=[];
  const result=actions.inlay(owner,item.uid,0,'sylph',{crumbled:id=>events.push(id),inlaid:def=>events.push(def.id),awakened:w=>events.push(w.id)});
  assert.equal(result.replaced,'sylph');assert.equal(owner.vestiges.sylph,1);
  assert.deepEqual(events,['sylph','sylph','wuthering']);
});
test('cue interruption leaves the committed debit and socket visible; the word uses the live item',()=>{
  const {owner,item}=setup();
  assert.throws(()=>actions.inlay(owner,item.uid,0,'thal',{crumbled:()=>{throw Error('stopped');}}),/stopped/);
  assert.equal(owner.vestiges.thal,0);assert.equal(item.sockets[0],'thal');
  const result=actions.inlay(owner,item.uid,1,'sylph',{inlaid:()=>{item.sockets=['sylph','sylph'];}});
  assert.equal(result.epitaph,'wuthering');
});
test('ordinary bag edits, grant overflow and invalid requests keep other owners isolated',()=>{
  const {owner,item}=setup();owner.items=[item];owner.equipped={};delete owner.vestiges;
  assert.equal(actions.inlay(owner,item.uid,0,'sylph').reason,'missing-material');
  assert.equal(actions.grant(owner,'bad',1).changed,false);assert(!Object.hasOwn(owner,'vestiges'));
  actions.grant(owner,'sylph',1);assert.equal(actions.inlay(owner,item.uid,.5,'sylph').changed,false);
  assert.equal(actions.inlay(owner,item.uid,1,'sylph',{recalculate:()=>assert.fail()}).epitaph,'wuthering');
  owner.vestiges.thal=Number.MAX_SAFE_INTEGER;assert.equal(actions.grant(owner,'thal',1).changed,false);
});
test('catalogue preserves category overrides, white-only order and foreign-reference checks',()=>{
  const data=structuredClone(pack),c=new VestigeCatalogue(data);data.vestiges[0].name='edited';
  assert.notEqual(c.vestige(data.vestiges[0].id).name,'edited');
  for(const rarity of ['magic','rare','unique'])assert.equal(c.word(rarity,'gloves',['sylph','sylph']),undefined);
  assert.equal(c.word('common','gloves',['sylph','sylph',null]),undefined);
  assert.deepEqual(c.modifiers('rare','chest',['kessa']),[{stat:'life',kind:'flat',value:25}]);
  data.epitaphs[0].sequence=['missing'];assert.throws(()=>new VestigeCatalogue(data));
});
