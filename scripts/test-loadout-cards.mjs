import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {ItemContent} from '@hollow-wake/engine/items';
import {ItemInspector} from '@hollow-wake/engine/items/inspection';
import {EquipmentSlots} from '@hollow-wake/engine/inventory/equipment';
import {CraftingSession} from '@hollow-wake/engine/crafting/session';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {itemPack,equipmentPack} from './compile-item-content.mjs';
import {craftingPack} from './compile-crafting-content.mjs';
import {skillProgressionPack} from './compile-skill-progression.mjs';
import {inspectionTerms} from './compile-inspection-terms.mjs';

const dir=path.join(root,'baseline/loadout-cards');
const raw=gunzipSync(fs.readFileSync(path.join(dir,'observations.json.gz')));
const frozen=JSON.parse(fs.readFileSync(path.join(dir,'acceptance.json')));
assert.equal(sha256(raw),frozen.sha256);
const cases=JSON.parse(raw),items=new ItemContent(itemPack()),slots=new EquipmentSlots(equipmentPack());
const inspector=new ItemInspector(items,inspectionTerms());
const view=(input,detail)=>inspector.inspectLoadout(input.item,input.equipped,input.heroLevel,slots,detail);
let visible=0,comparisons=0;
for(const {label,input,expected} of cases){
  // The game host owns cross-seat visibility. A refused original card never
  // ships a body into the standalone viewer.
  if(!expected){assert(input.guest||['foreign','client-stash'].includes(input.place));continue;}
  visible++;
  const before=JSON.stringify(input),full=view(input,'full'),brief=view(input,'compact');
  assert.equal('<span style="color:'+full.description.color+'">'+full.title+'</span>',expected.title,label);
  const meta='<span style="color:'+(full.levelMet?'#6fc06f':'#d05050')+'">'+full.requirement+'</span> · '+full.rarityLabel;
  assert.equal(meta,expected.fullMeta,label);
  assert.equal(meta+(brief.hasComparison?' · <span style="color:#c8a84b">full comparison in Options</span>':''),expected.compactMeta,label);
  assert.deepEqual(full.targets,expected.targets,label);
  assert.deepEqual(brief,{...full,targets:[]},label);
  comparisons+=full.targets.length;
  assert.equal(JSON.stringify(input),before,label);
}
assert.equal(visible,frozen.visible);
const {input}=cases.find(r=>r.label==='bag/local'),{item,equipped}=input;
const twin=equipped.ring2,other=equipped.ring1;
const full=view(input,'full');full.targets[0].rows.length=0;
assert.notDeepEqual(full.targets,view(input,'full').targets);
assert.throws(()=>view({...input,heroLevel:0},'full'),/invalid-integer/);
assert.throws(()=>view(input,'bogus'),/invalid-detail/);
assert.throws(()=>view({...input,equipped:{a:other,b:other}},'full'),/duplicate-worn-uid/);
assert.throws(()=>view({...input,equipped:{get ring1(){throw Error('invoked getter');}}},'full'),/invalid-property/);
const unavailable={...input,equipped:{ring1:{uid:1}}};
assert(view(unavailable,'compact').hasComparison);
assert.throws(()=>view(unavailable,'full'));
assert.equal(view({...input,equipped:{retired:{...item}}},'full').hasComparison,false);
const session=new CraftingSession({crafting:new CraftingContent(craftingPack(items),items),
  skills:new SkillProgression(skillProgressionPack()),memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}});
const call=(op,args={},profile=1)=>JSON.parse(JSON.stringify(session.command({op,profile,...args})));
const state={board:{w:1,h:1},items:[{...item,x:0,y:0}],equipped:{ring1:other},overflow:[twin],
  essences:{},account:{craftLore:{},ledger:{},features:[],progression:true}};
assert(call('open',{state,seed:8}).ok);
const before=call('save').save;
assert.equal(call('equip',{uid:item.uid,actorLevel:99}).reason,'equipment-unavailable');
session.configureEquipment(slots);
assert.throws(()=>session.configureEquipment(slots),/already-configured/);
const equip=(uid,actorLevel,slot)=>call('equip',{uid,actorLevel,...(slot?{slot}:{})});
assert.equal(equip(item.uid,1).result.refusal.reason,'requires level '+full.requiredLevel);
assert.equal(equip(twin.uid,99).result.changed,false);
assert.deepEqual(call('save').save,before);
assert.equal(full.levelMet,false);
assert(equip(item.uid,99,'mainhand').result.changed);
let saved=call('save').save;
assert.equal(saved.state.equipped.ring2.uid,item.uid);assert.equal(saved.state.equipped.ring1.uid,other.uid);
assert.deepEqual(saved.random,before.random);assert.equal(saved.nextUid,before.nextUid);
assert(call('recover',{uid:twin.uid}).result.moved);
assert.equal(call('unequip',{uid:item.uid,slot:'ring1'}).result.changed,false);
assert.equal(call('unequip',{uid:item.uid,slot:'ring2'}).result.refusal.reason,'no room in the bag');
assert(equip(item.uid,99,'ring1').result.changed);
saved=call('save').save;assert.equal(saved.state.equipped.ring2.uid,other.uid);
assert.equal(saved.state.equipped.ring1.uid,item.uid);
assert(equip(twin.uid,99,'retired').result.changed);
saved=call('save').save;assert.equal(saved.state.items[0].uid,item.uid);
assert(call('close').ok && call('restore',{save:saved}).ok);assert.deepEqual(call('save').save,saved);
assert(call('open',{state:{...state,items:[],overflow:[]},seed:1},2).ok);
assert(call('unequip',{uid:other.uid,slot:'ring1'},2).result.changed);
assert.deepEqual(call('save').save,saved);
// A previously saved slot can hold a piece that no longer fits the active
// board's dimensions. Its exact body must acquire a durable owner on swap.
const large={...cases.find(r=>r.label==='base/helmet_armor').input.item,uid:777};
const legacy={...state,equipped:{ring1:large},overflow:[]};
assert(call('close',{},2).ok&&call('open',{state:legacy,seed:2},2).ok);
const displaced=call('equip',{uid:item.uid,actorLevel:99,slot:'ring1'},2);
assert(displaced.result.changed);assert(displaced.events.some(e=>e.kind==='recovered'&&e.destination==='overflow'&&e.uid===large.uid));
const recovered=call('save',{},2).save;assert.deepEqual(recovered.state.overflow,[large]);
assert.equal(recovered.state.equipped.ring1.uid,item.uid);
const report={passed:true,sourceCommit:frozen.sourceCommit,sha256:frozen.sha256,bases:frozen.bases,
  visible,originalLookupRefusals:cases.length-visible,comparisons};
writeJSON(path.join(root,'.artifacts/loadout-verification.json'),report);console.log(report);
