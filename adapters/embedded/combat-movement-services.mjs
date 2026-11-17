import {MovementDeliveries} from '../../dist/movement-deliveries.js';
import {UtilityDeliveries} from '../../dist/utility-deliveries.js';
import {PendingResolutions} from '../../dist/pending-resolutions.js';

export function installCombatMovement(w, content) {
  const q = {...content.queries, ...content.hitQueries};
  w.movementFlashes = new WeakMap();
  const flash = value => {w.flashes.push(value);};
  const movement = new MovementDeliveries(() => w.pendingBlinks, content.staticRules.conjure.statTrail, {
    createActor: (...args) => w.allocateActor(...args), addActor: actor => {w.actors.push(actor);},
    forgetMotion: actor => {w.movementFlashes.delete(actor);}, moment: (...args) => w.movementMoment(...args),
    blast: (...args) => w.moveBlast(...args), status: id => q.STATUS_DEFS[id],
    clamp: (at, radius, mover) => w.clampPos(at, radius, undefined, {mover}), afforded: (...args) => w.affordedDest(...args),
    grants: (...args) => w.conjureGrantsFor(...args), conjure: (...args) => w.conjureCloud(...args),
    trailSpec: n => w.statTrailSpec(n), trail: (...args) => w.mintTrailPatch(...args),
    teleport: (actor, at, color, tier, id) => w.teleportActor(actor, at, color, undefined, tier, id),
    linger: (...args) => w.dropLingerField(...args), enemies: actor => w.enemiesOf(actor), hit: (...args) => w.resolveHit(...args),
    surfaces: (...args) => w.strikeSurfaces(...args), flash, voice: q.skillMovementVoice,
  });
  w.endCarom = (...args) => movement.endCarom(...args);
  const utility = new UtilityDeliveries(() => w.pendingDetonations, {
    ...(content.prototypeMechanics?{
      mineReady:mine=>!(mine.construct.timer>0)&&mine.construct.detonationLeft===undefined,
      mineClock:(mine,time)=>{if(mine.construct)mine.construct.detonationLeft=time;},
    }:{}),
    actors: () => w.actors, clamp: (...args) => w.clampPos(...args),
    teleport: (actor, at, color, id) => w.teleportActor(actor, at, color, undefined, undefined, id),
    marked: (actor, inst, at, color) => flash({pos: at, radius: 28, color, life: .4, maxLife: .4, fx: q.skillSelfVoice(inst.def.id), recoveryCueTier: actor.tier}),
    prepareMine: (mine, inst, timer, color) => {
      const fx = q.skillSelfVoice(inst.def.id, 'prepare');
      if (!fx) return;
      const visual = {pos: {...mine.pos}, radius: mine.radius + 18, color, life: timer, maxLife: timer, fx, recoveryCueTier: mine.tier};
      flash(visual); return visual;
    },
    released: (actor, inst) => w.showSelfRelease(actor, inst), empty: actor => w.text(actor.pos, 'no mines placed', '#8a8678', 11),
    execute: (...args) => w.executeSkill(...args), kill: (...args) => w.kill(...args),
  });
  const pending = new PendingResolutions(() => w.pendingFuses, () => w.pendingPersists, {
    time: () => w.time, actorById: id => w.actorById(id),
    fusePower: (actor, inst) => actor.sheet.get('fusePower', q.skillContextTags(inst.def, q.grantedTags(inst)), q.instanceMods(inst)),
    buff: (...args) => w.applyBuffEffect(...args), hit: (...args) => w.resolveHit(...args),
    arrived: (actor, inst, kind) => flash({pos: {...actor.pos}, radius: actor.radius + (kind === 'hit' ? 14 : 12), color: inst.def.color, life: .3, maxLife: .3}),
    copyPosition: at => ({...at}), execute: (...args) => w.executeSkill(...args),
  });
  return Object.freeze({movement, utility, pending});
}
