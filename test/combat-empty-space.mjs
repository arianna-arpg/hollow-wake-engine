import {dist, inAoe} from '../dist/combat-geometry.js';

/** Deliberately empty, flat test arena. Every absence below describes geometry;
 * no combat outcome, damage calculation or target choice is implemented here. */
export function emptyCombatSpace(width = 2000, height = 2000) {
  const body = actor => ({pos: actor.pos, r: actor.radius, seg: -1});
  return {
    arena: () => ({w: width, h: height}),
    clamp: (at, radius) => ({x: Math.max(radius, Math.min(width - radius, at.x)), y: Math.max(radius, Math.min(height - radius, at.y))}),
    layerAt: () => 0, lineOfFire: () => true, lineOfSight: () => true, clipShot: (_from, to) => ({...to}),
    nearestBody: actor => body(actor), noteBodyHit: (actor, segment) => {actor.hitSeg = segment;},
    inAoeBody: (at, radius, shape, facing, actor, arc, predicate) => inAoe(at, radius, shape, facing, actor.pos, actor.radius, arc)
      && (!predicate || predicate(actor.pos, actor.radius)) ? body(actor) : null,
    reachTo: (actor, at) => dist(actor.pos, at) - actor.radius,
    bodyWhere: (actor, predicate) => predicate(actor.pos, actor.radius) ? body(actor) : null,
    strikeSurfaces() {}, frontSplash() {}, freeSpot: at => ({...at}), emergenceGround: () => undefined,
    segsHittable: () => false, segR: actor => actor.radius, viewRectFor: () => ({x: 0, y: 0, w: width, h: height}),
    doodadsAt: () => [], doodadRuleOf: () => undefined, popBrittle() {}, blocksProjectiles: () => false,
    hitSurfaceOf: () => undefined, shapeContains: () => false, pushOutOfShape: at => at,
    shotGrid: () => undefined, shotElev: () => undefined, castGridRay: () => null, groundAt: () => undefined,
    isWalkable: () => true, pointInSolid: () => false, travelHit: () => null,
    dwellReachable: (_a, _b, _mode, story) => story.from === story.to,
  };
}
