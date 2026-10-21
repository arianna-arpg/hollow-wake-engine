import {ResourceEvents} from '@hollow-wake/engine/resources/events';
import {ResourceContent} from '@hollow-wake/engine/resources/content';
import {gaugeReady, gaugeSpend} from '@hollow-wake/engine/resources/gauges';
import {resourceActor} from './resource-cycle.mjs';

/** This example host chooses 2D distance and its own elite identities. An engine
 * adapter can supply different world geometry without changing resource rules. */
export function resourceEventWorld(content, random) {
  const events = new ResourceEvents({
    skills: actor => actor.skills,
    taps: inst => inst.taps ?? inst.def.chargeGain ?? [],
    toggled: (_actor, inst) => !!inst.toggled,
    distance: (actor, at) => Math.hypot(actor.position.x - at.x, actor.position.y - at.y),
    elite: victim => !!victim.boss || ['rare', 'champion', 'crowned'].includes(victim.rarity),
    random,
    gain: (actor, inst, tap) => actor.runtime.gain(tap.charge, tap.amount, tap.max, inst),
    gaugeTerms: (actor, inst) => actor.gaugeTerms(inst),
    cooldown: (actor, inst) => actor.cooldowns.get(inst.def.id) ?? 0,
    setCooldown: (actor, inst, seconds) => { actor.cooldowns.set(inst.def.id, seconds); },
  }, {deathRadius: 360});
  return {
    events,
    actor(position) {
      return Object.assign(resourceActor(content), {position: {...position}, cooldowns: new Map()});
    },
  };
}

/** An installed-package course: one shared binding, two independent actors,
 * death radius, orb/victim filters, a partial gauge press and its lockout. */
export function resourceEventCycle(pack) {
  const content = new ResourceContent(pack);
  let randomDraws = 0;
  const world = resourceEventWorld(content, () => { randomDraws++; return .5; });
  const actor = world.actor({x: 0, y: 0}), distant = world.actor({x: 1000, y: 0});
  for (const owner of [actor, distant]) {
    owner.skills = ['soul_harvest', 'grave_tide', 'life_flask'].map(id => ({def: content.skill(id)}));
  }
  for (let i = 0; i < 3; i++) {
    world.events.dispatch(actor, 'enemyDeath', {x: 420, y: 0});
    world.events.dispatch(distant, 'enemyDeath', {x: 420, y: 0});
  }
  const grave = actor.skills[1], terms = actor.gaugeTerms(grave);
  const ready = gaugeReady(grave, terms, grave.def.gauge);
  const power = gaugeSpend(grave, grave.def.gauge, terms);
  world.events.dispatch(actor, 'orbPickup', undefined, 'mana');
  world.events.dispatch(actor, 'orbPickup', undefined, 'life');
  world.events.dispatch(actor, 'hit', undefined, undefined, {rarity: 'normal'});
  world.events.dispatch(actor, 'hit', undefined, undefined, {rarity: 'rare'});
  const soulsBefore = actor.state.charges.get('soul');
  world.events.dispatch(actor, 'kill', undefined, undefined, {rarity: 'rare'});
  const duringLock = grave.state.gauge;
  actor.runtime.advance(12);
  world.events.dispatch(actor, 'enemyDeath', {x: 0, y: 0});
  return {ready, power, soulsBefore, flask: actor.state.charges.get('flask_life'),
    duringLock, afterLock: grave.state.gauge, distantBank: distant.state.charges.get('soul') ?? 0,
    distantGauge: distant.skills[1].state?.gauge ?? 0, randomDraws};
}
