import { SkillRequest } from '@hollow-wake/engine/casting/request';

/** A host supplies its live world operations and continues only on 'continue'. */
export function requestCycle() {
  const inst = { def: { id: 'spark', delivery: { type: 'self' } }, sockets: [] };
  const actor = { id: 'hero', dead: false, skills: [inst], activeAuras: new Map(), overdrive: {}, life: 100, useLock: 0 };
  const seat = { actor }, events = [];
  let sealed = false, trigger = false, admitted = true;
  const policy = new SkillRequest({
    castSealed: () => sealed ? {} : undefined,
    hivecallMeta: () => undefined, throngTravelProtected: () => false,
    replenishingDelivery: () => undefined, forgetReplenishment: () => {},
    seatOf: a => a === seat.actor ? seat : undefined,
    triggerSeat: a => a === seat.actor ? seat : undefined,
    markMetaDirty: () => events.push('metadata'), markCharacterDirty: () => {}, replenishmentFeedback: () => {},
    markSeatActed: () => events.push('acted'), isReflex: () => false, actorById: () => undefined,
    mashPress: () => 1, failNote: (_a, _key, text) => events.push(text), maxLife: () => 100,
    trigger: () => trigger, triggerArmed: i => !i.state?.triggerOff,
    requirementRefusal: () => undefined, conversion: () => undefined, definition: () => undefined,
    conversionHolds: () => false,
    mint: () => { throw new Error('This example has no payload definitions'); },
    dispatch: (a, i, aim, pressed) => request(a, i, aim, pressed),
    time: () => 0, mimicSelected: () => null, mimicPowerMods: () => undefined,
    unmetGate: () => null, effects: () => [], relocationTarget: () => undefined,
    canUse: () => admitted,
  });
  function request(a, i, aim, pressed) {
    const result = policy.preflight(a, i, aim, pressed);
    if (result !== 'continue') return result;
    events.push('host-continuation');
    return true;
  }
  sealed = true; const sealedPress = request(actor, inst, null, true);
  sealed = false; trigger = true; const toggled = request(actor, inst, null, true);
  const disarmed = inst.state.triggerOff;
  trigger = false; admitted = false; const refused = request(actor, inst, null, true);
  admitted = true; const continued = request(actor, inst, null, true);
  return { sealedPress, toggled, disarmed, refused, continued, useLock: actor.useLock, events };
}
