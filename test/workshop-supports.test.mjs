import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CraftingSession} from '@hollow-wake/engine/crafting/session';
import {WorkshopRack} from '@hollow-wake/engine/skills/workshop-rack';
import {WorkshopSupports} from '@hollow-wake/engine/skills/workshop-supports';
import {ItemContent} from '@hollow-wake/engine/items';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {itemPack} from '../scripts/compile-item-content.mjs';
import {craftingPack} from '../scripts/compile-crafting-content.mjs';
import {skillProgressionPack} from '../scripts/compile-skill-progression.mjs';

const items=new ItemContent(itemPack()),defs={crafting:new CraftingContent(craftingPack(items),items),
  skills:new SkillProgression(skillProgressionPack()),memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}};
const sample=JSON.parse(fs.readFileSync(new URL('../examples/godot-inventory/cargo-sample.json',import.meta.url)));
const rolled={trigger:'chance',brood:'grubs',clutch:'brood4'};
function start(rack=new WorkshopSupports()){
  const sdk=new CraftingSession(defs,1,rack);
  const cmd=(op,args={})=>JSON.parse(JSON.stringify(sdk.command({op,profile:1,...args})));
  const bag=structuredClone(sample),skill=bag.find(r=>r.gem?.kind==='skill'),support=bag.find(r=>r.gem?.kind==='support');
  skill.gem.sockets=[null,{supportId:'teeming_vein',level:2,rolled,locked:true},null,null];
  support.gem={kind:'support',supportId:'teeming_vein',level:2,rolled};support.locked=true;
  const state={board:{w:3,h:2,rows:['##.','##.']},items:bag,equipped:{},overflow:[],essences:{},account:{craftLore:{},ledger:{},features:[],progression:true}};
  assert(cmd('open',{state,seed:17}).ok);const save=()=>cmd('save').save;
  return {cmd,save,skill,support};
}
const pry={skillId:'firebolt',index:1,supportId:'teeming_vein',hold:null};
test('stored socket removal preserves payload, refuses before custody transfer, and persists the consumed ID',()=>{
  const {cmd,save,skill}=start();const before=save(),args={...pry,uid:skill.uid};
  for(const change of [{hold:'field discipline'},{index:0},{supportId:'multistrike'},{skillId:'retired'}]){
    assert.equal(cmd('unsocket-support',{...args,...change}).result.needsSave,false);assert.deepEqual(save(),before);
  }
  const full=cmd('unsocket-support',args);assert.deepEqual(full.result,{changed:false,needsSave:true,refusal:'inventory full'});assert.deepEqual(full.events,[]);
  const after=save();assert.equal(after.nextUid,before.nextUid+1);assert.deepEqual(after.state,before.state);assert.deepEqual(after.random,before.random);
  cmd('close');assert(cmd('restore',{save:after}).ok);
  const access={salvage:false,bench:false,oracle:false,counter:true};assert(cmd('salvage',{uid:sample[0].uid,access,lane:'sell'}).ok);
  const returned=cmd('unsocket-support',args);assert(returned.result.changed);assert.deepEqual(returned.events,[{kind:'dirty'},{kind:'dirty'}]);
  const end=save();assert.equal(end.schemaVersion,1);assert.equal(end.state.items.find(i=>i.uid===skill.uid).gem.sockets[1],null);
  const loose=end.state.items.at(-1);assert.equal(loose.uid,after.nextUid);assert.equal(loose.locked,true);
  assert.deepEqual(loose.gem,{kind:'support',supportId:'teeming_vein',level:2,rolled});assert.deepEqual(end.state.overflow,[]);
});
test('installation uses the first vacancy after admission, respects holds, and removes only the selected copy',()=>{
  const {cmd,save,skill,support}=start();assert(cmd('learn-skill',{uid:skill.uid,slot:6,meets:true,blocked:{}}).result.changed);
  const before=save(),args={skillId:'firebolt',uid:support.uid,hold:null,fits:true};
  for(const change of [{fits:false},{hold:'discipline'},{skillId:'unknown'}]){
    assert.equal(cmd('socket-support',{...args,...change}).result.needsSave,false);assert.deepEqual(save(),before);
  }
  const set=cmd('socket-support',args);assert.deepEqual(set.events,[{kind:'recalculate'},{kind:'resync-supports',skillId:'firebolt'},{kind:'dirty'}]);assert.equal(set.nextUid,before.nextUid);
  const loaded=save();assert.deepEqual(loaded.state.rack[6].gem.sockets.slice(0,2),[skill.gem.sockets[1],skill.gem.sockets[1]]);
  cmd('close');assert(cmd('restore',{save:loaded}).ok);
  const out=cmd('unsocket-support',pry);assert.deepEqual(out.events,[{kind:'dirty'},{kind:'recalculate'},{kind:'resync-supports',skillId:'firebolt'}]);
  const end=save();assert.deepEqual(end.state.rack[6].gem.sockets,[skill.gem.sockets[1],null,null,null]);assert.equal(end.state.items.at(-1).uid,before.nextUid);
  assert.deepEqual(end.random,before.random);
});
test('rack-only consumers refuse socket commands and malformed input cannot consume an ID',()=>{
  const plain=start(new WorkshopRack());assert.equal(plain.cmd('unsocket-support',pry).reason,'unknown-operation');
  const {cmd,save,skill}=start(),before=save();for(const index of [-1,1024,.5]){
    assert.equal(cmd('unsocket-support',{...pry,uid:skill.uid,index}).reason,'invalid-integer');
  }
  const high=save();high.nextUid=Number.MAX_SAFE_INTEGER;cmd('close');assert(cmd('restore',{save:high}).ok);
  assert.equal(cmd('unsocket-support',{...pry,uid:skill.uid}).reason,'uid-exhausted');assert.deepEqual(save(),high);
  assert.deepEqual(before.state,high.state);
});
