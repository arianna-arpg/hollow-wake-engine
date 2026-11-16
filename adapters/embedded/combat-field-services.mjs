import {CastFields} from '../../dist/cast-fields.js';
import {FieldSimulation} from '../../dist/field-simulation.js';
import {CastSchedules} from '../../dist/cast-schedules.js';

/** World-owned terrain and travel are replaceable services. A missing service
 * remains an explicit refusal, never an effect that quietly does nothing.
 * Public admission checks the same requirements before any payment. */
export function installCombatFields(w, content, link) {
  const q = {...content.queries, ...content.hitQueries};
  const world = name => (...args) => {
    const method = w.host.fields?.[name];
    if (typeof method !== 'function') throw Error('Missing combat field service: ' + name);
    return method.apply(w.host.fields, args);
  };
  w.addTempGround = world('terrain');
  w.conjureCloud = world('conjure');
  const flash = (pos, radius, color, life) => {w.flashes.push({pos: {...pos}, radius, color, life, maxLife: life});};
  const cast = new CastFields(w, q.CONJURE_RIDERS, {
    random: () => w.random(), terrain: w.addTempGround, conjure: w.conjureCloud,
    kindle: world('kindle'), vent: world('vent'), lure: (...args) => w.setLure(...args), portal: world('portal'),
    kindled: at => {flash(at, 80, '#ffd890', .4); w.text({x: at.x, y: at.y - 14}, 'kindled', '#ffd890', 11);},
    vented: (at, radius, color) => flash(at, radius, color, .35),
  });
  w.conjureGrantsFor = (...args) => cast.grants(...args);
  w.plantKindle = (...args) => cast.kindle(...args);
  w.plantVent = (fx, at, area, duration, tier = 0) => cast.vent(fx.bank, at, fx.radius, fx.duration, area, duration, tier);
  const fields = new FieldSimulation(w, {expireCueSeconds: q.PRESENCE_STYLE.expire,
    maddenEpsilon: content.staticRules.madden.epsilon, occludingDeliveries: q.LOS_CFG.zoneTickTypes}, link.ports('fieldSimulation', {
    time: () => w.time, random: () => w.random(), actors: () => w.actors,
    encounterLevel: () => w.encounter.level, activeBoss: () => w.encounter.boss,
    passiveMonster: id => !!q.MONSTERS[id]?.passive,
    regionAt: (x, y) => w.host.space.regionAt?.(x, y), underRoofAt: at => w.host.space.underRoofAt?.(at) ?? false,
    bodyWhere: (...args) => w.host.space.bodyWhere(...args),
    hasSkill: id => !!q.SKILLS[id], makeSkill: (id, level) => q.makeSkillInstance(q.SKILLS[id], level),
    plantImpactDress: field => w.signal('field-impact', {at: {...field.pos}, skill: field.inst.def.id}),
    flash: cue => {w.flashes.push(cue);},
  }));
  for (const method of ['updateZones', 'expireZone', 'updateZoneDomain', 'zoneVictims', 'zoneSees', 'zoneHas', 'strikeZoneSurfaces', 'detonateFissureSegment']) w[method] = (...args) => fields[method](...args);
  const schedules = new CastSchedules(w, {
    random: () => w.random(), timeScale: actor => w.timeflow.actorScale(actor), hasSkill: id => !!q.SKILLS[id], modifiers: q.instanceMods,
    followUps: q.instanceFollowUps, mintMeta: (...args) => w.mintMetaInstance(...args), targeting: q.instanceTargeting,
    resolveTargeting: (...args) => w.resolveTargeting(...args), enemies: actor => w.enemiesOf(actor),
    execute: (...args) => w.executeSkill(...args), use: (...args) => w.useSkill(...args),
  });
  w.queueFollowUps = (...args) => schedules.queueFollowUps(...args);
  return Object.freeze({cast, fields, schedules});
}
