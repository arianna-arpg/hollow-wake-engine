import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TimedDamage, Engine } from '../dist/index.js';
const read = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));
const definition = read('../baseline/milestone-two/authored.json').timedDamage;
const fixture = read('../baseline/milestone-two/lifecycle.json');
for (const scenario of fixture.dots) test(`original Burning and applyDot trace: damageTaken=${scenario.taken}`, () => {
  let dot = new TimedDamage(definition), expiry = 1;
  const engine = new Engine(read('../content/milestone-one.json'));
  const target = engine.target({ life: 1000, mods: [
    { stat: 'fireRes', kind: 'flat', value: .75 }, { stat: 'armor', kind: 'flat', value: 10000 },
    { stat: 'damageTaken', kind: 'override', value: scenario.taken }] });
  for (const { command: c, expected } of scenario.steps) {
    let raw = 0, damage = 0;
    if (c.type === 'apply') dot.apply(c.dps, c.scale ?? 1, expiry, c.sourceId);
    else if (c.type === 'expiry') expiry = c.value;
    else { raw = dot.advance(c.dt); damage = raw ? target.receiveDot(raw, definition.damageType) : 0; }
    assert.deepEqual({ raw, damage, life: target.life, active: dot.present ? { remaining: dot.remaining, dps: dot.dps, sourceId: dot.sourceId ?? null } : null }, expected);
    dot = TimedDamage.restore(JSON.parse(JSON.stringify(dot.snapshot())));
  }
});
test('full expiry frame is an explicit compatibility rule', () => {
  const a = new TimedDamage(definition), b = new TimedDamage(definition);
  a.apply(10); b.apply(10);
  assert.equal(a.advance(5), 50);
  assert.equal(b.advance(4) + b.advance(1), 40);
  assert.equal(a.advance(5), 0);
  assert.throws(() => new TimedDamage({ ...definition, clock: 'elapsed-time' }));
});
test('invalid tick and application are atomic; attribution is first-applier owned', () => {
  const d = new TimedDamage(definition); d.apply(10, 1, 1, 'first');
  const before = d.snapshot();
  for (const dt of [-1, Infinity, NaN]) { assert.throws(() => d.advance(dt)); assert.deepEqual(d.snapshot(), before); }
  for (const args of [[20, -1], [20, 1, 0], [20, 1, 1, '']]) { assert.throws(() => d.apply(...args)); assert.deepEqual(d.snapshot(), before); }
  assert.equal(d.apply(20, 1, 1, 'second'), 'replaced'); assert.equal(d.sourceId, 'first');
  const s = d.snapshot(); s.active.dps = -1; assert.throws(() => TimedDamage.restore(s));
  for (const active of [false, 0, undefined]) assert.throws(() => TimedDamage.restore({ ...d.snapshot(), active }));
});
