export type MemoryKind = 'skill' | 'support';
export type MemoryTier = 'discovery' | 'secondary';
export type MemoryMechanic = 'tree' | 'commission' | 'prestige';

export interface MemoryCandidate {
  readonly kind: MemoryKind;
  readonly id: string;
  readonly name: string;
  readonly weight: number;
}

export interface MemorySkillRow {
  readonly id: string;
  readonly name: string;
  readonly noDrop?: boolean;
  readonly dropWeight?: number;
}

export interface MemorySupportRow {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
}

/** Build the ordered authored drop catalogue. Content loaders can retain this
 * result, while live registry adapters rebuild it at their revision boundary. */
export function buildMemoryCatalog(skills: readonly MemorySkillRow[], supports: readonly MemorySupportRow[], excluded?: readonly string[]): MemoryCandidate[] {
  const result: MemoryCandidate[] = [];
  for (const skill of skills) {
    const weight = skill.dropWeight ?? 100;
    if (!skill.noDrop && weight > 0 && !excluded?.includes(memoryKey('skill', skill.id))) {
      result.push({ kind: 'skill', id: skill.id, name: skill.name, weight });
    }
  }
  for (const support of supports) {
    if (support.weight > 0 && !excluded?.includes(memoryKey('support', support.id))) {
      result.push({ kind: 'support', id: support.id, name: support.name, weight: support.weight });
    }
  }
  return result;
}

export interface MemoryRewardDefinition {
  readonly id: string;
  readonly tier: MemoryTier;
  readonly weights: Readonly<Record<MemoryKind, number>>;
}

export interface MemoryReceipt {
  sequence: number;
  kind: MemoryKind;
  id: string;
  tier: MemoryTier;
}

export interface MemoryAccountView {
  readonly features: ReadonlySet<string>;
  readonly ledger: Readonly<Record<string, number>>;
  readonly unlockedSkills: ReadonlySet<string>;
  readonly unlockedSupports: ReadonlySet<string>;
  readonly memorySecondary: ReadonlySet<string>;
}

export interface MemoryAccount extends MemoryAccountView {
  readonly unlockedSkills: Set<string>;
  readonly unlockedSupports: Set<string>;
  readonly explicitSkillUnlocks: Set<string>;
  readonly memorySecondary: Set<string>;
  readonly memoryReceipts: Record<string, MemoryReceipt | undefined>;
}

export interface MemoryRewardConfig {
  readonly debugCodexBypassesSecondary: boolean;
  readonly weighting: 'uniform' | 'drop';
  readonly excluded: readonly string[];
  readonly weightOverrides: Readonly<Record<string, number>>;
  readonly secondary: {
    readonly mechanics: Readonly<Record<MemoryMechanic, boolean>>;
    readonly kinds: readonly MemoryKind[];
    readonly legendaryFinds: boolean;
    readonly vault: boolean;
  };
}

/** Catalogue rows carry authored drop eligibility and original order. Each
 * returned array and its rows must remain stable through a synchronous call.
 * Immutable content can share them. Live adapters provide detached rows. */
export interface MemoryRewardContext {
  readonly config: MemoryRewardConfig;
  readonly unlockAllFeature: string;
  catalogue(): readonly MemoryCandidate[];
  progressionOpen(ledger: Readonly<Record<string, number>>): boolean;
  gemDropKey(id: string): string;
  canAwakenSkill(id: string): boolean;
}

export const memoryKey = (kind: MemoryKind, id: string): string => kind + ':' + id;

/** Detached query rows preserve the original caller-owned result contract. */
export function memoryCatalog(context: MemoryRewardContext): MemoryCandidate[] {
  const result: MemoryCandidate[] = [];
  for (const row of context.catalogue()) {
    if (!context.config.excluded.includes(memoryKey(row.kind, row.id))) result.push({ ...row });
  }
  return result;
}

export function memoryDiscovered(account: MemoryAccountView, kind: MemoryKind, id: string, context: MemoryRewardContext): boolean {
  return account.features.has(context.unlockAllFeature)
    || (kind === 'skill' ? account.unlockedSkills : account.unlockedSupports).has(id);
}

export function memoryProgressionOpen(account: MemoryAccountView, context: MemoryRewardContext): boolean {
  return context.progressionOpen(account.ledger)
    || (context.config.debugCodexBypassesSecondary && account.features.has(context.unlockAllFeature));
}

export function memorySecondaryOwned(account: MemoryAccountView, kind: MemoryKind, id: string, context: MemoryRewardContext): boolean {
  return memoryProgressionOpen(account, context) && (account.memorySecondary.has(memoryKey(kind, id))
    || (context.config.debugCodexBypassesSecondary && account.features.has(context.unlockAllFeature)));
}

export function memorySecondaryOpen(account: MemoryAccountView, kind: MemoryKind, id: string, mechanic: MemoryMechanic, context: MemoryRewardContext): boolean {
  const secondary = context.config.secondary;
  if (secondary.mechanics[mechanic] && !memoryProgressionOpen(account, context)) return false;
  return !secondary.mechanics[mechanic] || !secondary.kinds.includes(kind)
    || memorySecondaryOwned(account, kind, id, context);
}

export function memoryCommissionReady(account: MemoryAccountView, kind: MemoryKind, id: string, need: number, context: MemoryRewardContext): boolean {
  if (!memoryProgressionOpen(account, context) || !memoryDiscovered(account, kind, id, context)) return false;
  const secondary = context.config.secondary;
  return secondary.mechanics.commission && secondary.kinds.includes(kind)
    ? memorySecondaryOwned(account, kind, id, context)
    : (account.ledger[context.gemDropKey(id)] ?? 0) >= need;
}

/** One pass creates the weighted snapshot. Account eligibility stays live
 * between calls, while catalogue data can be shared across all accounts. */
export function memoryUnlockCandidates(account: MemoryAccountView, definition: MemoryRewardDefinition, context: MemoryRewardContext): MemoryCandidate[] {
  const config = context.config;
  if (definition.tier === 'secondary' && (!config.secondary.vault || !memoryProgressionOpen(account, context))) return [];
  const result: MemoryCandidate[] = [];
  for (const row of context.catalogue()) {
    const key = memoryKey(row.kind, row.id);
    if (config.excluded.includes(key)) continue;
    const eligible = definition.tier === 'discovery'
      ? !memoryDiscovered(account, row.kind, row.id, context)
      : config.secondary.kinds.includes(row.kind)
        && memoryDiscovered(account, row.kind, row.id, context)
        && !memorySecondaryOwned(account, row.kind, row.id, context);
    if (!eligible) continue;
    const weight = definition.weights[row.kind]
      * (config.weighting === 'drop' ? row.weight : 1)
      * (config.weightOverrides[key] ?? 1);
    if (Number.isFinite(weight) && weight > 0) result.push({ kind: row.kind, id: row.id, name: row.name, weight });
  }
  return result;
}

function nextReceiptSequence(account: MemoryAccount, id: string): number | null {
  const previous = Object.hasOwn(account.memoryReceipts, id) ? account.memoryReceipts[id]?.sequence ?? 0 : 0;
  return Number.isSafeInteger(previous) && previous >= 0 && previous < Number.MAX_SAFE_INTEGER ? previous + 1 : null;
}

/** The host provides a synchronous random source. Its exception propagates.
 * The weighted pool precedes that call. A nested grant can advance the receipt
 * sequence, so the sequence is checked again before the outer account writes. */
export function grantMemoryUnlock(account: MemoryAccount, definition: MemoryRewardDefinition, random: () => number, context: MemoryRewardContext): MemoryReceipt | null {
  if (nextReceiptSequence(account, definition.id) === null) return null;
  const pool = memoryUnlockCandidates(account, definition, context);
  if (!pool.length) return null;
  let total = 0;
  for (const row of pool) total += row.weight;
  if (!Number.isFinite(total) || total <= 0) return null;
  const roll = random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) return null;
  const sequence = nextReceiptSequence(account, definition.id);
  if (sequence === null) return null;
  let cursor = roll * total;
  let picked = pool[pool.length - 1];
  for (const row of pool) {
    cursor -= row.weight;
    if (cursor < 0) {
      picked = row;
      break;
    }
  }
  if (definition.tier === 'discovery') {
    (picked.kind === 'skill' ? account.unlockedSkills : account.unlockedSupports).add(picked.id);
    if (picked.kind === 'skill') account.explicitSkillUnlocks.add(picked.id);
  } else {
    account.memorySecondary.add(memoryKey(picked.kind, picked.id));
  }
  const receipt: MemoryReceipt = { sequence, kind: picked.kind, id: picked.id, tier: definition.tier };
  Object.defineProperty(account.memoryReceipts, definition.id, {
    value: receipt, enumerable: true, writable: true, configurable: true,
  });
  return receipt;
}

export function awakenMemoryFromDrop(account: MemoryAccount, id: string, rarity: string | undefined, context: MemoryRewardContext): boolean {
  const secondary = context.config.secondary;
  if (!secondary.legendaryFinds || !secondary.kinds.includes('skill')
    || rarity !== 'legendary' || !context.canAwakenSkill(id)) return false;
  const key = memoryKey('skill', id);
  if (account.memorySecondary.has(key)) return false;
  account.unlockedSkills.add(id);
  account.memorySecondary.add(key);
  return true;
}

export type MemoryAccess = Partial<Record<MemoryMechanic, string[] | null>> & { progression?: boolean };

export function memoryAccessView(account: MemoryAccountView, context: MemoryRewardContext): MemoryAccess {
  const config = context.config;
  return {
    progression: memoryProgressionOpen(account, context),
    ...Object.fromEntries(Object.entries(config.secondary.mechanics).map(([mechanic, gated]) => [mechanic,
      !gated || !config.secondary.kinds.includes('skill')
        || (config.debugCodexBypassesSecondary && account.features.has(context.unlockAllFeature))
        ? null : memoryProgressionOpen(account, context)
          ? [...account.memorySecondary].filter(key => key.startsWith('skill:')).map(key => key.slice(6)) : [],
    ])),
  };
}
