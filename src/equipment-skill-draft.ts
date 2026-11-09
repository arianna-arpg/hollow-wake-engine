import type {EquipmentSkillFrame} from './equipment-skills.js';

type Frame<D, U, S, I> = EquipmentSkillFrame<D, U, S, I>;
type Graft = {key: string; graft: {support: string; level?: number}};

export interface EquipmentSkillDraftPorts<D, U, S, I> {
  /** Pure, complete copies of host-owned mutable fields. Immutable definitions
   * may be shared. Do not serialize/restore: that can repair investment and
   * lose the distinction between an existing grant and a newly restored one. */
  copySkill(source: Readonly<S>): S;
  copyItem(source: Readonly<I>): I;
  /** Preserve private toggle metadata needed by retirement (for example
   * reserved resources or affected-source records), using the supplied alias. */
  copyToggle(kind: 'aura' | 'summon', source: Readonly<{inst: S}>, inst: S): {inst: S};
  /** The candidate's complete compiled sheet, including all admitted sources.
   * This synchronous read port must not observe or mutate a live actor. */
  sheet: Frame<D, U, S, I>['actor']['sheet'];
  /** Companion derivation can affect ordinary grants. It must operate on this
   * candidate, including retirement when definitions is empty. Never substitute
   * a live-world callback or silently omit this phase. */
  deriveCompanions(candidate: Frame<D, U, S, I>, definitions: D[],
    sourceName: (id: string) => string, relicKey: (id: string) => string | undefined): void;
  /** Apply any build-side consequences to the private candidate. The recorded
   * retirement is an observation, not authority to execute a live effect. */
  retire(candidate: Frame<D, U, S, I>, retirement: EquipmentSkillRetirement<S>): void;
}

export type EquipmentSkillRetirement<S> = {kind: 'aura' | 'summon'; id: string; inst: S};

/** A private build graph for EquipmentSkills.derive, not a combat snapshot or a
 * publication transaction. Identity aliases survive the fork; every copied
 * skill/item has one origin, and newly derived instances have no origin.
 * The host supplies pure copy/content/companion services and discards a failed
 * candidate. Live effects, persistence, conflict checks and publication remain
 * outside this object. In particular, never assign its bar to a live actor. */
export class EquipmentSkillDraft<D, U, S extends object, I extends object> {
  readonly frame: Frame<D, U, S, I>;
  readonly retirements: EquipmentSkillRetirement<S>[] = [];
  readonly #skills = new WeakMap<S, S>();
  readonly #items = new WeakMap<I, I>();

  constructor(source: Frame<D, U, S, I>, ports: EquipmentSkillDraftPorts<D, U, S, I>) {
    const skillSources = new Set<S>(source.meta.knownSkills.values());
    for (const inst of source.seat.grantedInsts?.values() ?? []) skillSources.add(inst);
    for (const inst of source.actor.skills) if (inst) skillSources.add(inst);
    for (const row of source.seat.grantedSkills ?? []) skillSources.add(row.inst);
    for (const row of source.actor.activeAuras.values()) skillSources.add(row.inst);
    for (const row of source.actor.summonToggles.values()) skillSources.add(row.inst);
    const itemSources = new Set<I>(source.containerPieceMods.keys());
    for (const item of Object.values(source.meta.equipped)) if (item) itemSources.add(item);
    const skills = new Map<S, S>(), items = new Map<I, I>();
    const copy = <T extends object>(originals: Set<T>, forward: Map<T, T>, reverse: WeakMap<T, T>, clone: (value: Readonly<T>) => T) => {
      for (const original of originals) {
        const owned = clone(original);
        if (!owned || typeof owned !== 'object' || originals.has(owned) || reverse.has(owned))
          throw new Error('Equipment draft requires distinct owned copies');
        forward.set(original, owned); reverse.set(owned, original);
      }
    };
    copy(skillSources, skills, this.#skills, value => ports.copySkill(value));
    copy(itemSources, items, this.#items, value => ports.copyItem(value));
    const skill = (inst: S): S => skills.get(inst)!;
    const toggles = (kind: 'aura' | 'summon', rows: Map<string, {inst: S}>) => new Map([...rows].map(([id, row]) => {
      const inst = skill(row.inst), owned = ports.copyToggle(kind, row, inst);
      if (!owned || owned === row || owned.inst !== inst) throw new Error('Equipment draft requires an owned toggle with its copied skill');
      return [id, owned];
    }));
    const lines = (rows: readonly {stat: string}[]) => rows.map(row => ({...row}));
    const sources = (rows: Map<string, readonly {stat: string}[]>) => new Map([...rows].map(([key, value]) => [key, lines(value)]));
    const grafts: Graft[] = [...source.passiveGrafts()].map(row => ({key: row.key, graft: {...row.graft}}));
    const frame: Frame<D, U, S, I> = {
      seat: {
        grantedInsts: source.seat.grantedInsts && new Map([...source.seat.grantedInsts].map(([id, inst]) => [id, skill(inst)])),
        grantedSkills: source.seat.grantedSkills?.map(row => ({...row, inst: skill(row.inst)})),
        wornGrafts: source.seat.wornGrafts?.map(row => ({...row})),
      },
      actor: {
        skills: source.actor.skills.map(inst => inst && skill(inst)), sheet: ports.sheet,
        activeAuras: toggles('aura', source.actor.activeAuras),
        summonToggles: toggles('summon', source.actor.summonToggles),
      },
      meta: {
        knownSkills: new Map([...source.meta.knownSkills].map(([id, inst]) => [id, skill(inst)])),
        equipped: Object.fromEntries(Object.entries(source.meta.equipped).map(([slot, item]) => [slot, item && items.get(item)!])),
        classDef: {innate: source.meta.classDef.innate && lines(source.meta.classDef.innate)}, grafts: {...source.meta.grafts},
      },
      passiveMods: lines(source.passiveMods), gearSheetMods: sources(source.gearSheetMods), containerSheetMods: sources(source.containerSheetMods),
      containerPieceMods: new Map([...source.containerPieceMods].map(([item, rows]) => [items.get(item)!, lines(rows)])),
      passiveGrafts: () => grafts,
      deriveCompanions: (definitions, name, key) => ports.deriveCompanions(frame, definitions, name, key),
      deactivateAura: id => {
        const row = frame.actor.activeAuras.get(id);
        if (row) { const retirement = {kind: 'aura' as const, id, inst: row.inst}; this.retirements.push(retirement); ports.retire(frame, retirement); }
      },
      dismissSummon: id => {
        const row = frame.actor.summonToggles.get(id);
        if (row) { const retirement = {kind: 'summon' as const, id, inst: row.inst}; this.retirements.push(retirement); ports.retire(frame, retirement); }
      },
    };
    this.frame = frame;
  }

  sourceSkill(candidate: S): S | undefined { return this.#skills.get(candidate); }
  sourceItem(candidate: I): I | undefined { return this.#items.get(candidate); }
}
