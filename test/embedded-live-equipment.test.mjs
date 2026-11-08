import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {create,dispatch,equipmentCapability} from '../adapters/embedded/equipment-session.mjs';
import {CraftingSession} from '../dist/crafting-session.js';
import {CraftingContent} from '../dist/crafting-content.js';
import {ItemContent} from '../dist/item-rules.js';
import {SkillProgression} from '../dist/skill-progression.js';
import {EquipmentSlots} from '../dist/equipment-actions.js';
import {CastRuntime} from '../dist/casting.js';
import {itemPack,equipmentPack} from '../scripts/compile-item-content.mjs';
import {craftingPack} from '../scripts/compile-crafting-content.mjs';
import {skillProgressionPack} from '../scripts/compile-skill-progression.mjs';
import {passivePack} from '../scripts/compile-passive-content.mjs';
import {sha256} from '../scripts/reference-utils.mjs';
const read=file=>JSON.parse(fs.readFileSync(new URL(file,import.meta.url)));
const packed=fs.readFileSync(new URL('../baseline/live-equipment/v2/observations.json.gz',import.meta.url));
assert.equal(sha256(packed),read('../baseline/live-equipment/v2/acceptance.json').gzipSha256);
const fixture=JSON.parse(gunzipSync(packed)),copy=value=>JSON.parse(JSON.stringify(value));
const input={core:read('../content/milestone-one.json'),items:itemPack(),passives:passivePack()};
const items=new ItemContent(input.items),crafting=new CraftingContent(craftingPack(items),items);
const definitions={crafting,skills:new SkillProgression(skillProgressionPack()),
 memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}};
const slots=new EquipmentSlots(equipmentPack());
const historical=JSON.parse(gunzipSync(fs.readFileSync(new URL('../evidence/embedded-js/windows-persistent-session-raw.json.gz',import.meta.url))));
const config=JSON.parse(historical.session['requests.jsonl'].split('\n')[0]).config;
config.character={classId:'magician',passivePoints:1};
config.skill={id:'ruin',level:5,sockets:0,treePoints:0};
config.resources={life:68,mana:117};
function open(root=create(input)){
 const reply=dispatch(root,{version:1,op:'create',config:copy(config)});assert(reply.ok);
 return {root,handle:reply.handle,owner:root.sessions.get(reply.handle)};
}
const request=(h,op,extra={})=>dispatch(h.root,{version:1,op,handle:h.handle,...extra});
const snapshot=h=>copy(request(h,'snapshot').snapshot);
const batch=(h,...commands)=>request(h,'batch',{commands});
function prepare(h,equipped){
 const reply=request(h,'prepareEquipment',{capability:equipmentCapability,equipped});
 assert(reply.ok,JSON.stringify(reply));return reply.token;
}
function publish(h,equipped){
 const token=prepare(h,equipped);assert(request(h,'publishEquipment',{token}).ok);
}
function compare(h,expected){
 const view=request(h,'equipmentView');assert(view.ok,JSON.stringify(view));
 assert.deepEqual(view.view.attributes,expected.attributes);
 for(const id of fixture.stats)assert.equal(view.view.stats[id],expected.stats[id],id);
 assert.deepEqual(view.view.preview,expected.preview);assert.deepEqual(view.view.cost,expected.cost);
 assert.equal(view.view.cooldown,expected.cooldown);
 assert.equal(h.owner.casting.life,expected.life);assert.equal(h.owner.casting.mana,expected.mana);
 const cast=h.owner.casting.snapshot().active;
 if(expected.cast){
  assert(cast);assert.equal(cast.elapsed,expected.cast.elapsed);assert.equal(cast.total,expected.cast.total);
  assert.deepEqual(cast.profile.cost,expected.cast.paidCost);
 }else assert.equal(cast,null);
}
for(const row of fixture.rows)test('live equipment reproduces original mechanical course '+row.name,()=>{
 const h=open(),workshop=new CraftingSession(definitions);workshop.configureEquipment(slots);
 assert(workshop.command({op:'open',profile:1,seed:17,state:{board:{w:16,h:16},items:copy(row.initialItems),
  overflow:[],equipped:{},essences:{},account:{features:[],ledger:{},craftLore:{},progression:true}}}).ok);
 const save=()=>copy(workshop.command({op:'save',profile:1}).save);
 for(const {command,expected} of row.steps){
  const op=command.op;
  if(op==='equip'||op==='unequip'){
   const before=snapshot(h),casting=h.owner.casting,itemRandom=h.owner.rules.snapshot();
   const change=workshop.command({...command,profile:1,...op==='equip'?{actorLevel:1}:{uid:save().state.equipped[command.slot].uid}});
   assert(change.ok,JSON.stringify(change));
   if(change.result.changed){
    const token=prepare(h,save().state.equipped);
    assert.deepEqual(snapshot(h),before,'Preparation published early');
    assert(request(h,'publishEquipment',{token}).ok);
   }
   const after=snapshot(h);
   assert.equal(h.owner.casting,casting);
   assert.deepEqual({...after.casting,resources:before.casting.resources},before.casting,'Gear replaced cast progress or clocks');
   for(const field of ['random','target','items','effect'])assert.deepEqual(after[field],before[field],field);
   assert.deepEqual(h.owner.rules.snapshot(),itemRandom);
  }else if(op==='press'){
   assert(batch(h,{op:'press'}).ok);
  }else if(op==='advanceCasting'){
   // The original fixture isolates World.updateCasting. CastRuntime also
   // advances clocks; compare their invariance at gear changes above, not
   // equality with deliberately unticked original Actor clocks.
   assert(batch(h,{op:'advance',dt:command.dt}).ok);
  }else if(op==='setResources')h.owner.casting.setResources({life:command.life,mana:command.mana});
  else if(op==='fillResources')h.owner.casting.setResources({life:h.owner.character.sheet.get('life'),mana:h.owner.character.sheet.get('mana')});
  else if(op==='fixtureClocks'||op==='fixtureRecovery'){
   const state=h.owner.casting.snapshot();state.recovery=command.useLock;
   if(command.cooldowns)state.cooldowns=command.cooldowns;
   h.owner.casting=CastRuntime.restore(state);
  }else assert.equal(op,'initial');
  compare(h,expected);
  assert.deepEqual(save().state.items,expected.bag);assert.deepEqual(save().state.equipped,expected.equipped);
 }
});
const ring=()=>{const item=copy(fixture.rows[0].initialItems[0]);delete item.x;delete item.y;return item;};
test('pending gear publishes against current combat, including another cast, contact RNG and timed damage',()=>{
 const h=open();publish(h,{ring1:ring()});h.owner.casting.setResources({life:68,mana:131});
 assert(batch(h,{op:'press'},{op:'applyDot',dps:5}).ok);
 const token=prepare(h,{});
 assert(batch(h,{op:'advance',dt:1},{op:'advance',dt:.2},{op:'press'},{op:'hit'}).ok);
 const before=snapshot(h),casting=h.owner.casting;
 assert.equal(before.casting.resources.mana,115);
 assert(request(h,'publishEquipment',{token}).ok);
 const after=snapshot(h);
 assert.equal(h.owner.casting,casting);assert.deepEqual(after.casting,before.casting);
 for(const field of ['random','target','effect','items','passive','inventory'])assert.deepEqual(after[field],before[field],field);
 assert.equal(h.owner.character.sheet.get('mana'),117);
 assert.equal(request(h,'publishEquipment',{token}).error,'stale-equipment-token');
 const restored=open();
 const reply=dispatch(restored.root,{version:1,op:'restore',snapshot:after});assert(reply.ok);
 assert.deepEqual(dispatch(restored.root,{version:1,op:'snapshot',handle:reply.handle}).snapshot,after);
});
test('publication clamps current balances and never revives a dead actor or finished cast',()=>{
 const h=open();publish(h,{ring1:ring()});h.owner.casting.setResources({life:68,mana:131});
 assert(batch(h,{op:'press'}).ok);const token=prepare(h,{});
 h.owner.casting.setResources({life:-2,mana:125});assert(batch(h,{op:'advance',dt:.01}).ok);
 const before=snapshot(h);assert.equal(before.casting.active,null);
 assert(request(h,'publishEquipment',{token}).ok);
 const after=snapshot(h);assert.equal(after.casting.resources.life,-2);assert.equal(after.casting.resources.mana,117);
 assert.deepEqual({...after.casting,resources:before.casting.resources},before.casting);
});
test('pending projection serializes structural changes and preserves current conditions and gauges',()=>{
 const h=open(),token=prepare(h,{ring1:ring()}),before=snapshot(h);
 assert.equal(batch(h,{op:'hit'},{op:'equip',item:'lapis-reference',slot:'ring1'}).error,'equipment-pending');
 assert.deepEqual(snapshot(h),before);
 h.owner.character.setConditions(['moving']);h.owner.character.setGauges([['test-live-gauge',.375]]);
 assert(request(h,'publishEquipment',{token}).ok);
 const state=snapshot(h);assert.deepEqual(state.character.conditions,['moving']);
 assert.deepEqual(state.character.gauges,[['test-live-gauge',.375]]);
 const next=prepare(h,{});
 h.owner.character.allocate('cross_int_pursuit');const changed=snapshot(h);
 assert.equal(request(h,'publishEquipment',{token:next}).error,'equipment-conflict');
 assert.deepEqual(snapshot(h),changed);assert(request(h,'discardEquipment',{token:next}).ok);
});
test('prepared handles are isolated, cancellable, bounded and retired with their actors',()=>{
 const a=open(),b=open(a.root),ta=prepare(a,{ring1:ring()}),tb=prepare(b,{});
 assert.notEqual(ta,tb);
 assert.equal(request(a,'publishEquipment',{token:tb}).error,'stale-equipment-token');
 assert.equal(request(a,'prepareEquipment',{capability:equipmentCapability,equipped:{}}).error,'equipment-pending');
 const before=snapshot(a);assert(request(a,'discardEquipment',{token:ta}).ok);assert.deepEqual(snapshot(a),before);
 assert.equal(request(a,'publishEquipment',{token:ta}).error,'stale-equipment-token');
 assert(request(b,'destroy').ok);assert.equal(a.root.equipment.pending.size,0);
 assert.equal(request(b,'publishEquipment',{token:tb}).error,'stale-handle');
});
test('unsupported or malformed equipment is refused without poisoning live combat or advancing randomness',()=>{
 const h=open(),before=snapshot(h),item=ring();
 const bad=[
  {ring1:{...item,rarity:'rare'}},{ring1:{...item,baseId:'ring_iron'}},
  {ring1:{...item,affixes:[{id:'attr_intelligence',tier:0,rolls:[.5]}]}},
  {ring1:{...item,sockets:[]}},{ring1:{...item,uniqueId:'unknown'}},
  {ring1:{...item,implicitRolls:[]}},{ring1:{...item,baseRoll:Infinity}},
  {ring1:{...item,uid:Number.MAX_SAFE_INTEGER+1}},{ring1:item,ring2:item},
  {amulet:item},{helmet:item},{ring1:{...item,unknownProc:{id:'danger'}}}
 ];
 for(const equipped of bad){
  const result=request(h,'prepareEquipment',{capability:equipmentCapability,equipped});
  assert.equal(result.ok,false);assert.deepEqual(snapshot(h),before);assert.equal(h.root.equipment.pending.size,0);
 }
 assert(batch(h,{op:'press'}).ok);
});
