import {Grabs} from '../../dist/grab.js';
import {Possessions} from '../../dist/possession.js';
import {CompanionCastCommands} from '../../dist/companion-cast-commands.js';
import {ConstructRelocation} from '../../dist/construct-relocation.js';
import {CorpseEffects} from '../../dist/corpse-effects.js';

/** Transient combat control stays with the shared actor graph. A possession
 * changes the in-memory controller; no account or save owner participates. */
export function installCombatControls(w, content) {
  const q = {...content.queries, ...content.hitQueries}, r = content.staticRules;
  const flash = value => {w.flashes.push(value);};
  const grabs = new Grabs(r.grab, {
    actors: () => w.actors, actorById: id => w.actorById(id), enemies: actor => w.enemiesOf(actor),
    time: () => w.time, random: () => w.random(), localActor: () => w.localSeat?.actor,
    tags: q.skillContextTags, modifiers: q.instanceMods, dormant: actor => w.isDormant(actor),
    hostileTo: (a, b) => w.hostileTo(a, b), lineOfSight: (...args) => w.lineOfSight(...args),
    clamp: (...args) => w.clampPos(...args), unclasp: actor => w.clingRelease(actor),
    mitigate: (...args) => w.damage.mitigateTyped(...args), kill: (...args) => w.kill(...args),
    hit: (...args) => w.resolveHit(...args), push: (...args) => w.pushActor(...args),
    text: (...args) => w.text(...args), flash, fail: (...args) => w.failNote(...args),
    damaged: (...args) => w.recordIndirectDamage(...args), dot: (...args) => w.observers.onDot?.(...args),
    leech: q.noteResourceFlow, seized: (target, caster) => w.observers.seized?.(target, caster),
  });
  const possession = new Possessions(r.possession, {
    actors: () => w.actors, controllers: () => w.seats, controllerFor: actor => w.seatOf(actor),
    // Owner queries read the current controller directly; no derived seat index.
    reindex: () => {}, time: () => w.time, definition: id => q.MONSTERS[id], status: id => q.STATUS_DEFS[id],
    tags: q.skillContextTags, grantedTags: q.grantedTags, modifiers: q.instanceMods,
    createBody: (...args) => w.createMonster(...args), clamp: (...args) => w.clampPos(...args),
    text: (...args) => w.text(...args), flash, fail: (...args) => w.failNote(...args),
    changed: seat => w.characterChanged(seat), embodied: event => w.signal('possess/embody', event),
    ejected: event => w.signal('possess/eject', event), returnSwarmForm: (...args) => w.hivecallReturn(...args),
  });
  w.grabSeize = (...args) => grabs.seize(...args);
  w.grabRelease = actor => grabs.release(actor);
  w.updateGrabs = dt => grabs.advance(dt);
  w.possessSeize = (...args) => possession.seize(...args);
  w.shapeshiftPress = (...args) => possession.shift(...args);
  w.seatEject = (...args) => possession.eject(...args);
  w.updatePossessions = dt => possession.advance(dt);
  const companions = new CompanionCastCommands({
    actors: () => w.actors, companions: (...args) => w.companionsOfSkill(...args),
    noRecall: id => !!q.MONSTERS[id]?.noRecall, nativeDelivery: inst => inst.def.delivery,
    revive: (...args) => w.reviveCompanion(...args), recover: actor => w.recoverCompanion(actor),
    teleport: (actor, at, color, layer) => w.teleportActor(actor, at, color, undefined, layer),
    companionCue: (...args) => w.showCompanionCue(...args), whistleBonds: (...args) => w.companionBonds.whistle(...args),
    controller: actor => w.seatOf(actor), stance: (...args) => w.stances.cycle(...args),
    refundCooldown: (actor, id) => w.refundSkillCooldown(actor, id), refused: (...args) => w.failNote(...args),
    explode: (actor, fraction, caster, inst, color) => w.explodeMinion(actor, fraction, {color, visual: q.skillSelfVoice(inst.def.id, 'burst')}),
    kill: (...args) => w.kill(...args), selfCue: (caster, inst, actor) => w.showSelfRelease(caster, inst, actor.pos, actor.radius + 18, actor.tier),
    burst: (at, radius, amount, color, team, tier, caster, inst) => w.burstDamage(at, radius, amount, 'physical', color, team, tier, undefined, undefined, q.skillSelfVoice(inst.def.id, 'burst')),
  });
  const relocation = new ConstructRelocation({actors: () => w.actors, metas: q.instanceMetas, delivery: q.instanceDelivery,
    sameLayer: q.sameStory, clamp: (at, radius, mover) => w.clampPos(at, radius, undefined, {mover}),
    moved: (body, color) => flash({pos: {...body.pos}, radius: 28, color, life: .25, maxLife: .25}),
  }, inst => w.skillInstances.relocationHost(inst));
  w.relocationTarget = (...args) => relocation.target(...args);
  const corpses = new CorpseEffects(r.corpses, () => w.corpses, {
    monster: id => !!q.MONSTERS[id], level: () => w.encounter.level, random: () => w.random(),
    clamp: (at, radius, mover) => w.clampPos(at, radius, undefined, mover ? {mover} : undefined), layerAt: at => w.spoilStoryAt(at),
    created: (at, color) => flash({pos: at, radius: 44, color, life: .3, maxLife: .3}),
    gathered: (at, color) => flash({pos: at, radius: 40, color, life: .3, maxLife: .3}),
    empty: (actor, id) => w.failNote(actor, id + ':nobodies', 'no dead to gather'),
  });
  return Object.freeze({grabs, possession, companions, relocation, corpses});
}
