import type {ConduitPool, ConduitSpec} from './conduit-content.js';

export {validateConduitSpec, type ConduitPool, type ConduitSpec} from './conduit-content.js';

export interface ConduitRules {
  readonly floor: number;
  readonly lifeFloor: number;
  readonly minRoom: number;
}

export const DEFAULT_CONDUIT_RULES: Readonly<ConduitRules> = Object.freeze({floor: .15, lifeFloor: .1, minRoom: .5});

interface GuardState {mode: string; shield?: number; maxShield?: number}

/** Live per-actor meters. The host owns canonical recovery, poise breaks, and their callbacks. */
export interface ConduitBody {
  life: number; mana: number; es: number; poise: number; ward: number; insight: number;
  readonly casting?: GuardState | null;
  readonly sheet: {get(stat: 'poiseOvercharge'): number};
  maxLife(): number;
  lifeCeiling(): number;
  availableMaxMana(): number;
  maxEs(): number;
  maxPoise(): number;
  maxInsight(): number;
  healBy(amount: number): unknown;
  gainEs(amount: number): unknown;
  gainPoise(amount: number): unknown;
  gainWard(amount: number): unknown;
  onLifeSpent?(amount: number): void;
}

interface PoiseSource<A> {damagePoise(amount: number, breaker: A): unknown}

interface Endpoint {
  current(body: ConduitBody): number;
  maximum(body: ConduitBody): number;
  room(body: ConduitBody): number;
  drain<A extends ConduitBody & PoiseSource<A>>(body: A, amount: number, rules: ConduitRules): number;
  feed(body: ConduitBody, amount: number): void;
}

function withdraw(body: ConduitBody, key: 'mana'|'es'|'insight'|'ward', amount: number): number {
  const taken = Math.min(amount, Math.max(0, body[key]));
  body[key] -= taken;
  return taken;
}

const pools: Record<ConduitPool, Endpoint> = {
  life: {
    current: a => a.life, maximum: a => a.maxLife(), room: a => Math.max(0, a.lifeCeiling() - a.life),
    drain(a, amount, rules) {
      const taken = Math.min(amount, Math.max(0, a.life - a.maxLife() * rules.lifeFloor));
      a.life -= taken;
      if (taken > 0) a.onLifeSpent?.(taken);
      return taken;
    },
    feed: (a, amount) => a.healBy(amount),
  },
  mana: {
    current: a => a.mana, maximum: a => a.availableMaxMana(), room: a => Math.max(0, a.availableMaxMana() - a.mana),
    drain: (a, amount) => withdraw(a, 'mana', amount),
    feed(a, amount) {a.mana = Math.min(a.availableMaxMana(), a.mana + amount);},
  },
  es: {
    current: a => a.es, maximum: a => a.maxEs(), room: a => Math.max(0, a.maxEs() - a.es),
    drain: (a, amount) => withdraw(a, 'es', amount), feed: (a, amount) => a.gainEs(amount),
  },
  poise: {
    current: a => a.poise, maximum: a => a.maxPoise(),
    room: a => Math.max(0, a.maxPoise() * (1 + a.sheet.get('poiseOvercharge')) - a.poise),
    drain(a, amount) {
      const before = a.poise;
      a.damagePoise(amount, a);
      return before - a.poise;
    },
    feed: (a, amount) => a.gainPoise(amount),
  },
  ward: {
    current: a => a.ward, maximum: a => a.ward, room: () => Infinity,
    drain: (a, amount) => withdraw(a, 'ward', amount), feed: (a, amount) => a.gainWard(amount),
  },
  insight: {
    current: a => a.insight, maximum: a => a.maxInsight(), room: a => Math.max(0, a.maxInsight() - a.insight),
    drain: (a, amount) => withdraw(a, 'insight', amount),
    feed(a, amount) {a.insight = Math.min(a.maxInsight(), a.insight + amount);},
  },
  guard: {
    current: a => a.casting?.mode === 'guard' ? a.casting.shield ?? 0 : 0,
    maximum: a => a.casting?.mode === 'guard' ? a.casting.maxShield ?? 0 : 0,
    room: a => a.casting?.mode === 'guard' ? Math.max(0,(a.casting.maxShield ?? 0)-(a.casting.shield ?? 0)) : 0,
    drain(a, amount) {
      const cast = a.casting;
      if (cast?.mode !== 'guard') return 0;
      const taken = Math.min(amount, Math.max(0,cast.shield ?? 0));
      cast.shield = (cast.shield ?? 0) - taken;
      return taken;
    },
    feed(a, amount) {
      const cast = a.casting;
      if (cast?.mode !== 'guard') return;
      const room = Math.max(0, (cast.maxShield ?? 0) - (cast.shield ?? 0));
      cast.shield = (cast.shield ?? 0) + Math.min(amount, room);
    },
  },
};

/** Transfer once through live resource gates. A drain callback can change the receiving gate. */
function transferConduit<A extends ConduitBody & PoiseSource<A>>(body: A, spec: ConduitSpec, seconds: number,
  rate: number, efficiency: number, rules: ConduitRules): void {
  const source = pools[spec.from], destination = pools[spec.to];
  const maximum = source.maximum(body);
  if (maximum <= 0) return;
  const room = destination.room(body);
  if (room < rules.minRoom) return;
  const exchange = spec.ratio * efficiency;
  const wanted = ((spec.drainPct ?? 0) * maximum + (spec.drainFlat ?? 0)) * rate * seconds;
  if (exchange <= 0 || wanted <= 0) return;
  const available = source.current(body) - maximum * (spec.floor ?? rules.floor);
  if (available <= 0) return;
  const drained = source.drain(body, Math.min(wanted, available, room / exchange), rules);
  if (drained > 0) destination.feed(body, drained * exchange);
}

interface SkillIdentity {readonly def: {readonly id: string}}
type Stat = 'conduitRate'|'conduitEfficiency'|'poiseOvercharge';
export interface ConduitActor<S extends SkillIdentity, T, M> extends ConduitBody {
  readonly skills: readonly (S|null)[];
  readonly casting?: (GuardState & {readonly held?: boolean; readonly inst: SkillIdentity}) | null;
  readonly activeAuras: {has(id: string): boolean};
  readonly summonToggles: {has(id: string): boolean};
  readonly wornConduits?: readonly ConduitSpec[];
  readonly sheet: {get(stat: Stat, tags?: T, extra?: M): number};
}

/** Definitions in innate, admitted socket/graft, then invested node order. The readers
 * describe the current skill and must have no gameplay side effects. */
export interface ConduitSkillReaders<S, T, M> {
  specs(skill: S): readonly ConduitSpec[];
  tags(skill: S): T;
  modifiers(skill: S): M;
}

const heldModes = new Set(['guard','channel','charge','overcharge']);

/** Call at the actor's resource update point. No retained actor, scratch list or clock. */
export function advanceConduits<S extends SkillIdentity, T, M, A extends ConduitBody & PoiseSource<A>>(
  body: A & ConduitActor<S,T,M>, seconds: number,
  readers: ConduitSkillReaders<S,T,M>, rules: ConduitRules = DEFAULT_CONDUIT_RULES): void {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Conduit frame duration must be finite and nonnegative');
  for (const skill of body.skills) {
    if (!skill) continue;
    const cast = body.casting, id = skill.def.id;
    const held = cast?.held && heldModes.has(cast.mode) && cast.inst.def.id === id;
    if (!held && !body.activeAuras.has(id) && !body.summonToggles.has(id)) continue;
    const specs = readers.specs(skill);
    if (!specs.length) continue;
    const tags = readers.tags(skill), extra = readers.modifiers(skill);
    const rate = body.sheet.get('conduitRate',tags,extra), efficiency = body.sheet.get('conduitEfficiency',tags,extra);
    if (rate <= 0 || efficiency <= 0) continue;
    for (const spec of specs) transferConduit(body, spec, seconds, rate, efficiency, rules);
  }
  if (body.wornConduits?.length) {
    const rate = body.sheet.get('conduitRate'), efficiency = body.sheet.get('conduitEfficiency');
    if (rate > 0 && efficiency > 0) {
      for (const spec of body.wornConduits) transferConduit(body, spec, seconds, rate, efficiency, rules);
    }
  }
}
