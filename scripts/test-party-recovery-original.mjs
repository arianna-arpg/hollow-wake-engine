import assert from 'node:assert/strict';
import {PartyRecovery} from '../dist/party-recovery.js';
import {acceptedCombatData} from './combat-registry-data.mjs';
const data = acceptedCombatData('party-recovery');
for (const c of data.courses) {
  const events = [], bodies = c.initial.bodies.map((initial, i) => ({...initial, pos: {x: i * 20, y: 0},
    maxLife: () => 100, maxMana: () => 80, isQuiescent: () => true}));
  const seats = bodies.map((actor, i) => ({id: 'p' + i, actor, lastActedAt: 0, reviveDwellBy: new Map()}));
  const current = c.name === 'alone' ? seats.slice(0, 1) : c.name === 'two-revivers' ? seats : seats.slice(0, 2);
  if (c.name === 'merc-policy') seats[1].merc = {name: 'helper'};
  let time = 10, reachable = true;
  const party = new PartyRecovery(data.rules, {seats: () => current, time: () => time, reachable: () => reachable,
    defeated: () => events.push(['defeated']), downed: a => events.push(['player/downed', bodies.indexOf(a) + 1], ['down', bodies.indexOf(a) + 1]),
    revived: s => events.push(['player/revived', bodies.indexOf(s.actor) + 1], ['revive', bodies.indexOf(s.actor) + 1])});
  const state = () => ({bodies: bodies.map(a => ({dead: a.dead, downed: a.downed, life: a.life, mana: a.mana})),
    dwell: seats.map(s => [...s.reviveDwellBy]), events: structuredClone(events)});
  assert.deepEqual(state(), c.initial); party.down(bodies[0]); assert.deepEqual(state(), c.entered, c.name + ': down');
  for (const step of c.steps) {
    time = step.time; reachable = step.reachable; bodies[1].pos.x = step.allyX; seats[1].lastActedAt = step.lastActed;
    party.advance(step.dt); assert.deepEqual(state(), step.expected, c.name + ':' + time);
  }
  const before = state(); for (const invalid of [-1, NaN, Infinity]) assert.throws(() => party.advance(invalid), RangeError);
  assert.deepEqual(state(), before);
}
console.log({passed: true, originalPartyRecoveryCourses: data.courses.length, transitions: data.courses.length * 5, optionalCampaignAbsent: true});
