import {GuardCasting, guardAiHold} from '@hollow-wake/engine/casting/guard';

/** A tiny host: admission pays once, then two actors share the guard binding.
 * The host receives component casts and bash payloads for its own delivery. */
export function guardCycle() {
  const wall = {id: 'wall', seated: true, mana: 100, inverted: false, cast: null};
  const sentinel = {id: 'sentinel', seated: false, mana: 100, inverted: true, cast: null};
  let now = 0;
  const pulses = [], warnings = [], bashes = [];
  const runtime = new GuardCasting({
    spec: s => s.spec, seated: a => a.seated, holdBonus: () => 0, aim: () => {},
    bash: () => ({}), context: s => s,
    bashStat: (a, _s, key) => key === 'bashInvert' ? Number(a.inverted) : 1,
    supports: () => {}, trigger: () => {}, pulse: a => pulses.push(a.id),
    dead: () => false, time: () => now, facing: () => 0,
    plantUntil: (a, deadline) => warnings.push({actor: a.id, deadline}),
    lower: () => {}, end: a => { a.cast = null; }, cleanup: () => {},
    cooldown: () => 0, stampCooldown: () => {},
    deliverBash: (a, _s, _spec, payload) => bashes.push({actor: a.id, payload}),
  }, {beatInterval: 1, releaseFloor: .25, armTime: 1});
  function raise(actor, spec) {
    if (actor.mana < 10 || actor.cast) return false;
    actor.mana -= 10;
    actor.cast = {mode: 'guard', held: true, channelTime: 0, maxShield: 60,
      shield: actor.inverted ? 15 : 60, spec, aiHold: .5, aiGuardWindup: .25};
    runtime.refresh(actor, actor.cast);
    return true;
  }
  raise(wall, {pulse: {skillId: 'challenge', interval: .5}});
  raise(sentinel, {});
  for (let frame = 1; frame <= 4; frame++) {
    now = frame * .25;
    if (frame === 4) wall.cast.held = false;
    sentinel.cast.held = sentinel.cast.channelTime < guardAiHold(sentinel.cast);
    runtime.advance(wall, wall.cast, .25);
    runtime.advance(sentinel, sentinel.cast, .25);
  }
  return {pulses, warnings, bashes, mana: [wall.mana, sentinel.mana], bothReleased: !wall.cast && !sentinel.cast};
}
