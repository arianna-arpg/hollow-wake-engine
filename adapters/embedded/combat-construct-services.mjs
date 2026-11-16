import {ConstructBirth} from '../../dist/construct-birth.js';
import {ConstructLifecycle} from '../../dist/construct-lifecycle.js';
import {ConstructDelivery} from '../../dist/construct-delivery.js';
import {SummonDelivery} from '../../dist/summon-delivery.js';

export function installCombatConstructs(w, content, link) {
  const q = {...content.queries, ...content.hitQueries};
  const birth = new ConstructBirth({looks: q.CONSTRUCT_LOOKS, aims: q.CONSTRUCT_KIND_AIMS, weight: q.DEFENSE_CFG.weight}, {
    tags: q.skillContextTags, modifiers: q.instanceMods, innateModifiers: q.instanceInnateMods, sockets: q.hostSockets, socket: q.socketSpec,
    minions: (actor, id) => w.minionsOfSkill(actor, id), kill: (...args) => w.kill(...args),
    create: (...args) => w.allocateActor(...args), actors: () => w.actors, random: () => w.random(),
    clamp: (at, radius, mover) => w.clampPos(at, radius, undefined, {mover}),
    push: (...args) => w.pushActor(...args), attachTethers: (...args) => w.attachObjectTethers(...args),
    enemies: actor => w.enemiesOf(actor), hit: (...args) => w.resolveHit(...args), arrival: (...args) => w.presenceArrival(...args),
    flash: (at, radius, color, life) => {w.flashes.push({pos: at, radius, color, life, maxLife: life});},
  });
  w.spawnConstruct = (...args) => birth.spawn(...args);
  const clock = new ConstructLifecycle(w, {echoStrikeLifeMax: q.ECHO_STRIKE_LIFE_MAX}, link.ports('constructLifecycle', {
    actors: () => w.actors, time: () => w.time, random: () => w.random(), skill: id => q.SKILLS[id],
    flash: cue => {w.flashes.push(cue);},
  }));
  for (const method of ['spawnEchoRiders', 'mirageSource', 'hoverSlotPos', 'buildEchoRider', 'echoToClones', 'updateConstructs']) w[method] = (...args) => clock[method](...args);
  const forwarding = content.staticRules.forwarding;
  const constructs = new ConstructDelivery(forwarding.scale, forwarding.scaleDefault, {
    device: inst => !!q.challengeOf(inst)?.device,
    toss: (...args) => w.challenges.toss(...args),
    summon: q.instanceSummon, spawnMinion: (...args) => w.spawnMinion(...args),
    level: q.effectiveSkillLevel, makeSkill: (id, level) => q.makeSkillInstance(q.SKILLS[id], level),
    forwardSockets: (...args) => w.forwardSummonSockets(...args), echoes: (...args) => clock.spawnEchoRiders(...args),
    clamp: (...args) => w.clampPos(...args), spawn: (...args) => birth.spawn(...args),
  });
  const summons = new SummonDelivery(w.summonQueues, {
    form: q.grimoireForm, monster: id => !!q.MONSTERS[id], corpses: () => w.corpses,
    minionsOfGroup: (...args) => w.minionsOfGroup(...args), minionsOfSkill: (...args) => w.minionsOfSkill(...args),
    removeCorpse: corpse => w.removeCorpse(corpse), corpseSpawn: (...args) => w.corpseSpawn(...args),
    spawn: (...args) => w.spawnMinion(...args), contracts: w.summonContracts,
    delivery: inst => {const d = q.instanceDelivery(inst); return d.type === 'summon' ? d : undefined;},
    cannotSustain: actor => w.text(actor.pos, 'cannot sustain', '#d05050', 12),
    clamp: (...args) => w.clampPos(...args), random: () => w.random(),
  });
  return Object.freeze({birth, clock, constructs, summons});
}
