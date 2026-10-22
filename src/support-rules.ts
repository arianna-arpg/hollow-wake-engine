import {finite} from './validation.js';

export interface SupportModifier {stat: string; kind: string; value: number}
export interface SupportCutRow<M = SupportModifier> {id: string; weight: number; requiresMechanisms?: string[]; mods?: M[]}
export interface SupportCut<M = SupportModifier> {axes: {id: string; rows: SupportCutRow<M>[]}[]}
export type SupportRoll = Record<string, string>;
export interface SupportDefinition<M = SupportModifier> {
  id: string; requiresTags?: string[]; excludeTags?: string[]; grantsTags?: string[];
  requiresMechanisms?: string[]; mods: M[]; perLevel?: M[]; rollBase?: SupportCut<M>;
  levelBonus?: number; levelBonusPer?: number; resonance?: boolean;
  constructFx?: unknown; zoneEmit?: unknown; tether?: unknown; healField?: unknown;
  fissureVolatile?: unknown; fissureAftershock?: unknown; fissureRoulette?: unknown;
  pulse?: unknown; munition?: unknown; massGraft?: unknown;
}
export interface SupportSocket<M = SupportModifier> {def: SupportDefinition<M>; level: number; rolled?: SupportRoll; forwardScale?: number}
export interface SupportDelivery {
  type: string; kind?: string; castSkillId?: string; lingerDuration?: number;
  fissure?: unknown; pulse?: unknown; forks?: number; shatter?: unknown; emit?: unknown;
  rehit?: number; noImpact?: boolean; shellGuard?: unknown; trajectory?: {orbit?: unknown}; catchSpot?: unknown;
}
export interface SupportEffect {type: string; status?: string; magnitude?: number; chance?: number; lane?: string}
export interface SupportSkillDefinition<M = SupportModifier> {
  id: string; tags: string[]; delivery: SupportDelivery; effects: SupportEffect[];
  baseDamage?: unknown; cooldown: number; useCharges?: unknown;
  innateMods?: M[]; leveling?: {perLevel?: M[]}; thresholds?: {level: number; mods: M[]}[];
}
export interface SupportSkill<M = SupportModifier, D extends SupportSkillDefinition<M> = SupportSkillDefinition<M>, S extends SupportSocket<M> = SupportSocket<M>> {
  def: D; level: number; sockets: (S | null)[]; grafts?: S[]; bonusLevels?: number;
  extraMods?: M[]; comboTreeMods?: M[]; state?: {stackN?: number};
}
export type SupportCrew<D> = readonly D[] | 'unknowable' | null;
export interface SupportStatus {
  dotType?: string; mods?: readonly unknown[]; powerInert?: boolean; buildup?: unknown;
  interruptChance?: number; scrambleChance?: number; stacking?: unknown;
}
export interface SupportPolicy<M = SupportModifier> {
  seatBoundFields: ReadonlySet<string>; globalStats: ReadonlySet<string>; costStats: ReadonlySet<string>;
  strikeFields: readonly string[]; surfaceStats: readonly string[]; childFlightStats: readonly string[];
  defaultLeveling: readonly M[];
}
/** Resolved observations, not engine objects. Borrowed host records must remain
 * coherent during a query; callbacks must be synchronous and side-effect free.
 * Mechanism overrides are explicit and instance-owned. */
export interface SupportRulePorts<M extends SupportModifier, D extends SupportSkillDefinition<M>, S extends SupportSocket<M>, I extends SupportSkill<M, D, S>> {
  policy(): SupportPolicy<M>; boarding(): 'gated' | 'free';
  baseTags(inst: I): string[]; delivery(inst: I): SupportDelivery; castMode(inst: I): string;
  treeModifiers(inst: I): readonly M[] | undefined; selfStack(inst: I): {mods: M[]} | undefined;
  summon(inst: I): unknown; componentInstances(inst: I): readonly I[];
  componentStatuses(inst: I): readonly string[]; hasChildFlights(inst: I): boolean;
  status(id: string): SupportStatus | undefined; tuneChance(id: string, authored: number): number;
  createCrew(def: D, sockets: number): I;
  mechanism?(name: string, inst: I): boolean;
}

export function supportTagsFit(support: Pick<SupportDefinition, 'requiresTags' | 'excludeTags'>, tags: readonly string[]): boolean {
  if (support.excludeTags?.some(tag => tags.includes(tag))) return false;
  return !support.requiresTags?.length || support.requiresTags.some(tag => tags.includes(tag));
}
/** Canonical first-row fallback preserves existing saves after a row rename.
 * Returned rows are borrowed; the returned record owns its keys. */
export function resolveSupportCut<M>(base: SupportCut<M>, rolled?: SupportRoll): Record<string, SupportCutRow<M>> {
  return Object.fromEntries(base.axes.filter(axis => axis.rows.length).map(axis =>
    [axis.id, axis.rows.find(row => row.id === rolled?.[axis.id]) ?? axis.rows[0]]));
}
export function canonicalSupportCut(base: SupportCut): SupportRoll {
  return Object.fromEntries(base.axes.filter(axis => axis.rows.length).map(axis => [axis.id, axis.rows[0].id]));
}
export function supportCutMechanisms(base: SupportCut, rolled?: SupportRoll): string[] {
  const out: string[] = [];
  for (const row of Object.values(resolveSupportCut(base, rolled))) for (const name of row.requiresMechanisms ?? []) if (!out.includes(name)) out.push(name);
  return out;
}
export function supportCutModifiers<M>(base: SupportCut<M>, rolled?: SupportRoll): M[] {
  const out: M[] = []; for (const row of Object.values(resolveSupportCut(base, rolled))) if (row.mods) out.push(...row.mods); return out;
}
/** RNG is mandatory. Empty axes reject before consuming any draw. Authored
 * nonpositive weights keep the original first-row/zero-total boundary. */
export function rollSupportCut(base: SupportCut, random: () => number): SupportRoll {
  if (typeof random !== 'function') throw new Error('Support random source is required');
  const totals = base.axes.map(axis => {
    if (!axis.rows.length) throw new Error('Cannot roll an empty support axis');
    let total = 0; for (const row of axis.rows) total += Math.max(0, finite(row.weight, 'Support row weight'));
    return finite(total, 'Support axis weight');
  });
  return Object.fromEntries(base.axes.map((axis, index) => {
    const total = totals[index], unit = finite(random(), 'Support random draw');
    if (unit < 0 || unit > 1) throw new Error('Support random draw must be in [0,1]');
    let roll = unit * total, picked = axis.rows[0];
    for (const row of axis.rows) {roll -= Math.max(0, row.weight); if (roll <= 0) {picked = row; break;}}
    return [axis.id, picked.id];
  }));
}

/** Live host policy. No cross-query caches or global registrations. Inputs and
 * unchanged modifiers retain their host identities; array results are new except
 * rawSockets(), which returns the original socket array when no grafts exist. */
export class SupportRules<M extends SupportModifier, D extends SupportSkillDefinition<M>, S extends SupportSocket<M>, I extends SupportSkill<M, D, S>> {
  readonly #p: SupportRulePorts<M, D, S, I>;
  constructor(ports: SupportRulePorts<M, D, S, I>) {
    const names = ['policy','boarding','baseTags','delivery','castMode','treeModifiers','selfStack','summon','componentInstances','componentStatuses','hasChildFlights','status','tuneChance','createCrew'] as const;
    for (const name of names) if (typeof ports[name] !== 'function') throw new Error(`Support ${name} port is required`);
    if (ports.mechanism !== undefined && typeof ports.mechanism !== 'function') throw new Error('Invalid support mechanism port');
    this.#p = {...Object.fromEntries(names.map(name => [name, ports[name].bind(ports)])), ...(ports.mechanism ? {mechanism: ports.mechanism.bind(ports)} : {})} as unknown as SupportRulePorts<M, D, S, I>;
  }
  rawSockets(inst: I): readonly (S | null)[] {return inst.grafts?.length ? [...inst.sockets, ...inst.grafts] : inst.sockets;}
  hostSockets(inst: I): S[] {
    const sockets = this.rawSockets(inst);
    let first = 0;
    while (first < sockets.length && !sockets[first]) first++;
    if (first === sockets.length) return [];
    const admitted = new Array<boolean>(sockets.length).fill(false), pool = [...this.#p.baseTags(inst)];
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < sockets.length; i++) {
        const socket = sockets[i];
        if (!socket || admitted[i] || !supportTagsFit(socket.def, pool)) continue;
        admitted[i] = true;
        if (socket.def.grantsTags) {pool.push(...socket.def.grantsTags); grew = true;}
      }
    }
    const out: S[] = [];
    for (let i = 0; i < sockets.length; i++) {const socket = sockets[i]; if (socket && admitted[i]) out.push(socket);}
    return out;
  }
  grantedTags(inst: I): string[] {
    const out: string[] = []; for (const socket of this.hostSockets(inst)) if (socket.def.grantsTags) out.push(...socket.def.grantsTags); return out;
  }
  first<K extends keyof S['def']>(inst: I, key: K): NonNullable<S['def'][K]> | undefined {
    for (const socket of this.hostSockets(inst)) {const value = (socket.def as S['def'])[key]; if (value !== undefined) return value as NonNullable<S['def'][K]>;}
    return undefined;
  }
  seatBoundFields(support: S['def']): string[] {
    const fields = this.#p.policy().seatBoundFields;
    return Object.entries(support).filter(([key, value]) => value !== undefined && fields.has(key)).map(([key]) => key);
  }
  ridesMinions(support: S['def']): boolean {return this.seatBoundFields(support).length === 0;}
  boardingOpen(inst: I): boolean {return this.#p.boarding() === 'free' || this.hostSockets(inst).some(socket => !!socket.def.resonance);}
  globalModifiers(socket: S): M[] {
    const out: M[] = [], stats = this.#p.policy().globalStats;
    for (const mod of socket.def.mods) if (stats.has(mod.stat)) out.push(mod);
    const level = socket.level - 1;
    if (level > 0) for (const mod of socket.def.perLevel ?? []) if (stats.has(mod.stat)) out.push({...mod, value: mod.value * level});
    return out;
  }
  effectiveLevel(inst: I): number {
    let level = inst.level + Math.floor(inst.bonusLevels ?? 0);
    for (const socket of this.hostSockets(inst)) if (socket.def.levelBonus) level += Math.floor(socket.def.levelBonus + (socket.def.levelBonusPer ?? 0) * (socket.level - 1));
    return level;
  }
  innateModifiers(inst: I): M[] {
    const out: M[] = [];
    if (inst.def.innateMods) out.push(...inst.def.innateMods);
    if (inst.extraMods) out.push(...inst.extraMods);
    if (inst.comboTreeMods) out.push(...inst.comboTreeMods);
    const tree = this.#p.treeModifiers(inst); if (tree) out.push(...tree);
    const effective = this.effectiveLevel(inst), perLevel = inst.def.leveling?.perLevel ?? this.#p.policy().defaultLeveling, level = effective - 1;
    if (level > 0) for (const mod of perLevel) out.push({...mod, value: mod.value * level});
    for (const threshold of inst.def.thresholds ?? []) if (effective >= threshold.level) out.push(...threshold.mods);
    return out;
  }
  modifiers(inst: I): M[] {
    const out = this.innateModifiers(inst), serving = this.hostSockets(inst);
    for (const socket of serving) {
      const scale = socket.forwardScale ?? 1;
      for (const mod of socket.def.mods) out.push(scale === 1 || mod.kind === 'override' ? mod : {...mod, value: mod.value * scale});
      if (socket.def.rollBase) for (const mod of supportCutModifiers(socket.def.rollBase, socket.rolled)) out.push(scale === 1 || mod.kind === 'override' ? mod : {...mod, value: mod.value * scale});
      const level = socket.level - 1;
      if (level > 0) for (const mod of socket.def.perLevel ?? []) out.push({...mod, value: mod.value * level * (mod.kind === 'override' ? 1 : scale)});
    }
    const components = this.#p.componentInstances(inst), costs = this.#p.policy().costStats;
    if (components.length) for (const socket of this.rawSockets(inst)) {
      if (!socket || serving.includes(socket) || !components.some(component => this.#fitsOwn(socket.def, component, socket.rolled))) continue;
      const scale = socket.forwardScale ?? 1, level = socket.level - 1;
      const mods = [...socket.def.mods, ...(socket.def.rollBase ? supportCutModifiers(socket.def.rollBase, socket.rolled) : []),
        ...(level > 0 ? (socket.def.perLevel ?? []).map(mod => ({...mod, value: mod.value * level})) : [])];
      for (const mod of mods) if (costs.has(mod.stat)) out.push(scale === 1 || mod.kind === 'override' ? mod : {...mod, value: mod.value * scale});
    }
    const stack = this.#p.selfStack(inst), count = inst.state?.stackN ?? 0;
    if (stack && count > 0) for (const mod of stack.mods) out.push({...mod, value: mod.value * count});
    if ((inst.def.delivery.type === 'summon' || this.#p.summon(inst)) && this.boardingOpen(inst)) {
      const served = new Set(serving);
      for (const socket of this.rawSockets(inst)) {
        if (!socket || served.has(socket) || !this.ridesMinions(socket.def)) continue;
        for (const mod of socket.def.mods) if (costs.has(mod.stat)) out.push(mod);
        const level = socket.level - 1;
        if (level > 0) for (const mod of socket.def.perLevel ?? []) if (costs.has(mod.stat)) out.push({...mod, value: mod.value * level});
      }
    }
    return out;
  }
  mechanismHolds(name: string, inst: I): boolean {
    if (this.#p.mechanism) return this.#p.mechanism(name, inst);
    const at = name.indexOf(':'); return this.builtinMechanism(at < 0 ? name : name.slice(0, at), inst, at < 0 ? undefined : name.slice(at + 1));
  }
  mechanismsFit(support: S['def'], inst: I): boolean {
    for (const name of support.requiresMechanisms ?? []) if (!this.mechanismHolds(name, inst)) return false; return true;
  }
  #fitsOwn(support: S['def'], inst: I, rolled?: SupportRoll): boolean {
    if (!supportTagsFit(support, [...this.#p.baseTags(inst), ...this.grantedTags(inst)]) || !this.mechanismsFit(support, inst)) return false;
    if (support.rollBase) for (const name of supportCutMechanisms(support.rollBase, rolled)) if (!this.mechanismHolds(name, inst)) return false;
    return true;
  }
  fits(support: S['def'], inst: I, rolled?: SupportRoll): boolean {
    return this.#fitsOwn(support, inst, rolled) || this.#p.componentInstances(inst).some(component => this.#fitsOwn(support, component, rolled));
  }
  crewServed(support: S['def'], inst: I, crew: SupportCrew<D>): D[] | 'unknowable' | null {
    if (!crew || !this.ridesMinions(support)) return null;
    if (crew === 'unknowable') return crew;
    const riders = this.rawSockets(inst).filter((socket): socket is S => !!socket && socket.def.id !== support.id && this.ridesMinions(socket.def));
    const served = crew.filter(def => {
      const pool = [...def.tags], admitted = new Set<S>(); let grew = true;
      while (grew) {
        grew = false;
        for (const rider of riders) {
          if (admitted.has(rider) || !supportTagsFit(rider.def, pool)) continue;
          admitted.add(rider); if (rider.def.grantsTags) {pool.push(...rider.def.grantsTags); grew = true;}
        }
      }
      if (!supportTagsFit(support, pool)) return false;
      // Legacy crew admission checks definition requirements only. Rolled-row
      // requirements remain a distinct caster check, recorded in the contract.
      if (support.requiresMechanisms?.length) {
        const instance = this.#p.createCrew(def, Math.max(1, admitted.size)); let slot = 0;
        for (const rider of admitted) instance.sockets[slot++] = rider;
        if (!this.mechanismsFit(support, instance)) return false;
      }
      return true;
    });
    return served.length ? served : null;
  }
  fitsOrCrew(support: S['def'], inst: I, crew: SupportCrew<D>, rolled?: SupportRoll): boolean {
    return this.fits(support, inst, rolled) || this.crewServed(support, inst, crew) !== null;
  }
  standingSurface(inst: I): boolean {
    const delivery = this.#p.delivery(inst), sockets = this.hostSockets(inst), mods = this.modifiers(inst);
    const modded = (stat: string) => mods.some(mod => mod.stat === stat && mod.value > 0);
    if (delivery.type === 'ground') {
      if ((delivery.lingerDuration ?? 0) > 0) return true;
      if (delivery.fissure) {if (sockets.some(s => s.def.fissureVolatile || s.def.fissureAftershock || s.def.fissureRoulette)) return true;}
      else if (delivery.pulse || sockets.some(s => s.def.pulse) || modded('pulseCount')) return true;
    }
    // first() intentionally reads the support's opaque graft, not its delivery.
    if (this.#firstField(inst, 'curseField')) return true;
    return sockets.some(s => s.def.healField !== undefined) || this.#p.policy().surfaceStats.some(modded);
  }
  #firstField(inst: I, key: string): unknown {
    for (const socket of this.hostSockets(inst)) {const value = (socket.def as unknown as Record<string, unknown>)[key]; if (value) return value;}
    return undefined;
  }
  /** Built-in predicates are separate from the override port, so adapters may
   * preserve a live registry without recursive dispatch into that registry. */
  builtinMechanism(name: string, inst: I, param?: string): boolean {
    const d = inst.def, p = this.#p;
    switch (name) {
      case 'periodicConstruct': {const delivery = p.delivery(inst); return delivery.type === 'construct' && ['totem','sentry'].includes(delivery.kind ?? '') && !!delivery.castSkillId;}
      case 'cooldown': return d.cooldown > 0 || this.innateModifiers(inst).some(m => m.stat === 'addedCooldown' && m.value > 0)
        || this.hostSockets(inst).some(s => [...s.def.mods, ...(s.def.perLevel ?? [])].some(m => m.stat === 'addedCooldown' && m.value > 0));
      case 'engagement': return d.delivery.type === 'aura' || d.delivery.type === 'summon' || p.castMode(inst) === 'guard' || d.tags.includes('minion');
      case 'affliction': {
        const dot = (id: string) => p.status(id)?.dotType, fits = (id: string) => param ? !!dot(id) && (id === param || dot(id) === param) : !!dot(id);
        return p.componentStatuses(inst).some(fits) || d.effects.some(e => e.type === 'status' && (e.magnitude ?? 0) > 0 && p.tuneChance(e.status!, e.chance!) > 0 && fits(e.status!))
          || this.hostSockets(inst).some(s => [...s.def.mods, ...(s.def.perLevel ?? [])].some(m => m.stat.startsWith('apply_') && fits(m.stat.slice(6))));
      }
      case 'strikes': return !!d.baseDamage || d.effects.some(e => e.type === 'damage') || this.hostSockets(inst).some(s => p.policy().strikeFields.some(key => (s.def as unknown as Record<string, unknown>)[key] !== undefined));
      case 'flight': {
        if (param === 'children') {if (p.hasChildFlights(inst)) return true; const delivery = p.delivery(inst);
          if ((delivery.forks ?? 0) > 0 || delivery.shatter !== undefined || delivery.emit !== undefined) return true;
          return this.hostSockets(inst).some(s => [...s.def.mods, ...(s.def.perLevel ?? [])].some(m => p.policy().childFlightStats.includes(m.stat)));}
        if (param === 'spends') {const delivery = p.delivery(inst); return delivery.type !== 'projectile' || (!delivery.rehit && !delivery.noImpact);}
        if (param === 'mints') {const delivery = p.delivery(inst); return delivery.type === 'projectile' || (delivery.type === 'construct' && delivery.castSkillId !== undefined);}
        return true;
      }
      case 'displaces': return ['dash','blink','leap'].includes(d.delivery.type);
      case 'bankless': return !d.useCharges && !this.hostSockets(inst).some(s => s.def.munition !== undefined);
      case 'guard': return p.castMode(inst) === 'guard' || ['dash','leap','construct'].includes(d.delivery.type) || (d.delivery.type === 'aura' && d.delivery.shellGuard !== undefined);
      case 'surface': return param === 'standing' ? this.standingSurface(inst) : d.delivery.type === 'ground'
        || this.hostSockets(inst).some(s => s.def.healField !== undefined || [...s.def.mods, ...(s.def.perLevel ?? [])].some(m => p.policy().surfaceStats.includes(m.stat) && m.value > 0));
      case 'construct': return d.delivery.type === 'construct' && (param !== 'massed' || this.hostSockets(inst).some(s => s.def.massGraft !== undefined));
      case 'status': {
        const qualifies = (id: string): boolean => {const status = p.status(id); if (!status) return false;
          if (param === 'power') return !status.powerInert && (!!status.dotType || !!status.mods?.length || !!status.buildup || !!status.interruptChance || !!status.scrambleChance);
          if (param === 'stacking') return !!status.stacking; return param ? id === param : true;};
        return p.componentStatuses(inst).some(qualifies) || d.effects.some(e => e.type === 'status' && qualifies(e.status!))
          || this.hostSockets(inst).some(s => [...s.def.mods, ...(s.def.perLevel ?? [])].some(m => m.stat.startsWith('apply_') && qualifies(m.stat.slice(6))));
      }
      case 'pour': return d.effects.some(e => e.type === 'restoreOverTime' && (!param || e.lane === param));
      case 'landing': return ['storm','ground'].includes(d.delivery.type) || (d.delivery.type === 'projectile' && !d.delivery.trajectory?.orbit && !d.delivery.catchSpot);
      default: return true;
    }
  }
}
