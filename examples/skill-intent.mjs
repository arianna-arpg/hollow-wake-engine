import {CastSeals} from '@hollow-wake/engine/casting/seals';
import {SkillInstances} from '@hollow-wake/engine/casting/instances';
import {SkillIntent} from '@hollow-wake/engine/casting/intent';

/** A host supplies live state and content; readiness does not execute a cast. */
export function intentCycle() {
  const definitions = {
    opener: {id: 'opener', effects: [], tags: ['attack'], manaCost: 2, comboChain: {skills: ['finisher'], window: 2}},
    finisher: {id: 'finisher', effects: [], tags: ['attack'], manaCost: 4},
  };
  const create = (def, level) => ({def, level, sockets: []});
  const host = create(definitions.opener, 1);
  const actor = {skills: [host], metaInsts: new Map(), activeAuras: new Map(), strobes: new Map(),
    venting: new Set(), pools: new Map(), charges: new Map(), mana: 3};
  let time = 10, seal;
  const seals = new CastSeals(inst => new Set(inst.def.tags));
  const instances = new SkillInstances({skill: id => definitions[id], create,
    effectiveLevel: inst => inst.level, treeMods: () => undefined});
  const intent = new SkillIntent(instances, {
    time: () => time, castSeal: () => seal,
    sealShuts: (spec, _actor, inst) => seals.shuts(spec, {inst, seated: true}),
    seat: () => undefined, knownSkill: () => false, requirementShortfall: () => undefined,
    trigger: () => false, gatesMet: () => true, chargeCost: () => undefined,
    targeting: () => undefined, qualifiedTargetAvailable: () => false,
    canUse: (body, inst) => body.mana >= inst.def.manaCost,
    mimicSelected: () => null, mimicPowerMods: () => undefined,
    conversion: () => undefined, conversionHolds: () => false,
  });
  const firstFace = intent.slotFace(actor, host).id;
  host.state = {comboIdx: 1, comboAt: time};
  const nextFace = intent.slotFace(actor, host).id;
  const hudReady = intent.hudUsable(actor, host), finisherReady = intent.pressUsable(actor, host);
  actor.mana = 5;
  const fundedReady = intent.pressUsable(actor, host);
  const sharedSockets = intent.queuedStep(actor, host).sockets === host.sockets;
  seal = {};
  const sealedPress = intent.pressUsable(actor, host);
  seal = undefined; time += 2.1;
  return {firstFace, nextFace, hudReady, finisherReady, fundedReady, sealedPress,
    expiredFace: intent.slotFace(actor, host).id, sharedSockets};
}
