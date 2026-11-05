
import {
  gateMet, gateRowMet, gateRowProgress, gateRowLabel, gateLevelNeeds,
  gateClassLevelNeeds, type GateRow, type GateContext,
} from './progression-gates.js';
import {grantClassBundle, claimEarnedEntry, pendingClassClaims, activateClassClaim, settleClassClaims} from './class-claims.js';
import type {MemoryCandidate, MemoryKind, MemoryRewardDefinition, MemoryReceipt} from './memory-rewards.js';

export interface UnlockMemoryDefinition extends MemoryRewardDefinition {
  readonly label: string;
  readonly description: string;
  readonly cost: number;
}

/** Borrowed synchronous account state. The caller owns persistence and authority. */
export interface UnlockAccount {
  level: number;
  credits: number;
  ledger: Readonly<Record<string, number>>;
  invested: Record<string, number>;
  unlockedSlots: Set<number>;
  unlockedClasses: Set<string>;
  pendingClassUnlocks: Set<string>;
  unlockedClassTiers: Set<string>;
  unlockedSkills: Set<string>;
  unlockedSupports: Set<string>;
  explicitSkillUnlocks: Set<string>;
  features: Set<string>;
  packageUnlocks: Set<string>;
  memoryReceipts: Record<string, MemoryReceipt | undefined>;
  skillGraft: boolean;
  reliquary: {rank: number; invested: number; stash: {pages: number; invested: number}};
  roster: {charId: string; name: string; fallen?: {level: number; fee: number}}[];
}
export interface UnlockPackage<A> {
  id: string; label: string; blurb: string; cost: number;
  alwaysOn?: boolean; pressureless?: boolean; defaultEnabled: boolean;
  unlock: {label: string; test(context: {account: A; ledger: Readonly<Record<string, number>>}): boolean};
  tiers?: readonly {id: string; label: string; requirement: string; cost: number;
    test(context: {account: A; ledger: Readonly<Record<string, number>>}): boolean}[];
}
/** Content references must remain stable during each synchronous operation.
 * Bind live getters for a mutable host registry, or share validated immutable content.
 * Package predicates are explicit authored functions. No string evaluation occurs. */
export interface UnlockContext<A extends UnlockAccount> {
  readonly catalog: readonly Unlockable[];
  unlock(id: string): Unlockable | undefined;
  readonly slotTiers: readonly {slots: number}[];
  readonly classBundles: readonly {classId: string; skillIds: readonly string[]; supportIds?: readonly string[]}[];
  readonly starterSkills: readonly string[];
  readonly memoryConfig: {legacyGemBundles: boolean; showDebugCodex: boolean};
  readonly memoryDefinitions: readonly UnlockMemoryDefinition[];
  readonly classWeb: {revealFrac: number; proseRevealFrac: number; unknownRumor: string};
  readonly gates: GateContext;
  readonly reliquaryFeature: string;
  readonly reliquaryConfig: {maxRank: number; attunement: string; powerPerRank: number};
  readonly relicStash: {initialPages: number; maxPages: number; board: {w: number; h: number}};
  readonly tabs: readonly VaultTabDef[];
  readonly shelfConfig: {stripMinShelves: number; stripMinOwned: number; stripMinStock: number};
  readonly commissionNeed: number;
  packages(): readonly UnlockPackage<A>[];
  package(id: string): UnlockPackage<A> | undefined;
  classBundleId(id: string): string;
  resurrectUnlockId(id: string): string;
  isClassUnlocked(account: A, id: string): boolean;
  unlockedClassCount(account: A): number;
  encipher(text: string): string;
  revealScript(text: string, fraction: number): string;
  awakeningRefusal(): string;
  memoryCatalog(): readonly MemoryCandidate[];
  memoryCommissionReady(account: A, kind: MemoryKind, id: string, need: number): boolean;
  memoryProgressionOpen(account: A): boolean;
  memoryUnlockDef(id: string): UnlockMemoryDefinition | undefined;
  memoryUnlockCandidates(account: A, definition: UnlockMemoryDefinition): readonly MemoryCandidate[];
  grantMemoryUnlock(account: A, definition: UnlockMemoryDefinition, random: () => number): MemoryReceipt | null;
  reliquaryCost(state: A['reliquary']): number;
  reliquaryPower(state: A['reliquary']): number;
  stashPageCost(state: A['reliquary']['stash']): number;
  investReliquary(account: A, amount: number): number;
  investRelicStash(account: A, amount: number): number;
}

interface UnlockBase {
  id: string;
  label: string;
  description: string;
  cost: number;
  /** Minimum ACCOUNT level. Prefer `requiresUnlock` sequencing for ladders —
   *  reserve this for genuine lifetime-milestone rewards. */
  reqLevel?: number;
  /** Other unlock id(s) that must be OWNED before this one surfaces (ANDed). */
  requiresUnlock?: string | string[];
  /** Lifetime-ledger milestone key(s) that must be PRESENT (≥1, ANDed) —
   *  e.g. reached_level_40 + unmade_slain. Generic to every unlock kind. */
  reqLedger?: string | string[];
  /** Lifetime-ledger COUNT thresholds (ANDed): each key must have accrued at
   *  least its value. The presence form above is sugar for `{key: 1}`; this is
   *  for genuine tallies — the Immortal covenant's "die 20 times". */
  reqLedgerCounts?: Record<string, number>;
  /** Minimum size of the account's unlocked-class POOL (starters included).
   *  THE MOOT LAW: a purchase whose value depends on pool depth (a class
   *  SLOT is a hand size — a hand wider than the pool deals nothing) stays
   *  HIDDEN until the pool can actually fill it. Slot tiers author this at
   *  their own slot count; any future pool-fed purchase reuses the gate. */
  reqClasses?: number;
  /** THE GATEWORK (meta/gates.ts): an ANY-OF avenue group — ONE held row
   *  satisfies the whole group (ANDed with every other gate on this entry).
   *  The family law: a ladder rung may open along several independent roads
   *  (reach a level / finish a vocation / turn in a quest), crossed in the
   *  player's own order. `level` avenues automatically join the XP sweep's
   *  milestone stamps via CATALOG_LEVEL_MILESTONES — authoring one here IS
   *  registering its signal. */
  reqAnyOf?: readonly GateRow[];
  /** Surface as a SEALED card once the entry's STRUCTURAL prereqs hold
   *  (requiresUnlock chain + requiresFeature owned) while its dynamic gates
   *  (reqAnyOf / reqLedger / reqLedgerCounts / reqLevel / reqClasses) do
   *  not: visible, named, priced, unbuyable, its unmet avenues printed —
   *  the player SEES the next rung and what roads open it. Default off:
   *  everything else keeps the discovery web's hidden-until-met law. */
  tease?: boolean;
  /** Earned through gameplay, never investment. After the automatic grant,
   *  a free Vault button acknowledges the persistent pending reward. */
  earned?: boolean;
  /** Surface the service only when at least one Memory is eligible. */
  requiresMemoryCommission?: boolean;
}

export type Unlockable =
  | (UnlockBase & { kind: 'power' | 'storage'; payload: { rank: number } })
  | (UnlockBase & { kind: 'slot'; payload: { slotCount: number } })
  | (UnlockBase & { kind: 'class'; payload: { classId: string; skillIds: string[]; supportIds: string[];
      /** Detailed deed instructions; visible only after the objectives reveal. */
      hint?: string;
      /** Identity flavor only: no class name, skill names, or deed instructions. */
      rumor?: string } })
  // THE MASTERY LADDER (data/classTiers.ts): one rung of one class — owned
  // by id (Account.unlockedClassTiers); its skills join the drop pool.
  | (UnlockBase & { kind: 'classtier'; payload: { classId: string; tierId: string; skillIds: string[] } })
  | (UnlockBase & { kind: 'skill'; payload: { skillIds: string[] } })
  | (UnlockBase & { kind: 'support'; payload: { supportIds: string[] } })
  | (UnlockBase & { kind: 'memory'; payload: { memoryUnlockId: string } })
  | (UnlockBase & { kind: 'feature'; requiresFeature?: string; payload: { flag: string } })
  | (UnlockBase & { kind: 'package'; payload: { packageId: string; tierId?: string } })
  // THE SKILL GRAFT — the REPEATABLE charge (never owned): buying arms
  // Account.skillGraft for the NEXT run's start, where the player picks one
  // unlocked skill to ride the class kit at its plainest cut; the run's
  // beginning consumes the charge and the entry returns to the shelf.
  | (UnlockBase & { kind: 'graft'; payload: Record<string, never> })
  // THE RESURRECTION COVENANT (meta/modes.ts onDeath 'fall'): one DYNAMIC
  // entry per FALLEN roster vessel — never owned (the graft's lifecycle:
  // completion is a state change elsewhere), priced at the fee FROZEN on
  // the card at the fall, poured full across any number of reckonings
  // through the standing investment lane; the grant clears the card's
  // fallen stamp and the entry leaves the shelf with it.
  | (UnlockBase & { kind: 'resurrect'; payload: { charId: string } });

export interface ClassObjectiveRead { label: string; frac: number; met: boolean; revealed: boolean }

export interface ClassUnlockRead {
  rows: ClassObjectiveRead[];
  /** At least one objective is readable; individual rows carry their own verdict. */
  revealed: boolean;
  /** Best avenue: completing any one objective earns the class. */
  frac: number;
  /** Every gate holds — the settle will claim it. */
  met: boolean;
}

export type UnlockKind = Unlockable['kind'];

export interface VaultTabDef {
  id: string;
  /** The tab face — keep it one short word; the blurb carries the detail. */
  label: string;
  /** The tab's hover story (rides the face's native title). */
  blurb: string;
  /** Catalog kinds seated on this shelf, in DISPLAY order (browse shelves
   *  only; a multi-kind shelf groups its floor under these, in this order). */
  kinds?: readonly UnlockKind[];
  /** This shelf also hangs the shrouded class-rumor wall. */
  rumors?: boolean;
  /** The trophy case: lists everything OWNED (grouped by kind) instead of a
   *  buying floor. Exactly one shelf wears this. */
  owned?: boolean;
  /** Unseated kinds fold here. Exactly one browse shelf wears this. */
  fallback?: boolean;
  /** Spoken when the shelf has nothing to sell right now (a generic line
   *  covers shelves that don't author one). */
  emptyNote?: string;
}

export interface VaultShelfCensus {
  tab: VaultTabDef;
  /** Purchasable now, seated here (browse shelves; empty on the Owned shelf). */
  stock: Unlockable[];
  /** Owned entries — ALL of them on the Owned shelf, the seated share elsewhere. */
  owned: Unlockable[];
  /** Rumors hanging here (rumor shelves only — the whole undiscovered list,
   *  in catalog order: rumor cards are INDEX-addressed off exactly this). */
  rumors: Unlockable[];
  /** Earned classes waiting for an explicit Unlock click; never priced stock. */
  pending: Unlockable[];
  /** The mystery law's verdict for this shelf. */
  visible: boolean;
}

/** Instance-owned milestone caches preserve original result identity. Construct a new instance when replacing catalogue content. */
export class UnlockLifecycle<A extends UnlockAccount> {
  private readonly classMilestoneCache = new Map<string, number[]>();
  private levelMilestoneCache: number[] | null = null;
  constructor(private readonly context: UnlockContext<A>) {}

  private ownInvestment(a: A, id: string): number {
    return Object.hasOwn(a.invested, id) ? a.invested[id] ?? 0 : 0;
  }

  private writeInvestment(a: A, id: string, value: number): void {
    Object.defineProperty(a.invested, id, {value, writable: true, enumerable: true, configurable: true});
  }

  private validPurchase(a: A, u: Unlockable): boolean {
    const held = u.kind === 'power' ? a.reliquary.invested
      : u.kind === 'storage' ? a.reliquary.stash.invested : this.ownInvestment(a, u.id);
    return Number.isFinite(a.credits) && Number.isFinite(u.cost) && u.cost >= 0
      && Number.isFinite(held);
  }

  private memorySequence(a: A, u: Unlockable): number {
    if (u.kind !== 'memory') return 0;
    const definition = this.context.memoryUnlockDef(u.payload.memoryUnlockId);
    return definition && Object.hasOwn(a.memoryReceipts, definition.id)
      ? a.memoryReceipts[definition.id]?.sequence ?? 0 : 0;
  }

 private readonly claims = {
  owned: (a: A, u: Unlockable) => this.isUnlockOwned(a, u),
  visible: (a: A, u: Unlockable, view?: Readonly<Record<string, number>>) => this.isUnlockVisible(view ? {...a, ledger: view} : a, u),
  clearInvestment: (a: A, id: string) => { delete a.invested[id]; },
  grant: (a: A, u: Unlockable) => this.grantUnlock(a, u),
  markPending: (a: A, u: Unlockable) => { if (u.kind === 'class') a.pendingClassUnlocks.add(u.payload.classId); },
  pending: (a: A, u: Unlockable) => u.kind === 'class' && a.pendingClassUnlocks.has(u.payload.classId),
  activate: (a: A, u: Unlockable) => u.kind === 'class' && a.pendingClassUnlocks.delete(u.payload.classId),
 };

  maxSlotCount(): number {
    return this.context.slotTiers.reduce((m, t) => Math.max(m, t.slots), 0);
}

  classUnlockFor(classId: string): Unlockable | undefined {
    return this.context.unlock(this.context.classBundleId(classId));
}

  shroudedClassUnlocks(a: A): Unlockable[] {
    return this.context.catalog.filter(u => u.kind === 'class' && !!u.earned && !this.isUnlockOwned(a, u) && this.structuralPrereqsMet(a, u));
}

  classUnlockProgress(a: A, u: Unlockable, view?: Readonly<Record<string, number>>): ClassUnlockRead {
    const probe: A = view ? { ...a, ledger: view } : a;
    const owned = this.ownedUnlockById(probe);
    const rows = (u.reqAnyOf ?? []).map(r => {
        const frac = gateRowProgress(probe, r, owned, this.context.gates);
        return { label: gateRowLabel(r, this.context.gates), frac, met: gateRowMet(probe, r, owned, this.context.gates),
            revealed: frac >= this.context.classWeb.revealFrac };
    });
    const best = rows.reduce((m, r) => Math.max(m, r.frac), 0);
    return { rows, frac: best, revealed: rows.some(r => r.revealed), met: this.isUnlockVisible(probe, u) };
}

  classRumorRead(a: A, u: Unlockable) {
    const read = this.classUnlockProgress(a, u);
    const proseFrac = this.context.classWeb.proseRevealFrac > 0 ? read.frac / this.context.classWeb.proseRevealFrac : 1;
    return {
        title: this.context.encipher('unknown calling'),
        body: this.context.revealScript(u.kind === 'class' ? u.payload.rumor ?? this.context.classWeb.unknownRumor : this.context.classWeb.unknownRumor, proseFrac),
        rows: read.rows.map(r => ({ ...r, label: r.revealed ? r.label : this.context.encipher(r.label) })),
        detail: u.kind === 'class' && read.rows.length > 0 && read.rows.every(r => r.revealed)
            ? u.payload.hint ?? '' : '',
        revealed: read.revealed,
    };
}

  pendingClassUnlocks(a: A): Unlockable[] { return pendingClassClaims(this.context.catalog, a, this.claims); }

  acknowledgeClassUnlock(a: A, u: Unlockable): boolean { return activateClassClaim(a, u, this.claims); }

  claimClassUnlock(a: A, u: Unlockable, view?: Readonly<Record<string, number>>): boolean { return claimEarnedEntry(a, u, view, this.claims); }

  settleClassUnlocks(a: A, view?: Readonly<Record<string, number>>): Unlockable[] { return settleClassClaims(this.context.catalog, a, view, this.claims); }

  reconcileClassBundleGems(a: A): void {
    if (!this.context.memoryConfig.legacyGemBundles) {
        const target = this.context.memoryDefinitions.find(r => r.tier === 'discovery');
        if (target)
            for (const u of this.context.catalog) {
                if (u.kind !== 'skill' && u.kind !== 'support')
                    continue;
                const held = this.investedToward(a, u);
                if (held > 0)
                    this.writeInvestment(a, target.id, this.ownInvestment(a, target.id) + held);
                delete a.invested[u.id];
            }
    }
    for (const b of this.context.classBundles)
        if (a.unlockedClasses.has(b.classId)) {
            for (const id of b.skillIds)
                a.unlockedSkills.add(id);
            for (const id of b.supportIds ?? [])
                a.unlockedSupports.add(id);
        }
}

  isSkillUnlockedForSelection(a: A, id: string): boolean {
    if (!a.unlockedSkills.has(id))
        return false;
    if (this.context.starterSkills.includes(id) || a.explicitSkillUnlocks.has(id))
        return true;
    const owners = this.context.classBundles.filter(b => b.skillIds.includes(id));
    if (owners.some(b => this.context.isClassUnlocked(a, b.classId)))
        return true;
    return !owners.some(b => a.pendingClassUnlocks.has(b.classId));
}

  classObjectiveNeeds(): Record<string, number> {
    const needs: Record<string, number> = {};
    const include = (key: string, amount: number) => {
        const previous = Object.hasOwn(needs, key) ? needs[key]! : 0;
        Object.defineProperty(needs, key, {
            value: Math.max(previous, amount), enumerable: true, writable: true, configurable: true,
        });
    };
    for (const u of this.context.catalog) {
        if (u.kind !== 'class' || !u.earned)
            continue;
        for (const r of u.reqAnyOf ?? []) {
            if (r.ledger !== undefined)
                include(r.ledger, r.n ?? 1);
            if (r.classLevel !== undefined) {
                const k = this.context.gates.classLevelLedgerKey(r.classLevel.classId, r.classLevel.level);
                include(k, 1);
            }
        }
    }
    return needs;
}

  classObjectiveKeys(): string[] {
    return Object.keys(this.classObjectiveNeeds());
}

  catalogClassLevelMilestones(classId: string): number[] {
    const hit = this.classMilestoneCache.get(classId);
    if (hit)
        return hit;
    const out = new Set<number>();
    const prefix = this.context.gates.classLevelLedgerKey(classId, 0).slice(0, -1);
    for (const u of this.context.catalog) {
        for (const need of gateClassLevelNeeds(u.reqAnyOf))
            if (need.classId === classId)
                out.add(need.level);
        const keys = [
            ...(u.reqLedger ? (Array.isArray(u.reqLedger) ? u.reqLedger : [u.reqLedger]) : []),
            ...Object.keys(u.reqLedgerCounts ?? {}),
        ];
        for (const k of keys) {
            const suffix = k.startsWith(prefix) ? k.slice(prefix.length) : '';
            if (/^\d+$/.test(suffix))
                out.add(Number(suffix));
        }
    }
    const list = [...out].sort((x, y) => x - y);
    this.classMilestoneCache.set(classId, list);
    return list;
}

  isUnlockOwned(a: A, u: Unlockable): boolean {
    switch (u.kind) {
        case 'power': return a.reliquary.rank >= u.payload.rank;
        case 'storage': return a.reliquary.stash.pages >= u.payload.rank;
        case 'slot': return a.unlockedSlots.has(u.payload.slotCount);
        case 'class': return a.unlockedClasses.has(u.payload.classId);
        case 'classtier': return a.unlockedClassTiers.has(u.id);
        case 'skill': return u.payload.skillIds.every(id => a.unlockedSkills.has(id));
        case 'support': return u.payload.supportIds.every(id => a.unlockedSupports.has(id));
        case 'memory': return false;
        case 'feature': return a.features.has(u.payload.flag);
        case 'package': return a.packageUnlocks.has(u.payload.tierId ?? u.payload.packageId);
        case 'graft': return false;
        case 'resurrect': return false;
    }
}

  resurrectUnlockables(a: A): Unlockable[] {
    return a.roster.filter(r => r.fallen).map(r => ({
        id: this.context.resurrectUnlockId(r.charId), kind: 'resurrect' as const,
        label: `${r.name} (Level ${r.fallen!.level})`,
        description: `An Immortal vessel, fallen. The covenant holds what death cannot keep: `
            + `pour Mortal Essence from your mortal line to resurrect this character. Partial `
            + `investment stays across runs, and when the full fee stands the vessel wakes in `
            + `Lastlight, exactly as it fell (its build whole; its carry went to its own corpse).`,
        cost: r.fallen!.fee,
        payload: { charId: r.charId },
    }));
}

  packageUnlockables(): Unlockable[] {
    const out: Unlockable[] = [];
    for (const p of this.context.packages()) {
        if (p.alwaysOn)
            continue;
        out.push({
            id: `pkg_${p.id}`, kind: 'package',
            label: p.pressureless ? p.label : `${p.label}: Configurable`,
            description: p.blurb, cost: p.cost,
            payload: { packageId: p.id },
        });
        for (const t of p.tiers ?? []) {
            out.push({
                id: `pkg_${p.id}_${t.id}`, kind: 'package',
                label: `${p.label}: ${t.label}`, description: t.requirement, cost: t.cost,
                payload: { packageId: p.id, tierId: t.id },
            });
        }
    }
    return out;
}

  allUnlockables(a?: A): Unlockable[] {
    return [...this.context.catalog.filter(u => this.context.memoryConfig.legacyGemBundles || (u.kind !== 'skill' && u.kind !== 'support')),
        ...this.packageUnlockables(), ...(a ? [...this.resurrectUnlockables(a), ...this.reliquaryUnlockables(a)] : [])];
}

  reliquaryUnlockables(a: A): Unlockable[] {
    const r = a.reliquary, s = r.stash;
    const out: Unlockable[] = [];
    if (r.rank > 0)
        out.push({ id: `reliquary_power_${r.rank}`, kind: 'power',
            label: `Reliquary Empowerment ${r.rank}`, cost: 0,
            description: `Active Relics are empowered by ${Math.round(this.context.reliquaryPower(r) * 100)}% across every life.`, payload: { rank: r.rank } });
    if (s.pages > this.context.relicStash.initialPages)
        out.push({ id: `relic_stash_${s.pages}`, kind: 'storage',
            label: `Relic Stash: ${s.pages} Pages`, cost: 0,
            description: `${s.pages} pages of account storage at the Oracle.`, payload: { rank: s.pages } });
    if (r.rank < this.context.reliquaryConfig.maxRank)
        out.push({ id: `reliquary_power_${r.rank + 1}`, kind: 'power',
            label: `Reliquary Empowerment ${r.rank + 1}`, cost: this.context.reliquaryCost(r), reqLedger: this.context.reliquaryConfig.attunement,
            description: `Empower active Relics by another ${this.context.reliquaryConfig.powerPerRank * 100}%. Current empowerment: +${Math.round(this.context.reliquaryPower(r) * 100)}%. Applies across every life.`, payload: { rank: r.rank + 1 } });
    if (s.pages < this.context.relicStash.maxPages)
        out.push({ id: `relic_stash_${s.pages + 1}`, kind: 'storage',
            label: `Relic Stash: Page ${s.pages + 1}`, cost: this.context.stashPageCost(s),
            description: `Add a ${this.context.relicStash.board.w} × ${this.context.relicStash.board.h} page to your account's Oracle storage.`, payload: { rank: s.pages + 1 } });
    return out;
}

  isUnlockVisible(a: A, u: Unlockable): boolean {
    if (u.kind === 'power' || u.kind === 'storage')
        return a.features.has(this.context.reliquaryFeature)
            && u.payload.rank === (u.kind === 'power' ? a.reliquary.rank : a.reliquary.stash.pages) + 1 && this.staticGateMet(a, u);
    if (!this.context.memoryConfig.legacyGemBundles && (u.kind === 'skill' || u.kind === 'support'))
        return false;
    if (u.id === 'feat_unlock_all_gems' && !this.context.memoryConfig.showDebugCodex)
        return false;
    if (u.kind === 'memory') {
        const def = this.context.memoryUnlockDef(u.payload.memoryUnlockId);
        return !!def && this.context.memoryUnlockCandidates(a, def).length > 0 && this.staticGateMet(a, u);
    }
    if (u.kind === 'graft' && a.skillGraft)
        return false;
    if (u.kind === 'resurrect') {
        return !!a.roster.find(r => r.charId === u.payload.charId)?.fallen;
    }
    if (u.kind !== 'package')
        return this.staticGateMet(a, u);
    const pkg = this.context.package(u.payload.packageId);
    if (!pkg)
        return false;
    if (!u.payload.tierId)
        return pkg.unlock.test({ account: a, ledger: a.ledger });
    if (!a.packageUnlocks.has(pkg.id))
        return false;
    const tiers = pkg.tiers ?? [];
    const idx = tiers.findIndex(t => t.id === u.payload.tierId);
    if (idx < 0)
        return false;
    for (let i = 0; i < idx; i++)
        if (!a.packageUnlocks.has(tiers[i].id))
            return false;
    return tiers[idx].test({ account: a, ledger: a.ledger });
}

  staticGateMet(a: A, u: Unlockable): boolean {
    if (u.requiresMemoryCommission && !this.context.memoryCatalog().some(c => this.context.memoryCommissionReady(a, c.kind, c.id, this.context.commissionNeed)))
        return false;
    if ((u.reqLevel ?? 0) > a.level)
        return false;
    if (u.requiresUnlock) {
        const needs = Array.isArray(u.requiresUnlock) ? u.requiresUnlock : [u.requiresUnlock];
        for (const id of needs) {
            const dep = this.context.unlock(id);
            if (!dep || !this.isUnlockOwned(a, dep))
                return false;
        }
    }
    if (u.reqLedger) {
        const keys = Array.isArray(u.reqLedger) ? u.reqLedger : [u.reqLedger];
        if (keys.some(k => (a.ledger[k] ?? 0) < 1))
            return false;
    }
    if (u.reqLedgerCounts) {
        for (const [k, n] of Object.entries(u.reqLedgerCounts)) {
            if ((a.ledger[k] ?? 0) < n)
                return false;
        }
    }
    if (u.reqClasses !== undefined && this.context.unlockedClassCount(a) < u.reqClasses)
        return false;
    if (u.kind === 'feature' && u.requiresFeature && !a.features.has(u.requiresFeature))
        return false;
    if (!gateMet(a, u.reqAnyOf, 'any', this.ownedUnlockById(a), this.context.gates))
        return false;
    return true;
}

  ownedUnlockById(a: A): (id: string) => boolean {
    return id => {
        const dep = this.context.unlock(id);
        return !!dep && this.isUnlockOwned(a, dep);
    };
}

  structuralPrereqsMet(a: A, u: Unlockable): boolean {
    if (u.requiresUnlock) {
        const needs = Array.isArray(u.requiresUnlock) ? u.requiresUnlock : [u.requiresUnlock];
        for (const id of needs) {
            const dep = this.context.unlock(id);
            if (!dep || !this.isUnlockOwned(a, dep))
                return false;
        }
    }
    if (u.kind === 'feature' && u.requiresFeature && !a.features.has(u.requiresFeature))
        return false;
    return true;
}

  sealedGateLines(a: A, u: Unlockable): { label: string; met: boolean; anyOf: boolean }[] {
    const owned = this.ownedUnlockById(a);
    const out: {
        label: string;
        met: boolean;
        anyOf: boolean;
    }[] = [];
    if (u.requiresMemoryCommission && !this.context.memoryProgressionOpen(a))
        out.push({ label: this.context.awakeningRefusal(), met: false, anyOf: false });
    if (u.requiresMemoryCommission)
        out.push({ label: 'an awakened skill or an indexed support',
            met: this.context.memoryCatalog().some(c => this.context.memoryCommissionReady(a, c.kind, c.id, this.context.commissionNeed)), anyOf: false });
    for (const r of u.reqAnyOf ?? []) {
        out.push({ label: gateRowLabel(r, this.context.gates), met: gateRowMet(a, r, owned, this.context.gates), anyOf: true });
    }
    const ledgerRows: GateRow[] = [];
    if (u.reqLedger) {
        for (const k of Array.isArray(u.reqLedger) ? u.reqLedger : [u.reqLedger])
            ledgerRows.push({ ledger: k });
    }
    for (const [k, n] of Object.entries(u.reqLedgerCounts ?? {}))
        ledgerRows.push({ ledger: k, n });
    for (const r of ledgerRows)
        out.push({ label: gateRowLabel(r, this.context.gates), met: gateRowMet(a, r, owned, this.context.gates), anyOf: false });
    if (u.reqLevel)
        out.push({ label: `account level ${u.reqLevel}`, met: a.level >= u.reqLevel, anyOf: false });
    if (u.reqClasses !== undefined) {
        out.push({ label: `${u.reqClasses} classes unlocked`, met: this.context.unlockedClassCount(a) >= u.reqClasses, anyOf: false });
    }
    return out;
}

  sealedUnlocks(a: A): { u: Unlockable; lines: { label: string; met: boolean; anyOf: boolean }[] }[] {
    return this.allUnlockables()
        .filter(u => u.tease && !this.isUnlockOwned(a, u) && !this.isUnlockVisible(a, u) && this.structuralPrereqsMet(a, u))
        .map(u => ({ u, lines: this.sealedGateLines(a, u) }));
}

  catalogLevelMilestones(): number[] {
    if (this.levelMilestoneCache)
        return this.levelMilestoneCache;
    const out = new Set<number>();
    const prefix = this.context.gates.reachedLevelKey(0).slice(0, -1);
    for (const u of this.context.catalog) {
        for (const n of gateLevelNeeds(u.reqAnyOf))
            out.add(n);
        const keys = u.reqLedger ? (Array.isArray(u.reqLedger) ? u.reqLedger : [u.reqLedger]) : [];
        for (const k of [...keys, ...Object.keys(u.reqLedgerCounts ?? {})]) {
            const suffix = k.startsWith(prefix) ? k.slice(prefix.length) : '';
            if (/^\d+$/.test(suffix))
                out.add(Number(suffix));
        }
    }
    return this.levelMilestoneCache
        = [...out].sort((x, y) => x - y);
}

  availableUnlocks(a: A): Unlockable[] {
    return this.allUnlockables(a).filter(u => !u.earned && this.isUnlockVisible(a, u) && !this.isUnlockOwned(a, u));
}

  unlockCompleted(a: A, u: Unlockable, memorySequence = 0): boolean {
    if (u.kind === 'memory')
        return this.memorySequence(a, u) > memorySequence;
    if (u.kind === 'graft')
        return a.skillGraft;
    if (u.kind === 'resurrect')
        return !a.roster.find(r => r.charId === u.payload.charId)?.fallen;
    return this.isUnlockOwned(a, u);
}

  lockedPackages(a: A): { label: string; requirement: string; cost: number; active: boolean }[] {
    return this.context.packages().filter(p => !p.alwaysOn && !a.packageUnlocks.has(p.id) && !p.unlock.test({ account: a, ledger: a.ledger }))
        .map(p => ({ label: p.label, requirement: p.unlock.label, cost: p.cost, active: p.defaultEnabled }));
}

  vaultSeatOf(kind: UnlockKind): VaultTabDef {
    return this.context.tabs.find(t => t.kinds?.includes(kind))
        ?? this.context.tabs.find(t => t.fallback)
        ?? this.context.tabs[0];
}

  vaultKindOrder(): UnlockKind[] {
    const seen = new Set<UnlockKind>();
    const out: UnlockKind[] = [];
    for (const t of this.context.tabs)
        for (const k of t.kinds ?? []) {
            if (!seen.has(k)) {
                seen.add(k);
                out.push(k);
            }
        }
    for (const u of this.allUnlockables())
        if (!seen.has(u.kind)) {
            seen.add(u.kind);
            out.push(u.kind);
        }
    return out;
}

  vaultShelfCensus(a: A): VaultShelfCensus[] {
    const avail = this.availableUnlocks(a);
    const ownedAll = this.allUnlockables(a).filter(u => this.isUnlockOwned(a, u)
        && !(u.kind === 'class' && a.pendingClassUnlocks.has(u.payload.classId)));
    const rumorsAll = this.shroudedClassUnlocks(a);
    const pendingAll = this.pendingClassUnlocks(a);
    return this.context.tabs.map(t => {
        const stock = t.owned ? [] : avail.filter(u => this.vaultSeatOf(u.kind).id === t.id);
        const owned = t.owned ? ownedAll : ownedAll.filter(u => this.vaultSeatOf(u.kind).id === t.id);
        const rumors = t.rumors ? rumorsAll : [];
        const pending = t.owned ? [] : pendingAll.filter(u => this.vaultSeatOf(u.kind).id === t.id);
        return {
            tab: t, stock, owned, rumors, pending,
            visible: t.owned ? owned.length > 0 : stock.length > 0 || rumors.length > 0 || pending.length > 0,
        };
    });
}

  vaultStripVisible(a: A, census: VaultShelfCensus[] = this.vaultShelfCensus(a)): boolean {
    const ownedTotal = census.find(c => c.tab.owned)?.owned.length ?? 0;
    const stockTotal = census.reduce((n, c) => n + c.stock.length, 0);
    const span = census.filter(c => c.visible).length;
    return span >= this.context.shelfConfig.stripMinShelves
        && (ownedTotal >= this.context.shelfConfig.stripMinOwned || stockTotal >= this.context.shelfConfig.stripMinStock);
}

  investedToward(a: A, u: Unlockable): number {
    if (u.kind === 'power')
        return u.payload.rank === a.reliquary.rank + 1 ? a.reliquary.invested : 0;
    if (u.kind === 'storage')
        return u.payload.rank === a.reliquary.stash.pages + 1 ? a.reliquary.stash.invested : 0;
    return Math.max(0, Math.floor(this.ownInvestment(a, u.id)));
}

  remainingCost(a: A, u: Unlockable): number {
    return Math.max(0, u.cost - this.investedToward(a, u));
}

  grantUnlock(a: A, u: Unlockable): void {
    switch (u.kind) {
        case 'power':
        case 'storage': break;
        case 'slot':
            a.unlockedSlots.add(u.payload.slotCount);
            break;
        case 'class': grantClassBundle(a, u.payload); break;
case 'classtier':
            a.unlockedClassTiers.add(u.id);
            for (const id of u.payload.skillIds) {
                a.unlockedSkills.add(id);
                a.explicitSkillUnlocks.add(id);
            }
            break;
        case 'skill':
            for (const id of u.payload.skillIds) {
                a.unlockedSkills.add(id);
                a.explicitSkillUnlocks.add(id);
            }
            break;
        case 'support':
            for (const id of u.payload.supportIds)
                a.unlockedSupports.add(id);
            break;
        case 'memory': break;
        case 'feature':
            a.features.add(u.payload.flag);
            break;
        case 'package':
            a.packageUnlocks.add(u.payload.tierId ?? u.payload.packageId);
            break;
        case 'graft':
            a.skillGraft = true;
            break;
        case 'resurrect': {
            const entry = a.roster.find(r => r.charId === u.payload.charId);
            if (entry)
                delete entry.fallen;
            break;
        }
    }
}

  investUnlock(a: A, u: Unlockable, amount: number, random: () => number): number {
    if (u.earned || this.isUnlockOwned(a, u) || !this.isUnlockVisible(a, u))
        return 0;
    if (typeof amount !== 'number' || Number.isNaN(amount) || !this.validPurchase(a, u))
        return 0;
    if (u.kind === 'power')
        return this.context.investReliquary(a, amount);
    if (u.kind === 'storage')
        return this.context.investRelicStash(a, amount);
    const rem = this.remainingCost(a, u);
    if (u.kind === 'memory') {
        const def = this.context.memoryUnlockDef(u.payload.memoryUnlockId);
        if (!def || !Number.isFinite(amount))
            return 0;
        const put = Math.min(Math.max(0, Math.floor(amount)), Math.max(0, Math.floor(a.credits)), rem);
        const total = this.investedToward(a, u) + put;
        if (total >= u.cost && !this.context.grantMemoryUnlock(a, def, random))
            return 0;
        a.credits -= put;
        const left = total >= u.cost ? total - u.cost : total;
        if (left > 0)
            this.writeInvestment(a, u.id, left);
        else
            delete a.invested[u.id];
        return put;
    }
    if (rem === 0) {
        delete a.invested[u.id];
        this.grantUnlock(a, u);
        return 0;
    }
    const put = Math.min(Math.max(0, Math.floor(amount)), Math.max(0, Math.floor(a.credits)), rem);
    if (put <= 0)
        return 0;
    a.credits -= put;
    const now = this.investedToward(a, u) + put;
    if (now >= u.cost) {
        delete a.invested[u.id];
        this.grantUnlock(a, u);
    }
    else {
        this.writeInvestment(a, u.id, now);
    }
    return put;
}

  applyUnlock(a: A, u: Unlockable, random: () => number): boolean {
    if (u.earned || this.isUnlockOwned(a, u) || !this.isUnlockVisible(a, u))
        return false;
    if (!this.validPurchase(a, u))
        return false;
    const rem = this.remainingCost(a, u);
    if (a.credits < rem)
        return false;
    const sequence = this.memorySequence(a, u);
    const poured = this.investUnlock(a, u, rem, random);
    return poured === rem && this.unlockCompleted(a, u, sequence);
}
}
