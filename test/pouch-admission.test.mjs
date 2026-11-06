import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {CraftingSession} from '@hollow-wake/engine/crafting/session';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {ItemContent} from '@hollow-wake/engine/items';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {itemPack} from '../scripts/compile-item-content.mjs';
import {craftingPack} from '../scripts/compile-crafting-content.mjs';
import {skillProgressionPack} from '../scripts/compile-skill-progression.mjs';

test('legacy pouches preserve retired promises and still bound live gem levels',()=>{
  const items=new ItemContent(itemPack()),skills=new SkillProgression(skillProgressionPack());
  const defs={crafting:new CraftingContent(craftingPack(items),items),skills,memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}};
  const bag=JSON.parse(fs.readFileSync(new URL('../examples/godot-inventory/cargo-sample.json',import.meta.url)));
  const state={board:{w:2,h:2},items:bag,equipped:{},overflow:[],essences:{},account:{craftLore:{},ledger:{},features:[],progression:true}};
  for(const [k,def] of [['skill',skills.skill('firebolt')],['support',skills.support('teeming_vein')]]){
    const session=new CraftingSession(defs);
    bag[0].mem=[{d:'found',s:0,g:{k,id:'retired-promise',l:3}}];
    assert(session.command({op:'open',profile:1,seed:7,state}).ok);
    const {save}=session.command({op:'save',profile:1});
    assert.equal(save.schemaVersion,1);
    assert.deepEqual(JSON.parse(JSON.stringify(save.state.items[0].mem)),bag[0].mem);
    assert(session.command({op:'restore',profile:2,save}).ok);
    save.state.items[0].mem[0].g={k,id:def.id,l:def.maxLevel+1};
    assert.equal(session.command({op:'restore',profile:3,save}).ok,false);
  }
});
