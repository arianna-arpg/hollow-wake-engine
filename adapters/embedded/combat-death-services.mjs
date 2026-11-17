import {CombatDeath} from '../../dist/combat-death.js';

/** Death owns combat retirement and dispatches optional outcome observations.
 * General AI death reactions, rewards, quests and saves are not imported. */
export function installCombatDeath(w, content, births) {
  const q = {...content.queries, ...content.hitQueries};
  const flash = (pos, radius, color, life, extra) => {w.flashes.push({pos, radius, color, life, maxLife: life, ...extra});};
  const death = new CombatDeath(w, {corpseDuration: content.staticRules.corpses.duration, corpseMax: content.staticRules.corpses.max}, births.bursts, {
    actors: () => w.actors, seats: () => w.seats, random: () => w.random(),
    deferDeath: (actor,silent,killer) => w.frameArts?.deferDeath(actor,silent,killer) ?? false,
    undying: (actor,departure) => {
      if(!w.prototypeMechanics)return;
      actor.summonPactTemporary ??= actor.lifespan>0||!!actor.decay;
      actor.summonPactDeathCause=departure==='expire'?'expire':'slain';
    },
    retired: (actor,silent,killer,departure) => {
      if(!w.prototypeMechanics)return;
      if(!silent)w.battleDoctrines.death(actor,killer);
      w.frameArts.death(actor,silent,departure==='expire');
      w.cohortArts.death(actor,silent,departure==='expire');
      w.summonArts.death(actor,silent&&departure!=='sacrifice',departure==='expire');
      w.summonPacts.death(actor,departure==='sacrifice'?'slain':departure==='expire'?'expire':silent?'dismiss':'slain');
      w.summonPacts.reconcile(actor);
    },
    immortal: id => !!q.MONSTERS[id]?.immortal, leavesRemains: id => q.defLeavesRemains(q.MONSTERS[id]),
    breakDoor: id => w.host.space.breakDoor(id), eject: (...args) => w.seatEject(...args),
    breakPart: (...args) => w.onPartBroken(...args), releaseGarrison: actor => w.releaseGarrison(actor),
    tags: q.skillContextTags, modifiers: q.instanceMods, bashSpec: q.guardBashSpec, bash: (...args) => w.guardBash(...args),
    enemies: actor => w.enemiesOf(actor), hit: (...args) => w.resolveHit(...args), heal: (...args) => w.applyHeal(...args),
    statuses: w.statusEffects, bonds: w.companionBonds, clutch: births.births,
    minionDeath: (owner, body) => w.rollOwnProcs(owner, 'minionDeath', {target: body}), guard: w.guardArts,
    carried: Object.values(w.carried), hiveDeath: actor => w.hivecallDeath(actor), throngMinimum: (...args) => w.throngKeepMinimum(...args),
    throngKill: (...args) => w.throngOnKill(...args), retireAura: (...args) => w.deactivateAura(...args),
    deathActions: (...args) => w.runSummonDeathActions(...args), playerDown: (...args) => w.onPlayerDown(...args),
    createMonster: (...args) => w.createMonster(...args), minionsOfSkill: (...args) => w.minionsOfSkill(...args), lifeline: actor => w.conjurationLifeline(actor),
    clamp: (...args) => w.clampPos(...args), emerge: actor => w.emergeBody(actor), hatch: actor => w.hatchPod(actor),
    releaseContract: (...args) => w.releaseContract(...args), dismissToggle: (...args) => w.dismissSummonToggle(...args),
    tapCharges: (...args) => w.tapCharges(...args), presence: (...args) => w.presenceMoment(...args), flash,
    text: (...args) => w.text(...args), observers: w.observers.death,
    cue: (actor, kind, parent) => {
      if (kind === 'weak-points') for (const cue of q.takeWeakPointBreaks(actor)) w.flashes.push(q.anatomyFlash(actor.pos, actor.radius, actor.facing, cue));
      else if (kind === 'companion-down') w.showCompanionCue(actor, 'down');
      else if (kind === 'undying') w.showRecoveryCue(actor, 'undying');
      else if (kind === 'part-death') flash({...actor.pos}, actor.radius * 1.3, actor.color, .3, {fx: q.deathVoiceOf(actor.material ?? parent?.material)});
      else if (kind === 'worm-death') for (let n = 0; n < actor.worm.segments.length; n++) {
        flash({...actor.worm.segments[n]}, w.host.space.segR(actor, n) + 6, actor.color, .25 + n * .045, {fx: q.deathVoiceOf(actor.material)});
      }
      else if (kind === 'death') flash({...actor.pos}, actor.radius * 1.6, actor.color, .4, {fx: q.deathVoiceOf(actor.material)});
    },
  });
  w.kill = (...args) => death.kill(...args);
  return death;
}
