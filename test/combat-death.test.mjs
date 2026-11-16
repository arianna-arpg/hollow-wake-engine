import test from 'node:test';
import assert from 'node:assert/strict';
import {deathHost} from './combat-death-host.mjs';
const skill = {def: {id: 'summon', name: 'Summon'}};

test('dead and downed bodies refuse all repeated death work', () => {
  const h = deathHost(), a = h.make(1); a.dead = true; h.runtime.kill(a);
  a.dead = false; a.downed = true; h.runtime.kill(a);
  assert.deepEqual(h.events, []);
});
test('construct bash precedes immortal recovery and door departure', () => {
  const h = deathHost(), a = h.make(1), killer = h.make(2, 'player');
  Object.assign(a, {construct: {}, summonInst: skill, defId: 'immortal', doorId: 'door'});
  h.p.bashSpec = () => ({power: 3}); h.p.immortal = () => true;
  h.runtime.kill(a, false, killer);
  assert.equal(a.life, 100); assert.equal(a.dead, false);
  assert.deepEqual(h.events.find(e => e[0] === 'bash').slice(3), [{power: 3, arcDeg: 360}, 100]);
  assert(!h.events.some(e => ['door', 'clutch'].includes(e[0])));
  h.p.immortal = () => false; h.runtime.kill(a, true);
  assert(h.events.some(e => e[0] === 'door'));
});
test('possession ejection precedes companion down and preserves revive ownership', () => {
  const h = deathHost(), a = h.make(1), owner = h.make(2, 'player');
  Object.assign(a, {owner, companion: true, possession: {seatId: 'p'}}); h.seats.push({id: 'p', actor: a});
  h.runtime.kill(a);
  assert.deepEqual(h.events.filter(e => ['eject', 'bond-down'].includes(e[0])), [['eject', 'p', 'bodyDied'], ['bond-down', 1]]);
  assert.equal(a.downed, true); assert.equal(a.dead, false); assert.equal(a.casting, null);
  assert.equal(a.aiCommand, undefined); assert.equal(a.companionReviveDwell, 0);
  assert(!h.events.some(e => e[0] === 'clutch'));
});
test('undying runs early death effects once but leaves retirement for final death', () => {
  const h = deathHost(), owner = h.make(1, 'player'), a = h.make(2, 'player'), sibling = h.make(3, 'player');
  Object.assign(a, {owner, undyingTime: 3, explodeOnDeath: .2, deathHealPct: .1, deathHealFlat: 5, summonInst: skill}); sibling.owner = owner;
  h.runtime.kill(a);
  assert.equal(a.life, 25); assert.equal(a.lifespan, 3); assert.equal(a.undyingSpent, true);
  assert.equal(a.explodeOnDeath, 0); assert.equal(sibling.life, 15); assert.equal(a.dead, false);
  assert(h.events.some(e => e[0] === 'clutch' && e[2] === false));
  assert(!h.events.some(e => e[0] === 'guard'));
  h.runtime.kill(a); assert.equal(a.dead, true);
  assert.equal(h.events.filter(e => e[0] === 'explode').length, 1);
});
test('silent expiry retains mandatory cleanup without kill-only effects', () => {
  const h = deathHost(), owner = h.make(1, 'player'), a = h.make(2, 'player');
  Object.assign(a, {owner, summonInst: skill, companion: true, summonShell: true, explodeOnDeath: .5});
  owner.summonShells = new Set([a]); h.state.strikeReleaseBodies.set(owner, new Set([a]));
  a.activeAuras.set('ward', {}); a.summonToggles.set('summon', {});
  h.runtime.kill(a, true);
  assert.equal(a.dead, true); assert.equal(a.downed, false);
  assert.equal(owner.summonShells.size, 0); assert.equal(h.state.strikeReleaseBodies.get(owner).size, 0);
  assert.equal(a.activeAuras.size, 0); assert.equal(a.summonToggles.size, 0);
  assert.deepEqual(h.events.filter(e => ['guard', 'satellites', 'auroras', 'guardians', 'creepers'].includes(e[0])).map(e => e[0]), ['guard', 'satellites', 'auroras', 'guardians', 'creepers']);
  assert(!h.events.some(e => ['release', 'charge', 'explode', 'minionDeath'].includes(e[0])));
});
test('construct burst flag and stored heal are consumed before dispatch', () => {
  const h = deathHost(), owner = h.make(1, 'player'), a = h.make(2, 'player'), target = h.make(3), ally = h.make(4, 'player');
  Object.assign(a, {owner, summonInst: skill, construct: {deathBurst: {radius: 30, damageScale: 2}, healBurst: {cap: 20, ratio: 2, radius: 30}, stored: 50}});
  let hits = 0, heals = 0;
  h.p.hit = (_owner, source, victim) => {hits++; assert.equal(a.construct.burstFired, true); assert.equal(source, skill); assert.equal(victim, target);};
  h.p.heal = () => {heals++; assert.equal(a.construct.healBurst, undefined);};
  h.runtime.kill(a); assert.equal(hits, 1); assert.equal(heals, 2);
});
test('fraction construct explosion retains original ground-tier default', () => {
  const h = deathHost(), a = h.make(1); a.tier = 5; a.construct = {deathBurst: {radius: 20, fraction: .3}};
  let args; h.bursts.damage = (...v) => {args = v;}; h.runtime.kill(a, true);
  assert.equal(args.length, 6); assert.deepEqual(args.slice(1), [20, 30, 'physical', '#fff', 'enemy']);
});
test('player retirement stops before aura births, contracts and corpse creation', () => {
  const h = deathHost(), a = h.make(1, 'player'); a.summonToggles.set('keep', {}); h.seats.push({id: 'p', actor: a});
  h.runtime.kill(a); assert(a.dead); assert(a.summonToggles.has('keep'));
  assert(h.events.some(e => e[0] === 'playerDown')); assert(!h.events.some(e => e[0] === 'propagate'));
});
test('aura death births preserve owner, cap, duration and copied position', () => {
  const h = deathHost(), owner = h.make(1, 'player'), bearer = h.make(2, 'player'), a = h.make(3);
  owner.life = bearer.life = 100; bearer.owner = owner;
  bearer.activeAuras.set('brood', {inst: skill, radius: 50, shape: 0, spec: {deathSpawn: {chance: 1, maxActive: 1, monsterId: 'child', duration: 5}}});
  h.runtime.kill(a); const child = h.actors.find(b => b.defId === 'child');
  assert(child); assert.equal(child.owner, owner); assert.equal(child.sourceSkillId, 'summon');
  assert.equal(child.lifelineId, 42); assert.equal(child.lifespan, 5); assert.notEqual(child.pos, a.pos);
  h.runtime.kill(h.make(4)); assert.equal(h.actors.filter(b => b.defId === 'child').length, 1);
});
test('enemy corpse retention and kill credit work with every extension absent', () => {
  const h = deathHost(), killer = h.make(10, 'ally');
  for (let i = 1; i <= 3; i++) {const a = h.make(i); a.defId = 'body' + i; h.runtime.kill(a, false, killer);}
  assert.deepEqual(h.state.corpses.map(c => c.defId), ['body2', 'body3']);
  assert(!h.events.some(e => e[0] === 'throngKill'));
  const a = h.make(4); a.defId = 'body4'; h.runtime.kill(a);
  assert(h.events.some(e => e[0] === 'throngKill' && e[1] === 4));
});
