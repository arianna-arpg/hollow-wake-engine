import assert from 'node:assert/strict';
import {projectDeliveryReplay, compareDeliveryReplay, checkFaultCourseErrors} from './native-delivery-comparison.mjs';

export function projectStatusDeliveryReplay(values) {
  return projectDeliveryReplay(values, 88);
}

// No geometry tolerance is assumed for this course. Report any cross-runtime
// difference before considering a separately documented numerical policy.
export function compareStatusDeliveryReplay(actual, expected) {
  return compareDeliveryReplay(actual, expected);
}

export function assertStatusDeliveryReplayFault(name, actual, expected) {
  checkFaultCourseErrors(actual, expected);
  const steps = course => actual.rows.find(row => row.name === course).steps;
  if (name === 'zero-share-fault') {
    assert.deepEqual(steps('recall-zero-share')[0].after.projectiles.map(p => p.flat.physical), [50]);
    assert.deepEqual(expected.rows.find(row => row.name === 'recall-zero-share').steps[0].after.projectiles.map(p => p.flat.physical), [0]);
  } else if (name === 'source-identity-fault') {
    assert.deepEqual(steps('recall-tree-selective-retirement').map(step => step.after.projectiles.length), [1, 2, 3, 3, 3, 3]);
    assert.deepEqual(expected.rows.find(row => row.name === 'recall-tree-selective-retirement').steps.map(step => step.after.projectiles.length), [1, 2, 3, 2, 1, 1]);
  } else throw new Error('Unknown status-delivery replay fault: ' + name);
  assert.throws(() => compareStatusDeliveryReplay(actual, expected), {name: 'AssertionError'});
}
