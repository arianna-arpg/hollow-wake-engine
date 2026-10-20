import fs from 'node:fs';
import path from 'node:path';
import { makeSimWorld } from '../src/sim/arena';
import { mulberry32 } from '../src/sim/rng';
import { forgeItem } from '../src/engine/itemgen';
import { SKILLS } from '../src/data/skills';
import { makeSkillInstance, skillCooldownSeconds } from '../src/engine/skills';
import { skillDamageBands } from '../src/engine/damage';
const world = makeSimWorld('magician', 4321), hero = world.player;
const skill = makeSkillInstance(SKILLS.ruin, 5, 0);
const stats = ['life','mana','accuracy','evasion','armor','critChance','critMulti','damage'];
const expected = () => ({ attributes: { ...hero.attributeValues }, stats: Object.fromEntries(stats.map(id => [id,hero.sheet.get(id)])),
  preview: skillDamageBands(hero,skill), cost: hero.skillCost(skill), cooldown: skillCooldownSeconds(hero,skill) });
const rows: any[] = [{ command: { type: 'initial' }, expected: expected() }];
for (const [index, options] of [
  { baseId: 'ring_lapis', ilvl: 1, rarity: 'common' as const, quality: .5 },
  { baseId: 'ring_lapis', ilvl: 21, rarity: 'rare' as const, quality: 1, affixes: [{ id:'attr_intelligence' }] },
].entries()) {
  const item = forgeItem({ ...options, rng: mulberry32(index + 34) })!;
  world.meta.equipped.ring1 = item; world.recalcPlayer();
  rows.push({ command: { type: 'equip', item, slot: 'ring1' }, expected: expected() });
}
delete world.meta.equipped.ring1; world.recalcPlayer(); rows.push({ command: { type: 'unequip', slot: 'ring1' }, expected: expected() });
fs.mkdirSync(process.argv[2], { recursive: true });
fs.writeFileSync(path.join(process.argv[2], 'item-equipment.json'), JSON.stringify({ schemaVersion: 1, stats, rows }) + '\n');
console.log('Captured original item-to-character-to-preview equip, replace and remove path.');
