import {applyInstantRestoration} from '@hollow-wake/engine/combat/restoration';
import {refundSkillCooldown} from '@hollow-wake/engine/combat/cooldown-lifecycle';
import {SkillRecovery} from '../../dist/skill-recovery.js';
import {CastSelfEffects} from '../../dist/cast-self-effects.js';
import {CastResourceEffects} from '../../dist/cast-resource-effects.js';
import {CastBuffs} from '../../dist/cast-buffs.js';
import {GuardSurge} from '../../dist/guard-surge.js';
import {IronWard} from '../../dist/iron-ward.js';
import {CompanionRecovery} from '../../dist/companion-recovery.js';

/** Shared recovery and caster-resource services. Gameplay writes happen here;
 * the consuming host receives only presentation and threat observations. */
export function installCombatRecovery(w, content, shared) {
  const q = content.hitQueries;
  const tags = (inst, granted = false) => q.skillContextTags(inst, granted ? q.grantedTags(inst) : undefined);
  const flash = (actor, radius, color, life) => w.flashes.push({pos: {...actor.pos}, radius, color, life, maxLife: life});
  const recovery = new SkillRecovery({
    tags, modifiers: q.instanceMods, level: q.effectiveSkillLevel,
    healOverTime: inst => q.socketSpec(inst, 'healOverTime'), random: () => w.random(),
    actors: () => w.actors, sameLayer: q.sameStory, distance: q.dist,
    absorbCue: actor => flash(actor, actor.radius + 8, '#d8e8f8', .25),
    criticalCue: at => {w.flashes.push(q.combatCueFlash(at, 'mend', 18));},
    healCue: (actor, n) => w.text(actor.pos, '+' + Math.round(n), '#6fc06f', 12),
    cleanseCue: actor => w.text(actor.pos, 'cleansed', '#a8e8d8', 12, 'combat'),
    chainCue: (caster, inst, from, to) => w.tethers.push({a: from, b: to, owner: caster, skillId: inst.def.id, link: 'zap',
      visual: 'healing_chain', visualAge: 0, amounts: {}, heal: 0, affects: 'allies', width: 5,
      remaining: .16, tickTimer: 99, color: '#7ec88a', ax: from.pos.x, ay: from.pos.y, bx: to.pos.x, by: to.pos.y}),
    arrivalCue: (caster, inst, actor) => {if (q.skillTargetVoice(inst.def.id)) w.showSkillArrival(caster, inst, actor.pos, actor.radius + 14, actor.tier);},
    healedAlly: (caster, target, landed) => w.signal('healed-ally', {caster: caster.id, target: target.id, landed}),
  });
  w.grantAbsorb = (...args) => recovery.absorb(...args);
  w.critMendMult = (...args) => recovery.critical(...args);
  w.startRestoreStream = (...args) => recovery.stream(...args);
  w.applyHeal = (...args) => recovery.heal(...args);
  w.applyHealChained = (...args) => recovery.chain(...args);
  w.cleanseActor = (...args) => recovery.cleanse(...args);
  w.applyRestore = (actor, effect, options) => applyInstantRestoration(actor, effect, shared.procs.restoration, options);
  const self = new CastSelfEffects({
    absorbAmount: w.damage.skillAbsorbAmount, absorb: w.grantAbsorb, restore: w.applyRestore,
    critical: (actor, inst) => recovery.critical(actor, inst, actor.pos), stream: w.startRestoreStream,
    heal: w.applyHealChained, cleanse: w.cleanseActor,
  });
  const resource = new CastResourceEffects({
    useCharges: q.instanceUseCharges, refundCooldown: refundSkillCooldown,
    ammunitionCue: (actor, inst) => {const cue = q.payloadTransition(actor, inst, 'ammo'); if (cue) w.flashes.push(cue);},
    ledgerPaid: (actor, amount) => {w.text(actor.pos, 'absolved ' + Math.round(amount), '#d8c878', 12); flash(actor, actor.radius + 14, '#d8c878', .3);},
    ledgerEmpty: (actor, id) => w.failNote(actor, id + ':noledger', 'nothing owed'),
    cooldownsReduced: actor => w.text(actor.pos, 'time slips', '#8ae0e8', 12, 'combat'),
  });
  const buffs = new CastBuffs({actors: () => w.actors, tags, tagList: tags => [...tags], modifiers: q.instanceMods,
    hasTreeBuffs: inst => !!inst.treeNodes?.some(id => q.treeNodeOf(inst.def, id)?.buffs?.length),
    grant: (actor, effect, duration, depth, tags) => actor.addBuff(effect, duration, depth, tags), remove: (actor, id) => actor.removeBuff(id),
    arrival: (caster, inst, actor) => w.showSkillArrival(caster, inst, actor.pos, actor.radius + 16, actor.tier, true),
  });
  w.grantTreeBuff = (...args) => buffs.grant(...args);
  w.applyBuffEffect = (...args) => buffs.apply(...args);
  w.retireTreeBuffs = (...args) => buffs.retire(...args);
  const guardSurge = new GuardSurge({absorbAmount: w.damage.skillAbsorbAmount,
    durationScale: (actor, inst) => actor.sheet.get('effectDuration', tags(inst), q.instanceMods(inst))});
  const ironWard = new IronWard({time: () => w.time, buff: (actor, fx, duration) => actor.addBuff(fx, duration), burst: (...args) => w.burstDamage(...args)});
  const companions = new CompanionRecovery({rules: () => q.COMPANION_CFG.recovery, actors: () => w.actors,
    status: id => q.STATUS_DEFS[id], cleanse: actor => actor.cleanseDebuffs(), endStatus: (actor, id) => actor.endStatus(id),
    applyStatus: (actor, ...args) => actor.applyStatus(...args), maxLife: actor => actor.maxLife(),
    revivalCue: actor => w.showRecoveryCue(actor, 'revive', w.companionBonds.host(actor)),
  });
  w.recoverCompanion = actor => companions.recover(actor);
  w.reviveCompanion = (actor, fraction) => companions.revive(actor, fraction);
  return Object.freeze({recovery, resource, self, buffs, guardSurge, ironWard, companions});
}
