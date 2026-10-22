import {ChannelCasting, channelInterval, channelWindup, advanceChannelPersistence} from '@hollow-wake/engine/casting/channel';

/** Illustrative host: one binding, two independent actors, explicit resource
 * sinks and delivered payloads. A real host supplies input, targets, effects,
 * interruption and presentation through the same ports. */
export function channelCycle() {
  const deliveries = [], completions = [], persists = [];
  const runtime = new ChannelCasting({
    spec: state => state.spec, dead: actor => actor.dead,
    stat: () => 1, speed: () => 1,
    brim: actor => actor.bank ??= {fill: 0}, releaseBrim: actor => actor.bank,
    trigger: (actor, _state, event) => { if (event === 'channelFinish') completions.push(actor.id); },
    tapFinish: () => {}, rune: () => {}, aim: () => true,
    end: (actor, _state, recovery) => { actor.cast = null; actor.recovery = recovery; },
    cooldown: () => 0, stampCooldown: () => {}, releaseEffects: () => {},
    release: (actor, _state, _track, payload) => deliveries.push({actor: actor.id, kind: 'release', power: payload.dmgMult}),
    persist: (actor, _state, plan) => persists.push({actor, ...plan}),
    supports: () => {}, target: () => undefined, context: () => undefined,
    cost: () => ({mana: 4, life: 0}), canAfford: (actor, cost) => actor.mana >= cost.mana && actor.life > cost.life,
    pay: (actor, _state, cost) => { actor.mana -= cost.mana; actor.life -= cost.life; },
    random: () => .5, pulseStat: () => 0, construct: () => false,
    pulse: (actor, _state, _track, _target, payload) => deliveries.push({actor: actor.id, kind: 'pulse', power: payload.dmgMult}),
    cue: () => {},
  }, .5);
  function actor(id, spec) {
    const total = channelInterval(spec.interval, 1);
    return {id, mana: 12, life: 10, dead: false, recovery: 0,
      cast: {spec, held: true, total, baseMult: 1, channelTime: 0,
        pulseTimer: spec.windup === undefined ? total : channelWindup(spec.windup, 1)}};
  }
  const rain = actor('rain', {interval: .5, ramp: {per: .5, max: 1}, persist: {perHeldSec: 2, fade: .25}});
  const gather = actor('gather', {interval: .5, brim: {fillTime: 1, autoRelease: true}, release: {pulses: false}});
  runtime.advance(rain, rain.cast, .5); runtime.advance(gather, gather.cast, .5);
  runtime.advance(rain, rain.cast, .5); runtime.advance(gather, gather.cast, .5);
  rain.cast.held = false; runtime.advance(rain, rain.cast, 0);
  for (const dt of [.5, .5, 1]) for (let i = persists.length - 1; i >= 0; i--) {
    const pending = persists[i], power = advanceChannelPersistence(pending, dt, pending.actor.dead);
    if (power === null) persists.splice(i, 1);
    else if (power !== undefined) deliveries.push({actor: pending.actor.id, kind: 'persist', power});
  }
  return {deliveries, completions, rainMana: rain.mana, gatherMana: gather.mana,
    spentBrim: gather.bank.fill, remainingPersists: persists.length, bothReleased: !rain.cast && !gather.cast};
}
