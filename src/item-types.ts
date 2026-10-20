import type { Modifier, ModifierKind } from './types.js';
export type ItemCategory = string;
export type SkillRarity = string;
export type MonsterRarity = string;
export type ModKind = ModifierKind;
export type SkillTag = string;
export type ConditionId = string;
export type ItemRarity = 'common' | 'magic' | 'rare' | 'unique';
export type AffixKind = 'prefix' | 'suffix';
export type RngFn = () => number;
export interface ModLineDef {
  stat: string;
  kind: ModKind;
  tags?: SkillTag[];
  when?: ConditionId;
  /** 'link' lines: gain `value` of fromStat as stat (single-hop rule). */
  fromStat?: string;
  gauge?: string;
  /** With `gauge`: THE GAUGE GATE (Modifier.gaugeAt) — the line applies at
   *  full value only while the gauge stands at or above this count. */
  gaugeAt?: number;
  /** This line re-uses the FIRST line's roll (an all-res block moves as one). */
  sharedRoll?: boolean;
  /** LOCAL SCOPE: the line modifies THIS ITEM's own stats (folded into the
   *  defense header by itemgen) instead of the wearer's sheet. Displays with
   *  ITEM_CFG.localLineSuffix. Legal kinds: flat/increased/more of a plain
   *  stat — no when/tags/gauge/fromStat (the validator warns otherwise). */
  local?: boolean;
}

export interface RangedLineDef extends ModLineDef {
  range: [number, number];
  /** Fractional growth per tier above 1; 0 pins the line flat. */
  tierScale?: number;
  /** Tooltip override; '{v}' is replaced with the formatted value. */
  text?: string;
}

export interface ItemBaseDef {
  id: string;
  /** Family display name; the resolved tier prepends ITEM_CFG.tierNames
   *  (or indexes namesByTier when the family brings its own ladder). */
  name: string;
  category: ItemCategory;
  /** Tetris footprint in bag cells. */
  w: number;
  h: number;
  /** Affix-gating tags (the category id is ALWAYS implied as a tag). */
  tags: string[];
  /** Defense mix as relative weights — {armor:1, evasion:1} splits the slot
   *  budget evenly. Omit for jewelry (implicit-driven, no defense budget). */
  defense?: Record<string, number>;
  /** AFFIX-THEME AFFINITY: theme → weight multiplier applied when rolling
   *  affixes onto THIS base ({caster: 2.5} makes caster-themed lines favor
   *  it). Bias, never a gate — gates stay with AffixDef.tags/excludeTags. */
  affinity?: Record<string, number>;
  /** Identity lines rolled at EVERY rarity (a Coral Ring is always life). */
  implicits?: RangedLineDef[];
  /** THE COMPLEXITY CLASS (the steady hand, walk 2 — her horizontal axis:
   *  intricacy, never strength): 1 plain · 2 fine · 3 ornate. Absent =
   *  DERIVED from what the base IS (defense-lane count for armour, the
   *  implicit count for jewelry — baseComplexityOf), so today's pure
   *  mixes read plain, the hybrid textures read fine, and the ornate
   *  class stands EMPTY until her exotic-base pass authors it (a fire-
   *  for-physical blade, a resistance-baseline plate) — the writ's high
   *  class and the masterwork trace lines turn on that day, by data. */
  complexity?: number;
  /** Optional per-tier display names replacing the generic tier prefixes. */
  namesByTier?: string[];
  /** Weight within its category's drop pool (0 = never drops naturally). */
  dropWeight: number;
  /** The family doesn't exist below this item level (deep-world exclusives). */
  minIlvl?: number;
  /** THE RARITY FLOOR: a family that never drops BELOW this rarity — the
   *  drop roller PROMOTES a lower roll (a relic with no lines is nothing,
   *  so relics floor at magic; the withFamily common→magic promotion is
   *  the same shape). Uniques stand outside the ladder as ever. */
  minRarity?: ItemRarity;
  /** THE AFFIX CAP: this family's OWN ceiling on rolled prefixes/suffixes,
   *  applied UNDER the rarity's caps (ITEM_CFG.affixSlots) — footprint
   *  prices power: a 1×1 charm carries one line each way however rare, an
   *  effigy the rarity's full six. Absent = the rarity's caps alone. */
  affixCap?: Partial<Record<AffixKind, number>>;
  /** THE POOL LAW: 'open' (default) lets every family whose tag gate
   *  passes roll here — INCLUDING untagged catch-all families (attributes,
   *  resists); 'explicit' admits only families that NAME one of this base's
   *  tags, so a base with its own register (relics) rolls its register and
   *  nothing else. The gate itself is never bent — this only decides what
   *  an absent gate means for this base. */
  affixPool?: 'open' | 'explicit';
}

export interface AffixTierDef {
  /** Minimum item level for this tier to enter the pool. */
  ilvl: number;
  /** [min,max] per affix line (index-matched with AffixDef.lines). */
  ranges: [number, number][];
  weight: number;
  magicOnly?: boolean;
}

export interface AffixDef {
  id: string;
  kind: AffixKind;
  /** Mod-group: one item never carries two affixes of the same family. */
  family: string;
  /** Name particles for magic items, tier-indexed best-first (falls back to
   *  the last entry) — prefixes prepend ("Vigorous X"), suffixes append
   *  ("X of the Zephyr"). */
  names: string[];
  /** The stat line shapes; each tier supplies index-matched ranges. */
  lines: ModLineDef[];
  tiers: AffixTierDef[];
  /** Family weight in the roll pool. */
  weight: number;
  /** Rolls only on bases sharing ≥1 tag (undefined = everything). */
  tags?: string[];
  /** Never rolls on bases carrying any of these tags. */
  excludeTags?: string[];
  /** THEME tags ('caster', 'martial', 'summoner', …) — open strings that
   *  meet ItemBaseDef.affinity multipliers. A themed family rolls more
   *  often where the base leans its way; themeless families are neutral. */
  themes?: string[];
}

export interface UniqueDef {
  id: string;
  name: string;
  baseId: string;
  lines: RangedLineDef[];
  /** Independently rolled, persistent families of alternative modifier lines. */
  choices?: UniqueChoiceGroup[];
  flavor?: string;
  /** Weight among the uniques of the same base (boss tables can force ids). */
  weight: number;
  /** Never drops below this item level. */
  minIlvl?: number;
  /** Maximum copies of this identity seated in one container. Omit for no
   * limit. Rolled choices and instance names never change the identity. */
  maxPerContainer?: number;
}

export interface AffixRollState {
  id: string;
  tier: number;
  rolls: number[];
  /** Player-crafted line (the bench, not the drop): capped per item by
   *  CRAFT_CFG.maxCraftedAffixes, excluded from salvage lore, tagged in
   *  tooltips. Sits OUTSIDE the rarity's natural prefix/suffix caps — a
   *  white with one crafted line is the promised customizable base. */
  crafted?: boolean;
  /** ORACLE-LOCKED: this line has been communed over (rerolled) once and is
   *  sealed — the stone answers each question only once. */
  locked?: boolean;
}

export interface GemSocketRow {
  supportId: string; level: number; locked?: boolean;
  /** THE CUT (the support base — engine/supportbase.ts): a chassis gem's
   *  rolled rows, fixed at the vein; rides every serialization verbatim. */
  rolled?: Record<string, string>;
}

export interface SkillGemPayload {
  /** Legendary empowerment investment, independent of normal skill level. */
  empowermentRank?: number;
  replenishmentPaused?: true;
  kind: 'skill';
  skillId: string;
  level: number;
  rarity: SkillRarity;
  sockets: (GemSocketRow | null)[];
  /** GRANTED (reacquired class starter — worthless wherever value mints). */
  granted?: boolean;
  /** THE GRIMOIRE: attuned bestiary form (validated on rebuild). */
  attunedForm?: string;
  /** THE SKILL-MODE TREES: spent node ids (validated at learn). */
  treeNodes?: string[];
}

export interface SupportGemPayload {
  kind: 'support';
  supportId: string;
  level: number;
  /** THE CUT (the support base): fixed at the vein, read in the bag. */
  rolled?: Record<string, string>;
}

export type GemPayload = SkillGemPayload | SupportGemPayload;

export interface MemoryPin {
  k: 'skill' | 'support';
  id: string;
  /** The promised rarity (skills only) — absent = the seeded cut's own roll. */
  r?: SkillRarity;
  /** The promised level — absent = 1 (DROP-AT-1). */
  l?: number;
}

export interface RoughMemoryUnit {
  d: string;
  s: number;
  e?: MonsterRarity;
  t?: string;
  g?: MemoryPin;
  /** Purchased memories retain their counter's rarity ceiling through recall. */
  ceiling?: SkillRarity;
}

export interface ItemInstance {
  /** Account-owned Relic identity; never exported to bag, trade or corpse. */
  relicKey?: string;
  /** Protected quest cargo. Only its owning quest's return leg consumes it. */
  questId?: string;
  uid: number;
  baseId: string;
  ilvl: number;
  /** Base tier resolved at mint from ilvl (tierForIlvl) — frozen thereafter. */
  tier: number;
  rarity: ItemRarity;
  name: string;
  /** 0..1 across this rarity's base-defense window (commons roll widest). */
  baseRoll: number;
  /** SUPERIOR (common-only): 0..1 across the superior extension window. */
  superior?: number;
  /** 0..1 per base implicit line. */
  implicitRolls: number[];
  affixes: AffixRollState[];
  uniqueId?: string;
  /** 0..1 per unique line (present iff uniqueId). */
  uniqueRolls?: number[];
  uniqueChoices?: Record<string, UniqueChoiceRoll>;
  /** THE RESIDENCE ON THE ITEM (THE LEGEND FABRIC — skillgrant_<id>): the
   *  socketed supports + tree picks of every skill THIS item grants, keyed
   *  by skill id — written back by World.recalcSeat from the live granted
   *  instance (every socket/tree mutation recalcs), read when the instance
   *  is minted afresh (equip, load, the wire). Pure JSON like every field
   *  here; a skill or support that left the registry drops tolerantly. */
  grantState?: Record<string, GrantedSkillState>;
  /** SOCKETS: one entry per socket — a VESTIGE id, or null while empty.
   *  Rolled at mint (whites richest: ITEM_CFG.sockets) or chiseled at the
   *  bench (craftedSockets tracks those against the crafted-slot budget).
   *  Vestige effects and EPITAPH activation both derive from this array —
   *  no other socket state exists anywhere. */
  sockets?: (string | null)[];
  /** How many of the sockets were BENCH-ADDED — they share the one
   *  crafted-slot budget with crafted affixes (you chisel OR you inscribe,
   *  not both, unless the Vault sells you a second slot). */
  craftedSockets?: number;
  /** Bag grid position while carried (absent when equipped / on the ground). */
  x?: number;
  y?: number;
  /** THE KEEPER'S MARK (salvageLock intent): a locked piece refuses the
   *  breaker's hammer on BOTH lanes and every salvageBulk sweep passes it
   *  by. Rides the instance verbatim through saves and the co-op wire. */
  locked?: boolean;
  /** THE RESIDENCE (skill-items M1): a loose gem's cargo. Present exactly on
   *  the skill_gem/support_gem wrapper bases; pure JSON like everything else
   *  here. engine/gemitems.ts is the one pack/unpack/validate seam. */
  gem?: GemPayload;
  /** THE STONE (skill-items M2/M3): a Memory pouch's units, append-ordered
   *  (the array IS the count — the ONE stacking family; gems never stack).
   *  Present exactly on the MEMORY_KINDS bases ('rough_memory' /
   *  'preformed_memory'); engine/memories.ts is the seam. Mutations
   *  REPLACE the array (snapshot-alias safety). */
  mem?: RoughMemoryUnit[];
  /** THE SMITH'S WRIT (the steady hand — docs/design/steady-hand.md): a
   *  bounty-paid craft credit. Present exactly on the 'smith_writ' base;
   *  redeemed at Brandt's Forge face by TRACING the piece — the writ is
   *  consumed only at the verdict's mint (atomic; an aborted trace keeps
   *  it). COMPLEXITY is the named class (walk 2 — a pre-walk-2 writ's
   *  `tier` folds in tolerantly at every read). Never stacks; 1×1 by its
   *  base's own grid. */
  writ?: { category: ItemCategory; complexity: number };
}

export interface GrantedSkillState {
  sockets: ({ supportId: string; level: number; locked?: boolean; rolled?: Record<string, string> } | null)[];
  treeNodes?: string[];
}

export interface UniqueChoiceGroup {
  id: string;
  /** Groups sharing this key sample exclusive identities without replacement. */
  uniqueBy?: string;
  options: { id: string; weight: number; lines: RangedLineDef[]; exclusiveKey?: string }[];
}

export interface UniqueChoiceRoll { id: string; rolls: number[] }

export interface AffixQuality {
  bestTierCount: number;
  rollFloor: number;
}

export interface RollItemOpts {
  ilvl: number;
  rng?: RngFn;
  /** Force a rarity (loot-table entries); otherwise weighted by config. */
  rarity?: ItemRarity;
  /** Constrain the base pool to one category. */
  category?: ItemCategory;
  /** Force an exact base family. */
  baseId?: string;
  /** Force an exact unique (implies rarity 'unique' and its base). */
  uniqueId?: string;
  /** Per-call rarity weight overrides layered over ITEM_CFG.rarityWeights. */
  rarityWeights?: Partial<Record<ItemRarity, number>>;
  /** A constrained supplier excludes bases whose native rarity floor exceeds
   * this ceiling; it never downgrades their identity after minting. */
  rarityCeiling?: ItemRarity;
  /** Guarantee ONE affix from this FAMILY (AffixDef.family) on the minted
   *  item — the THEMED-DROP lever (a royal-jelly cache forcing its register;
   *  any future themed cache names any family, pure data). Commons promote
   *  to magic so the line has a slot; uniques ignore it (legends are
   *  authored). Silently skipped when the family cannot roll on the
   *  resolved base — the tag gate is never bent. */
  withFamily?: string;
  affixQuality?: AffixQuality;
}

export interface ForgeAffixPick {
  /** Affix id — must belong to the base's tag-gated pool (illegal picks are
   *  dropped, never bent into an instance no drop could produce). */
  id: string;
  /** Tier INDEX into AffixDef.tiers (best-first, exquisite included). Omitted
   *  = the best ilvl-legal tier; an explicit index may exceed the ilvl gate
   *  on purpose (testing a top tier on a low item). */
  tier?: number;
}

export interface ForgeItemOpts {
  ilvl: number;
  /** Exact base family (or implied by uniqueId). */
  baseId?: string;
  /** Exact unique — implies its base and rarity 'unique'. */
  uniqueId?: string;
  /** Default: 'unique' with uniqueId, else 'rare' when affixes are picked,
   *  else 'common'. */
  rarity?: ItemRarity;
  /** Explicit affix families (family-deduped, kind-capped by the rarity). */
  affixes?: ForgeAffixPick[];
  /** Top up the remaining prefix/suffix slots with normal weighted rolls. */
  fillRandom?: boolean;
  /** Pin EVERY numeric roll (base/superior/implicits/affixes/unique lines) to
   *  this 0..1 quality. Omitted = random, exactly like a drop. */
  quality?: number;
  /** Force the superior implicit (commons only). */
  superior?: boolean;
  /** Exact socket count, clamped to the category cap (0 = none). Omitted =
   *  the natural rarity-weighted roll. */
  sockets?: number;
  rng?: RngFn;
}

export interface OwnStatFold {
  stat: string;
  value: number;
  augmented: boolean;
}
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
