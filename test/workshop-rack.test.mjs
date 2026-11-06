import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ItemContent} from '../dist/item-rules.js';
import {CraftingContent} from '../dist/crafting-content.js';
import {SkillProgression} from '../dist/skill-progression.js';
import {CraftingSession} from '../dist/crafting-session.js';
import {WorkshopRack} from '@hollow-wake/engine/skills/workshop-rack';
import {itemPack} from '../scripts/compile-item-content.mjs';
import {craftingPack} from '../scripts/compile-crafting-content.mjs';
import {skillProgressionPack} from '../scripts/compile-skill-progression.mjs';

const items=new ItemContent(itemPack());
const defs={crafting:new CraftingContent(craftingPack(items),items),skills:new SkillProgression(skillProgressionPack()),
  memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}};
const sample=JSON.parse(fs.readFileSync(new URL('../examples/godot-inventory/cargo-sample.json',import.meta.url)));
const fire=sample.find(i=>i.gem?.kind==='skill');
const state=()=>({board:{w:2,h:2},items:structuredClone(sample),equipped:{},overflow:[],essences:{},
  account:{craftLore:{},ledger:{},features:[],progression:true}});
const workshop=()=>new CraftingSession(defs,2,new WorkshopRack());

test('account reuse reserves every UTF-8 byte for restore and rolls an oversized removal back',()=>{
  const seed=workshop();open(seed);assert(learn(seed).result.changed);
  const full=saved(seed),features=full.state.account.features;
  const envelope={op:'restore',profile:0xffffffff,save:full};
  const budget=512*1024, prefix='界'.repeat(490);
  let remaining=budget-Buffer.byteLength(JSON.stringify(envelope));
  while(remaining>1600){
    const feature=prefix+features.length;
    remaining-=Buffer.byteLength(JSON.stringify(feature))+(features.length?1:0);
    features.push(feature);
  }
  while(remaining>12){
    const feature='界'.repeat(Math.min(500,Math.floor((remaining-6)/3)))+'x';
    features.push(feature);remaining-=Buffer.byteLength(JSON.stringify(feature))+1;
  }
  assert(Buffer.byteLength(JSON.stringify(envelope))<=budget&&remaining<=12);
  const sdk=workshop();assert(go(sdk,'restore',{save:full}).ok);
  assert.deepEqual(unlearn(sdk),{ok:false,reason:'json-byte-limit'});
  assert.deepEqual(saved(sdk),full);
  full.state.account.features.pop();
  assert.notDeepEqual(saved(sdk).state.account.features,full.state.account.features);
});

test('a retained rack draft cannot change a committed profile after a move',()=>{
  let held;
  class ObservedRack extends WorkshopRack {
    move(request,state,...ports){
      held=state;
      state.account.ledger.learned=(state.account.ledger.learned??0)+1;
      return super.move(request,state,...ports);
    }
  }
  const sdk=new CraftingSession(defs,1,new ObservedRack());open(sdk);assert(learn(sdk).result.changed);
  const before=saved(sdk);
  assert.equal(before.state.account.ledger.learned,1);
  assert(Object.isFrozen(held.account.features));
  held.rack[0].gem.level=1;held.items.length=0;
  assert.deepEqual(saved(sdk),before);
});

test('direct storage text matches the portable save before and after a refused mint',()=>{
  const sdk=workshop(),s=state();
  s.rack=[{gem:structuredClone(fire.gem)},...Array(7).fill(null)];
  s.account.ledger=JSON.parse('{"__proto__":4,"~f0042":2}');
  assert.equal(sdk.snapshotText(1).reason,'not-open');
  assert.equal(sdk.snapshotText(1.5).reason,'invalid-integer');
  open(sdk,s);
  const bytes=()=>sdk.snapshotText(1).text;
  assert.equal(bytes(),JSON.stringify(saved(sdk)));
  const original=bytes();
  assert.equal(unlearn(sdk).result.refusal,'no room in the bag');
  assert.notEqual(bytes(),original);assert.equal(bytes(),JSON.stringify(saved(sdk)));
  assert(go(sdk,'close').ok);assert.equal(sdk.snapshotText(1).reason,'not-open');
});
const go=(sdk,op,args={})=>JSON.parse(JSON.stringify(sdk.command({op,profile:1,...args})));
const saved=sdk=>go(sdk,'save').save;
const learn=(sdk,args={})=>go(sdk,'learn-skill',{uid:fire.uid,meets:true,blocked:{},...args});
const unlearn=(sdk,args={})=>go(sdk,'unlearn-skill',{skillId:'firebolt',blocked:{},...args});
const open=(sdk,s=state())=>assert.deepEqual(go(sdk,'open',{seed:7,state:s}),{ok:true});

test('old saves upgrade on learning, reopen with the same locks, rolls and seat, and mint once on return',()=>{
  const sdk=workshop();open(sdk);
  const old=saved(sdk);assert.equal(old.schemaVersion,1);
  assert.deepEqual(learn(sdk,{meets:false}).result,{changed:false,needsSave:false,refusal:'requirements unmet'});
  assert.deepEqual(saved(sdk),old);
  assert.deepEqual(learn(sdk,{slot:5}).result,{changed:true,needsSave:true});
  const next=saved(sdk);assert.equal(next.schemaVersion,2);assert.equal(next.state.rack.length,8);
  assert.deepEqual(next.state.rack[5].gem,fire.gem);assert.equal(next.nextUid,old.nextUid);
  const base=new CraftingSession(defs);assert.equal(go(base,'restore',{save:next}).reason,'rack-unavailable');
  assert.deepEqual(go(base,'restore',{save:old}),{ok:true});
  const other=workshop();assert.deepEqual(go(other,'restore',{save:next}),{ok:true});assert.deepEqual(saved(other),next);
  assert.equal(unlearn(other,{blocked:{firebolt:'field discipline'}}).result.refusal,'field discipline');
  assert.deepEqual(saved(other),next);
  assert.equal(unlearn(other).result.changed,true);
  const finish=saved(other);assert.equal(finish.state.rack.every(s=>s===null),true);
  const wrapper=finish.state.items.find(i=>i.uid===old.nextUid);
  assert.deepEqual(wrapper.gem,fire.gem);assert.equal(wrapper.locked,fire.locked);
  assert.deepEqual(finish.random,old.random);assert.equal(finish.nextUid,old.nextUid+1);
});

test('masked full bag preserves consumed IDs and bag order on source-observed refusals',()=>{
  const sdk=workshop(),s=state(),second=defs.skills.pack.skills.find(r=>r.id!=='firebolt').id;
  const row=id=>({gem:{kind:'skill',skillId:id,level:1,rarity:'common',sockets:[null]}});
  s.rack=[row('firebolt'),row(second),...Array(6).fill(null)];
  s.board={w:3,h:2,rows:['##.','##.']};open(sdk,s);
  const before=saved(sdk);
  assert.deepEqual(learn(sdk,{slot:1,blocked:{firebolt:'debt'}}).result,{changed:false,needsSave:false,refusal:'debt'});
  assert.deepEqual(saved(sdk),before);
  assert.deepEqual(learn(sdk,{slot:1}).result,{changed:false,needsSave:true,refusal:'no room in the bag'});
  const reordered=saved(sdk);assert.deepEqual(reordered.state.items.at(-1),fire);
  assert.equal(reordered.nextUid,before.nextUid);assert.deepEqual(before.state.rack,reordered.state.rack);
  assert.equal(learn(sdk,{slot:1}).result.needsSave,false);
  assert.deepEqual(unlearn(sdk).result,{changed:false,needsSave:true,refusal:'no room in the bag'});
  assert.equal(saved(sdk).nextUid,before.nextUid+1);assert.deepEqual(saved(sdk).state,reordered.state);
  // Two departing copies can now land, sitter first.
  s.items.pop();const room=workshop();open(room,s);
  assert.equal(learn(room,{slot:1}).result.changed,true);
  const after=saved(room);assert.equal(after.state.rack[0],null);assert.deepEqual(after.state.rack[1].gem,fire.gem);
  assert.deepEqual(after.state.items.slice(-2).map(i=>i.gem.skillId),[second,'firebolt']);
});

test('malformed, truncated and cross-version learned data refuse without occupying a profile',()=>{
  const sdk=workshop();open(sdk);learn(sdk);
  const good=saved(sdk);
  for(const corrupt of [s=>s.state.rack.pop(),s=>s.state.rack[1]=s.state.rack[0],s=>s.state.rack[0].uid=1,
    s=>s.state.rack[0].locked=false,s=>s.state.rack[0].gem.sockets[0].supportId='missing',s=>delete s.state.rack,
    s=>s.schemaVersion=1,s=>s.capability='crafting-session/v1']){
    const bad=structuredClone(good);corrupt(bad);
    const clean=workshop();assert.equal(go(clean,'restore',{save:bad}).ok,false);
    assert.deepEqual(go(clean,'restore',{save:good}),{ok:true});
  }
});
