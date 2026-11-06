import {decodeContentTable} from '@hollow-wake/engine/content/table';
import {CraftingSession} from '@hollow-wake/engine/crafting/session';
import {ItemContent} from '@hollow-wake/engine/items';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';

// The native host owns its parsed JSON argument exclusively. Release the encoded
// rows after validation, then each decoded pack after its owner has detached it.
// This consuming factory is not the public, non-mutating table decoder.
export function createCraftingContext(table,rack) {
  let {items:itemPack,crafting:craftPack,skills:skillPack} = decodeContentTable(table);
  table.nodes.length = 0;
  const items = new ItemContent(itemPack); itemPack = null;
  const crafting = new CraftingContent(craftPack,items); craftPack = null;
  const skills = new SkillProgression(skillPack); skillPack = null;
  const session=new CraftingSession({crafting,skills,memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}},2,rack);
  return {session,items,skills,crafting};
}
export const create = table => createCraftingContext(table).session;
export const dispatch = (session,request) => session.command(request);
