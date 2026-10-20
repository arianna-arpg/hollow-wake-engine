// Derived from the pinned original; mechanical recipe: scripts/extract-item-core.mjs.
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
// A pool has at most one compiled level per rarity. Ownership is bounded by the
// authored base pools; arbitrary item levels cannot grow an unbounded cache.
type WeightedPool = { level: number; definitions: AffixDef[]; weights: Float64Array };
const weightedPoolCache = new WeakMap<AffixDef[], Map<ItemRarity, WeightedPool>>();
interface EligibleTier { index: number; def: AffixTierDef }
const relicUniqueValue = (m: Pick<Modifier, 'stat' | 'kind' | 'value' | 'fromStat'>) =>
  Object.hasOwn(pack.relic.scalable, m.stat) && (m.kind === 'flat' || m.kind === 'increased') && !m.fromStat && Number.isFinite(m.value) && m.value > 0
    ? m.value * pack.relic.baseline : m.value;
const epitaphFor = (rarity: string, category: string, sockets: readonly (string | null)[]) => rarity === 'common' && sockets.length && !sockets.some(s => s === null)
  ? pack.epitaphs.find(e => e.categories.includes(category) && e.sequence.length === sockets.length && e.sequence.every((id,i) => sockets[i] === id)) : undefined;
function socketCap(category: ItemCategory): number {
  return ITEM_CFG.sockets.cap[category] ?? 0;
}

function tierForIlvl(ilvl: number): number {
  let tier = 1;
  for (let i = 0; i < ITEM_CFG.tierBreaks.length; i++) {
    if (ilvl >= ITEM_CFG.tierBreaks[i]) tier = i + 1;
  }
  return tier;
}

function tieredBaseName(base: ItemBaseDef, tier: number): string {
  if (base.namesByTier && base.namesByTier.length > 0) {
    return base.namesByTier[Math.min(tier, base.namesByTier.length) - 1];
  }
  return (ITEM_CFG.tierNames[tier - 1] ?? '') + base.name;
}

function defenseBudget(ilvl: number, tier: number, category: ItemCategory): number {
  const slot = ITEM_CFG.slotBudget[category] ?? 0;
  if (slot <= 0) return 0;
  const d = ITEM_CFG.defense;
  return (d.base + d.perIlvl * ilvl) * (1 + d.tierBonus * (tier - 1)) * slot;
}

function baseBonusFor(item: Pick<ItemInstance, 'rarity' | 'baseRoll' | 'superior'>): number {
  const range = ITEM_CFG.baseRollRange[item.rarity];
  if (item.superior !== undefined) {
    return range + item.superior * Math.max(0, ITEM_CFG.superior.max - range);
  }
  return item.baseRoll * range;
}

function lerpRange(range: [number, number], t: number, mult = 1): number {
  const lo = range[0] * mult;
  const hi = range[1] * mult;
  return lo + (hi - lo) * Math.max(0, Math.min(1, t));
}

function roundStatValue(v: number): number {
  return Math.abs(v) >= 3 ? Math.round(v) : Math.round(v * 1000) / 1000;
}

function rollUniqueChoices(def: UniqueDef, rng: () => number, magnitude = rng): Record<string, UniqueChoiceRoll> | undefined {
  if (!def.choices?.length) return undefined;
  const result: Record<string, UniqueChoiceRoll> = {};
  const usedChoices = new Set<string>();
  for (const group of def.choices) {
    const pool = group.options.filter(o => o.weight > 0 && Number.isFinite(o.weight)
      && (!group.uniqueBy || !o.exclusiveKey || !usedChoices.has(`${group.uniqueBy}:${o.exclusiveKey}`)));
    if (!pool.length) continue;
    const total = pool.reduce((n, o) => n + o.weight, 0);
    if (!Number.isFinite(total)) throw new Error('Unique choice weight overflow');
    let roll = rng() * total;
    const option = pool.find(o => (roll -= o.weight) < 0) ?? pool[pool.length - 1];
    if (group.uniqueBy && option.exclusiveKey) usedChoices.add(`${group.uniqueBy}:${option.exclusiveKey}`);
    const rolls = option.lines.map(() => magnitude());
    for (let i = 1; i < rolls.length; i++) if (option.lines[i].sharedRoll) rolls[i] = rolls[0];
    result[group.id] = { id: option.id, rolls };
  }
  return result;
}

function resolveUniqueChoices(item: ItemInstance, def: UniqueDef): Record<string, UniqueChoiceRoll> | undefined {
  if (!def.choices?.length) return undefined;
  const result: Record<string, UniqueChoiceRoll> = {};
  const usedChoices = new Set<string>();
  for (const group of def.choices) {
    let seed = item.uid ^ Math.imul(item.ilvl, 0x9e3779b9);
    for (const c of `${def.id}:${group.id}`) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
    const rng = new Random(seed >>> 0);
    const stored = item.uniqueChoices?.[group.id];
    const available = (o: UniqueChoiceGroup['options'][number]): boolean => !group.uniqueBy || !o.exclusiveKey
      || !usedChoices.has(`${group.uniqueBy}:${o.exclusiveKey}`);
    const option = stored && group.options.find(o => o.id === stored.id && available(o));
    if (option) {
      const rolls = option.lines.map((_, i) => {
        const value = stored.rolls?.[i];
        return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
      });
      for (let i = 1; i < rolls.length; i++) if (option.lines[i].sharedRoll) rolls[i] = rolls[0];
      result[group.id] = { id: option.id, rolls };
    } else {
      const fallback = rollUniqueChoices({ ...def, choices: [{ ...group, options: group.options.filter(available) }] }, () => rng.next())?.[group.id];
      if (fallback) result[group.id] = fallback;
    }
    const chosen = option ?? group.options.find(o => o.id === result[group.id]?.id);
    if (group.uniqueBy && chosen?.exclusiveKey) usedChoices.add(`${group.uniqueBy}:${chosen.exclusiveKey}`);
  }
  return result;
}

function rolledUniqueLines(item: ItemInstance, def: UniqueDef): { line: RangedLineDef; roll: number }[] {
  const rows = def.lines.map((line, i) => ({ line, roll: item.uniqueRolls?.[i] ?? 0.5 }));
  const choices = resolveUniqueChoices(item, def);
  for (const group of def.choices ?? []) {
    const selected = choices?.[group.id];
    const option = group.options.find(o => o.id === selected?.id);
    option?.lines.forEach((line, i) => rows.push({ line, roll: selected!.rolls[i] }));
  }
  return rows;
}

function pickWeighted<T extends { weight: number }>(arr: readonly T[], rng: RngFn): T | null {
  let total = 0;
  for (const e of arr) total += Math.max(0, e.weight);
  if (total <= 0) return null;
  if (!Number.isFinite(total)) throw new Error('Item selection weight overflow');
  let r = rng() * total;
  for (const e of arr) {
    r -= Math.max(0, e.weight);
    if (r <= 0) return e;
  }
  return arr[arr.length - 1] ?? null;
}

function droppableBases(): ItemBaseDef[] {
  return Object.values(ITEM_BASES).filter(
    b => b.dropWeight > 0 && isCarriableCategory(b.category),
  );
}

function basePool(ilvl: number, category?: ItemCategory): ItemBaseDef[] {
  return droppableBases().filter(b =>
    (category === undefined || b.category === category) &&
    (b.minIlvl === undefined || ilvl >= b.minIlvl));
}

function affixPoolsFor(base: ItemBaseDef): { prefix: AffixDef[]; suffix: AffixDef[] } {
  let pools = affixPoolCache.get(base.id);
  if (pools) return pools;
  const baseTags = new Set([...base.tags, base.category]);
  // THE POOL LAW (ItemBaseDef.affixPool): an UNTAGGED family is a catch-all
  // that rolls everywhere on an 'open' base; an 'explicit' base admits only
  // families that NAME one of its tags — its own register and nothing else.
  const openPool = base.affixPool !== 'explicit';
  const fits = (a: AffixDef): boolean =>
    (a.tags ? a.tags.some(t => baseTags.has(t)) : openPool) &&
    (!a.excludeTags || !a.excludeTags.some(t => baseTags.has(t)));
  pools = {
    prefix: ITEM_AFFIX_LIST.filter(a => a.kind === 'prefix' && fits(a)),
    suffix: ITEM_AFFIX_LIST.filter(a => a.kind === 'suffix' && fits(a)),
  };
  affixPoolCache.set(base.id, pools);
  return pools;
}

function improveAffixQuality(affixes: AffixRollState[], ilvl: number, rarity: ItemRarity,
  quality: AffixQuality, rng: RngFn): void {
  if (rarity !== 'magic' && rarity !== 'rare') return;
  const floor = Math.max(0, Math.min(1, quality.rollFloor));
  for (const a of affixes) a.rolls = a.rolls.map(r => floor + (1 - floor) * r);
  const pool = [...affixes];
  for (let i = 0; i < Math.max(0, Math.floor(quality.bestTierCount)) && pool.length; i++) {
    const a = pool.splice(Math.min(pool.length - 1, Math.floor(rng() * pool.length)), 1)[0];
    const def = ITEM_AFFIXES[a.id];
    const best = def && eligibleTiers(def, ilvl, rarity)[0];
    if (best) a.tier = Math.min(a.tier, best.index);
  }
}

function eligibleTiers(def: AffixDef, ilvl: number, rarity: ItemRarity): EligibleTier[] {
  const out: EligibleTier[] = [];
  for (let i = 0; i < def.tiers.length; i++) {
    const t = def.tiers[i];
    if (t.ilvl > ilvl) continue;
    if (t.magicOnly && rarity !== 'magic') continue;
    out.push({ index: i, def: t });
  }
  return out; // best-first, mirroring def.tiers
}

function pickTier(def: AffixDef, ilvl: number, rarity: ItemRarity, rng: RngFn): number | null {
  const elig = eligibleTiers(def, ilvl, rarity);
  if (elig.length === 0) return null;
  const topIlvl = ITEM_CFG.tierBreaks[ITEM_CFG.tierBreaks.length - 1];
  const t = Math.max(0, Math.min(1, ilvl / topIlvl));
  const bias = ITEM_CFG.rare.tierBias.low + (ITEM_CFG.rare.tierBias.high - ITEM_CFG.rare.tierBias.low) * t;
  const weighted = elig.map((e, rank) => ({
    e,
    weight: e.def.weight
      * (rarity === 'rare' ? Math.pow(bias, rank) : 1)
      * (e.def.magicOnly ? ITEM_CFG.magic.exquisiteWeightMult : 1),
  }));
  const over = ITEM_CFG.magic.overroll;
  if (rarity === 'magic' && over.chance > 0 && rng() < over.chance) {
    // Walk UP from the best normally-eligible tier (tiers are best-first).
    const bestElig = elig[0].index;
    for (let step = 1; step <= over.maxSteps; step++) {
      const idx = bestElig - step;
      if (idx < 0) break;
      const above = def.tiers[idx];
      if (above.magicOnly && !over.canReachExquisite) continue;
      weighted.push({
        e: { index: idx, def: above },
        weight: above.weight * Math.pow(over.stepDecay, step),
      });
    }
  }
  return pickWeighted(weighted, rng)?.e.index ?? null;
}

function rollLineSet(count: number, rng: RngFn): number[] {
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(rng());
  return rolls;
}

function affinityMult(base: ItemBaseDef, def: AffixDef): number {
  if (!base.affinity || !def.themes) return 1;
  let mult = 1;
  for (const t of def.themes) mult *= base.affinity[t] ?? 1;
  return mult;
}

function rollOneAffix(
  base: ItemBaseDef, pool: AffixDef[], used: Set<string>, ilvl: number, rarity: ItemRarity, rng: RngFn,
): AffixRollState | null {
  let byRarity = weightedPoolCache.get(pool);
  if (!byRarity) { byRarity = new Map(); weightedPoolCache.set(pool, byRarity); }
  let compiled = byRarity.get(rarity);
  if (!compiled || compiled.level !== ilvl) {
    const definitions = pool.filter(a => a.tiers.some(t => t.ilvl <= ilvl && (!t.magicOnly || rarity === 'magic')));
    const weights = new Float64Array(definitions.length);
    for (let i = 0; i < definitions.length; i++) {
      weights[i] = Math.max(0, definitions[i].weight * affinityMult(base, definitions[i]));
      if (!Number.isFinite(weights[i])) throw new Error('Affix weight overflow');
    }
    compiled = { level: ilvl, definitions, weights }; byRarity.set(rarity, compiled);
  }
  const { definitions, weights } = compiled;
  let total = 0;
  let def: AffixDef | undefined;
  for (let i = 0; i < definitions.length; i++) if (!used.has(definitions[i].family)) {
    total += weights[i]; def = definitions[i];
  }
  if (total <= 0) return null;
  if (!Number.isFinite(total)) throw new Error('Affix pool weight overflow');
  let roll = rng() * total;
  for (let i = 0; i < definitions.length; i++) if (!used.has(definitions[i].family)) {
    roll -= weights[i];
    if (roll <= 0) { def = definitions[i]; break; }
  }
  if (!def) return null;
  const tier = pickTier(def, ilvl, rarity, rng);
  if (tier === null) return null;
  used.add(def.family);
  const rolls = rollLineSet(def.lines.length, rng);
  for (let i = 1; i < def.lines.length; i++) if (def.lines[i].sharedRoll) rolls[i] = rolls[0];
  return { id: def.id, tier, rolls };
}

function affixCapsFor(base: ItemBaseDef, rarity: ItemRarity): { prefixes: number; suffixes: number } {
  const r = ITEM_CFG.affixSlots[rarity];
  const own = base.affixCap;
  if (!own) return r;
  return {
    prefixes: Math.min(r.prefixes, own.prefix ?? r.prefixes),
    suffixes: Math.min(r.suffixes, own.suffix ?? r.suffixes),
  };
}

function rollAffixSet(base: ItemBaseDef, ilvl: number, rarity: ItemRarity, rng: RngFn): AffixRollState[] {
  const caps = affixCapsFor(base, rarity);
  if (caps.prefixes + caps.suffixes === 0) return [];
  let nPre = 0;
  let nSuf = 0;
  if (rarity === 'magic') {
    if (rng() < ITEM_CFG.magic.bothChance) { nPre = 1; nSuf = 1; }
    else if (rng() < 0.5) nPre = 1;
    else nSuf = 1;
  } else {
    const total = Math.min(
      caps.prefixes + caps.suffixes,
      pickWeighted(ITEM_CFG.rare.countWeights, rng)?.count ?? ITEM_CFG.rare.countWeights[0].count,
    );
    for (let i = 0; i < total; i++) {
      const preOpen = caps.prefixes - nPre;
      const sufOpen = caps.suffixes - nSuf;
      if (preOpen <= 0 && sufOpen <= 0) break;
      if (rng() * (preOpen + sufOpen) < preOpen) nPre++;
      else nSuf++;
    }
  }
  const pools = affixPoolsFor(base);
  const used = new Set<string>();
  const out: AffixRollState[] = [];
  // Custom packs can explicitly disable one kind. The original authored pack
  // did not exercise zero-sided magic caps; honor that supported data contract.
  nPre = Math.min(nPre, caps.prefixes); nSuf = Math.min(nSuf, caps.suffixes);
  for (let i = 0; i < nPre; i++) {
    const a = rollOneAffix(base, pools.prefix, used, ilvl, rarity, rng);
    if (a) out.push(a);
  }
  for (let i = 0; i < nSuf; i++) {
    const a = rollOneAffix(base, pools.suffix, used, ilvl, rarity, rng);
    if (a) out.push(a);
  }
  return out;
}

function forceFamilyAffix(
  base: ItemBaseDef, affixes: AffixRollState[], family: string,
  ilvl: number, rarity: ItemRarity, rng: RngFn,
): void {
  if (affixes.some(a => ITEM_AFFIXES[a.id]?.family === family)) return;
  const pools = affixPoolsFor(base);
  const def = pools.prefix.find(a => a.family === family)
    ?? pools.suffix.find(a => a.family === family);
  if (!def) return;
  const caps = affixCapsFor(base, rarity);
  const cap = def.kind === 'prefix' ? caps.prefixes : caps.suffixes;
  if (cap <= 0) return;
  const tier = pickTier(def, ilvl, rarity, rng);
  if (tier === null) return;
  const sameKind = affixes.filter(a => ITEM_AFFIXES[a.id]?.kind === def.kind);
  if (cap > 0 && sameKind.length >= cap) {
    const evict = sameKind[Math.floor(rng() * sameKind.length)];
    affixes.splice(affixes.indexOf(evict), 1);
  }
  const rolls = rollLineSet(def.lines.length, rng);
  for (let i = 1; i < def.lines.length; i++) if (def.lines[i].sharedRoll) rolls[i] = rolls[0];
  affixes.push({ id: def.id, tier, rolls });
}

function affixName(a: AffixRollState): string {
  const def = ITEM_AFFIXES[a.id];
  if (!def) return '';
  return def.names[Math.min(a.tier, def.names.length - 1)] ?? '';
}

function mintName(
  base: ItemBaseDef, tier: number, rarity: ItemRarity,
  affixes: AffixRollState[], unique: UniqueDef | undefined,
  superior: boolean, rng: RngFn,
): string {
  const tiered = tieredBaseName(base, tier);
  if (unique) return unique.name;
  if (rarity === 'common') return (superior ? 'Superior ' : '') + tiered;
  if (rarity === 'magic') {
    const pre = affixes.find(a => ITEM_AFFIXES[a.id]?.kind === 'prefix');
    const suf = affixes.find(a => ITEM_AFFIXES[a.id]?.kind === 'suffix');
    return [pre ? affixName(pre) : '', tiered, suf ? affixName(suf) : '']
      .filter(Boolean).join(' ');
  }
  const names = ITEM_CFG.rareNames;
  return names.first[Math.floor(rng() * names.first.length)]
    + names.second[Math.floor(rng() * names.second.length)];
}

function rollRarity(opts: RollItemOpts, rng: RngFn): ItemRarity {
  const table = ITEM_RARITY_IDS.map(id => ({
    id, weight: opts.rarityCeiling && ITEM_RARITY_IDS.indexOf(id) > ITEM_RARITY_IDS.indexOf(opts.rarityCeiling)
      ? 0 : opts.rarityWeights?.[id] ?? ITEM_CFG.rarityWeights[id],
  }));
  return pickWeighted(table, rng)?.id ?? 'common';
}

function candidateUniques(ilvl: number, category?: ItemCategory, baseId?: string): UniqueDef[] {
  return UNIQUE_LIST.filter(u => {
    if (u.minIlvl !== undefined && ilvl < u.minIlvl) return false;
    const base = ITEM_BASES[u.baseId];
    if (!base) return false;
    if (category !== undefined && base.category !== category) return false;
    if (baseId !== undefined && u.baseId !== baseId) return false;
    return true;
  });
}

function rollItem(opts: RollItemOpts): ItemInstance | null {

  const rng = opts.rng!;
  const ilvl = Math.max(1, Math.round(opts.ilvl));

  let unique: UniqueDef | undefined = opts.uniqueId ? UNIQUES[opts.uniqueId] : undefined;
  if (opts.uniqueId && !unique) return null;
  let rarity: ItemRarity = unique ? 'unique' : opts.rarity ?? rollRarity(opts, rng);
  // A forced-family pull needs an affix SLOT: commons promote to magic (the
  // themed cache must always pay); an explicit/rolled magic+ stands as-is.
  if (opts.withFamily && !unique && rarity === 'common') rarity = 'magic';
  const ceiling = opts.rarityCeiling ? ITEM_RARITY_IDS.indexOf(opts.rarityCeiling) : Infinity;
  if (ITEM_RARITY_IDS.indexOf(rarity) > ceiling) return null;

  if (rarity === 'unique' && !unique) {
    const pool = candidateUniques(ilvl, opts.category, opts.baseId);
    unique = pickWeighted(pool, rng) ?? undefined;
    if (!unique) rarity = 'rare'; // no legend fits — degrade gracefully
  }

  // THE THEMED-CACHE AIM: a forced family constrains the base LOTTERY to
  // bases that can actually carry it — the tag gate itself is still never
  // bent (an explicit baseId/category that misfits keeps skipping the
  // force), this only aims the open pick. Without it a register cache paid
  // a plain piece whenever the dice drew a base outside the family's tags:
  // a silently unthemed payout every themed table shares (royal / drowned /
  // pastoral). Falls back to the whole pool when nothing fits — a themed
  // pull must degrade to an ordinary item, never to null.
  let openPool = basePool(ilvl, opts.category).filter(b => ITEM_RARITY_IDS.indexOf(b.minRarity ?? 'common') <= ceiling);
  if (opts.withFamily && !unique && !opts.baseId) {
    const fits = openPool.filter(b => {
      const pools = affixPoolsFor(b);
      return pools.prefix.some(a => a.family === opts.withFamily)
        || pools.suffix.some(a => a.family === opts.withFamily);
    });
    if (fits.length) openPool = fits;
  }
  const base = unique
    ? ITEM_BASES[unique.baseId]
    : opts.baseId
      ? ITEM_BASES[opts.baseId]
      : pickWeighted(openPool.map(b => ({ b, weight: b.dropWeight })), rng)?.b;
  if (!base) return null;
  if (ITEM_RARITY_IDS.indexOf(base.minRarity ?? 'common') > ceiling) return null;
  // THE RARITY FLOOR (ItemBaseDef.minRarity): a family that never drops
  // below a rarity PROMOTES a lower roll — the withFamily common→magic
  // shape, authored per base (a relic with no lines is nothing). Uniques
  // stand outside the ladder; an explicit lower ask is lifted the same way.
  if (base.minRarity && !unique && ITEM_RARITY_IDS.indexOf(rarity) < ITEM_RARITY_IDS.indexOf(base.minRarity)) {
    rarity = base.minRarity;
  }

  const tier = tierForIlvl(ilvl);
  const superior = rarity === 'common' && rng() < ITEM_CFG.superior.chance;
  const affixes = rarity === 'magic' || rarity === 'rare'
    ? rollAffixSet(base, ilvl, rarity, rng)
    : [];
  if (opts.withFamily && !unique && (rarity === 'magic' || rarity === 'rare')) {
    forceFamilyAffix(base, affixes, opts.withFamily, ilvl, rarity, rng);
  }
  if (opts.affixQuality) improveAffixQuality(affixes, ilvl, rarity, opts.affixQuality, rng);

  const item: ItemInstance = {
    uid: nextItemUid(),
    baseId: base.id,
    ilvl,
    tier,
    rarity,
    name: mintName(base, tier, rarity, affixes, unique, superior, rng),
    baseRoll: rng(),
    implicitRolls: (base.implicits ?? []).map(() => rng()),
    affixes,
  };
  if (superior) item.superior = rng();
  // SOCKETS: a low-weight bonus — whites both chance-richer AND count-fatter
  // (ITEM_CFG.sockets), clamped to the category's absolute cap.
  const cap = socketCap(base.category);
  if (cap > 0 && rng() < ITEM_CFG.sockets.chanceByRarity[rarity]) {
    const n = Math.min(cap, pickWeighted(ITEM_CFG.sockets.countWeights[rarity], rng)?.n ?? 1);
    item.sockets = new Array<string | null>(n).fill(null);
  }
  if (unique) {
    item.uniqueId = unique.id;
    item.uniqueRolls = rollLineSet(unique.lines.length, rng);
    if (unique.choices?.length) item.uniqueChoices = rollUniqueChoices(unique, rng);
    for (let i = 1; i < unique.lines.length; i++) {
      if (unique.lines[i].sharedRoll) item.uniqueRolls[i] = item.uniqueRolls[0];
    }
  }
  return item;
}

function forgeItem(opts: ForgeItemOpts): ItemInstance | null {

  const rng = opts.rng!;
  const q = opts.quality;
  const roll = (): number => (q !== undefined ? Math.min(1, Math.max(0, q)) : rng());
  const rollSet = (n: number): number[] => { const out: number[] = []; for (let i = 0; i < n; i++) out.push(roll()); return out; };
  const ilvl = Math.max(1, Math.round(opts.ilvl));

  const unique = opts.uniqueId ? UNIQUES[opts.uniqueId] : undefined;
  if (opts.uniqueId && !unique) return null;
  const rarity: ItemRarity = unique ? 'unique' : opts.rarity ?? (opts.affixes?.length ? 'rare' : 'common');
  const base = ITEM_BASES[unique?.baseId ?? opts.baseId ?? ''];
  if (!base) return null;

  const caps = affixCapsFor(base, rarity);
  const pools = affixPoolsFor(base);
  const used = new Set<string>();
  const counts: Record<AffixKind, number> = { prefix: 0, suffix: 0 };
  const affixes: AffixRollState[] = [];
  for (const pick of opts.affixes ?? []) {
    const def = ITEM_AFFIXES[pick.id];
    if (!def || used.has(def.family)) continue;
    if (!(def.kind === 'prefix' ? pools.prefix : pools.suffix).includes(def)) continue;
    if (counts[def.kind] >= (def.kind === 'prefix' ? caps.prefixes : caps.suffixes)) continue;
    const tier = pick.tier !== undefined
      ? Math.max(0, Math.min(def.tiers.length - 1, Math.round(pick.tier)))
      : eligibleTiers(def, ilvl, rarity)[0]?.index ?? def.tiers.length - 1;
    used.add(def.family);
    counts[def.kind]++;
    const rolls = rollSet(def.lines.length);
    for (let i = 1; i < def.lines.length; i++) if (def.lines[i].sharedRoll) rolls[i] = rolls[0];
    affixes.push({ id: def.id, tier, rolls });
  }
  if (opts.fillRandom) {
    for (const kind of ['prefix', 'suffix'] as const) {
      const cap = kind === 'prefix' ? caps.prefixes : caps.suffixes;
      const pool = kind === 'prefix' ? pools.prefix : pools.suffix;
      while (counts[kind] < cap) {
        const a = rollOneAffix(base, pool, used, ilvl, rarity, rng);
        if (!a) break; // pool exhausted for this kind
        if (q !== undefined) a.rolls = a.rolls.map(() => Math.min(1, Math.max(0, q)));
        counts[kind]++;
        affixes.push(a);
      }
    }
  }

  const tier = tierForIlvl(ilvl);
  const superior = rarity === 'common' && (opts.superior ?? false);
  const item: ItemInstance = {
    uid: nextItemUid(),
    baseId: base.id,
    ilvl,
    tier,
    rarity,
    name: mintName(base, tier, rarity, affixes, unique, superior, rng),
    baseRoll: roll(),
    implicitRolls: (base.implicits ?? []).map(() => roll()),
    affixes,
  };
  if (superior) item.superior = roll();
  const cap = socketCap(base.category);
  if (opts.sockets !== undefined) {
    const n = Math.max(0, Math.min(cap, Math.round(opts.sockets)));
    if (n > 0) item.sockets = new Array<string | null>(n).fill(null);
  } else if (cap > 0 && rng() < ITEM_CFG.sockets.chanceByRarity[rarity]) {
    const n = Math.min(cap, pickWeighted(ITEM_CFG.sockets.countWeights[rarity], rng)?.n ?? 1);
    item.sockets = new Array<string | null>(n).fill(null);
  }
  if (unique) {
    item.uniqueId = unique.id;
    item.uniqueRolls = rollSet(unique.lines.length);
    if (unique.choices?.length) item.uniqueChoices = rollUniqueChoices(unique, rng, roll);
    for (let i = 1; i < unique.lines.length; i++) {
      if (unique.lines[i].sharedRoll) item.uniqueRolls[i] = item.uniqueRolls[0];
    }
  }
  return item;
}

function rangedLineValue(line: RangedLineDef, roll: number, tier: number, defaultScale: number): number {
  const scale = 1 + (line.tierScale ?? defaultScale) * (tier - 1);
  return roundStatValue(lerpRange(line.range, roll, scale));
}

function defenseMods(base: ItemBaseDef, item: ItemInstance): Modifier[] {
  if (!base.defense) return [];
  const budget = defenseBudget(item.ilvl, item.tier, base.category) * (1 + baseBonusFor(item));
  const totalW = Object.values(base.defense).reduce((s, w) => s + w, 0);
  if (budget <= 0 || totalW <= 0) return [];
  const out: Modifier[] = [];
  for (const [kind, w] of Object.entries(base.defense)) {
    const def = DEFENSE_KINDS[kind];
    if (!def) continue;
    const value = Math.round(budget * (w / totalW) * def.coeff);
    if (value > 0) out.push({ stat: def.stat, kind: 'flat', value });
  }
  return out;
}

function eachItemLine(
  base: ItemBaseDef, item: ItemInstance,
  visit: (line: ModLineDef, value: number) => void,
): void {
  (base.implicits ?? []).forEach((line, i) => {
    visit(line, rangedLineValue(line, item.implicitRolls[i] ?? 0.5, item.tier, ITEM_CFG.implicitTierScale));
  });
  for (const a of item.affixes) {
    const def = ITEM_AFFIXES[a.id];
    const tierDef = def?.tiers[a.tier];
    if (!def || !tierDef) continue;
    def.lines.forEach((line, i) => {
      const roll = line.sharedRoll ? a.rolls[0] : a.rolls[i];
      visit(line, roundStatValue(lerpRange(tierDef.ranges[i], roll ?? 0.5)));
    });
  }
  if (item.uniqueId) {
    const unique = UNIQUES[item.uniqueId];
    if (unique) for (const { line, roll } of rolledUniqueLines(item, unique)) {
      const value = rangedLineValue(line, roll, base.category === 'relic' ? 1 : item.tier, ITEM_CFG.uniqueTierScale);
      visit(line, base.category === 'relic' ? relicUniqueValue({ ...line, value }) : value);
    }
  }
}

function foldOwnStats(base: ItemBaseDef, item: ItemInstance): OwnStatFold[] {
  const seed = new Map<string, number>();
  for (const m of defenseMods(base, item)) seed.set(m.stat, m.value);
  const flat = new Map<string, number>();
  const inc = new Map<string, number>();
  const more = new Map<string, number>();
  const touched = new Set<string>();
  eachItemLine(base, item, (line, v) => {
    if (!line.local) return;
    touched.add(line.stat);
    if (line.kind === 'flat') flat.set(line.stat, (flat.get(line.stat) ?? 0) + v);
    else if (line.kind === 'increased') inc.set(line.stat, (inc.get(line.stat) ?? 0) + v);
    else if (line.kind === 'more') more.set(line.stat, (1 + (more.get(line.stat) ?? 0)) * (1 + v) - 1);
  });
  // Registry order first (armor, evasion, ES, poise, …), created stats after.
  const order = [...new Set([
    ...Object.values(DEFENSE_KINDS).map(k => k.stat).filter(s => seed.has(s) || touched.has(s)),
    ...seed.keys(), ...touched.keys(),
  ])];
  const out: OwnStatFold[] = [];
  for (const stat of order) {
    const value = roundStatValue(Math.max(0,
      ((seed.get(stat) ?? 0) + (flat.get(stat) ?? 0))
      * (1 + (inc.get(stat) ?? 0)) * (1 + (more.get(stat) ?? 0))));
    if (value > 0) out.push({ stat, value, augmented: touched.has(stat) });
  }
  return out;
}

function compileItemMods(item: ItemInstance): Modifier[] {
  const base = ITEM_BASES[item.baseId];
  if (!base) return [];
  const out: Modifier[] = foldOwnStats(base, item)
    .map(f => ({ stat: f.stat, kind: 'flat' as const, value: f.value }));

  eachItemLine(base, item, (line, value) => {
    if (line.local) return; // already folded into the item-own stats above
    out.push({
      stat: line.stat, kind: line.kind, value,
      tags: line.tags, when: line.when, fromStat: line.fromStat, gauge: line.gauge,
      gaugeAt: line.gaugeAt,
    });
  });

  // SOCKETED VESTIGES: deterministic lines by the HOST's category ('default'
  // fallback) — the same Kessa reads differently in a chest than in gloves,
  // but identically in every chest. An activated EPITAPH (white base, exact
  // sequence — epitaphFor owns the whole contract) adds its word's lines ON
  // TOP of every vestige's own.
  if (item.sockets) {
    for (const vid of item.sockets) {
      if (!vid) continue;
      const v = VESTIGES[vid];
      const lines: VestigeLine[] = v?.effects[base.category] ?? v?.effects.default ?? [];
      for (const ln of lines) {
        out.push({ stat: ln.stat, kind: ln.kind, value: ln.value, tags: ln.tags, when: ln.when });
      }
    }
    const epi = epitaphFor(item.rarity, base.category, item.sockets);
    for (const ln of epi?.effects ?? []) {
      out.push({ stat: ln.stat, kind: ln.kind, value: ln.value, tags: ln.tags, when: ln.when });
    }
  }
  return out;
}
return { rollItem, forgeItem, compileItemMods, foldOwnStats, resolveUniqueChoices, tierForIlvl };
}
