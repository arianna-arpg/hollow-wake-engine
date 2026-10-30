import assert from 'node:assert/strict';

export function projectStatusDeliveryReplay(values) {
  assert.equal(values.length, 89);
  for (const value of values.slice(0, 88)) assert.equal(value.done, false);
  assert.equal(values[88].done, true);
  return {...values[88].value, rows: values.slice(0, 88).map(value => value.value)};
}

// No geometry tolerance is assumed for this course. Report any cross-runtime
// difference before considering a separately documented numerical policy.
export function compareStatusDeliveryReplay(actual, expected) {
  let numbers = 0;
  function visit(a, b, at) {
    if (typeof a === 'number' && typeof b === 'number') {
      numbers++;
      assert(Object.is(a, b), `Numeric mismatch at ${at}: ${a} != ${b}`);
      return;
    }
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
      assert.equal(a, b, at);
      return;
    }
    assert.equal(Array.isArray(a), Array.isArray(b), at);
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), at);
    for (const key of Object.keys(b)) visit(a[key], b[key], at + '/' + key);
  }
  visit(actual, expected, '$');
  return {numbers, exact: true};
}

export function assertStatusDeliveryReplayFault(name, actual, expected) {
  assert.deepEqual(actual.rows.map(row => [row.name, row.steps.map(step => step.name)]),
    expected.rows.map(row => [row.name, row.steps.map(step => step.name)]));
  for (let i = 0; i < expected.rows.length; i++) {
    for (let j = 0; j < expected.rows[i].steps.length; j++) {
      assert.equal(actual.rows[i].steps[j].error, expected.rows[i].steps[j].error, 'Unrelated exception');
    }
  }
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
