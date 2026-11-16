import test from 'node:test';
import assert from 'node:assert/strict';
import {CombatHostility} from '../dist/combat-hostility.js';

const actor = (id, team, extra = {}) => ({id, team, tier: 0, dead: false, downed: false, untargetable: false, ...extra});
function setup(facts = {}) {
  const calls = [], wrap = (name, fn) => (...args) => {calls.push(name); return fn(...args);};
  const p = {travelProtected: a => !!a.travel, crossLayerDuels: () => false, burrowed: a => !!a.burrowed,
    prey: () => false, factionStance: () => 'neutral', ...facts};
  return {calls, rules: new CombatHostility(Object.fromEntries(Object.entries(p).map(([name, fn]) => [name, wrap(name, fn)])))};
}
test('travel and layer protection short-circuit later relationship queries', () => {
  const a = actor(1, 'player'), b = actor(2, 'enemy', {travel: true, tier: 2});
  const h = setup(); assert.equal(h.rules.hostile(a, b), false); assert.deepEqual(h.calls, ['travelProtected']);
  b.travel = false; h.calls.length = 0; assert.equal(h.rules.hostile(a, b), false);
  assert.deepEqual(h.calls, ['travelProtected', 'crossLayerDuels']);
  assert(setup({crossLayerDuels: () => true}).rules.hostile(a, b));
});
test('possession guise and an inside rider protect only one direction', () => {
  const hunter = actor(1, 'enemy', {faction: 'guard'}), rider = actor(2, 'player', {possession: {guiseFaction: 'guard'}});
  const {rules} = setup(); assert.equal(rules.hostile(hunter, rider), false); assert(rules.hostile(rider, hunter));
  rider.possession.guiseBroken = true; assert(rules.hostile(hunter, rider));
  rider.clingTo = {id: hunter.id}; rider.burrowed = true;
  assert.equal(rules.hostile(hunter, rider), false); assert(rules.hostile(rider, hunter));
  assert(rules.hostile(actor(3, 'enemy'), rider));
});
test('predation precedes faction stance and same-team factions stay directional', () => {
  const a = actor(1, 'enemy', {faction: 'a'}), b = actor(2, 'enemy', {faction: 'b'});
  const h = setup({prey: () => true, factionStance: () => {throw Error('Not reached');}});
  assert(h.rules.hostile(a, b)); assert.deepEqual(h.calls, ['travelProtected', 'prey']);
  const r = setup({factionStance: (x, y) => x === 'a' && y === 'b' ? 'hostile' : 'neutral'}).rules;
  assert(r.hostile(a, b)); assert.equal(r.hostile(b, a), false);
  a.team = b.team = 'player'; assert.equal(r.hostile(a, b), false);
});
