import {CombatHostility} from '../../dist/combat-hostility.js';
import {CombatTargeting} from '../../dist/combat-targeting.js';

const spatialMethods = ['arena', 'isWalkable', 'pointInSolid', 'dwellReachable', 'clamp', 'layerAt', 'lineOfFire', 'lineOfSight', 'clipShot',
  'nearestBody', 'inAoeBody', 'noteBodyHit', 'reachTo', 'strikeSurfaces', 'frontSplash', 'bodyWhere', 'freeSpot', 'emergenceGround'];

/** Physical facts and presentation only. No quest, account, persistence or
 * generic effect-execution callback enters this boundary. Core and nested
 * payload admission must separately check optional terrain/travel services. */
export function installCombatHostServices(w, content) {
  const q = {...content.queries, ...content.hitQueries}, space = w.host.space;
  for (const name of spatialMethods) if (typeof space?.[name] !== 'function') throw Error('Missing combat spatial service: ' + name);
  for (const [method, provider] of Object.entries({clampPos: 'clamp', spoilStoryAt: 'layerAt', lineOfFire: 'lineOfFire',
    lineOfSight: 'lineOfSight', clipShot: 'clipShot', nearestBody: 'nearestBody', inAoeBody: 'inAoeBody',
    noteBodyHit: 'noteBodyHit', strikeSurfaces: 'strikeSurfaces', frontSplash: 'frontSplash'})) w[method] = (...args) => space[provider](...args);
  w.clampPos = (pos, radius, from, options) => {
    const tether = options?.mover ? q.refreshMovementTether(options.mover, w) : undefined;
    const out = space.clamp(tether ? q.movementTetherLimit(tether, pos) : pos, radius, from, options);
    if (tether && q.movementTetherDistance(tether, out) > tether.spec.length + .001) {
      if (q.movementTetherDistance(tether, tether.safe) > tether.spec.length) {tether.released = true; tether.returning = false; return out;}
      return {...tether.safe};
    }
    return out;
  };
  // A contact index is combat state. The spatial adapter reports geometry;
  // it must not write the actor to make a hit reach the selected segment.
  w.noteBodyHit = (actor, segment) => {q.noteBodyHit(actor,segment);space.noteBodyHit(actor,segment);};
  w.signal = (kind, detail) => w.signals.push({kind, detail});
  w.text = (at, text, color, size = 12, kind) => {
    // Original presentation jitter participates in the accepted random stream.
    // A renderer may ignore it; disabling rendering must not change combat rolls.
    const jitter = w.random();
    w.signal('text', {at: {...at}, text, color, size, kind, jitter});
  };
  w.notice = (text, color, size, kind) => w.signal('notice', {text, color, size, kind});
  w.showSkillArrival = (actor, inst, at, radius, tier, self, area) => w.signal('skill-arrival', {actor: actor.id, skill: inst.def.id, at: {...at}, radius, tier, self, area});
  w.showSelfRelease = (actor, inst) => w.signal('self-release', {actor: actor.id, skill: inst.def.id});
  w.ultimateFlash = (actor, definition) => w.signal('ultimate', {actor: actor.id, skill: definition.id});
  w.presenceArrival = (actor, caster, inst) => {
    const profile = q.presenceProfile(inst.def.id);
    if (!profile || profile.family === 'storm') return false;
    actor.presenceBadge = {skillId: inst.def.id, color: w.host.presentation?.cosmetic?.(caster.id, inst.def.id)?.color ?? inst.def.color};
    return w.presenceMoment(actor, 'arrive');
  };
  w.showCombatOutcome = (actor, outcome) => w.signal('combat-outcome', {actor: actor.id, outcome});
  w.occluded = kind => w.signal('occluded', {kind});
  w.feeding = (meal, caster, inst) => w.signal('feeding', {meal: meal.id, caster: caster.id, skill: inst.def.id});
  w.characterChanged = seat => w.signal('character-changed', {id: seat.id});
  w.markMetaDirty = seat => w.characterChanged(seat);
  w.seatOf = actor => w.seats.find(seat => seat.actor === actor);
  w.seatHero = seat => seat.home ?? seat.actor;
  w.storyPair = (from, to) => ({from: from.tier ?? 0, to: to.tier ?? 0});
  w.markSeatActed = actor => {const seat = w.seatOf(actor); if (seat) seat.lastActedAt = w.time;};
  w.markSeatMoved = actor => {const seat = w.seatOf(actor); if (seat) seat.lastMovedAt = w.time;};
  w.walkScale = (actor, x, y) => {
    const scale = space.walkScale?.({id:actor.id, pos:{...actor.pos}, tier:actor.tier, direction:{x,y}}) ?? 1;
    if (!Number.isFinite(scale) || scale < 0) throw new TypeError('Invalid host walking scale');
    return scale;
  };
  w.recordIndirectDamage = (...args) => w.observers.indirectDamage?.(...args);
  w.shotElev = (...args) => w.host.space.shotElev(...args);
  w.viewRectFor = (...args) => space.viewRectFor(...args);
  w.resolveBoundary = (...args) => space.resolveBoundary(...args);
  w.steppedClamp = (actor, dest, from, displacement) => {
    const out = w.cScratch; out.hit = 'none';
    const tether = space.stepPhysical ? q.refreshMovementTether(actor, w) : undefined;
    const to = tether ? q.movementTetherLimit(tether, dest) : dest;
    const step = space.stepPhysical?.({id:actor.id,pos:{...actor.pos},radius:actor.radius,tier:actor.tier,
      flying:actor.flying,touchdown:!!actor.touchdown}, {...to}, {...from}, displacement && {...displacement});
    if (space.stepPhysical && !step) throw new TypeError('Invalid physical pose');
    if (step) {
      if (!Number.isFinite(step.pos?.x) || !Number.isFinite(step.pos?.y) || !Number.isSafeInteger(step.tier) || step.tier < 0
        || step.collision && !['none','wall','void'].includes(step.collision.hit)) throw new TypeError('Invalid physical pose');
      // A wall slide is still subject to the SDK's physical tether. A lost or
      // out-of-range safe anchor follows the original release policy.
      let pos = step.pos;
      if (tether && q.movementTetherDistance(tether,pos) > tether.spec.length + .001) {
        if (q.movementTetherDistance(tether,tether.safe) > tether.spec.length) {tether.released=true;tether.returning=false;}
        else pos=tether.safe;
      }
      actor.pos = {...pos}; actor.tier = step.tier; actor.touchdown = false; Object.assign(out, step.collision);
    }
    else actor.pos = w.clampPos(dest, actor.radius, from, {out, disp: displacement, mover: actor});
    if (out.hit === 'void') w.resolveBoundary(actor, out, from);
  };
  const grid = new q.ActorGrid();
  let gridActors, builtRevision = -1;
  w.actorGridRev = 0;
  w.actorsNear = (x, y, radius, output) => {
    if (gridActors !== w.actors || builtRevision !== w.actorGridRev) {
      grid.build(w.actors); gridActors = w.actors; builtRevision = w.actorGridRev;
    }
    return grid.near(x, y, radius, output);
  };
  w.noiseAt = (...args) => w.host.intent?.noiseAt?.(...args);
  w.actorById = id => w.actors.find(actor => actor.id === id);
  const hostility = new CombatHostility({travelProtected: q.throngTravelProtected,
    crossLayerDuels: () => !!w.host.space.crossLayerDuels?.(), burrowed: q.clingBurrowed,
    prey: (a, b) => w.isPrey(a, b), factionStance: (a, b) => w.host.relationships?.factionStance?.(a, b) ?? q.factionStance(a, b)});
  w.hostileTo = (a, b) => hostility.hostile(a, b);
  w.isDormant = actor => !!w.host.intent?.dormant?.(actor.id);
  // Crowd storage, promotion and combat belong to the SDK's packed population
  // service. The spatial host supplies floor facts, not replacement combat.
  const targeting = new CombatTargeting(() => w.corpses, content.staticRules.corpses.duration, {
    spec: q.instanceTargeting, grimoire: q.grimoireForm, tags: q.skillContextTags, modifiers: q.instanceMods,
    actors: () => w.actors, enemies: actor => w.enemiesOf(actor), spoilStoryAt: w.spoilStoryAt,
    leavesRemains: id => q.defLeavesRemains(q.MONSTERS[id]), monsterTags: id => q.MONSTERS[id]?.tags,
    hasHeal: inst => inst.def.effects.some(fx => fx.type === 'heal'), occlusion: (actor, inst) => w.skillOcclusion(actor, inst),
    lineOfFire: w.lineOfFire, reachTo: (actor, at) => space.reachTo(actor, at),
    kill: actor => w.kill(actor, true), corpse: record => record,
  });
  w.resolveTargeting = (actor, inst, aim) => q.instanceTargeting(inst) ? targeting.resolve(actor, inst, aim) : null;
  w.removeCorpse = corpse => {const index = w.corpses.indexOf(corpse); if (index >= 0) w.corpses.splice(index, 1);};
  return Object.freeze({hostility, targeting});
}
