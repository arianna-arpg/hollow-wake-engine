import {ProcRuntime, BorrowedProcRegistry} from '@hollow-wake/engine/combat/procs';
import {createProcDelivery, countProcSummons} from '@hollow-wake/engine/combat/proc-delivery';
import {createProcCasting, heldProcSkill} from '@hollow-wake/engine/combat/proc-casting';
import {applyProcHeal} from '@hollow-wake/engine/combat/recovery';
import {applyProcRestoration} from '@hollow-wake/engine/combat/restoration';
import {applyProcCooldown} from '@hollow-wake/engine/combat/cooldowns';
import {applyWardEffect} from '@hollow-wake/engine/combat/effects';
import {DelayedBursts} from '@hollow-wake/engine/combat/delayed';
import {ResourceEvents} from '@hollow-wake/engine/resources/events';

/** Completes the shared hit graph's proc/resource event lanes with SDK
 * implementations. All nested casts return through the same combat owner. */
export function installCombatProcs(w, q, ports) {
  const life = {maximumLife: actor => actor.maxLife()};
  const restoration = {
    maximumShield: a => a.maxEs(), maximumPoise: a => a.maxPoise(), maximumMana: a => a.maxMana(),
    poiseOvercharge: a => a.sheet.get('poiseOvercharge'), availableMana: a => a.availableMaxMana(),
    restoreLife: (a, effect) => a.healBy(effect.amount), restoreShield: (a, effect) => a.gainEs(effect.amount),
    restorePoise: (a, effect) => a.gainPoise(effect.amount), gainShield: (a, n) => a.gainEs(n), gainPoise: (a, n) => a.gainPoise(n),
    noteGain: (a, resource, n, cue) => {q.noteRestoreGain(a, resource, n, cue);},
  };
  w.delayedBurstEngine = new DelayedBursts({
    queue: owner => owner.pendingBursts, time: owner => owner.time, actors: owner => owner.actors,
    clearQueue: owner => {owner.pendingBursts = [];},
    warning: (owner, burst) => {owner.flashes.push({pos: {...burst.at}, radius: burst.fx.radius,
      color: burst.color, life: burst.fx.delay, maxLife: burst.fx.delay, edgeFrac: .94});},
    flash: (owner, burst) => {owner.flashes.push({pos: {...burst.at}, radius: burst.fx.radius, color: burst.color, life: .3, maxLife: .3});},
    heal: (_owner, actor, n) => actor.healBy(n),
    mitigate: (owner, actor, type, n) => owner.damage.mitigateTyped(actor, {[type]: n}),
    text: (owner, ...args) => {owner.text(...args);},
    ...(w.prototypeProfile?{damageText:(owner,...args)=>{owner.damageText(...args);}}:{}),
    shieldBreak: (owner, actor, depth) => {owner.rollOwnProcs(actor, 'esBreak', {depth});},
    sweepDefenses: (owner, actor, depth) => {owner.sweepDefenseEvents(actor, depth);},
    kill: (owner, actor) => {owner.kill(actor);},
  });
  w.engineStatusEffects = w.statusEffects;
  const delivery = createProcDelivery({...ports.procDelivery,
    heal: (a, effect) => applyProcHeal(a, effect, life, a.healBy),
    restore: (a, effect) => applyProcRestoration(a, effect, restoration),
    cooldown: applyProcCooldown,
    ward: (a, effect) => applyWardEffect(a, effect, {maximumLife: a => a.maxLife(), gain: (a, n) => a.gainWard(n)}),
    delayed: (a, effect, color, depth, target) => w.delayedBurstEngine.schedule(w, a, effect, color, depth, target),
    mitigate: (a, type, amount) => w.damage.mitigateTyped(a, {[type]: amount}),
    summonCount: (owner, key) => countProcSummons(w.actors, owner, key),
  });
  const casting = createProcCasting(ports.procCasting);
  w.executeProc = (proc,caster,inst,target,depth=0,aim) => {
    w.signal?.('proc', {id:proc.id,actor:caster.id,target:target?.id,depth});
    return delivery.execute(proc,caster,inst,target,depth,aim);
  };
  w.castProcPayload = casting.cast;
  w.heldSkillInst = (actor, id) => heldProcSkill(actor, id, {
    instances: actor => actor.skills, seat: actor => w.seatOf(actor),
    granted: (seat, id) => seat.grantedInsts?.get(id), learned: (seat, id) => seat.meta.knownSkills.get(id),
  });
  const source = new BorrowedProcRegistry({definitions: () => q.PROC_LIST, definition: id => q.PROCS[id], riders: () => q.PROC_RIDER_LIST}, q.DEFENSE_CFG.procs);
  const procs = w.sdkProcs = new ProcRuntime(source, {
    time: () => w.time, random: () => w.random(), stat: (a, id, tags, extra) => a.sheet.get(id, tags, extra),
    condition: (a, id) => a.sheet.hasCondition(id), armed: (a, ids, extra) => a.sheet.armedFamily('proc_', ids, extra),
    tags: q.skillContextTags, extra: q.instanceMods, carryTags: i => q.skillContextTags(i.def),
    carryCourt: (a, i) => w.minionsOfSkill(a, i.def.id).length, victim: (...args) => w.victimGate(...args),
    execute: (...args) => w.executeProc(...args), castRider: (...args) => w.castProcPayload(...args),
    bankStatus: (owner, inst, target, status) => w.bankStatusTriggers(owner, status, {...target.pos}, inst.state?.trigDepth ?? 0, inst),
    lastGasp: owner => w.showCombatOutcome(owner, 'last_gasp'),
  });
  w.rollOwnProcs = (...args) => procs.own(...args);
  w.rollCollisionProcs = (...args) => procs.collision(...args);
  w.rollStatusProcs = (...args) => procs.status(...args);
  w.rollGainProcs = (...args) => procs.gain(...args);
  w.fireProcRiders = (...args) => procs.riders(...args);
  w.rollTopMet = (...args) => procs.rollTop(...args);
  w.procChance = (...args) => procs.chance(...args);
  w.procDepthAllowed = (...args) => procs.depthAllowed(...args);
  w.procGates = (...args) => procs.gates(...args);
  w.procReady = (...args) => procs.ready(...args);
  const resources = new ResourceEvents({...ports.resourceEvents, elite: a => w.isEliteVictim(a)}, {deathRadius: 360});
  w.tapCharges = (...args) => resources.dispatch(...args);
  w.tapFires = (...args) => resources.fires(...args);
  return Object.freeze({procs, delivery, casting, resources, restoration});
}
