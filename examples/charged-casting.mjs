import {canPayCast, payCast} from '@hollow-wake/engine';
import {ChargedCasting, chargeCastDuration, overchargeCastDuration} from '@hollow-wake/engine/casting/charged';

/** A minimal host using plain resources. A full game supplies its own admission,
 * interruption, aim, cooldown and delivery policies through these same ports. */
export function chargedCastingCycle() {
  const charge = {maxTime: 2, minScale: .5, maxScale: 2};
  const overcharge = {stages: 3, time: .8, perStage: .4, aoePerStage: .12};
  const actor = name => ({name, mana: 20, life: 10, cast: null, recovery: 0});
  const a = actor('charge'), b = actor('stages'), delivered = [], stages = [];
  let draws = 0;
  const runtime = new ChargedCasting({
    active: actor => actor.cast,
    dead: actor => actor.life <= 0,
    chargeSpec: state => state.spec,
    overchargeSpec: state => state.spec,
    stageLimit: (_actor, _state, spec) => spec.stages,
    timing: () => undefined,
    sparkBonus: () => .35,
    cost: () => ({mana: 6, life: 2}),
    canAfford: canPayCast,
    pay: (actor, _state, cost) => payCast(actor, cost),
    random: () => { draws++; return .5; },
    stageBanked: (actor, state) => stages.push({name: actor.name, stage: state.stage}),
    end: (actor, _state, recovery) => { actor.cast = null; actor.recovery = recovery; },
    execute: (actor, _state, release) => delivered.push({name: actor.name, power: release.dmgMult, active: actor.cast !== null}),
    cue: () => {},
  });
  // Admission and initial payment precede attachment of the live cast record.
  payCast(a, {mana: 6, life: 2}); payCast(b, {mana: 6, life: 2});
  a.cast = {mode: 'charge', spec: charge, elapsed: 0, total: chargeCastDuration(charge.maxTime, 1), held: true, baseMult: 1};
  b.cast = {mode: 'overcharge', spec: overcharge, elapsed: 0, total: overchargeCastDuration(overcharge.time, .75, 1), held: true, baseMult: 1};
  runtime.advance(a, 1); runtime.advance(b, 4); // One stage; excess frame time is discarded.
  a.cast.held = false; runtime.advance(a, 0);
  b.mana = 0; runtime.advance(b, .8); // Full bar waits for an affordable quote.
  const blockedStage = b.cast.stage;
  b.mana = 6; runtime.advance(b, 0); // The full bar can retry without more elapsed time.
  b.cast.held = false; runtime.advance(b, 0);
  runtime.advance(a, 1); runtime.advance(b, 1); // Completed casts cannot deliver twice.
  return {delivered, stages, blockedStage, remaining: {a: [a.mana, a.life], b: [b.mana, b.life]}, draws};
}
