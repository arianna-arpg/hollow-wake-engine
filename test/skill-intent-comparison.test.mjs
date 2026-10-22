import test from 'node:test';
import assert from 'node:assert/strict';
import {expectedIntentQueries, compareIntentQueries, expectedAdmissionAfterIntent} from '../scripts/skill-intent-comparison.mjs';
const calls = (...names) => names.map(method => ({method}));
test('older admission projection retains actual request seals and every non-seal host observation', () => {
  const source = {courses: [{steps: ['hud', 'press-query', 'press', 'ai-press', 'unknown'].map(op => ({
    command: {op}, calls: calls('castSealed', 'canUse', 'unmetGate', 'payCost'), result: false, after: {mana: 4},
  }))}]};
  const before = structuredClone(source), projected = expectedAdmissionAfterIntent(source);
  assert.deepEqual(source, before);
  for (const [index, step] of projected.courses[0].steps.entries()) {
    assert.deepEqual(step.calls, index < 2 ? calls('canUse', 'unmetGate', 'payCost') : calls('castSealed', 'canUse', 'unmetGate', 'payCost'));
    assert.equal(step.result, false); assert.equal(step.after.mana, 4);
  }
});
const original = () => ({courses: [{steps: [
  {method: 'castSealed', result: {sealed:true}, calls: calls('castSealed')},
  {method: 'castReqRefusal', result: 'needs STR 12', calls: calls('castReqRefusal', 'reqShortfall')},
  {method: 'skillUsable', result: false, before:{banks:[]}, after:{banks:[]}, calls: calls('castSealed', 'gatesMet', 'resolveTargeting')},
  {method: 'slotFaceOf', result: 'art', calls: calls('comboCursorOf', 'comboStepOf')},
  {method: 'pressUsable', result: false, before:{banks:[]}, after:{banks:[['gun',0]]}, calls: calls('castSealed', 'comboCursorOf', 'comboStepOf', 'mintMetaInstance', 'canUse', 'skillChargeBank')},
]}], seals:{retained:true}});

test('intent projection removes only contextual original forwarding entries', () => {
  const source = original(), before = structuredClone(source), expected = expectedIntentQueries(source), steps = expected.courses[0].steps;
  assert.deepEqual(source, before); assert.deepEqual(steps[0].calls, calls('castSealed'));
  assert.deepEqual(steps[1].calls, calls('castReqRefusal', 'reqShortfall'));
  assert.deepEqual(steps[2].calls, calls('gatesMet', 'resolveTargeting'));
  assert.deepEqual(steps[3].calls, []); assert.deepEqual(steps[4].calls, calls('canUse', 'skillChargeBank'));
  compareIntentQueries(expected, source); assert.throws(() => compareIntentQueries(source, source), assert.AssertionError);
});

test('intent comparison retains state, results, host call order and seal observations', () => {
  for (const change of [
    value => { value.courses[0].steps[4].after.banks = []; },
    value => { value.courses[0].steps[2].result = true; },
    value => { value.courses[0].steps[4].calls.reverse(); },
    value => { value.seals.retained = false; },
  ]) { const source = original(), actual = expectedIntentQueries(source); change(actual); assert.throws(() => compareIntentQueries(actual, source), assert.AssertionError); }
});

test('unknown query operations or instrumented calls cannot be projected silently', () => {
  const source = original(); source.courses[0].steps[0].calls.push({method:'unknown'});
  assert.throws(() => expectedIntentQueries(source), /Unreviewed query trace/);
  const other = original(); other.courses[0].steps[0].method = 'useSkill';
  assert.throws(() => expectedIntentQueries(other), /Unreviewed query operation/);
});
