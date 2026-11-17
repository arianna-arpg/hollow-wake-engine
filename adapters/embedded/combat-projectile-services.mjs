import {Projectiles} from '../../dist/projectiles.js';
import {ProjectileDelivery} from '../../dist/projectile-delivery.js';
import {ProjectileSchedules} from '../../dist/projectile-schedules.js';

export function installCombatProjectiles(w, content, link) {
  const q = {...content.queries, ...content.hitQueries}, r = content.staticRules;
  const spatial = name => (...args) => {
    const method = w.host.space[name];
    if (typeof method !== 'function') throw Error('Unadmitted projectile geometry: ' + name);
    return method.apply(w.host.space, args);
  };
  const physics = Object.fromEntries(['arena', 'segsHittable', 'segR', 'viewRectFor', 'doodadsAt', 'doodadRuleOf', 'popBrittle',
    'blocksProjectiles', 'hitSurfaceOf', 'shapeContains', 'pushOutOfShape', 'shotGrid', 'shotElev', 'castGridRay', 'groundAt'].map(name => [name, spatial(name)]));
  const ports = link.ports('projectiles', {...physics,
    instanceDelivery:q.instanceDelivery,hostileTo:(...args)=>w.hostileTo(...args),plantedLook:()=>q.SECONDARY_LOOKS.planted,
    artConfigure: p => w.projectileArts?.configure(p), artUpdate: dt => w.projectileArts?.update(dt),
    artValid: p => !(p.inst.projectileCast || p.projectileOrbit) || (!p.dissolved && w.projectileArts.valid(p)),
    artElapsed: (p, dt) => p.inst.projectileCast && p.maxAge !== undefined ? Math.max(0, Math.min(dt, p.maxAge - p.age)) : dt,
    artMove: (p, dt) => w.projectileArts?.move(p, dt),
    artTouches: (p, x, y, radius) => p.projectileOrbit ? w.projectileArts.touches(p, x, y, radius) : undefined,
    artBounce: p => w.projectileArts?.bounce(p), artTick: p => w.projectileArts?.tick(p),
    artImpact: p => w.projectileArts?.impact(p) ?? p.pos,
    artOrigin: p => p.inst.projectileCast ? w.projectileArts.impact(p) : p.origin,
    artContact: p => w.projectileArts?.contact(p) ?? p.inst, artExpire: p => w.projectileArts?.expire(p),
    time: () => w.time, random: () => w.random(), actors: () => w.actors, actorScale: actor => w.timeflow.actorScale(actor),
    cosmetic: (actor, id) => w.host.presentation?.cosmetic?.(actor.id, id) ?? {},
    applyConversion: w.damage.applyConversion, skill: id => q.SKILLS[id], makeSkill: q.makeSkillInstance,
    flash: value => {w.flashes.push(value);},
    sequenceFlight: projectile => w.attackSequences.flight(projectile), sequenceBeforeContact: projectile => w.attackSequences.beforeContact(projectile),
    sequenceContact: (...args) => w.attackSequences.contact(...args),
    rollSkillDamage: w.damage.rollSkillDamage, mitigateTyped: w.damage.mitigateTyped,
    guardiansActive: () => w.carried.guardians.active, satellitesCount: () => w.carried.satellites.visuals.length,
    reflectSatellites: (...args) => w.carried.satellites.reflectProjectiles(...args), interceptGuardians: (...args) => w.carried.guardians.intercept(...args),
    liteCount: () => w.lite.liveCount,
    noiseAt: (...args) => w.host.intent?.noiseAt?.(...args),
  });
  const flights = new Projectiles(w, r.projectiles, ports, !!content.prototypeMechanics);
  for (const method of ['spawnProjectile', 'explodeProjectile', 'updateProjectiles', 'reflectParriedProjectile']) {
    if (typeof flights[method] === 'function') w[method] = (...args) => flights[method](...args);
  }
  const schedules = new ProjectileSchedules(() => w.pendingSalvos, () => w.pendingAmbushes, {
    time: () => w.time, random: () => w.random(), actorById: id => w.actorById(id), enemies: actor => w.enemiesOf(actor),
    timeScale: actor => w.timeflow.actorScale(actor), tags: inst => q.skillContextTags(inst.def, q.grantedTags(inst)), modifiers: q.instanceMods,
    kill: (...args) => w.kill(...args), spawn: (...args) => flights.spawnProjectile(...args),
    released: (at, color) => {w.flashes.push({pos: at, radius: 26, color, life: .3, maxLife: .3});},
  });
  w.triggerAmbush = (...args) => schedules.trigger(...args);
  const projectile = new ProjectileDelivery(() => w.pendingSalvos, () => w.pendingAmbushes, r.corpses.batch.projectilesPerExtra, {
    artCount: (actor, inst) => w.projectileArts?.count(actor, inst) ?? 0,
    artOrbitLimit: inst => inst.projectileSpec?.orbit ? w.projectileArts.limit(inst) : undefined,
    time: () => w.time, random: () => w.random(), projectilesPerCharge: inst => q.instanceChargeCost(inst)?.projectilesPerCharge ?? 0,
    caromCapacity: q.caromCapacity, clamp: (...args) => w.clampPos(...args),
    spawn: (...args) => flights.spawnProjectile(...args), embed: (actor, inst, spec, aim, at) => w.spawnConstruct(actor, inst, spec, aim, undefined, at),
    minions: (...args) => w.minionsOfSkill(...args), triggerAmbush: (...args) => schedules.trigger(...args),
    anchor: (at, color) => {w.flashes.push({pos: at, radius: 16, color, life: .35, maxLife: .35});},
  });
  return Object.freeze({flights, schedules, projectile});
}
