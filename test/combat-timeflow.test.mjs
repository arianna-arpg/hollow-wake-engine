import test from 'node:test';
import assert from 'node:assert/strict';
import {CombatTimeflow} from '../dist/combat-timeflow.js';
const actor = (id, team = 'enemy', owner) => ({id, team, owner, statuses: []});
test('world and actor holds fold independently; status time multiplies the actor clock', () => {
  const clock = new CombatTimeflow(id => id === 'slow' ? {timeScale: .5} : undefined), a = actor(2);
  clock.hold({id: 'world', scale: .5}); clock.hold({id: 'body', scale: .25, actors: {onlyTeam: 'enemy'}});
  a.statuses.push({id: 'slow'}); assert.equal(clock.beginFrame(.1), .5);
  assert.equal(clock.actorScale(a), .125); assert.equal(clock.scaleFor(a), .0625); assert.equal(clock.age, .1);
});
test('magic expires on raw time but a hard menu pause freezes the hold age', () => {
  const clock = new CombatTimeflow(() => undefined);
  clock.hold({id: 'magic', scale: 0, duration: 1});
  clock.beginFrame(.5); clock.hold({id: 'menu', scale: 0, kind: 'menu'});
  assert.equal(clock.beginFrame(20), 0); assert.equal(clock.age, .5);
  clock.release('menu'); assert.equal(clock.beginFrame(.5), 1); assert.equal(clock.active, false);
});
test('owner exemption is intentionally one hop and changing allegiance changes eligibility', () => {
  const clock = new CombatTimeflow(() => undefined), owner = actor(1, 'player'), child = actor(2, 'player', owner), grandchild = actor(3, 'player', child);
  clock.hold({id: 'stop', scale: 0, actors: {exceptIds: [1], exceptOwnedBy: [1]}});
  assert.equal(clock.actorScale(owner), 1); assert.equal(clock.actorScale(child), 1); assert.equal(clock.actorScale(grandchild), 0);
  clock.hold({id: 'stop', scale: .5, actors: {onlyTeam: 'enemy'}});
  assert.equal(clock.actorScale(child), 1); child.team = 'enemy'; assert.equal(clock.actorScale(child), .5);
});
test('menu refusal preserves an existing same-id hold and optional surfaces are caller-owned policy', () => {
  const clock = new CombatTimeflow(() => undefined, {pause: {scale: 0, kind: 'menu'}});
  clock.hold({id: 'pause', scale: .5, hud: {label: 'slow'}});
  clock.allowHold = () => false; assert.equal(clock.holdSurface('pause'), false);
  assert.equal(clock.worldScale(), .5); assert.equal(clock.overlay().label, 'slow');
  assert.equal(clock.holdSurface('unknown'), false);
});
test('invalid duration, scale and elapsed values fail before replacement or aging', () => {
  const clock = new CombatTimeflow(() => undefined); clock.hold({id: 'keep', scale: .5, duration: 2});
  for (const value of [-1, NaN, Infinity]) {
    assert.throws(() => clock.beginFrame(value), RangeError);
    assert.throws(() => clock.hold({id: 'keep', scale: value}), RangeError);
    assert.throws(() => clock.hold({id: 'keep', scale: 0, duration: value}), RangeError);
    assert.equal(clock.age, 0); assert.equal(clock.worldScale(), .5);
  }
});
test('separate combat sessions never share hold state', () => {
  const a = new CombatTimeflow(() => undefined), b = new CombatTimeflow(() => undefined);
  a.hold({id: 'stop', scale: 0}); b.beginFrame(2);
  assert.equal(a.age, 0); assert.equal(b.active, false); assert.equal(b.worldScale(), 1);
});
