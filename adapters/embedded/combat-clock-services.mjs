import {CombatActorFrame} from '../../dist/combat-actor-frame.js';
import {StatusAftermath} from '../../dist/status-aftermath.js';
import {createCombatActorPhases} from './combat-actor-phases.mjs';

/** Internal combat frame composition. No campaign, account, storage or general
 * AI tick runs here. The public owner must prevent reentrant frame admission. */
export function installCombatClock(owner, content) {
  const {w, shared, recovery, bodies, fields, births, carried, projectiles, movement, population} = owner;
  const q = {...content.queries, ...content.hitQueries};
  const phases = createCombatActorPhases(w, q);
  const summonDotShares=[];
  const collectDot=content.prototypeMechanics?(status,amount,type)=>{
    const source=status.casterId===undefined?undefined:w.actorById(status.casterId);
    if(source&&status.skillId&&w.summonArts.signature(source,status.skillId))summonDotShares.push({source,amount,type});
  }:undefined;
  const banks = new StatusAftermath({bodies: {create: (...args) => w.createMonster(...args)}, births: {lifeline: a => w.conjurationLifeline(a)}}, {
    actors: () => w.actors, random: () => w.random(), clamp: (...args) => w.clampPos(...args), emerge: (...args) => w.emergeBody(...args),
    resourceFlow: (to, from, amount) => q.noteResourceFlow(to, from, 'life', amount),
  });
  const frame = new CombatActorFrame({damage: w.damage, procs: shared.procs.procs,
    triggers: {damageTaken: (...args) => w.bankDamageTakenTriggers(...args), defense: a => w.sweepDefenseEvents(a)},
    pours: {release: a => w.releasePrimedPours(a)},
    gauges: {sample: a => {
      if (a.gaugeSampleIn > 0) return;
      a.gaugeSampleIn = q.GAUGE_CFG.cadence;
      for (const id in q.DERIVED_GAUGES) {
        if (!a.gaugeReferenced(id)) {a.derivedGauges?.delete(id); continue;}
        const value = Math.max(0, Math.round(q.DERIVED_GAUGES[id].sample(a, w)));
        (a.derivedGauges ??= new Map()).set(id, value);
      }
    }},
    sympathy: {echo: (...args) => w.echoSympathy(...args)}, banks,
    ledgers: {advance: (...args) => w.updateActorLedgers(...args)},
    death: {kill: a => w.kill(a)}, statuses: w.statusEffects, ironWard: recovery.ironWard,
  }, {
    afterTimers: a => phases.afterTimers(a), afterBanks: (a, dt) => phases.afterBanks(a, dt),
    dotText: (...args) => w.accumulateDotText(...args), dotApplied: (target,amount,type,before) => {
      const landed=Math.max(0,before-Math.max(0,target.life));
      for(const row of summonDotShares)if(row.type===type)w.summonArts.siphon(row.source,landed*row.amount/amount);
      w.observers.dotApplied?.(target,amount,type,before);
    },
  });
  let busy = false;
  const advance = rawDt => {
    if (busy) throw Error('Combat frame cannot reenter');
    if (!Number.isFinite(rawDt) || rawDt < 0) throw new RangeError('Combat duration must be finite and nonnegative');
    busy = true;
    try {
      const dt = rawDt * w.timeflow.beginFrame(rawDt);
      if (dt <= 0) return;
      w.time += dt;
      w.damageTextBursts?.prune(w.time);
      for (const actor of w.actors) if (!actor.dead) q.ensureMovementTether(actor);
      w.actorGridRev++;
      w.updateDownedSeats(dt); w.companionBonds.update(dt);
      w.summonPacts?.update(dt); w.battleDoctrines?.update();
      w.challenges.update(dt);
      w.summonArts?.update(dt); w.cohortArts?.update(dt); w.frameArts?.update(dt); w.channelFormations?.update();
      w.attackSequences.update(dt); w.guardArts.update(dt);
      w.updateDownedCompanions(dt); births.births.advance(dt);
      projectiles.schedules.advanceSalvos(dt);
      if(w.prototypeProfile){w.updateDoodadEffects(dt);w.updateTerraforms(dt);}
      fields.schedules.advanceRepeats(dt);
      projectiles.schedules.advanceAmbushes();
      fields.schedules.advanceMetas(dt);
      movement.pending.advance(dt);
      w.updateMinionMeta(dt); w.updateThrongEvolution(dt); w.updateHivecall(dt);
      for (const seat of w.seats) {
        const skill = seat.actor.skills.find(s => s?.def.id === 'command_assault');
        if (skill?.treeNodes?.includes('renewed_advance')) w.promoteCommandThrong(seat.actor, skill, 'minions', 200);
      }
      w.assaults.update(dt); w.updateThrong(dt); population.advance(dt);
      for (const id of w.grantedTrailMemory.keys()) {
        const actor = w.actorById(id);
        if (!actor || actor.dead) w.grantedTrailMemory.delete(id);
      }
      for (const actor of w.actors) {
        if (actor.dead || actor.downed) continue;
        const elapsed = phases.beforeTimers(actor, dt, rawDt);
        if (elapsed === false) continue;
        summonDotShares.length=0;
        const steered = frame.advance(actor, elapsed, rawDt, collectDot);
        phases.afterStatuses(actor, elapsed, steered);
      }
      w.updateSummonShells();
      w.actorGridRev++;
      w.delayedBurstEngine.advance(w); w.updatePendingContagions();
      // Environmental simulation belongs to the host. Its status facts enter
      // at the original post-actor/pre-projectile phase, never via reentry.
      owner.environment?.(dt);
      w.updateLeaps(dt); w.updateWorms(dt); w.updateParts(); carried.advance(dt); w.updateProjectiles(dt); w.updateZones(dt);
      w.updatePackTethers(dt); w.updateTethers(dt); w.updateVents(dt); w.updateDischarges();
      w.updateConstructs(dt); w.updateAuras(dt); w.updateStrobes(dt);
      movement.utility.advanceDetonations(dt); fields.schedules.advanceFollowUps(dt); births.bursts.advance(dt);
      bodies.contracts.advanceSummons(dt); bodies.contracts.advanceRespawns(dt); bodies.contracts.reconcile();
      w.updateSummonReforms(dt); w.updateCompanionGrants(dt); w.updateReplenishment(dt);
      movement.movement.advanceBlinks(dt); w.checkMinionDetonations();
      w.separateActors(); w.updateSquish();
      w.updateOrbs(dt); w.updateRemnants(dt); w.updateClings(); w.updateGrabs(dt); w.updateSummonShells();
      q.updateMovementTethers(w, dt); w.updatePossessions(dt);
      for (let i = w.corpses.length - 1; i >= 0; i--) {
        const corpse = w.corpses[i]; corpse.remaining -= dt;
        corpse.tier ??= w.spoilStoryAt(corpse.pos);
        if (corpse.remaining <= 0) w.corpses.splice(i, 1);
      }
      for (let i = w.flashes.length - 1; i >= 0; i--) {
        w.flashes[i].life -= dt;
        if (w.flashes[i].life <= 0) w.flashes.splice(i, 1);
      }
      if (w.emergences.length) w.updateEmergences(dt);
      w.actors = w.actors.filter(a => !a.dead || a.isPlayerKind());
    } finally {busy = false;}
  };
  return Object.freeze({frame, banks, phases, advance});
}
