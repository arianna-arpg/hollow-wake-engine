import {AttackSequences} from '@hollow-wake/engine/combat/attack-sequences';
import {AttackSequenceContent} from '@hollow-wake/engine/combat/attack-sequence-content';

/** Minimal headless host with three-dimensional positions. A real game binds
 * its skill compiler, status/damage services, collision and presentation here.
 * This example records delivery requests; it does not simulate projectile hits. */
export function createAttackSequenceDemo(spec = {hitCycle: {max: 3, increasedPerStack: 0.1}}) {
  const demo = {time: 0, draws: 0, visible: true, scale: 1, actors: [], flights: [],
    queues: {salvos: [], repeats: [], steps: [], followUps: [], fuses: []},
    zones: [], events: [], deliveries: [], applications: [], patches: {}};
  let nextId = 0;
  const actor = position => {
    const a = {id: ++nextId, pos: {...position}, tier: 0, radius: 1, dead: false, life: 1000,
      facing: 2, lifespan: 0, skills: [], statuses: [], buffs: new Map(),
      cooldowns: new Map(), cooldownTotals: new Map(), skillRecoveryLocks: new Set(),
      stats: {effectDuration: 1, statusMagnitude: 1, aoeRadius: 1, critMulti: 2},
      sheet: {get: id => a.stats[id] ?? 0, setBase: (id, value) => {a.stats[id] = value;}},
      speedFactor: () => 1,
      addBuff: (definition, durationScale = 1) => {a.buffs.set(definition.id, {def: definition, durationScale});},
      removeBuff: id => {a.buffs.delete(id);},
      gainCharge: (id, amount, cap) => {demo.events.push(['charge', a.id, id, amount, cap]);},
    };
    demo.actors.push(a); return a;
  };
  const make = (definition, level) => ({def: definition, level, sockets: [], treeNodes: [], state: {}});
  const content = new AttackSequenceContent({patch: (_definition, id) => demo.patches[id],
    innateMods: inst => inst.def.innateMods ?? [], tags: inst => new Set(inst.def.tags), make},
  ['attack', 'melee', 'aoe', 'physical']);
  const owner = actor({x: 0, y: 0, z: 0}), target = actor({x: 10, y: 0, z: 0});
  const host = make({id: 'example-axe', name: 'Example Axe', tags: ['attack', 'melee', 'physical'],
    delivery: {type: 'melee', range: 10, arcDeg: 120}, attackSequence: spec,
    cooldown: 0, manaCost: 0, useTime: 0, innateMods: []}, 5);
  owner.skills.push(host);
  const ports = {
    time: () => demo.time,
    random: () => {demo.draws++; return 0.25;},
    actors: () => demo.actors,
    enemiesOf: source => demo.actors.filter(a => a !== source && !a.owner && !a.dead),
    distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
    copyPosition: position => ({...position}),
    pointAt: (origin, angle, distance) => ({x: origin.x + Math.cos(angle) * distance,
      y: origin.y, z: origin.z + Math.sin(angle) * distance}),
    interpolate: (from, to, ratio) => ({x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio, z: from.z + (to.z - from.z) * ratio}),
    clampPosition: position => position,
    lineOfFire: () => demo.visible,
    actorScale: () => demo.scale,
    spec: inst => content.spec(inst),
    delivery: inst => content.delivery(inst) ?? inst.def.delivery,
    tags: inst => new Set(inst.def.tags),
    mods: inst => inst.extraMods ?? [],
    modifier: (stat, kind, value) => ({stat, kind, value}),
    payload: (inst, delivery, tags) => content.payload(inst, delivery, tags),
    sweep: (inst, delivery) => content.sweep(inst, delivery),
    execute: (source, inst, aim, options) => {demo.deliveries.push({source, inst, aim, options}); source.facing = 9;},
    spawnMarker: (source, _inst, markerSpec, at) => {const marker = actor(at); marker.owner = source; marker.look = markerSpec.look; return marker;},
    spawnProjectile: (source, inst, at, angle, options) => {
      demo.flights.push({caster: source, inst, pos: {...at}, angle, tier: source.tier, ...options});
    },
    inheritedFlight: projectile => projectile.inherit,
    statusDefinition: id => ({element: 'physical', dotType: id === 'bleed' ? 'physical' : undefined, duration: id === 'bleed' ? 4 : 6}),
    zoneLevel: () => 1,
    baselineStatusDps: () => 2,
    applyStatus: (recipient, id, dps, durationScale, name, options) => {
      const entry = {id, dps, remaining: durationScale * (id === 'bleed' ? 4 : 6), stacks: 1, ...options};
      recipient.statuses.push(entry); demo.applications.push({recipient, entry, name});
    },
    burst: (source, inst, recipient, amount) => {recipient.life -= amount; demo.events.push(['burst', source.id, inst.def.id, recipient.id, amount]);},
    flights: () => demo.flights,
    filterFlights: keep => {demo.flights = demo.flights.filter(keep);},
    work: queue => demo.queues[queue],
    filterWork: (queue, keep) => {demo.queues[queue] = demo.queues[queue].filter(keep);},
    retireZones: owned => {for (const zone of [...demo.zones]) if (owned(zone.caster, zone.inst)) {zone.retired = true;}},
    kill: a => {a.dead = true;},
    cycleCue: (a, _inst, step, maximum) => {demo.events.push(['cycle', a.id, step, maximum]);},
    impactCue: (a, radius) => {demo.events.push(['impact', a.id, radius]);},
    flightCue: p => {demo.events.push(['flight', {...p.pos}]);},
    lodgedCue: (at, a) => {demo.events.push(['lodged', {...at}, a.id]);},
    bounceCue: (at, p, _inst, radius, elapsed, ratio) => {demo.events.push(['bounce', {...at}, {...p.pos}, radius, elapsed, ratio]);},
  };
  const controller = new AttackSequences(ports);
  return Object.assign(demo, {owner, target, host, actor, content, controller, ports});
}
