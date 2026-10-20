// Provenance recipe for the initial mechanical extraction. Refuses to overwrite maintained code.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { root, verifyReference } from './reference-utils.mjs';
const reference = path.join(root, '.reference');
verifyReference(reference, JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'))));
const read = file => ts.createSourceFile(file, fs.readFileSync(path.join(reference, file), 'utf8'), ts.ScriptTarget.Latest, true);
const items = read('src/engine/items.ts'), generator = read('src/engine/itemgen.ts'), choices = read('src/engine/itemchoices.ts');
function pick(source, names, exported = false) {
  return names.map(name => {
    const node = source.statements.find(s => s.name?.text === name);
    if (!node) throw new Error(`Missing source declaration ${name}`);
    const code = node.getText(source).replace(/^export /, '');
    return (exported ? 'export ' : '') + code;
  }).join('\n\n');
}
const types = `import type { Modifier, ModifierKind } from './types.js';
export type ItemCategory = string;
export type SkillRarity = string;
export type MonsterRarity = string;
export type ModKind = ModifierKind;
export type SkillTag = string;
export type ConditionId = string;
export type ItemRarity = 'common' | 'magic' | 'rare' | 'unique';
export type AffixKind = 'prefix' | 'suffix';
export type RngFn = () => number;
` + pick(items, ['ModLineDef','RangedLineDef','ItemBaseDef','AffixTierDef','AffixDef','UniqueDef','AffixRollState',
  'GemSocketRow','SkillGemPayload','SupportGemPayload','GemPayload','MemoryPin','RoughMemoryUnit','ItemInstance','GrantedSkillState'], true)
  .replaceAll("import('./itemchoices').", '') + '\n\n' + pick(choices, ['UniqueChoiceGroup','UniqueChoiceRoll'], true)
  + '\n\n' + pick(generator, ['AffixQuality','RollItemOpts','ForgeAffixPick','ForgeItemOpts','OwnStatFold'], true) + `
export type ItemRollOptions = Omit<RollItemOpts, 'rng'>;
export type ItemForgeOptions = Omit<ForgeItemOpts, 'rng'>;
export interface ItemConfiguration {
  tierBreaks: number[]; tierNames: string[];
  defense: { base: number; perIlvl: number; tierBonus: number };
  slotBudget: Partial<Record<string, number>>; baseRollRange: Record<ItemRarity, number>;
  superior: { chance: number; max: number };
  affixSlots: Record<ItemRarity, { prefixes: number; suffixes: number }>;
  magic: { bothChance: number; exquisiteWeightMult: number; overroll: { chance: number; maxSteps: number; stepDecay: number; canReachExquisite: boolean } };
  rare: { countWeights: { count: number; weight: number }[]; tierBias: { low: number; high: number } };
  uniqueTierScale: number; implicitTierScale: number; rarityWeights: Record<ItemRarity, number>;
  sockets: { cap: Partial<Record<string, number>>; chanceByRarity: Record<ItemRarity, number>; countWeights: Record<ItemRarity, { n: number; weight: number }[]> };
  rareNames: { first: string[]; second: string[] };
}
export type VestigeLine = Modifier;
export interface ItemRulePack {
  schemaVersion: 1; capability: 'item-rules/v1'; id: string;
  bases: Record<string, ItemBaseDef>; affixes: Record<string, AffixDef>; uniques: Record<string, UniqueDef>;
  vestiges: Record<string, { id: string; effects: Record<string, VestigeLine[]> }>;
  epitaphs: { id: string; categories: string[]; sequence: string[]; effects: VestigeLine[] }[];
  defenseKinds: Record<string, { stat: string; coeff: number }>;
  config: ItemConfiguration; carriableCategories: string[];
  relic: { baseline: number; scalable: Record<string, number | null> };
}
`;
const functions = pick(generator, ['pickWeighted','droppableBases','basePool','affixPoolsFor','improveAffixQuality',
  'eligibleTiers','pickTier','rollLineSet','affinityMult','rollOneAffix','affixCapsFor','rollAffixSet','forceFamilyAffix',
  'affixName','mintName','rollRarity','candidateUniques','rollItem','forgeItem','rangedLineValue','defenseMods',
  'eachItemLine','foldOwnStats','compileItemMods'])
  .replaceAll('  ensureValidated();', '')
  .replaceAll('opts.rng ?? Math.random', 'opts.rng!');
const core = `// Derived from the pinned original; mechanical recipe: scripts/extract-item-core.mjs.
// Maintained directly after extraction. All registries, caches and identity providers are explicit instance state.
import { Random } from './random.js';
import type { Modifier } from './types.js';
import type { ItemRulePack, ItemInstance, ItemBaseDef, ItemRarity, ItemCategory, AffixDef, AffixTierDef,
  AffixRollState, AffixKind, UniqueDef, RngFn, AffixQuality, RollItemOpts, ForgeItemOpts,
  OwnStatFold, RangedLineDef, ModLineDef, VestigeLine, UniqueChoiceGroup, UniqueChoiceRoll } from './item-types.js';
export function itemOperations(pack: ItemRulePack, nextItemUid: () => number) {
const { bases: ITEM_BASES, affixes: ITEM_AFFIXES, uniques: UNIQUES, vestiges: VESTIGES, defenseKinds: DEFENSE_KINDS, config: ITEM_CFG } = pack;
const ITEM_AFFIX_LIST = Object.values(ITEM_AFFIXES), UNIQUE_LIST = Object.values(UNIQUES);
const ITEM_RARITY_IDS: ItemRarity[] = ['common','magic','rare','unique'];
const carriable = new Set(pack.carriableCategories);
const isCarriableCategory = (category: string) => carriable.has(category);
const affixPoolCache = new Map<string, { prefix: AffixDef[]; suffix: AffixDef[] }>();
interface EligibleTier { index: number; def: AffixTierDef }
const relicUniqueValue = (m: Pick<Modifier, 'stat' | 'kind' | 'value' | 'fromStat'>) =>
  Object.hasOwn(pack.relic.scalable, m.stat) && (m.kind === 'flat' || m.kind === 'increased') && !m.fromStat && Number.isFinite(m.value) && m.value > 0
    ? m.value * pack.relic.baseline : m.value;
const epitaphFor = (rarity: string, category: string, sockets: readonly (string | null)[]) => rarity === 'common' && sockets.length && !sockets.some(s => s === null)
  ? pack.epitaphs.find(e => e.categories.includes(category) && e.sequence.length === sockets.length && e.sequence.every((id,i) => sockets[i] === id)) : undefined;
` + pick(items, ['socketCap','tierForIlvl','tieredBaseName','defenseBudget','baseBonusFor','lerpRange','roundStatValue'])
  + '\n\n' + pick(choices, ['rollUniqueChoices','resolveUniqueChoices','rolledUniqueLines']).replace('new Rng(seed)', 'new Random(seed >>> 0)')
  + '\n\n' + functions + `
return { rollItem, forgeItem, compileItemMods, foldOwnStats, resolveUniqueChoices, tierForIlvl };
}
`;
for (const [file, source] of [['src/item-types.ts', types], ['src/item-core.ts', core]]) {
  const target = path.join(root, file);
  if (fs.existsSync(target)) throw new Error(`Refusing to overwrite ${file}`);
  fs.writeFileSync(target, source + '\n');
}
