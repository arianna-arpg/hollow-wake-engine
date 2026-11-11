// Synthetic public controller course. Damage and presentation are bounded host sinks.
export function makeChallengeTargetingScene(Challenges, enemies, devices, fields) {
  let serial = 0, hits = 0, pulses = 0, checksum = 0;
  const spec = {device: {thornsRatio: .5}, deviceCap: devices,
    ...(fields ? {bleedingField: {power: .4}} : {}),
    creeper: {speed: 40, trailRadius: 8, trailDuration: .3, trailPower: .1, strikePower: .2, strikeInterval: .3}};
  const makeSkill = (def, level = 1) => ({def, level, sockets: [], treeNodes: []});
  const definition = id => ({id, name: id, tags: [], delivery: {}, effects: [], cooldown: 1, useTime: 0});
  const actor = (team, pos) => ({id: ++serial, team, pos: {...pos}, tier: 0, radius: 8,
    dead: false, color: '', shape: '', passive: false, untargetable: false, invulnerable: false, noBounty: false,
    skills: [], statuses: [], cooldowns: new Map(), cooldownTotals: new Map(),
    sheet: {get: id => id === 'aoeRadius' ? 1 : 0, setSource() {}}, removeBuff() {}, addBuff() {},
    applyStatus(id, dps, duration, sourceName, options) {this.statuses.push({id, dps, stacks: 1, remaining: duration, total: duration, ...options});}});
  const owner = actor('friend', {x: 0, y: 0}), host = makeSkill(definition('goad')); owner.skills = [host];
  const ports = {time: 0, actors: [owner], projectiles: [], pendingRepeats: [], pendingFuses: [], zones: [], flashes: [],
    spec: () => spec, random: () => {throw Error('Unexpected RNG');}, tags: () => new Set(), modifiers: () => [],
    modifier: (stat, kind, value) => ({stat, kind, value}), damageBands: () => ({total: {lo: 10, hi: 20}}),
    createSkill: makeSkill, deviceCall: definition('goad_device_call'), text() {},
    allocate: (_name, team, pos) => actor(team, pos),
    enemiesOf: body => ports.actors.filter(a => a.team !== body.team && !a.dead), clampPos: pos => pos,
    spawnConstruct(caster, _host, d, at, call) {const body = actor(caster.team, at); body.owner = caster;
      body.construct = {range: d.range, timer: 0}; body.skills = [call]; ports.actors.push(body); return body;},
    executeSkill(_actor, inst, aim) {pulses++; checksum += aim.x + aim.y + inst.level;},
    challengeHit(_actor, _inst, target, power) {hits++; checksum += target.id * power;},
    challengeBurst() {throw Error('Unexpected burst');}, spawnProjectile() {throw Error('Unexpected projectile');},
    retireOwnedZone() {throw Error('Unexpected zone retirement');}};
  for (let i = 0; i < enemies; i++) {
    const angle = ((i * 173) % 360) * Math.PI / 180, radius = 10 + ((i * 37) % 190);
    ports.actors.push(actor('enemy', {x: Math.cos(angle) * radius, y: Math.sin(angle) * radius}));
  }
  const controller = new Challenges(ports);
  for (let i = 0; i < devices; i++) controller.toss(owner, controller.prepare(owner, host, false),
    {x: (i - devices / 2) * 3, y: 0}, {range: 250, placeRange: 300}, 1);
  controller.update(1);
  const tick = frames => {for (let i = 0; i < frames; i++) {ports.time += 1 / 60; controller.update(1 / 60); ports.flashes.length = 0;}};
  const observe = () => ({hits, pulses, checksum, time: ports.time,
    actors: ports.actors.map(a => ({id: a.id, pos: a.pos, statuses: a.statuses})),
    effigies: controller.effigies.map(e => ({center: e.center, trailAt: e.trailAt, strikeAt: e.strikeAt}))});
  return {tick, observe};
}
