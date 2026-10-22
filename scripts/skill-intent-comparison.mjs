import assert from 'node:assert/strict';

// Only the original query helper's entries into methods that now run inside
// the SDK disappear. Direct World requests and every effectful host port stay.
const forwarders = {
  castSealed: new Set(),
  castReqRefusal: new Set(),
  skillUsable: new Set(['castSealed']),
  slotFaceOf: new Set(['comboCursorOf', 'comboStepOf']),
  pressUsable: new Set(['castSealed', 'mintMetaInstance', 'comboCursorOf', 'comboStepOf']),
};
const known = new Set(['castSealed', 'castReqRefusal', 'reqShortfall', 'resolveTargeting',
  'mintMetaInstance', 'comboCursorOf', 'comboStepOf', 'canUse', 'gatesMet', 'skillChargeBank']);

export function expectedIntentQueries(original) {
  const result = structuredClone(original);
  for (const course of result.courses) for (const step of course.steps) {
    assert(Object.hasOwn(forwarders, step.method), 'Unreviewed query operation: ' + step.method);
    step.calls = step.calls.filter(call => {
      if (call === null || typeof call !== 'object' || !Object.hasOwn(call, 'method')) return true;
      assert(known.has(call.method), 'Unreviewed query trace: ' + call.method);
      return !forwarders[step.method].has(call.method);
    });
  }
  return result;
}

export function compareIntentQueries(actual, original) {
  // Do not project the candidate: an old/disconnected World implementation
  // still emitting the original forwarding calls is not this integration.
  assert.deepEqual(actual, expectedIntentQueries(original));
}

// The older admission fixture also observes World HUD/press queries. Preserve
// its actual request seal checks; only these two query wrappers moved in M31.
export function expectedAdmissionAfterIntent(original) {
  const result = structuredClone(original);
  for (const course of result.courses) for (const step of course.steps) {
    if (step.command.op === 'hud' || step.command.op === 'press-query') {
      step.calls = step.calls.filter(call => call.method !== 'castSealed');
    }
  }
  return result;
}
