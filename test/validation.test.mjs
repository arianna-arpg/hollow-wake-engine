import test from 'node:test';
import assert from 'node:assert/strict';
import {copy} from '../dist/validation.js';

test('recursive copies preserve enumerable order, descriptors, sparse arrays and independent owners', () => {
  const shared = { tags: ['spell'] }, source = Object.create(null);
  source.second = shared; source.first = shared; source.undefined = undefined; source.negativeZero = -0;
  source.sparse = Array(3); source.sparse[2] = shared;
  Object.defineProperty(source, 'hidden', { value: () => 1 }); source[Symbol('ignored')] = () => 1;
  const result = copy(source);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(Object.keys(result), ['second', 'first', 'undefined', 'negativeZero', 'sparse']);
  assert.equal(Object.getOwnPropertySymbols(result).length, 0); assert(Object.is(result.negativeZero, -0));
  assert.equal(0 in result.sparse, false); assert.equal(1 in result.sparse, false);
  assert.notEqual(result.second, result.first); assert.notEqual(result.first, result.sparse[2]);
  result.second.tags.push('changed'); assert.deepEqual(result.first.tags, ['spell']); assert.deepEqual(shared.tags, ['spell']);
  for (const key of Object.keys(result)) {
    const descriptor = Object.getOwnPropertyDescriptor(result, key);
    assert(descriptor.writable && descriptor.enumerable && descriptor.configurable);
  }
});

test('recursive copies read each parent field before child traversal, exactly once', () => {
  const trace = [], nested = { get value() { trace.push('nested'); return 3; }};
  const source = { get first() { trace.push('first'); return nested; }, get second() { trace.push('second'); return 2; }};
  const result = copy(source);
  assert.deepEqual(trace, ['first', 'second', 'nested']); assert.deepEqual(result, { first: { value: 3 }, second: 2 });
});

test('cycles, executable values, nonfinite values and nonplain records remain rejected', () => {
  const objectCycle = {}; objectCycle.self = objectCycle;
  const arrayCycle = []; arrayCycle.push(arrayCycle);
  for (const value of [objectCycle, arrayCycle, new Map(), new Set(), new Date(), Object.create({ inherited: true }),
    { nested: [() => 1] }, { nested: Symbol('bad') }, { nested: 1n }, { nested: NaN }, { nested: Infinity }]) {
    assert.throws(() => copy(value));
  }
  assert.deepEqual(copy({ still: ['valid'] }), { still: ['valid'] });
});

test('prototype-named fields remain ordinary own data without changing prototypes or calling setters', () => {
  const source = JSON.parse('{"__proto__":{"owned":true},"constructor":"label","when":"ready"}');
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'when'); let calls = 0, result;
  try {
    Object.defineProperty(Object.prototype, 'when', { configurable: true, set() { calls++; } });
    result = copy(source);
  } finally {
    if (previous) Object.defineProperty(Object.prototype, 'when', previous); else delete Object.prototype.when;
  }
  assert.equal(calls, 0); assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert(Object.hasOwn(result, '__proto__')); assert.deepEqual(result.__proto__, { owned: true });
  assert.equal(result.constructor, 'label'); assert.equal(result.when, 'ready'); assert.equal({}.owned, undefined);
});
