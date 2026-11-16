import test from 'node:test';
import assert from 'node:assert/strict';
import {CombatServiceBindings} from '../adapters/embedded/combat-service-bindings.mjs';
import {combatPortContracts} from '../adapters/embedded/combat-port-contracts.mjs';

test('missing services refuse assembly before assigning any pending port', () => {
  const owner = {actors: () => []}, link = new CombatServiceBindings(owner, {});
  const ports = link.ports('area');
  assert.throws(() => link.finish(), /Incomplete combat assembly/);
  assert.equal(ports.actors, undefined);
  assert(link.missing().some(row => row.includes('resolveHit')));
});

test('aliases resolve after assembly, remain instance-owned and avoid runtime lookup', () => {
  const queries = Object.fromEntries(combatPortContracts.area.map(name => [name, () => name]));
  const one = {}, two = {}, a = new CombatServiceBindings(one, queries), b = new CombatServiceBindings(two, queries);
  const pa = a.ports('area', {resolveHit: 'contact'}), pb = b.ports('area', {resolveHit: 'contact'});
  one.contact = () => 1; two.contact = () => 2;
  a.finish(); b.finish(); one.contact = () => 3;
  assert.equal(pa.resolveHit(), 1); assert.equal(pb.resolveHit(), 2); assert(Object.isFrozen(pa));
  assert.throws(() => a.ports('area'), /closed/); assert.throws(() => a.finish(), /closed/);
});

test('unknown contracts, misspelled overrides and noncallable ports refuse setup', () => {
  const link = new CombatServiceBindings({}, {});
  assert.throws(() => link.ports('unknown'), /Unknown combat service contract/);
  assert.throws(() => link.ports('area', {resolveHits() {}}), /Unknown combat port/);
  assert.throws(() => link.ports('area', {resolveHit: 42}), /Noncallable/);
});

test('inherited direct-delivery recovery methods are part of the generated contract', () => {
  for (const name of ['absorbAmount', 'absorb', 'restore', 'stream', 'heal', 'cleanse']) assert(combatPortContracts.direct.includes(name), name);
});
