import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {CraftingSession} from '../dist/crafting-session.js';
import {CraftingContent} from '../dist/crafting-content.js';
import {ItemContent} from '../dist/item-rules.js';
import {SkillProgression} from '../dist/skill-progression.js';
import {EquipmentSlots} from '../dist/equipment-actions.js';
import {itemPack,equipmentPack} from '../scripts/compile-item-content.mjs';
import {craftingPack} from '../scripts/compile-crafting-content.mjs';
import {skillProgressionPack} from '../scripts/compile-skill-progression.mjs';
import {sha256} from '../scripts/reference-utils.mjs';

const fixtureBytes=fs.readFileSync(new URL('../baseline/live-equipment/v2/observations.json.gz',import.meta.url));
const receipt=JSON.parse(fs.readFileSync(new URL('../baseline/live-equipment/v2/acceptance.json',import.meta.url)));
assert.equal(sha256(fixtureBytes),receipt.gzipSha256);
const fixture=JSON.parse(gunzipSync(fixtureBytes));
const items=new ItemContent(itemPack()),crafting=new CraftingContent(craftingPack(items),items);
const definitions={crafting,skills:new SkillProgression(skillProgressionPack()),
 memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}};
const slots=new EquipmentSlots(equipmentPack());
const copy=value=>JSON.parse(JSON.stringify(value));
function open(row){
 const session=new CraftingSession(definitions);session.configureEquipment(slots);
 const state={board:{w:16,h:16},items:copy(row.initialItems),overflow:[],equipped:{},essences:{},
  account:{features:[],ledger:{},craftLore:{},progression:true}};
 assert(session.command({op:'open',profile:1,seed:17,state}).ok);return session;
}
const saved=session=>copy(session.command({op:'save',profile:1}).save);
for(const row of fixture.rows)test('workshop equipment custody matches original '+row.name,()=>{
 const session=open(row);
 for(const {command,expected} of row.steps){
  if(command.op==='equip'){
   const reply=session.command({...command,profile:1,actorLevel:1});
   assert.equal(reply.ok,true,JSON.stringify(reply));
  }else if(command.op==='unequip'){
   const uid=saved(session).state.equipped[command.slot]?.uid;
   const reply=session.command({...command,uid,profile:1});
   assert.equal(reply.ok,true,JSON.stringify(reply));
  }
  const state=saved(session).state;
  assert.deepEqual(state.items,expected.bag,command.op+': bag');
  assert.deepEqual(state.equipped,expected.equipped,command.op+': equipped');
  const before=saved(session),projection=session.equipmentText(1);assert(projection.ok);
  assert.deepEqual(JSON.parse(projection.text),expected.equipped);
  assert.deepEqual(saved(session),before,'equipment-only read preserves profile and random continuation');
 }
});
test('equipment projection has profile ownership and refuses missing or invalid profiles',()=>{
 const session=open(fixture.rows[0]);
 assert.deepEqual(session.equipmentText(1),{ok:true,text:'{}'});
 assert.equal(session.equipmentText(2).reason,'not-open');
 for(const id of [-1,.5,NaN,Infinity,4294967296,'1'])assert.equal(session.equipmentText(id).ok,false);
 assert(session.command({op:'close',profile:1}).ok);
 assert.equal(session.equipmentText(1).reason,'not-open');
});
test('exact unequip coordinates reject malformed requests without changing custody or random state',()=>{
 const session=open(fixture.rows[0]),uid=fixture.rows[0].initialItems[0].uid;
 assert(session.command({op:'equip',profile:1,uid,actorLevel:1,slot:'ring1'}).ok);
 const before=saved(session);
 for(const coordinates of [{x:0},{y:0},{x:-1,y:0},{x:0,y:-1},{x:.5,y:0},{x:NaN,y:0},{x:0,y:Infinity}]){
  const reply=session.command({op:'unequip',profile:1,uid,slot:'ring1',...coordinates});
  assert.equal(reply.ok,false,JSON.stringify(coordinates));assert.deepEqual(saved(session),before);
 }
 const reply=session.command({op:'unequip',profile:1,uid,slot:'ring1',x:7,y:9});
 assert(reply.ok && reply.result.changed);const after=saved(session);
 assert.deepEqual([after.state.items[0].x,after.state.items[0].y],[7,9]);
 assert.deepEqual(after.random,before.random);
});
