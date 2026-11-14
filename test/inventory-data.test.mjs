import {InventoryData} from '../dist/inventory-data.js';
import {ItemContent,ItemRules} from '../dist/item-rules.js';
import {CraftingContent} from '../dist/crafting-content.js';
import {SkillProgression} from '../dist/skill-progression.js';
import {itemPack} from '../scripts/compile-item-content.mjs';
import {craftingPack} from '../scripts/compile-crafting-content.mjs';
import {skillProgressionPack} from '../scripts/compile-skill-progression.mjs';
import {inventoryDataContracts} from './inventory-data/contracts.mjs';

const items=new ItemContent(itemPack());
inventoryDataContracts({InventoryData,ItemRules,definitions:{crafting:new CraftingContent(craftingPack(items),items),
  skills:new SkillProgression(skillProgressionPack()),memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}}});
