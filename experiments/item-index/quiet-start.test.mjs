import test from 'node:test';
import assert from 'node:assert/strict';
import {quietStart} from './quiet-start.mjs';

function fixture(values, options = {}) {
  const events = []; let samples = 0;
  return {events, run: () => quietStart({limit: .15, attempts: 3, retryDelayMs: 15000,
    sample: async () => { events.push('sample'); return {samples: values[samples++].map(meanBusyFraction => ({meanBusyFraction}))}; },
    record: async (observation, attempt) => {events.push({attempt, observation});},
    wait: async ms => {events.push({wait: ms});}, ...options})};
}
test('a quiet complete observation starts without waiting', async () => {
  const f = fixture([[.05, .15, .03]]); await f.run(); assert.equal(f.events.length, 2);
});
test('one busy interval defers the order and retains the full observation', async () => {
  const f = fixture([[.05, .16, .03], [.1, .1, .1]]); await f.run();
  assert.equal(f.events.length, 5); assert.equal(f.events[1].observation.samples[1].meanBusyFraction, .16);
  assert.deepEqual(f.events[2], {wait: 15000}); assert.equal(f.events[4].attempt, 1);
});
test('persistent activity refuses after the fixed bound', async () => {
  const f = fixture([[.2, .2, .2], [.3, .3, .3], [.4, .4, .4]]);
  await assert.rejects(f.run, {code: 'ENVIRONMENT_BUSY'});
  assert.equal(f.events.filter(value => value === 'sample').length, 3);
  assert.equal(f.events.filter(value => value?.wait).length, 2);
});
test('missing or nonfinite measurements cannot establish a quiet start', async () => {
  for (const values of [[.1, .1], [.1, NaN, .1], [-.1, .1, .1], [.1, 1.1, .1]]) {
    const f = fixture([values]); await assert.rejects(f.run, /Invalid CPU observation/); assert.equal(f.events.length, 2);
  }
});
test('observational legacy mode records activity without imposing a new limit', async () => {
  const f = fixture([[.8, .9, .8]], {limit: undefined, attempts: 1}); await f.run(); assert.equal(f.events.length, 2);
});
test('invalid limits or unbounded waits are rejected before sampling', async () => {
  for (const options of [{limit: NaN}, {attempts: 0}, {attempts: 4}, {retryDelayMs: 15001}, {retryDelayMs: -1}]) {
    const f = fixture([], options); await assert.rejects(f.run, RangeError); assert.equal(f.events.length, 0);
  }
});
