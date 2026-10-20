import type { ItemRulePack, ItemInstance, ItemRollOptions, ItemForgeOptions, ModLineDef } from './item-types.js';
import { finite, integer } from './validation.js';
const rarities = ['common', 'magic', 'rare', 'unique'];
export function itemId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > 512) throw new Error(`Invalid ${label}`);
}
function number(value: number, label: string, min = -Infinity): void {
  finite(value, label); if (value < min) throw new Error(`${label} must be >= ${min}`);
}
function strings(values: string[], label: string): void {
  if (!Array.isArray(values)) throw new Error(`Invalid ${label}`);
  for (const value of values) itemId(value, label);
}
function array(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`);
}
function range(values: number[], label: string): void {
  array(values, label); if (values.length !== 2) throw new Error(`Invalid ${label}`);
  values.forEach(v => number(v, label));
}
function boolean(value: unknown, label: string): void { if (value !== undefined && typeof value !== 'boolean') throw new Error(`Invalid ${label}`); }
function line(value: ModLineDef): void {
  itemId(value.stat, 'item stat');
  if (!['flat','increased','more','override','link'].includes(value.kind)) throw new Error('Invalid item modifier kind');
  if (value.tags !== undefined) strings(value.tags, 'modifier tags');
  for (const key of ['when','fromStat','gauge'] as const) if (value[key] !== undefined) itemId(value[key], key);
  if (value.gaugeAt !== undefined) number(value.gaugeAt, 'gauge gate');
  boolean(value.sharedRoll, 'Shared roll flag'); boolean(value.local, 'Local scope flag');
  if (value.local && (!['flat','increased','more'].includes(value.kind) || value.tags?.length || value.when || value.gauge || value.fromStat)) {
    throw new Error('Local item lines require an unscoped flat/increased/more modifier');
  }
}
export function validateItemPack(p: ItemRulePack): void {
  if (p.schemaVersion !== 1 || p.capability !== 'item-rules/v1') throw new Error('Unsupported item content capability');
  itemId(p.id, 'content identity'); strings(p.carriableCategories, 'carriable categories');
  for (const registry of [p.bases, p.affixes, p.uniques, p.vestiges, p.defenseKinds]) {
    if (!registry || Array.isArray(registry) || typeof registry !== 'object') throw new Error('Invalid item registry');
    for (const id of Object.keys(registry)) itemId(id, 'registry identity');
  }
  for (const [id, b] of Object.entries(p.bases)) {
    if (b.id !== id) throw new Error(`Mismatched item identity: ${id}`);
    itemId(b.name, 'base name'); itemId(b.category, 'item category'); strings(b.tags, 'base tags');
    integer(b.w, 1, 'Item width'); integer(b.h, 1, 'Item height'); number(b.dropWeight, 'Base weight', 0);
    if (b.minRarity && !rarities.includes(b.minRarity)) throw new Error('Invalid rarity floor');
    for (const [kind, weight] of Object.entries(b.defense ?? {})) {
      if (!Object.hasOwn(p.defenseKinds, kind)) throw new Error(`Unknown item defense kind: ${kind}`);
      number(weight, 'Defense weight', 0);
    }
    for (const weight of Object.values(b.affinity ?? {})) number(weight, 'Affinity', 0);
    for (const value of Object.values(b.affixCap ?? {})) integer(value, 0, 'Affix capacity');
    if (b.minIlvl !== undefined) number(b.minIlvl, 'Minimum item level', 1);
    if (b.namesByTier) strings(b.namesByTier, 'Tier names');
    for (const ln of b.implicits ?? []) { line(ln); range(ln.range, 'Implicit range'); }
  }
  for (const [id, a] of Object.entries(p.affixes)) {
    if (a.id !== id || !['prefix','suffix'].includes(a.kind)) throw new Error(`Invalid affix: ${id}`);
    itemId(a.family, 'affix family'); strings(a.names, 'affix names');
    number(a.weight, 'Affix weight', 0); array(a.lines, 'Affix lines'); array(a.tiers, 'Affix tiers');
    if (!a.tiers.length) throw new Error('Affix needs a tier');
    for (const ln of a.lines) line(ln);
    for (const t of a.tiers) {
      number(t.ilvl, 'Affix level', 1); number(t.weight, 'Tier weight', 0); boolean(t.magicOnly, 'Magic-only tier');
      if (t.ranges.length !== a.lines.length) throw new Error(`Affix range count differs: ${id}`);
      for (const pair of t.ranges) range(pair, 'Affix range');
    }
    for (const tags of [a.tags,a.excludeTags,a.themes]) if (tags) strings(tags, 'Affix tags');
  }
  for (const [id, u] of Object.entries(p.uniques)) {
    if (u.id !== id || !Object.hasOwn(p.bases, u.baseId)) throw new Error(`Invalid unique identity/base: ${id}`);
    itemId(u.name, 'unique name'); number(u.weight, 'Unique weight', 0);
    const groupIds = new Set<string>();
    for (const g of u.choices ?? []) {
      itemId(g.id, 'choice group'); if (groupIds.has(g.id)) throw new Error('Duplicate unique choice group'); groupIds.add(g.id);
      if (['__proto__','constructor','prototype'].includes(g.id)) throw new Error('Reserved choice group identity');
      if (g.uniqueBy !== undefined) itemId(g.uniqueBy, 'Choice exclusivity group');
      const optionIds = new Set<string>();
      for (const o of g.options) {
        itemId(o.id, 'choice option'); if (optionIds.has(o.id)) throw new Error('Duplicate unique option'); optionIds.add(o.id);
        number(o.weight, 'Choice weight', 0);
        if (o.exclusiveKey !== undefined) itemId(o.exclusiveKey, 'Choice exclusivity key');
      }
    }
    for (const ln of [...u.lines, ...(u.choices ?? []).flatMap(g => g.options.flatMap(o => o.lines))]) { line(ln); range(ln.range, 'Unique range'); }
  }
  for (const [id, v] of Object.entries(p.vestiges)) {
    if (v.id !== id) throw new Error('Invalid vestige identity');
    for (const lines of Object.values(v.effects)) for (const ln of lines) { line(ln); number(ln.value, 'Vestige value'); }
  }
  const epitaphIds = new Set<string>();
  for (const e of p.epitaphs) {
    itemId(e.id, 'epitaph identity'); if (epitaphIds.has(e.id)) throw new Error('Duplicate epitaph'); epitaphIds.add(e.id);
    strings(e.categories, 'Epitaph categories'); strings(e.sequence, 'Epitaph sequence');
    for (const id of e.sequence) if (!Object.hasOwn(p.vestiges, id)) throw new Error('Unknown epitaph vestige');
    for (const ln of e.effects) { line(ln); number(ln.value, 'Epitaph value'); }
  }
  for (const k of Object.values(p.defenseKinds)) { itemId(k.stat, 'defense stat'); number(k.coeff, 'Defense coefficient', 0); }
  number(p.relic.baseline, 'Relic baseline', 0);
  for (const cap of Object.values(p.relic.scalable)) if (cap !== null) number(cap, 'Relic cap', 0);
  const c = p.config;
  array(c.tierNames, 'Tier names'); if (c.tierNames.some(n => typeof n !== 'string')) throw new Error('Invalid tier names');
  strings(c.rareNames.first, 'Rare name first parts'); strings(c.rareNames.second, 'Rare name second parts');
  boolean(c.magic.overroll.canReachExquisite, 'Exquisite overroll flag');
  if (!c.tierBreaks.length || !c.rare.countWeights.length || !c.rareNames.first.length || !c.rareNames.second.length) throw new Error('Empty item configuration table');
  let previous = 0; for (const level of c.tierBreaks) { number(level, 'Tier level', 1); if (level <= previous) throw new Error('Tier thresholds must increase'); previous = level; }
  for (const value of Object.values(c.defense)) number(value, 'Defense budget', 0);
  for (const value of Object.values(c.slotBudget)) number(value!, 'Slot budget', 0);
  for (const value of Object.values(c.sockets.cap)) { integer(value!, 0, 'Socket cap'); if (value! > 1024) throw new Error('Socket cap too large'); }
  for (const rarity of rarities as (keyof typeof c.affixSlots)[]) {
    integer(c.affixSlots[rarity].prefixes, 0, 'Prefix cap'); integer(c.affixSlots[rarity].suffixes, 0, 'Suffix cap');
    if (c.affixSlots[rarity].prefixes + c.affixSlots[rarity].suffixes > 1024) throw new Error('Affix cap too large');
    number(c.baseRollRange[rarity], 'Base roll range', 0); number(c.rarityWeights[rarity], 'Rarity weight', 0);
    number(c.sockets.chanceByRarity[rarity], 'Socket chance', 0);
    for (const entry of c.sockets.countWeights[rarity]) { integer(entry.n, 0, 'Socket count'); number(entry.weight, 'Socket weight', 0); }
  }
  for (const entry of c.rare.countWeights) { integer(entry.count, 0, 'Affix count'); number(entry.weight, 'Affix count weight', 0); }
  for (const value of [c.superior.chance,c.superior.max,c.magic.bothChance,c.magic.exquisiteWeightMult,c.magic.overroll.chance,
    c.magic.overroll.stepDecay,c.rare.tierBias.low,c.rare.tierBias.high,c.uniqueTierScale,c.implicitTierScale]) number(value, 'Item tuning', 0);
  integer(c.magic.overroll.maxSteps, 0, 'Overroll steps');
  if (c.magic.overroll.maxSteps > 1024) throw new Error('Overroll limit too large');
}
export function validateMint(options: ItemRollOptions | ItemForgeOptions, forge: boolean): void {
  const keys = forge ? ['ilvl','baseId','uniqueId','rarity','affixes','fillRandom','quality','superior','sockets']
    : ['ilvl','rarity','category','baseId','uniqueId','rarityWeights','rarityCeiling','withFamily','affixQuality'];
  for (const key of Object.keys(options)) if (!keys.includes(key)) throw new Error(`Unsupported item option: ${key}`);
  number(options.ilvl, 'Item level');
  integer(Math.max(1, Math.round(options.ilvl)), 1, 'Normalized item level');
  if (options.rarity !== undefined && !rarities.includes(options.rarity)) throw new Error('Invalid rarity');
  for (const key of ['baseId','uniqueId'] as const) if (options[key] !== undefined) itemId(options[key], key);
  if (forge) {
    const o = options as ItemForgeOptions;
    boolean(o.fillRandom, 'Random fill'); boolean(o.superior, 'Superior flag');
    for (const n of [o.quality,o.sockets]) if (n !== undefined) number(n, 'Forge option');
    for (const a of o.affixes ?? []) { itemId(a.id, 'affix identity'); if (a.tier !== undefined) number(a.tier, 'Forge tier'); }
  } else {
    const o = options as ItemRollOptions;
    if (o.rarityCeiling && !rarities.includes(o.rarityCeiling)) throw new Error('Invalid rarity ceiling');
    for (const key of ['category','withFamily'] as const) if (o[key] !== undefined) itemId(o[key], key);
    for (const [key, weight] of Object.entries(o.rarityWeights ?? {})) {
      if (!rarities.includes(key)) throw new Error('Unknown rarity weight'); number(weight, 'Rarity weight', 0);
    }
    if (o.affixQuality) { number(o.affixQuality.bestTierCount, 'Quality tiers'); number(o.affixQuality.rollFloor, 'Quality floor'); }
  }
}
export function validateItem(item: ItemInstance, pack: ItemRulePack): void {
  integer(item.uid, 1, 'Item uid'); integer(item.tier, 1, 'Item tier'); number(item.ilvl, 'Item level', 1);
  itemId(item.baseId, 'base identity'); if (!Object.hasOwn(pack.bases, item.baseId)) throw new Error(`Unknown item base: ${item.baseId}`);
  if (!rarities.includes(item.rarity)) throw new Error('Invalid item rarity'); number(item.baseRoll, 'Base roll');
  if (item.superior !== undefined) number(item.superior, 'Superior roll');
  array(item.implicitRolls, 'Implicit rolls'); for (const roll of item.implicitRolls) number(roll, 'Implicit roll');
  array(item.affixes, 'Item affixes');
  for (const a of item.affixes) {
    const def = Object.hasOwn(pack.affixes, a.id) ? pack.affixes[a.id] : undefined;
    if (!def) throw new Error(`Unknown item affix: ${a.id}`);
    integer(a.tier, 0, 'Affix tier'); if (!def.tiers[a.tier]) throw new Error('Unknown affix tier');
    for (const roll of a.rolls) number(roll, 'Affix roll');
  }
  if (item.uniqueId && !Object.hasOwn(pack.uniques, item.uniqueId)) throw new Error('Unknown unique item');
  for (const roll of item.uniqueRolls ?? []) number(roll, 'Unique roll');
  for (const id of item.sockets ?? []) if (id !== null && !Object.hasOwn(pack.vestiges, id)) throw new Error('Unknown socketed vestige');
}
