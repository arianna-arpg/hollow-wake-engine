import {challengeContinuationState, type ChallengeOwnedState, type ChallengeState, type ChallengeCast, type Effigy} from './challenge-owned.js';
import type {ChallengePoint, ChallengeActor, ChallengeConstructDelivery, ChallengeSpec} from './challenge-types.js';

type ContinuationActor<I> = Pick<ChallengeActor<I, never>, 'id' | 'skills' | 'statuses' | 'cooldowns' | 'cooldownTotals' | 'pos'> & {sheet: object};
type ContinuationSkill = {def: {id: string}; challengeHost?: unknown};
interface ContinuationController<A, I extends object, C> {
  [challengeContinuationState](next?: ChallengeOwnedState<A, I, C>): ChallengeOwnedState<A, I, C>;
}

/** A complete, detached host graph. Include externally retained retired casts:
 * weak keys omitted from the skill map cannot be discovered by this service.
 * Copy callbacks are trusted synchronous operations. They must preserve values
 * and aliases, detach mutable data, and leave both hosts/controllers untouched.
 * Shared immutable authored content is allowed inside copied policy/delivery
 * roots. Actor internals, clocks, random state and carrier ownership remain the
 * caller's responsibility; this is not a general actor or World copier. */
export interface ChallengeContinuationMapping<A, I, C> {
  actors: ReadonlyMap<A, A>;
  skills: ReadonlyMap<I, I>;
  spec(source: ChallengeSpec): ChallengeSpec;
  point(source: ChallengePoint): ChallengePoint;
  delivery(source: C): C;
}

/** Copy controller-owned state without replaying casts, advancing time or
 * invoking host effects. Absolute deadlines are preserved. The destination
 * must never have owned a challenge, even if it has since been cleared.
 * Validation and copying complete before the destination state is replaced.
 * Caller callback side effects cannot be rolled back. */
export function copyChallengeState<
  A extends ContinuationActor<I>, I extends ContinuationSkill, C extends ChallengeConstructDelivery,
  Destination extends ContinuationController<A, I, C>,
>(source: ContinuationController<A, I, C>, destination: Destination,
  mapping: NoInfer<ChallengeContinuationMapping<A, I, C>>): Destination {
  const owned = source[challengeContinuationState]();
  const requireFresh = () => {
    const current = destination[challengeContinuationState]();
    if (destination === source || current.used || current.states.size || current.landings.length
      || current.effigies.length || current.shocks.length)
      throw Error('Challenge continuation requires a fresh private controller');
  };
  requireFresh();
  const checkIdentities = <T extends object>(map: ReadonlyMap<T, T>, label: string) => {
    const originals = new Set(map.keys()), targets = new Set<T>();
    for (const target of map.values()) {
      if (!target || typeof target !== 'object' || originals.has(target) || targets.has(target))
        throw Error('Challenge continuation requires detached ' + label + ' identities');
      targets.add(target);
    }
  };
  checkIdentities(mapping.actors, 'actor'); checkIdentities(mapping.skills, 'skill');
  const get = <T>(map: ReadonlyMap<T, T>, original: T, label: string): T => {
    if (!map.has(original)) throw Error('Missing challenge ' + label + ' mapping');
    return map.get(original)!;
  };
  const actor = (value: A) => get(mapping.actors, value, 'actor');
  const skill = (value: I) => get(mapping.skills, value, 'skill');
  for (const [original, target] of mapping.skills) {
    if (target.def.id !== original.def.id)
      throw Error('Challenge continuation changed skill definition identity');
    if (target.challengeHost !== (original.challengeHost === undefined ? undefined : skill(original.challengeHost as I)))
      throw Error('Challenge continuation lost payload provenance');
  }
  for (const [original, target] of mapping.actors) {
    if (target.id !== original.id) throw Error('Challenge continuation changed actor identity');
    if (target.skills === original.skills || target.statuses === original.statuses
      || target.cooldowns === original.cooldowns || target.cooldownTotals === original.cooldownTotals
      || target.pos === original.pos || target.sheet === original.sheet)
      throw Error('Challenge continuation shares mutable actor state');
    if (target.skills.length !== original.skills.length
      || original.skills.some((value, index) => (value ? skill(value) : null) !== target.skills[index]))
      throw Error('Challenge continuation lost bar identity');
  }

  const copied = <T extends object>(copy: (value: T) => T, label: string) => {
    const values = new Map<T, T>(), targets = new Set<T>();
    return (original: T): T => {
      if (values.has(original)) return values.get(original)!;
      const target = copy(original);
      if (!target || typeof target !== 'object' || target === original || values.has(target)
        || targets.has(target) || targets.has(original))
        throw Error('Challenge continuation requires detached ' + label + ' snapshots');
      values.set(original, target); targets.add(target); return target;
    };
  };
  const spec = copied((value: ChallengeSpec) => mapping.spec(value), 'policy');
  const point = copied((value: ChallengePoint) => {
    const target = mapping.point(value);
    if (!target || !Object.is(target.x, value.x) || !Object.is(target.y, value.y))
      throw Error('Challenge continuation changed point coordinates');
    return target;
  }, 'point');
  const delivery = copied((value: C) => mapping.delivery(value), 'delivery');
  const states = new Map<ChallengeState<A, I>, ChallengeState<A, I>>();
  const state = (original: ChallengeState<A, I>): ChallengeState<A, I> => {
    const found = states.get(original); if (found) return found;
    const target = {owner: actor(original.owner), host: skill(original.host), spec: spec(original.spec),
      policy: original.policy, primed: original.primed, guaranteedAt: original.guaranteedAt, retired: original.retired};
    states.set(original, target); return target;
  };
  const casts = new Map<ChallengeCast<A, I>, ChallengeCast<A, I>>();
  const cast = (original: ChallengeCast<A, I>): ChallengeCast<A, I> => {
    const found = casts.get(original); if (found) return found;
    const target = {state: state(original.state), inst: skill(original.inst), primed: original.primed,
      generation: original.generation, orbitTargets: new Set(original.orbitTargets)};
    casts.set(original, target); return target;
  };
  const effigies = new Map<Effigy<A, I>, Effigy<A, I>>();
  const effigy = (original: Effigy<A, I>): Effigy<A, I> => {
    const found = effigies.get(original); if (found) return found;
    const target = {...original, body: actor(original.body), cast: cast(original.cast), center: point(original.center),
      ...(Object.hasOwn(original, 'creeper') ? {creeper: original.creeper === undefined ? undefined : actor(original.creeper)} : {})};
    effigies.set(original, target); return target;
  };
  const activeStates = new Map([...owned.states].map(([key, value]) => [key, state(value)]));
  const knownCasts = new WeakMap<I, ChallengeCast<A, I>>();
  for (const [original, target] of mapping.skills) {
    const known = owned.casts.get(original); if (known) knownCasts.set(target, cast(known));
  }
  const landings = owned.landings.map(value => ({...value, cast: cast(value.cast),
    from: point(value.from), at: point(value.at), d: delivery(value.d)}));
  const activeEffigies = owned.effigies.map(effigy);
  const shocks = owned.shocks.map(value => ({...value, effigy: effigy(value.effigy), at: point(value.at)}));
  requireFresh();
  destination[challengeContinuationState]({states: activeStates, casts: knownCasts, landings,
    effigies: activeEffigies, shocks, used: true});
  return destination;
}
