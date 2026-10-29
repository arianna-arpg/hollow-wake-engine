import test from 'node:test';
import assert from 'node:assert/strict';
import {createAttackSequenceDemo as demo} from '../examples/attack-sequences.mjs';
import {attackSequenceErrors} from '../dist/attack-sequence-content.js';

const thrown = () => ({thrown: {type: 'projectile', speed: 20, radius: 1, range: 100},
  recovery: {meleeRange: 1, bleed: 0.3, missCooldown: 2, look: 'ground'}});
const bounce = () => ({...thrown(), bounce: {seconds: 2, distance: 10, radius: 2, charge: 'charge', amount: 1, cap: 4, airLook: 'air', nova: {count: 8, power: 0.5}},
  catchBuff: {max: 2, label: 'Catch', repeatInterval: 0.2}});
function connected(r) {
  const inst = r.controller.prepare(r.owner, r.host, r.target.pos), p = {caster: r.owner, inst, pos: {...r.target.pos}, tier: 0, mult: 2};
  r.controller.landed(r.owner, inst, r.target, 20, 15, 0);
  assert(r.controller.contact(p, r.target)); return p;
}
test('hit cycles are per victim and only primary, positive, depth-zero receipts advance them', () => {
  const r = demo(), c = r.controller, i = c.prepare(r.owner, r.host, r.target.pos), second = r.actor({x: 2, y: 0, z: 0});
  assert.notEqual(i, r.host); assert.equal(i.state, r.host.state); assert.notEqual(i.sockets, r.host.sockets);
  assert.equal(c.forTarget(r.owner, i, r.target, 0).extraMods.at(-1).value, 0.1);
  c.landed(r.owner, i, r.target, 0, 0, 0); c.landed(r.owner, i, r.target, 1, 1, 1); c.landed(second, i, r.target, 1, 1, 0);
  assert.equal(c.stacks(r.owner, r.host, r.target), 0);
  for (let hit = 1; hit <= 3; hit++) {c.landed(r.owner, i, r.target, 10, 8, 0); assert.equal(c.stacks(r.owner, r.host, r.target), hit % 3);}
  assert.equal(c.stacks(r.owner, r.host, second), 0); assert.equal(c.forTarget(r.owner, i, second, 1), i);
});
test('vulnerability replaces the local ramp and maximum clears it while granting a timed owner buff', () => {
  const r = demo({hitCycle: {max: 2, increasedPerStack: 0.2}, vulnerability: {perStack: 0.15, duration: 3, label: 'Open'},
    cycleBuff: {type: 'buff', id: 'authored', duration: 5, mods: []}}), c = r.controller, i = c.prepare(r.owner, r.host, r.target.pos);
  assert.equal(c.forTarget(r.owner, i, r.target, 0), i); c.landed(r.owner, i, r.target, 10, 8, 0);
  assert.equal([...r.target.buffs.values()][0].def.mods[0].value, 0.15);
  r.owner.stats.effectDuration = 2; c.landed(r.owner, i, r.target, 10, 8, 0);
  assert.equal(r.target.buffs.size, 0); assert.equal([...r.owner.buffs.values()][0].durationScale, 2);
  c.clearAll(); assert.equal(r.owner.buffs.size, 0);
});
test('rhythm consumes only its own remaining damage and preserves foreign statuses', () => {
  const r = demo({hitCycle: {max: 2, increasedPerStack: 0}, rhythm: {bleed: 0.5, impale: 0.5}, consumeRhythm: {multiplier: 2}}), i = r.controller.prepare(r.owner, r.host, r.target.pos);
  const foreign = {sourceKey: 'foreign', dps: 100, stacks: 2, remaining: 9}; r.target.statuses.push(foreign);
  r.controller.landed(r.owner, i, r.target, 20, 16, 0); r.controller.landed(r.owner, i, r.target, 20, 16, 0);
  assert.deepEqual(r.target.statuses, [foreign]); assert.equal(r.target.life, 904);
  assert.deepEqual(r.applications.map(a => a.entry.id), ['bleed', 'impaled']); assert(r.applications.every(a => a.entry.holdDischarge));
});
test('ailment resistance short-circuits later random samples; critical and rupture preserve ordered arithmetic', () => {
  const r = demo({hitCycle: {max: 5, increasedPerStack: 0}, rhythm: {bleed: 0.5, impale: 0.5}}), i = r.controller.prepare(r.owner, r.host, r.target.pos);
  r.target.stats.ailmentResist = 0.5; r.controller.landed(r.owner, i, r.target, 20, 16, 0); assert.equal(r.draws, 1); assert.equal(r.applications.length, 0);
  r.target.stats.ailmentResist = 0; r.owner.stats.dotCrit = 1; r.owner.stats.critChance = 1; r.owner.stats.dotRupture = 0.5;
  r.controller.landed(r.owner, i, r.target, 20, 16, 0); r.controller.landed(r.owner, i, r.target, 20, 16, 0);
  assert.equal(r.draws, 4); assert.equal(r.applications[1].entry.dps, 20); assert.equal(r.applications[1].entry.rupture, 40);
});
test('nearest-victim footprint uses host 3D distance and leaves the enemy list intact', () => {
  const r = demo({hitCycle: {max: 5, increasedPerStack: 0}, cycleArea: {radiusPerStack: 0.1, arcPerStack: 0.2}}), c = r.controller;
  const elevated = r.actor({x: 0, y: 0, z: 100}), list = [r.target, elevated]; r.ports.enemiesOf = () => list;
  const i = c.prepare(r.owner, r.host, elevated.pos); c.landed(r.owner, i, elevated, 1, 1, 0);
  const next = c.prepare(r.owner, r.host, elevated.pos); assert.deepEqual(next.extraMods.map(m => m.value), [0.2, 0.4]); assert.deepEqual(list, [r.target, elevated]);
});
test('independent sweeps honor speed-scaled deadlines and restore facing after successful delivery', () => {
  const r = demo({castSweeps: [{delay: 0, delivery: {type: 'melee', range: 3, arcDeg: 120}, power: 0.5},
    {delay: 1, delivery: {type: 'melee', range: 5, arcDeg: 180}, power: 0.25}]}), aim = {...r.target.pos};
  r.owner.speedFactor = () => 2; r.controller.opening(r.owner, r.host, aim, 4); aim.z = 99;
  assert.equal(r.deliveries.length, 1); assert.equal(r.deliveries[0].options.dmgMult, 2); assert.equal(r.owner.facing, 2);
  r.time = 0.49; r.controller.update(0.49); assert.equal(r.deliveries.length, 1);
  r.time = 0.5; r.controller.update(0.01); assert.equal(r.deliveries.length, 2); assert.equal(r.deliveries[1].aim.z, 0);
  assert.equal(r.deliveries[1].options.dmgMult, 1); assert(r.deliveries.every(d => d.options.componentUse && d.options.noRepeat && d.options.noCooldown));
});
test('delivery exceptions keep the original partial-write behavior and do not replay a removed scheduled job', () => {
  const r = demo({castSweeps: [{delay: 1, delivery: {type: 'melee', range: 3, arcDeg: 120}, power: 1}]});
  r.controller.opening(r.owner, r.host, r.target.pos, 1); r.time = 1; let calls = 0;
  r.ports.execute = () => {calls++; r.owner.facing = 7; throw Error('delivery');};
  assert.throws(() => r.controller.update(1), /delivery/); assert.equal(r.owner.facing, 7);
  r.controller.update(0); assert.equal(calls, 1);
});
test('lodged weapons require matching floor and sight before pickup; removal releases their hold', () => {
  const r = demo(thrown()); connected(r); assert(r.owner.skillRecoveryLocks.has(r.host.def.id));
  r.owner.pos = {...r.target.pos}; r.owner.tier = 1; r.controller.update(0.1); assert(r.owner.skillRecoveryLocks.size);
  r.owner.tier = 0; r.visible = false; r.controller.update(0.1); assert(r.owner.skillRecoveryLocks.size);
  r.visible = true; r.controller.update(0.1); assert.equal(r.owner.skillRecoveryLocks.size, 0); assert.equal(r.owner.cooldowns.size, 0); assert.equal(r.applications.length, 1);
});
test('misses release a timed penalty; unmatched contacts only defer matching queued hit fuses', () => {
  const r = demo(thrown()), i = r.controller.prepare(r.owner, r.host, r.target.pos), p = {caster: r.owner, inst: i, pos: {...r.target.pos}, tier: 0, mult: 1};
  assert.equal(r.controller.contact(p, r.target), false);
  r.queues.fuses.push({caster: r.owner, inst: i, kind: 'hit', targetId: r.target.id}); assert.equal(r.controller.contact(p, r.target), true);
  r.controller.update(0); assert(r.owner.skillRecoveryLocks.size); r.queues.fuses = [];
  r.controller.update(0); assert.equal(r.owner.skillRecoveryLocks.size, 0); assert.equal(r.owner.cooldowns.get(r.host.def.id), 2);
});
test('delayed hit receipt claims its deferred flight once and before cycling the target', () => {
  const r = demo({...thrown(), hitCycle: {max: 3, increasedPerStack: 0.1}}), i = r.controller.prepare(r.owner, r.host, r.target.pos), p = {caster: r.owner, inst: i, pos: {...r.target.pos}, tier: 0, mult: 1};
  r.queues.fuses.push({caster: r.owner, inst: i, kind: 'hit', targetId: r.target.id}); r.controller.beforeContact(p); assert(r.controller.contact(p, r.target));
  r.controller.landed(r.owner, i, r.target, 10, 8, 0); r.queues.fuses = []; r.controller.update(0);
  assert.equal(r.controller.stacks(r.owner, r.host, r.target), 1); assert(r.owner.skillRecoveryLocks.size);
  r.target.dead = true; r.controller.update(0); assert.equal(r.owner.skillRecoveryLocks.size, 0);
});
test('catch uses 3D positions, inherits flight, grants nova and schedules the next repeated throw', () => {
  const r = demo(bounce()), p = connected(r), marker = r.actors.find(a => a.owner === r.owner);
  assert(marker); assert.equal(marker.pos.z, 10); assert.equal(marker.stats.phasing, 1); assert(marker.untargetable);
  p.inherit = {homing: 1, erratic: 2, spiral: 3, orbit: 4, spin: 5, weave: 6, amp: 7, orbitR0: 8};
  r.controller.update(0.5); assert.equal(p.pos.z, 2.5); assert.equal(p.pos.x, 7.5);
  r.owner.pos = {...marker.pos}; r.controller.update(0.1); assert(marker.dead); assert.equal(r.owner.skillRecoveryLocks.size, 0);
  assert.equal(r.deliveries.length, 1); const nova = r.deliveries[0]; assert.equal(nova.inst.def.delivery.count, 8); assert.equal(nova.inst.def.delivery.trajectory.orbitRadius, 8); assert.equal(nova.options.dmgMult, 1);
  assert.equal(nova.inst.sequenceRole, 'payload'); assert.equal(nova.inst.sequenceHost, r.host);
  r.controller.prepare(r.owner, r.host, r.target.pos); r.time = 0.19; r.controller.update(0); assert.equal(r.deliveries.length, 1);
  r.time = 0.2; r.controller.update(0); assert.equal(r.deliveries.length, 2); assert.equal(r.deliveries[1].inst.sequenceRole, 'primary');
});
test('expired catch window leaves a ground pickup and clears the catch bank without a nova', () => {
  const r = demo(bounce()); connected(r); const marker = r.actors.find(a => a.owner === r.owner);
  r.controller.update(2); assert.equal(marker.look, 'ground'); assert(r.owner.skillRecoveryLocks.size);
  r.owner.pos = {...marker.pos}; r.controller.update(0); assert.equal(r.deliveries.length, 0); assert.equal(r.owner.skillRecoveryLocks.size, 0);
});
test('obstructed bounce falls back to the owner; failed placement leaves no recovery object', () => {
  const r = demo(bounce()); r.visible = false; connected(r); const marker = r.actors.find(a => a.owner === r.owner); assert.deepEqual(marker.pos, r.owner.pos);
  const other = demo(bounce()); other.ports.spawnMarker = () => undefined; connected(other); other.controller.update(0);
  assert.equal(other.owner.skillRecoveryLocks.size, 0); assert.equal(other.owner.cooldowns.size, 0);
});
test('flight rain shares the host time gate and preserves inherited trajectory without recovering payloads', () => {
  const r = demo({...thrown(), flightRain: {interval: 0.5, power: 0.2, range: 25, radius: 2}}), i = r.controller.prepare(r.owner, r.host, r.target.pos), p = {caster: r.owner, inst: i, pos: {...r.target.pos}, tier: 0, mult: 3};
  r.controller.flight(p); r.controller.flight(p); assert.equal(r.flights.length, 1); assert.equal(r.draws, 1);
  r.time = 0.5; r.controller.flight(p); assert.equal(r.flights.length, 2); assert.equal(r.flights[0].mult, 0.6000000000000001);
  assert.equal(r.flights[0].inst.def.delivery.range, 25); assert.equal(r.flights[0].inst.def.delivery.radius, 2);
  assert.equal(r.controller.prepare(r.owner, r.flights[0].inst, r.target.pos), r.flights[0].inst);
});
test('impact area excludes another floor and blocked victims while using the original hit amount', () => {
  const r = demo({...thrown(), impactBleed: {radius: 5, power: 0.5, bleed: 0.25}}), nearby = r.actor({x: 11, y: 0, z: 0}), wrongFloor = r.actor({x: 10, y: 0, z: 0});
  wrongFloor.tier = 1; connected(r); assert.equal(r.target.life, 990); assert.equal(nearby.life, 990); assert.equal(wrongFloor.life, 1000);
  assert.deepEqual(r.applications.map(a => a.recipient), [r.target, nearby]);
  const blocked = demo({...thrown(), impactBleed: {radius: 5, power: 0.5, bleed: 0.25}});
  blocked.visible = false; connected(blocked); assert.equal(blocked.target.life, 1000); assert.equal(blocked.applications.length, 0);
});
test('policy change retires queued work, statuses, zones and echoes by exact owner and host identity', () => {
  const r = demo(thrown()), p = connected(r), foreignHost = {...r.host}, owned = {caster: r.owner, inst: p.inst}, foreign = {caster: r.owner, inst: {...p.inst, sequenceHost: foreignHost}};
  r.flights.push(p, {...p, inst: foreign.inst}); for (const queue of Object.values(r.queues)) queue.push(owned, foreign);
  const zone = {...owned}, foreignZone = {...foreign}; r.zones.push(zone, foreignZone);
  const echo = r.actor(r.owner.pos); echo.owner = r.owner; echo.construct = {echo: {}, castInst: p.inst};
  r.target.statuses.push({sourceKey: 'sequence:1:example-axe:1:throw', dps: 1, remaining: 1, stacks: 1}, {sourceKey: 'foreign', dps: 1, remaining: 1, stacks: 1});
  r.host.level++; r.controller.update(0); assert.equal(r.flights.length, 1); assert(r.flights[0].inst === foreign.inst);
  for (const queue of Object.values(r.queues)) assert.deepEqual(queue, [foreign]);
  assert(zone.retired); assert(!foreignZone.retired); assert(echo.dead); assert.equal(r.target.statuses.length, 1); assert.equal(r.owner.skillRecoveryLocks.size, 0);
});
test('unseating and independent simulations release only their own state', () => {
  const a = demo(thrown()), b = demo(thrown()); connected(a); connected(b); a.owner.skills = []; a.controller.update(0);
  assert.equal(a.owner.skillRecoveryLocks.size, 0); assert.equal(b.owner.skillRecoveryLocks.size, 1); b.controller.clearAll(); assert.equal(b.owner.skillRecoveryLocks.size, 0);
});
test('content patch order, payload stripping, support identity and proc depth are independent of allocation order', () => {
  const r = demo({hitCycle: {max: 3, increasedPerStack: 0.1}}), sweep = {delay: 1, delivery: {type: 'melee', range: 3, arcDeg: 90}, power: 1};
  r.patches.a = {cycleMax: 2, castSweeps: [sweep]}; r.patches.z = {cycleMax: 4, castSweeps: [{...sweep, delay: 2}]};
  r.host.treeNodes = ['z', 'a']; assert.equal(r.content.spec(r.host).cycleMax, 4); assert.deepEqual(r.content.spec(r.host).castSweeps.map(s => s.delay), [1, 2]); assert.deepEqual(r.host.treeNodes, ['z', 'a']);
  const support = {def: {id: 'support'}, level: 2}; r.host.sockets = [support]; r.host.grafts = [support]; r.host.procChainDepth = 2; r.host.state.trigDepth = 5; r.host.bonusLevels = 3;
  r.host.def.innateMods = [{stat: 'damage', kind: 'increased', value: 0.4}];
  const payload = r.content.payload(r.host, thrown().thrown), component = r.content.sweep(r.host, sweep.delivery);
  assert.equal(payload.level, 1); assert.equal(payload.def.attackSequence, undefined); assert.equal(payload.def.cooldown, 0); assert.equal(payload.def.manaCost, 0); assert.equal(payload.procChainDepth, 1);
  assert.deepEqual(payload.def.leveling.perLevel, []); assert.equal(payload.def.innateMods, r.host.def.innateMods);
  assert.equal(payload.sockets[0], support); assert.notEqual(payload.sockets, r.host.sockets); assert.notEqual(payload.grafts, r.host.grafts); assert.equal(payload.sequenceHost, r.host);
  assert.equal(component.level, 5); assert.equal(component.bonusLevels, 3); assert.equal(component.procChainDepth, 5); assert.deepEqual(component.def.tags, ['attack', 'melee', 'aoe', 'physical']);
  assert.equal(r.content.spec(payload), undefined); assert.equal(r.content.delivery(payload), undefined); assert.deepEqual(r.content.statuses(payload), []);
});
test('authoring diagnostics reject invalid timing/counts and keep the original modifier exemption', () => {
  assert.deepEqual(attackSequenceErrors({cycleBuff: {type: 'buff', id: 'b', duration: 1, mods: [{value: -2}]}}), []);
  const errors = attackSequenceErrors({cycleMax: 0, hitCycle: {max: 1.5, increasedPerStack: -1},
    flightRain: {interval: 0, power: Infinity, range: 1, radius: 1}, catchBuff: {max: 0, repeatInterval: 0},
    thrown: {type: 'projectile', speed: 0, range: 0, radius: 0}, bounce: {seconds: 0, radius: 0}});
  assert.equal(errors.length, 8); assert(errors.some(e => e.includes('projectile'))); assert(errors.some(e => e.includes('positive interval')));
});
