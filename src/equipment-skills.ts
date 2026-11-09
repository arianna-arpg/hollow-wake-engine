/** Rebuild derived skills only when a build changes. All records are borrowed,
 * synchronous, single-writer state. Content reads and effect callbacks are live;
 * exceptions retain completed writes, matching the original recalc phase. */
export interface EquipmentSkillDefinition { id: string; name: string }
export interface EquipmentSupportDefinition { id: string }
export interface EquipmentSkill<D, U> {
  def: D; level: number; bonusLevels?: number;
  sockets: ({ def: U } | null)[];
  grafts?: { def: U; level: number }[];
  treeNodes?: string[];
  grantedBy?: string; grantedHostUid?: number; relicSource?: string;
}
export interface EquipmentGrantItem<State> {
  uid: number; name: string; relicKey?: string; grantState?: Record<string, State>;
}
export interface EquipmentSkillOwner<S, I> {
  meta: { knownSkills: Map<string, S>; equipped: Record<string, I | undefined> };
  grantedInsts?: Map<string, S>;
}
export interface EquipmentGrantModifier { stat: string; kind: string; value: number }
export interface EquipmentGrantRow<D, S> {
  def: D; level: number; inst: S; source: string; hostUid?: number; slot: number;
}
export interface EquipmentSupportRow<U> {
  slot: number; def: U; level: number; skillId?: string;
  state: 'empty' | 'duplicate' | 'unfit' | 'live';
}
type Lines = readonly { stat: string }[];
export interface EquipmentSkillFrame<D, U, S, I> {
  seat: {
    grantedInsts?: Map<string, S>; grantedSkills?: EquipmentGrantRow<D, S>[];
    wornGrafts?: EquipmentSupportRow<U>[];
  };
  actor: {
    skills: (S | null)[]; sheet: { get(stat: string): number };
    activeAuras: Map<string, { inst: S }>; summonToggles: Map<string, { inst: S }>;
  };
  meta: { knownSkills: Map<string, S>; equipped: Record<string, I | undefined>;
    classDef: { innate?: Lines }; grafts: Record<string, string | null> };
  passiveMods: Lines; gearSheetMods: Map<string, Lines>;
  containerSheetMods: Map<string, Lines>; containerPieceMods: Map<I, Lines>;
  passiveGrafts(): Iterable<{ key: string; graft: { support: string; level?: number } }>;
  deriveCompanions(definitions: D[], sourceName: (id: string) => string,
    relicKey: (id: string) => string | undefined): void;
  deactivateAura(id: string): void;
  dismissSummon(id: string): void;
}
export interface EquipmentSkillPorts<D, U, S, State, C> {
  skillGrantPrefix: string; companionGrantPrefix: string; slotGraftPrefix: string;
  equipSlots(): Iterable<{ id: string }>;
  skill(id: string): D | undefined; support(id: string): U | undefined;
  parseSkillGrant(stat: string): string | null;
  companionGrantStat(id: string): string;
  parseSlotGraft(stat: string): { slot: number; gemId: string } | null;
  skillMaxLevel(def: D): number; maxSupportLevel: number;
  grantSockets(): number; autoSeat(): boolean;
  makeSkill(def: D, level: number, sockets: number): S;
  restoreGrant(skill: S, state: State): void; packGrant(skill: S): State;
  classes(): Iterable<C>; openingSkills(def: C): readonly string[];
  classSkillStat(def: C): string;
  treeGraft(def: D, node: string): { support: string; level?: number } | undefined;
  /** Includes any summoned crew. Must observe grafts added earlier in this pass. */
  supportFits(def: U, skill: S): boolean;
}

export class EquipmentSkills<D extends EquipmentSkillDefinition, U extends EquipmentSupportDefinition,
  S extends EquipmentSkill<D, U>, I extends EquipmentGrantItem<State>, State, C> {
  readonly #p: EquipmentSkillPorts<D, U, S, State, C>;
  constructor(ports: EquipmentSkillPorts<D, U, S, State, C>) { this.#p = ports; }

  /** Resolve saved bar ownership before the first rebuild. Only worn flat grants
   * can create an instance here; derive() later normalizes item investment. */
  resolve(seat: EquipmentSkillOwner<S, I>, skillId: string,
    compileItem: (item: I) => Iterable<EquipmentGrantModifier>): S | null {
    const known = seat.meta.knownSkills.get(skillId);
    if (known) return known;
    const held = seat.grantedInsts?.get(skillId);
    if (held) return held;
    const r = this.#p, def = r.skill(skillId);
    if (!def) return null;
    const stat = r.skillGrantPrefix + skillId;
    let host: I | undefined;
    let level = 0;
    for (const slot of r.equipSlots()) {
      const worn = seat.meta.equipped[slot.id];
      if (!worn) continue;
      for (const gm of compileItem(worn)) {
        if (gm.stat !== stat || gm.kind !== 'flat') continue;
        level += gm.value;
        host ??= worn;
      }
    }
    level = Math.min(r.skillMaxLevel(def), Math.floor(level));
    if (!host || level < 1) return null;
    const inst = r.makeSkill(def, level, r.grantSockets());
    const state = host.grantState?.[skillId];
    if (state) r.restoreGrant(inst, state);
    inst.grantedBy = host.name;
    inst.grantedHostUid = host.uid;
    (seat.grantedInsts ??= new Map()).set(skillId, inst);
    return inst;
  }

  derive(frame: EquipmentSkillFrame<D, U, S, I>): void {
    const r = this.#p, { seat, actor: p, meta: m, passiveMods, gearSheetMods,
      containerSheetMods, containerPieceMods } = frame;
    const grantStats = new Set<string>(), companionGrantIds = new Set<string>();
    const scanGrants = (mods: Lines | undefined): void => {
      if (!mods) return;
      for (const gm of mods) {
        if (gm.stat.startsWith(r.skillGrantPrefix)) grantStats.add(gm.stat);
        if (gm.stat.startsWith(r.companionGrantPrefix)) companionGrantIds.add(gm.stat.slice(r.companionGrantPrefix.length));
      }
    };
    scanGrants(m.classDef.innate); scanGrants(passiveMods);
    for (const mods of gearSheetMods.values()) scanGrants(mods);
    for (const mods of containerSheetMods.values()) scanGrants(mods);
    // Preserve both live lookups, and complete companion work before reading
    // the previous ordinary-grant map (the callback can change it).
    frame.deriveCompanions([...companionGrantIds].flatMap(id => r.skill(id) ? [r.skill(id)!] : []), id => {
      const stat = r.companionGrantStat(id);
      for (const slot of r.equipSlots()) {
        if (gearSheetMods.get(slot.id)?.some(line => line.stat === stat)) return m.equipped[slot.id]!.name;
      }
      for (const [item, mods] of containerPieceMods) if (mods.some(line => line.stat === stat)) return item.name;
      return 'your passives';
    }, id => {
      if ([...gearSheetMods.values()].some(mods => mods.some(line => line.stat === r.companionGrantStat(id)))) return undefined;
      return [...containerPieceMods].find(([, mods]) => mods.some(line => line.stat === r.companionGrantStat(id)))?.[0].relicKey;
    });
    const prevInsts = seat.grantedInsts, keep = new Map<string, S>();
    const rows: EquipmentGrantRow<D, S>[] = [];
    for (const stat of grantStats) {
      const skillId = r.parseSkillGrant(stat), def = skillId ? r.skill(skillId) : undefined;
      if (!skillId || !def) continue;
      const level = Math.min(r.skillMaxLevel(def), Math.floor(p.sheet.get(stat)));
      if (level < 1) continue;
      let host: I | undefined;
      for (const slot of r.equipSlots()) {
        const worn = m.equipped[slot.id];
        if (worn && gearSheetMods.get(slot.id)?.some(gm => gm.stat === stat)) { host = worn; break; }
      }
      if (!host) for (const [seated, mods] of containerPieceMods) {
        if (mods.some(gm => gm.stat === stat)) { host = seated; break; }
      }
      const previousGrant = prevInsts?.get(skillId);
      let inst = previousGrant?.grantedHostUid === host?.uid ? previousGrant : undefined;
      if (inst) inst.level = level;
      else {
        inst = r.makeSkill(def, level, r.grantSockets());
        const state = host?.grantState?.[skillId];
        if (state) r.restoreGrant(inst, state);
      }
      inst.grantedBy = host?.name ?? 'your passives';
      inst.grantedHostUid = host?.uid; inst.relicSource = host?.relicKey;
      if (previousGrant && previousGrant !== inst) {
        for (let i = 0; i < p.skills.length; i++) if (p.skills[i] === previousGrant) p.skills[i] = inst;
      }
      keep.set(skillId, inst);
      const beneficiary = m.knownSkills.get(skillId);
      if (beneficiary) for (let i = 0; i < p.skills.length; i++) if (p.skills[i] === inst) {
        p.skills[i] = p.skills.includes(beneficiary) ? null : beneficiary;
      }
      if (host) (host.grantState ??= {})[skillId] = r.packGrant(inst);
      rows.push({ def, level, inst, source: inst.grantedBy, hostUid: host?.uid, slot: p.skills.indexOf(inst) });
    }
    if (prevInsts) for (const [id, inst] of prevInsts) {
      if (keep.get(id) === inst) continue;
      for (let i = 0; i < p.skills.length; i++) if (p.skills[i] === inst) p.skills[i] = null;
      if (p.activeAuras.get(id)?.inst === inst) frame.deactivateAura(id);
      if (p.summonToggles.get(id)?.inst === inst) frame.dismissSummon(id);
    }
    if (r.autoSeat()) for (const row of rows) {
      if (row.slot >= 0 || m.knownSkills.has(row.def.id)) continue;
      const free = p.skills.indexOf(null); if (free < 0) break;
      p.skills[free] = row.inst; row.slot = free;
    }
    seat.grantedInsts = keep.size ? keep : undefined;
    seat.grantedSkills = rows.length ? rows.sort((a, b) => a.def.name.localeCompare(b.def.name)) : undefined;
    const wielded = (): S[] => seat.grantedInsts
      ? [...m.knownSkills.values(), ...seat.grantedInsts.values()] : [...m.knownSkills.values()];
    for (const inst of wielded()) {
      const grant = seat.grantedInsts?.get(inst.def.id);
      let bonus = grant && grant !== inst && p.skills.includes(inst) ? grant.level : 0;
      for (const c of r.classes()) if (r.openingSkills(c).includes(inst.def.id)) bonus += p.sheet.get(r.classSkillStat(c));
      inst.bonusLevels = bonus;
    }
    for (const inst of wielded()) inst.grafts = undefined;
    for (const s of frame.passiveGrafts()) {
      const skillId = m.grafts[s.key]; if (!skillId) continue;
      const inst = m.knownSkills.get(skillId), def = r.support(s.graft.support);
      if (!inst || !def) continue;
      (inst.grafts ??= []).push({ def, level: s.graft.level ?? 1 });
    }
    for (const inst of wielded()) for (const nid of inst.treeNodes ?? []) {
      const g = r.treeGraft(inst.def, nid), def = g ? r.support(g.support) : undefined;
      if (!def) continue;
      if (inst.sockets.some(s => s?.def.id === def.id) || inst.grafts?.some(row => row.def.id === def.id)) continue;
      (inst.grafts ??= []).push({ def, level: g!.level ?? 1 });
    }
    const wornGraftIds = new Set<string>();
    const scanMods = (mods: Lines | undefined): void => {
      if (mods) for (const gm of mods) if (gm.stat.startsWith(r.slotGraftPrefix)) wornGraftIds.add(gm.stat);
    };
    scanMods(m.classDef.innate); scanMods(passiveMods);
    for (const mods of gearSheetMods.values()) scanMods(mods);
    const wornRows: EquipmentSupportRow<U>[] = [];
    for (const stat of wornGraftIds) {
      const seatRef = r.parseSlotGraft(stat); if (!seatRef) continue;
      const def = r.support(seatRef.gemId); if (!def) continue;
      const level = Math.min(r.maxSupportLevel, Math.floor(p.sheet.get(stat))); if (level < 1) continue;
      const inst = p.skills[seatRef.slot];
      const state: EquipmentSupportRow<U>['state'] = !inst ? 'empty'
        : inst.sockets.some(s => s?.def.id === def.id) || inst.grafts?.some(g => g.def.id === def.id) ? 'duplicate'
          : !r.supportFits(def, inst) ? 'unfit' : 'live';
      wornRows.push({ slot: seatRef.slot, def, level, skillId: inst?.def.id, state });
      if (state === 'live' && inst) (inst.grafts ??= []).push({ def, level });
    }
    // Monotone admission: only unfit -> live, so at most row-count passes.
    // Re-read bar/fit on each attempt; do not cache across host callbacks.
    for (let flipped = true; flipped;) {
      flipped = false;
      for (const row of wornRows) {
        if (row.state !== 'unfit') continue;
        const inst = p.skills[row.slot]; if (!inst || !r.supportFits(row.def, inst)) continue;
        row.state = 'live'; (inst.grafts ??= []).push({ def: row.def, level: row.level }); flipped = true;
      }
    }
    seat.wornGrafts = wornRows.length ? wornRows.sort((a, b) => a.slot - b.slot || a.def.id.localeCompare(b.def.id)) : undefined;
  }
}
