import test from 'node:test';
import assert from 'node:assert/strict';
import {StatusAftermath} from '../dist/status-aftermath.js';

function course(draws = [0, .25, .75]) {
  const owner = {id: 1, team: 'player', level: 4, dead: false, healed: 0,
    healBy(n) {this.healed += n; return n / 2;}};
  const victim = {id: 2, dead: false, pos: {x: 40, y: 60}, statuses: []};
  const actors = [owner, victim], events = [];
  let at = 0;
  const services = {bodies: {create(id, level, team, owner) {events.push(['create', id, level, team]); return {id: 10, radius: 8, owner, dead: false};}},
    births: {lifeline(a) {events.push(['lifeline', a.id]); return a.id;}}};
  const ports = {actors: () => actors, random() {assert(at < draws.length); return draws[at++];},
    clamp(p, radius) {events.push(['clamp', radius]); return p;},
    emerge(a, options) {events.push(['emerge', a.id, options]);},
    resourceFlow(to, from, n) {events.push(['flow', to.id, from.id, n]);}};
  const runtime = new StatusAftermath(services, ports);
  return {owner, victim, actors, events, services, ports, runtime, draws: () => at};
}
const brood = (extra = {}) => ({casterId: 1, broodAcc: 100,
  brood: {monsterId: 'rat', perDamage: .01, max: 1, duration: 3}, ...extra});

test('brood creates under the exact applier and consumes its bank before publication', () => {
  const h = course(), s = brood(); h.victim.statuses.push(s);
  h.ports.emerge = child => {
    assert.equal(s.broodAcc, 0);
    assert(h.actors.includes(child));
    h.runtime.brood(h.victim);
  };
  h.runtime.brood(h.victim);
  assert.equal(h.actors.length, 3);
  assert.deepEqual(h.actors[2], {id: 10, radius: 8, owner: h.owner, dead: false,
    sourceSkillId: '__brood:rat', lifelineId: 1, lifespan: 3, pos: {x: 28, y: 72}});
  assert.equal(h.draws(), 3);
});
test('brood probability is capped and a failed roll consumes only the probability draw', () => {
  const h = course([.35]); h.victim.statuses.push(brood()); h.runtime.brood(h.victim);
  assert.equal(h.victim.statuses[0].broodAcc, 0); assert.equal(h.actors.length, 2); assert.equal(h.draws(), 1);
});
test('a missing or dead applier consumes the bank and chance before lookup', () => {
  for (const dead of [false, true]) {
    const h = course([0]); if (dead) h.owner.dead = true; else h.actors.shift();
    h.victim.statuses.push(brood()); h.runtime.brood(h.victim);
    assert.equal(h.events.length, 0); assert.equal(h.draws(), 1); assert.equal(h.victim.statuses[0].broodAcc, 0);
  }
});
test('brood cap excludes dead children and children of a different exact owner', () => {
  for (const live of [true, false]) {
    const h = course(); h.victim.statuses.push(brood());
    h.actors.push({id: 3, owner: h.owner, sourceSkillId: '__brood:rat', dead: !live},
      {id: 4, owner: {owner: h.owner}, sourceSkillId: '__brood:rat', dead: false});
    h.runtime.brood(h.victim); assert.equal(h.actors.length, live ? 4 : 5); assert.equal(h.draws(), live ? 1 : 3);
  }
});
test('leech clears before healing, preserves reentrant deposits, and reports actual healing', () => {
  const h = course([]), s = {casterId: 1, leechAcc: 12}; h.victim.statuses.push(s);
  h.owner.healBy = n => {assert.equal(s.leechAcc, 0); h.runtime.leech(h.victim); s.leechAcc = 3; return n / 2;};
  h.runtime.leech(h.victim);
  assert.equal(s.leechAcc, 3); assert.deepEqual(h.events, [['flow', 1, 2, 6]]);
});
test('leech for a dead applier is retired; a bank without an applier remains untouched', () => {
  const h = course([]); h.owner.dead = true;
  h.victim.statuses.push({casterId: 1, leechAcc: 10}, {leechAcc: 7}, {casterId: 1, leechAcc: -2});
  h.runtime.leech(h.victim);
  assert.deepEqual(h.victim.statuses.map(s => s.leechAcc), [0, 7, -2]); assert.deepEqual(h.events, []);
});
