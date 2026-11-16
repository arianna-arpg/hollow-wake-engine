import test from 'node:test';
import assert from 'node:assert/strict';
import {CombatActorFrame} from '../dist/combat-actor-frame.js';

function course(dot = {fire: 2, cold: 3, untyped: 1, chaos: 0}) {
  const events = [], a = {life: 10, dead: false, esBroke: true, recentHurt: 99,
    gainEvents: [{kind: 'charge', id: 'fire', depth: 0}],
    updateTimers(dt, chronoDt) {events.push(['timers', dt, chronoDt]); return dot;}};
  const record = name => (...args) => {events.push([name, ...args.slice(1)]);};
  const s = {
    damage: {applyDot(a, n, type) {events.push(['dot', n, type]); a.life -= n;}},
    procs: {own(a, trigger) {assert.equal(a.esBroke, false); events.push(['proc', trigger]);},
      talents() {events.push(['talents']); return true;}, gain: record('gain')},
    triggers: {damageTaken: record('bank-damage'), defense: record('defense')},
    pours: {release: record('pour')}, gauges: {sample: record('gauges')},
    sympathy: {echo: record('sympathy')}, banks: {brood: record('brood'), leech: record('leech')},
    ledgers: {advance: record('ledger')},
    death: {kill(a) {events.push(['death']); a.dead = true;}},
    statuses: {expireStatuses: record('expire'), zapStatuses: record('zap'), lashStatuses: record('lash')},
    ironWard: {advance: record('ward')},
  };
  const p = {afterTimers: record('timer-facts'), afterBanks: record('body-facts'), dotText: record('dot-text')};
  return {a, s, p, events, runtime: new CombatActorFrame(s, p)};
}
test('typed damage, reactions, gain queues and expiry retain their source order', () => {
  const h = course(); h.runtime.advance(h.a, .2, .1);
  assert.deepEqual(h.events.map(e => e[0]), ['timers', 'timer-facts', 'dot', 'dot', 'dot', 'dot-text',
    'proc', 'bank-damage', 'pour', 'defense', 'talents', 'gauges', 'gain', 'sympathy', 'brood',
    'leech', 'body-facts', 'ledger', 'expire', 'zap', 'lash', 'ward']);
  assert.equal(h.a.life, 4); assert.equal(h.a.recentHurt, 0);
  assert.deepEqual(h.events.filter(e => e[0] === 'dot'), [['dot', 2, 'fire'], ['dot', 3, 'cold'], ['dot', 1, undefined]]);
});
test('gained effects are processed from a detached queue and propagate next frame', () => {
  const h = course(null), originalQueue = h.a.gainEvents, first = originalQueue[0];
  h.s.procs.gain = (a, ev) => {assert.notEqual(a.gainEvents, originalQueue); a.gainEvents.push({...ev, depth: ev.depth + 1});};
  h.runtime.advance(h.a, .1);
  assert.deepEqual(h.a.gainEvents, [{...first, depth: 1}]);
});
test('ledger starvation is collected before status expiry and a dead actor is not killed twice', () => {
  const h = course(null); h.s.ledgers.advance = a => {h.events.push(['ledger']); a.life = 0;};
  h.runtime.advance(h.a, .1); h.runtime.advance(h.a, .1);
  assert.equal(h.events.filter(e => e[0] === 'death').length, 1);
  const death = h.events.findIndex(e => e[0] === 'death');
  assert.equal(h.events[death - 1][0], 'ledger'); assert.equal(h.events[death + 1][0], 'expire');
});
test('damage observers are optional and receive pre-damage life after mandatory damage', () => {
  const h = course({physical: 4}), observed = [];
  h.p.dotApplied = (a, amount, type, before) => observed.push([a.life, amount, type, before]);
  h.runtime.advance(h.a, 0);
  assert.deepEqual(observed, [[6, 4, 'physical', 10]]);
});
test('invalid elapsed time refuses before reading actor timers or changing owned state', () => {
  for (const [dt, chrono] of [[NaN, 0], [-1, 0], [Infinity, 0], [0, NaN], [0, -1], [0, Infinity]]) {
    const h = course(); assert.throws(() => h.runtime.advance(h.a, dt, chrono), RangeError);
    assert.deepEqual(h.events, []); assert.equal(h.a.life, 10); assert.equal(h.a.esBroke, true);
  }
});
test('dead-talent refusal skips derived gauge sampling while bank and expiry cleanup continue', () => {
  const h = course(null); h.s.procs.talents = () => false; h.runtime.advance(h.a, .1);
  assert(!h.events.some(e => e[0] === 'gauges')); assert(h.events.some(e => e[0] === 'expire'));
});
