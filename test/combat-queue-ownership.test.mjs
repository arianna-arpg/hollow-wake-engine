import test from 'node:test';
import assert from 'node:assert/strict';
import {PendingResolutions} from '../dist/pending-resolutions.js';
import {ProjectileDelivery} from '../dist/projectile-delivery.js';
import {ProjectileSchedules} from '../dist/projectile-schedules.js';
import {MovementDeliveries} from '../dist/movement-deliveries.js';
import {UtilityDeliveries} from '../dist/utility-deliveries.js';
import {CombatTargeting} from '../dist/combat-targeting.js';
import {CorpseEffects} from '../dist/corpse-effects.js';

test('a delayed buff never executes from the queue retired by a build change', () => {
  const actor = {dead: false}, inst = {}, retired = [{kind: 'buff', due: 0, caster: actor, inst, fx: {}, durScale: 1, mult: 1}];
  let fuses = retired, persists = [], landed = 0;
  const service = new PendingResolutions(() => fuses, () => persists, {time: () => 0, fusePower: () => 1, arrived() {}, buff: () => landed++});
  fuses = []; service.advance(0); assert.equal(landed, 0); assert.equal(retired.length, 1);
  fuses.push({...retired[0]}); service.advance(0); assert.equal(landed, 1); assert.equal(fuses.length, 0);
});

test('persistent pulses follow the current owner after replacement and keep instance identity', () => {
  const actor = {dead: false, pos: {x: 0, y: 0}}, inst = {}, retired = [];
  let persists = retired, released;
  const service = new PendingResolutions([], () => persists, {copyPosition: p => ({...p}), execute: (...args) => {released = args;}});
  persists = [{caster: actor, inst, remaining: 2, total: 2, timer: 0, interval: 1, fade: 1, powerMult: 1}];
  service.advance(.1); assert.equal(released[0], actor); assert.equal(released[1], inst); assert.equal(retired.length, 0);
});

test('salvo release and its clock share the replacement queue', () => {
  let salvos = [], ambushes = []; const retired = salvos, shots = [];
  const actor = {dead: false, pos: {x: 0, y: 0}, facing: 0, sheet: {get: () => 0}, speedFactor: () => 1}, inst = {def: {id: 'salvo'}};
  const spawn = (...args) => shots.push(args);
  const release = new ProjectileDelivery(() => salvos, () => ambushes, 0, {projectilesPerCharge: () => 0, caromCapacity: () => 0, spawn});
  const clock = new ProjectileSchedules(() => salvos, () => ambushes, {timeScale: () => 1, spawn});
  salvos = [];
  release.execute({caster: actor, skill: inst, aim: {x: 50, y: 0}, delivery: {type: 'projectile', count: 2, fire: 'salvo', radius: 2},
    multiplier: 1, tags: new Set(), modifiers: [], gaugePower: 1, chargesSpent: 0, corpseFeast: 0, bonusProjectiles: 0, ventRounds: 0});
  assert.equal(retired.length, 0); assert.equal(salvos.length, 1); clock.advanceSalvos(1);
  assert.equal(shots.length, 2); assert.equal(shots[1][1], inst); assert.equal(salvos.length, 0);
});

test('ambush expiry operates on current rows without retiring old bodies twice', () => {
  const retired = [{caster: {dead: true}, arrowIds: [1]}]; let ambushes = retired; const killed = [];
  const service = new ProjectileSchedules([], () => ambushes, {actorById: id => ({id, dead: false}), time: () => 3, kill: a => killed.push(a.id)});
  ambushes = [{caster: {dead: true}, arrowIds: [2]}]; service.advanceAmbushes();
  assert.deepEqual(killed, [2]); assert.equal(retired.length, 1); assert.equal(ambushes.length, 0);
});

test('delayed blink cancellation cannot teleport from a retired queue', () => {
  const actor = {dead: false, tier: 0}, inst = {def: {id: 'blink'}}, visual = {life: 1}, retired = [{actor, inst, visual, timer: 1, dest: {x: 2, y: 0}}];
  let blinks = retired, landed = 0;
  const service = new MovementDeliveries(() => blinks, {}, {teleport: a => {assert.equal(a, actor); landed++;}, blast() {}, linger() {}});
  blinks = []; service.advanceBlinks(2); assert.equal(landed, 0);
  blinks.push({...retired[0]}); service.advanceBlinks(2); assert.equal(landed, 1); assert.equal(blinks.length, 0); assert.equal(retired.length, 1);
});

test('mine detonation uses the current queue and removes the row before callbacks', () => {
  const skill = {}, mine = {dead: false, construct: {castInst: skill}, pos: {x: 0, y: 0}, cooldowns: new Map(), maxMana: () => 8};
  let detonations = []; const retired = detonations, calls = [];
  const service = new UtilityDeliveries(() => detonations, {execute: (a, i) => {assert.equal(detonations.length, 0); assert.equal(i, skill); calls.push('execute');}, kill: () => calls.push('kill')});
  detonations = [{mine, timer: 0}]; service.advanceDetonations(0);
  assert.deepEqual(calls, ['execute', 'kill']); assert.equal(retired.length, 0);
});

test('corpse creation and targeting share the replacement roster', () => {
  let corpses = []; const retired = corpses, caster = {pos: {x: 0, y: 0}, radius: 5, tier: 0, sheet: {get: () => 0}};
  const effects = new CorpseEffects({max: 4, duration: 8, mint: {spread: 0, life: 20, lifePerLevel: 1}, batch: {aoePerExtra: 0}}, () => corpses,
    {monster: () => true, level: () => 1, random: () => .5, clamp: p => p, created() {}});
  const targeting = new CombatTargeting(() => corpses, 8, {spec: () => ({target: 'corpse', castRange: 100}), grimoire: () => undefined,
    tags: () => new Set(), modifiers: () => [], actors: () => [caster], spoilStoryAt: () => 0});
  corpses = []; effects.spawn(caster, {x: 20, y: 0}, 'skeleton', 1, new Set(), [], '#fff');
  const found = targeting.resolve(caster, {}, {x: 20, y: 0});
  assert.equal(retired.length, 0); assert.equal(found.corpse, corpses[0]); assert.equal(corpses.length, 1);
});
