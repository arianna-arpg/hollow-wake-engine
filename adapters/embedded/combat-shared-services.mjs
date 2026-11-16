import {StatRules, StatSheet} from '@hollow-wake/engine';
import {createCombatHits} from '@hollow-wake/engine/combat/hits';
import {createStatusEffects} from '@hollow-wake/engine/statuses/effects';
import {createStatusDelivery} from '@hollow-wake/engine/statuses/delivery';
import {Challenges} from '@hollow-wake/engine/combat/challenges';
import {AttackSequences} from '@hollow-wake/engine/combat/attack-sequences';
import {GuardArts} from '@hollow-wake/engine/guard/arts';
import {CompanionBonds} from '@hollow-wake/engine/companions/bonds';
import {CompanionStances} from '@hollow-wake/engine/companions/stances';
import {Mimic} from '@hollow-wake/engine/combat/mimic';
import {CombatTimeflow} from '@hollow-wake/engine/combat/timeflow';
import {createCombatActors} from './combat-actor-services.mjs';
import {combatHitBindings} from './combat-hit-bindings.mjs';
import {createCombatPolicies, combatPolicyMethods} from './combat-policies.mjs';
import {installCombatProcs} from './combat-proc-services.mjs';
import {createCombatCommands} from './combat-command-controllers.mjs';
import {ParryDamageWindow} from '../../dist/parry-damage.js';

/** Internal graph assembly, never a host callback API. The owning combat
 * session installs its remaining SDK services on w before admitting commands.
 * All phases retain this same owner and borrow the same actor/skill identities. */
export function installSharedCombat(w, content) {
  const {queries: q, hitQueries: h, staticRules: r} = content;
  const stats = new StatRules(content.stats, content.statTrades);
  w.rules = r;
  w.presencePulseAt = new WeakMap();
  w.lightningFlashes = new WeakMap();
  w.throngEvolutionBites = new WeakMap();
  w.parryDamageWindow = new ParryDamageWindow(actor => actor.sheet.get('parryDamageCooldown'));
  w.dominantType = h.dominantTypeOf;
  w.statusIds = Object.keys(h.STATUS_DEFS);
  w.timeflow = new CombatTimeflow(id => h.STATUS_DEFS[id], w.host.surfaces ?? {});
  w.mimic = new Mimic(r.mimic, {tags: q.skillContextTags, modifiers: q.instanceMods,
    studied: (actor, kind, group) => w.host.knowledge?.studied?.(actor.id, kind, group) ?? false,
    monsterExists: id => !!h.MONSTERS[id]});
  const noStances = new Map();
  w.stances = new CompanionStances(Object.values(r.companionStances), r.stances.default, r.stances.kindPrefix, {
    choices: seat => seat?.meta.stances ?? noStances,
    learned: (seat, id) => seat.meta.knownSkills.has(id),
    refresh: () => w.companionBonds.refresh(),
    shifted: (actor, skill, stance) => w.signal('companion-stance', {actor: actor.id, skill, stance}),
    changed: seat => w.characterChanged(seat),
  });
  const ports = combatHitBindings(w, h);
  const hits = createCombatHits(ports);
  w.damage = hits.damage;
  w.resolveHit = hits.resolve;
  w.engineHitStatuses = hits.statuses;
  w.statusEffects = createStatusEffects(ports.statusEffects);
  w.statusDelivery = createStatusDelivery(ports.statusDelivery);
  for (const [name, method] of Object.entries(w.statusEffects)) w[name] = method;
  w.challenges = new Challenges(ports.challenges);
  w.attackSequences = new AttackSequences(ports.sequences);
  w.guardArts = new GuardArts(ports.guards);
  w.companionBonds = new CompanionBonds(ports.companions);
  const commands = createCombatCommands(w, h);
  w.assaults = commands.assaults;
  w.replenishment = commands.replenishment;
  w.issueCommand = commands.issueCommand;
  w.obedienceOf = commands.obedienceOf;
  w.shellArcFactor = commands.shellArcFactor;
  w.convertRuleHolds = commands.convertRuleHolds;
  w.conversionIds = commands.conversionIds;
  w.companionCueFlash = commands.companionCueFlash;
  w.companionCueSpec = commands.companionCueSpec;
  const policies = createCombatPolicies(w, h);
  for (const name of combatPolicyMethods) {
    if (Object.hasOwn(w, name)) throw Error('Combat policy binding collision: ' + name);
    w[name] = policies[name];
  }
  const procs = installCombatProcs(w, h, ports);
  const actors = createCombatActors({initialize: content.initializeActor, queries: q,
    definitions: {statuses: h.STATUS_DEFS}, rules: {...content.actorRules, ...content.actorTiming},
    random: () => w.random(), damage: w.damage,
    summons: {slots: (...args) => w.summonContracts.slots(...args), reservation: (...args) => w.summonContracts.reservation(...args)},
    notify: {
      healed: (actor, amount) => w.observers.healed?.(actor, amount),
      lifeSpent: (actor, amount) => actor.onLifeSpent?.(amount),
      buffRelease: (actor, definition, id, count) => h.noteProcCue(actor, h.buffProcCue(definition), 'release', id, count),
      statusPop: (actor, id, def) => h.noteProcPop(actor, def?.pop?.procCue === false ? false : {
        profile: def?.dotType === 'physical' ? 'blood' : def?.dotType, color: def?.color, ...def?.pop?.procCue}, id),
      restore: h.noteRestoreGain,
      timers: (actor, dt) => {h.tickProcCues(actor, dt); h.tickRestoreGains(actor, dt);},
    },
  });
  w.actorServices = actors;
  w.allocateActor = (name, team, pos) => {
    if (!Number.isSafeInteger(w.nextActorId) || w.nextActorId < 1) throw Error('Combat actor identity space exhausted');
    return new actors.Actor(w.nextActorId++, name, team, pos, new StatSheet(stats));
  };
  return Object.freeze({stats, actors, hits, ports, procs, commands});
}
