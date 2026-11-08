import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {ItemContent} from '../../dist/item-rules.js';
import {CraftingContent} from '../../dist/crafting-content.js';
import {SkillProgression} from '../../dist/skill-progression.js';
import {itemPack} from '../../scripts/compile-item-content.mjs';
import {craftingPack} from '../../scripts/compile-crafting-content.mjs';
import {skillProgressionPack} from '../../scripts/compile-skill-progression.mjs';
import {unlockContentPack} from '../../scripts/compile-unlock-content.mjs';
import {memoryRewardPack} from '../../scripts/compile-memory-rewards.mjs';
import {progressionGatePack} from '../../scripts/compile-progression-gates.mjs';

export const packs={items:itemPack(),crafting:craftingPack(),skills:skillProgressionPack(),
  unlocks:unlockContentPack(),memories:memoryRewardPack(),gates:progressionGatePack()};
export function definitionsFrom(packs) {
  const items=new ItemContent(packs.items);
  return {progression:{unlocks:packs.unlocks,memories:packs.memories,gates:packs.gates},
    workshop:{crafting:new CraftingContent(packs.crafting,items),skills:new SkillProgression(packs.skills),
      memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}}};
}
const compressed=fs.readFileSync(new URL('../../baseline/shared-account/admitted-socket/observations.json.gz',import.meta.url));
const manifest=JSON.parse(fs.readFileSync(new URL('../../baseline/shared-account/admitted-socket/acceptance.json',import.meta.url)));
const sha=value=>createHash('sha256').update(value).digest('hex'),bytes=gunzipSync(compressed);
assert.equal(sha(compressed),manifest.compressedSha256);
assert.equal(sha(bytes),manifest.sha256);assert.equal(bytes.length,manifest.bytes);
export const baseline=JSON.parse(bytes);
export const definitions=definitionsFrom(packs);
