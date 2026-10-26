// Native Actor/World paths; the pinned source is imported only for type checking.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import type * as arena from '../src/sim/arena';
import type {Actor} from '../src/engine/actor';
import type * as stats from '../src/engine/stats';
import type * as skills from '../src/engine/skills';
import type {BuffEffect} from '../src/engine/skills';
import type {SkillTag} from '../src/engine/stats';
import type {SKILLS} from '../src/data/skills';
import type {seedGlobalRandom} from '../src/sim/rng';

type Api = {arena: typeof arena; Actor: typeof Actor; stats: typeof stats; skills: typeof skills; SKILLS: typeof SKILLS; seedGlobalRandom: typeof seedGlobalRandom};
type Course = {name: string; actors: number; frames?: number; dt?: number; durationScale?: number; stacks?: number; callsPerActor?: number; cycles?: number; waves?: number; attemptEveryFrames?: number; quietTailFrames?: number};
type Plan = {warmups: number; samples: number; memorySamples: number; workloads: Course[]; memory: {actorCounts: number[]; states: string[]}};
const [previous, current, output, planFile] = process.argv.slice(2);
const validationOnly = process.argv.includes('--validate-only');
const plan: Plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const load = async (game: string): Promise<Api> => {
  const get = (file: string) => import(pathToFileURL(path.join(game, 'src', file + '.ts')).href);
  return {arena: await get('sim/arena'), Actor: (await get('engine/actor')).Actor, stats: await get('engine/stats'), skills: await get('engine/skills'), SKILLS: (await get('data/skills')).SKILLS, seedGlobalRandom: (await get('sim/rng')).seedGlobalRandom};
};
const apis: Record<string, Api> = {previous: await load(previous), current: await load(current)};
const comparisonAt = process.argv.indexOf('--comparison-adapter');
if (comparisonAt >= 0) apis.comparison = await load(process.argv[comparisonAt + 1]);
const orderAt = process.argv.indexOf('--order');
const keys = orderAt < 0 ? Object.keys(apis) : process.argv[orderAt + 1].split(',');
assert.deepEqual([...keys].sort(), Object.keys(apis).sort());
for (const api of Object.values(apis)) api.arena.bootSimEngine();
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const gc = (globalThis as typeof globalThis & {gc?: () => void}).gc;
assert(gc, 'Run with --expose-gc');
const collect = () => {gc!(); gc!(); return process.memoryUsage().heapUsed;};
const median = (values: number[]) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rotate = (trial: number, offset: number) => keys[((trial % keys.length) + keys.length + offset) % keys.length];
const effect = (api: Api, id: string): BuffEffect => {
  const rows = api.SKILLS[id].effects.filter((e): e is BuffEffect => e.type === 'buff');
  assert.equal(rows.length, 1, 'Expected one authored buff: ' + id);
  return rows[0];
};
const attack: SkillTag[] = ['attack'], spell: SkillTag[] = ['spell'], attackContext = new Set(attack);

function clean(api: Api, p: Actor) {
  p.sheet = new api.stats.StatSheet();
  for (const [stat, value] of [['life', 1e9], ['mana', 1e9], ['accuracy', 1e6], ['critChance', 0], ['strength', 100], ['intelligence', 100], ['willpower', 100]] as const) p.sheet.setBase(stat, value);
  p.life = 5e8; p.mana = 1e9; p.es = 0; p.poise = 0; p.ward = 0; p.insight = 0; p.endurance = 0; p.absorb = 0;
  p.tier = 0; p.radius = 10; p.level = 5; p.dead = false; p.brain = undefined; p.skills = []; p.statuses = [];
  p.charges.clear(); p.buffs.clear(); p.gainEvents = []; p.healedSince = 0; p.procReadyAt.clear(); p.procAttemptAt.clear(); p.procFiredAt.clear(); p.condRose = []; p.gasped = false;
}
function makeActor(api: Api, i: number) {
  const p = new api.Actor('buff-benchmark-' + i, 'player', {x: 700 + i, y: 700});
  clean(api, p); return p;
}
function state(p: Actor) {
  return {buffs: [...p.buffs], gains: p.gainEvents, cues: p.procCuePulses, life: p.life, mana: p.mana, es: p.es, ward: p.ward, dead: p.dead,
    damage: p.sheet.get('damage', attackContext), fire: p.sheet.get('addedFire', attackContext), attackSpeed: p.sheet.get('attackSpeed'),
    cooldowns: [...p.cooldowns], statuses: p.statuses, conditions: [...p.condRose], ready: [...p.procReadyAt], attempted: [...p.procAttemptAt], fired: [...p.procFiredAt],
    recency: [...p.since], recentHurt: p.recentHurt, casting: p.casting?.inst.def.id ?? null};
}
function setup(api: Api, c: Course) {
  const restore = api.seedGlobalRandom(0xbc41), war = effect(api, 'war_cry'), deep = effect(api, 'deep_carve'), flame = effect(api, 'flame_imbuement');
  assert.equal(deep.maxStacks, 12); assert.equal(deep.duration, 4.5); assert.equal(flame.stacksOnApply, 6);
  const isWorld = c.name.endsWith('world-frames');
  const world = isWorld ? api.arena.makeSimWorld('warrior', 0xbc41) : undefined;
  const actors: Actor[] = [];
  const count = c.actors * (c.waves ?? 1);
  for (let i = 0; i < count; i++) {
    const p = i === 0 && world ? world.player : makeActor(api, i);
    if (i === 0 && world) clean(api, p);
    actors.push(p);
  }
  if (world) {world.actors = actors; world.walk = null; world.time = 10; world.flashes = []; world.texts = []; actors[0].pos = {x: 700, y: 700};}
  for (const p of actors) {
    if (c.name === 'previously-buffed-empty-timers') {p.addBuff(war); p.removeBuff(war.id);}
    if (c.name === 'shared-live-timers') p.addBuff(war, c.durationScale);
    if (c.name === 'independent-live-timers' || c.name === 'independent-at-cap-grant') for (let i = 0; i < c.stacks!; i++) p.addBuff(deep, c.durationScale ?? 1);
    if (c.name === 'independent-mixed-expiry' || c.name === 'independent-dense-expiry') {
      for (let i = 0; i < c.stacks!; i++) p.addBuff(deep, c.name === 'independent-mixed-expiry' && i >= c.stacks! / 2 ? 1 : .1);
    }
    if (c.name === 'synthetic-large-expiry') {
      const d: BuffEffect = {...deep, id: 'synthetic-capacity', maxStacks: c.stacks, stacksOnApply: c.stacks! / 2};
      p.addBuff(d, .1); p.addBuff(d, 2);
    }
    if (c.name === 'buffed-world-frames') {p.addBuff(war); for (let i = 0; i < 12; i++) p.addBuff(deep);}
  }
  const detached = c.waves ? actors.map(p => [...p.buffs.values()][0]) : [];
  const clockArrays = detached.map(b => b.expiries);
  const initial = actors.map(p => [...p.buffs].map(([id, b]) => ({id, remaining: b.remaining, stacks: b.stacks, expiries: b.expiries?.slice()})));
  const counts = {grant: 0, publish: 0, remove: 0, consume: 0, spent: 0, releases: 0, nonmatching: 0, nonmatchingStacks: 0, fireSum: 0, timers: 0, accepted: [0, 0, 0], attempts: [0, 0, 0]};
  const grantById: Record<string, number> = {};
  for (const p of actors) {
    const grant = p.addBuff, publish = p.sheet.setSource, remove = p.sheet.removeSource, consume = p.consumeBuffStacks;
    p.addBuff = function (...args) {counts.grant++; grantById[args[0].id] = (grantById[args[0].id] ?? 0) + 1; return grant.apply(this, args);};
    p.sheet.setSource = function (...args) {if (args[0].startsWith('buff:')) counts.publish++; return publish.apply(this, args);};
    p.sheet.removeSource = function (...args) {if (args[0].startsWith('buff:')) counts.remove++; return remove.apply(this, args);};
    p.consumeBuffStacks = function (id, n = 1) {
      const before = this.buffs.get(id)?.stacks ?? 0, last = this.procCuePulses.at(-1);
      counts.consume++; const result = consume.call(this, id, n);
      counts.spent += before - (this.buffs.get(id)?.stacks ?? 0);
      const pulse = this.procCuePulses.at(-1);
      if (pulse && pulse !== last && pulse.phase === 'release') counts.releases++;
      return result;
    };
  }
  let draws = 0; const random = Math.random; Math.random = () => {draws++; return random();};
  const instances = c.name === 'casting-world-frames' ? ['war_cry', 'flame_imbuement', 'deep_carve'].map(id => api.skills.makeSkillInstance(api.SKILLS[id])) : [];
  if (instances.length) {assert(world); world.devIgnoreSkillAttributes = true; actors[0].skills = instances; actors[1].team = 'enemy'; actors[1].pos = {x: 745, y: 700};}
  const run = () => {
    if (world) {
      for (let frame = 0; frame < c.frames!; frame++) {
        if (instances.length && frame < c.frames! - c.quietTailFrames! && frame % c.attemptEveryFrames! === 0) {
          const slot = (frame / c.attemptEveryFrames!) % instances.length;
          counts.attempts[slot]++; if (world.useSkill(actors[0], instances[slot], actors[1].pos)) counts.accepted[slot]++;
        }
        world.update(1 / 60);
      }
    } else if (c.frames) {
      for (let frame = 0; frame < c.frames; frame++) for (const p of actors) {p.updateTimers(c.dt ?? 1 / 60); counts.timers++;}
    } else if (c.callsPerActor) {
      const def = c.name === 'shared-refresh' ? war : deep;
      for (let n = 0; n < c.callsPerActor; n++) for (const p of actors) p.addBuff(def);
    } else if (c.cycles) {
      for (let cycle = 0; cycle < c.cycles; cycle++) for (const p of actors) {
        p.addBuff(flame); counts.fireSum += p.sheet.get('addedFire', attackContext);
        p.spendBuffs('use', spell, 'war_cry'); counts.nonmatching++;
        counts.nonmatchingStacks += p.buffs.get(flame.id)?.stacks ?? 0;
        for (let n = 0; n < c.stacks!; n++) {p.spendBuffs('use', attack, 'deep_carve'); counts.fireSum += p.sheet.get('addedFire', attackContext);}
      }
    } else if (c.waves) {
      for (const p of actors) {p.updateTimers(1); counts.timers++;}
    } else throw Error('Unknown buff workload: ' + c.name);
  };
  const receipt = () => {
    if (c.frames && !world) assert.equal(counts.timers, c.frames * c.actors);
    if (c.name.includes('empty-timers') || c.name === 'never-buffed-timers') {assert(actors.every(p => !p.buffs.size)); assert.equal(counts.publish, 0); assert.equal(counts.grant, 0);}
    if (c.name === 'shared-live-timers') {assert(actors.every((p, i) => Math.abs(p.buffs.get(war.id)!.remaining - (initial[i][0].remaining - c.frames! * (c.dt ?? 1 / 60))) < 1e-8)); assert(actors.every(p => p.buffs.get(war.id)!.remaining > 0)); assert.equal(counts.publish, 0);}
    if (c.name === 'independent-live-timers') {assert(actors.every(p => p.buffs.get(deep.id)?.stacks === 12)); assert.equal(counts.publish, 0);}
    if (c.callsPerActor) {assert.equal(counts.grant, c.callsPerActor * c.actors); assert.equal(counts.publish, counts.grant); if (c.name === 'independent-at-cap-grant') assert.deepEqual(actors.map(p => p.buffs.get(deep.id)!.expiries), initial.map(p => p[0].expiries));}
    if (c.cycles) {assert.equal(counts.consume, c.cycles * c.actors * c.stacks!); assert.equal(counts.spent, counts.consume); assert.equal(counts.releases, counts.consume); assert.equal(counts.remove, c.cycles * c.actors); assert.equal(counts.nonmatching, c.cycles * c.actors); assert.equal(counts.nonmatchingStacks, counts.nonmatching * 6); assert.equal(counts.fireSum, c.cycles * c.actors * 168); assert(actors.every(p => !p.buffs.size));}
    if (c.waves) {
      assert.equal(counts.timers, count); assert(detached.every((b, i) => b.expiries === clockArrays[i]));
      if (c.name === 'independent-dense-expiry') {assert(actors.every(p => !p.buffs.size)); assert.equal(counts.remove, count); assert(detached.every(b => b.expiries!.length === 0));}
      else {assert(actors.every(p => [...p.buffs.values()][0].stacks === c.stacks! / 2)); assert.equal(counts.publish, count); assert(detached.every(b => b.expiries!.length === c.stacks! / 2));}
    }
    if (world) {
      assert.equal(world.actors.length, actors.length); assert(actors.every(p => !p.dead));
      if (c.name === 'quiet-world-frames') assert.equal(counts.grant + counts.publish + counts.consume, 0);
      if (c.name === 'buffed-world-frames') {assert(actors.every(p => !p.buffs.size)); assert.equal(counts.remove, c.actors * 2);}
      if (instances.length) {assert(counts.accepted.every(n => n > 0)); assert(['war_cry', 'flame_imbue', 'deep_carve'].every(id => grantById[id] > 0)); assert(counts.spent > 0); assert(actors[1].life < 5e8);}
    }
    return {name: c.name, counts, grantById, draws, actors: actors.map(state), detached,
      world: world ? {time: world.time, flashes: world.flashes, texts: world.texts, pendingBursts: world['pendingBursts'].length} : null};
  };
  return {run, receipt, restore};
}

const results: unknown[] = [];
for (const course of plan.workloads) {
  const samples: Record<string, number[]> = Object.fromEntries(keys.map(k => [k, []])); let expected = '';
  for (let trial = validationOnly ? 0 : -plan.warmups; trial < (validationOnly ? 1 : plan.samples); trial++) for (let offset = 0; offset < keys.length; offset++) {
    const key = rotate(trial, offset), prepared = setup(apis[key], course);
    try {
      collect(); const start = performance.now(); prepared.run(); const elapsed = performance.now() - start;
      const actual = JSON.stringify(prepared.receipt());
      if (!expected) expected = actual;
      else if (actual !== expected) {fs.writeFileSync(output + '.mismatch.json', JSON.stringify({course: course.name, key, expected: JSON.parse(expected), actual: JSON.parse(actual)}, null, 2)); assert.fail('Buff observation mismatch: ' + course.name + '/' + key);}
      if (trial >= 0 && !validationOnly) samples[key].push(elapsed);
    } finally {prepared.restore();}
  }
  const timings = validationOnly ? {} : Object.fromEntries(keys.map(key => {const sorted = [...samples[key]].sort((a, b) => a - b); return [key, {samplesMs: samples[key], medianMs: median(sorted), p95Ms: sorted[Math.floor(sorted.length * .95)]}];}));
  results.push({name: course.name, receipt: JSON.parse(expected), receiptSha256: digest(JSON.parse(expected)), ...timings});
  console.log((validationOnly ? 'Validated ' : 'Measured ') + course.name);
}

function memoryBatch(api: Api, count: number, mode: string) {
  let actors: Actor[] | null = Array.from({length: count}, (_, i) => makeActor(api, i));
  const war = effect(api, 'war_cry'), deep = effect(api, 'deep_carve');
  if (mode !== 'never-buffed') for (const p of actors) {
    p.addBuff(war);
    if (mode === 'previously-buffed-empty') p.removeBuff(war.id);
    else {assert.equal(mode, 'active-shared-and-independent'); for (let i = 0; i < 12; i++) p.addBuff(deep);}
  }
  const receipt = digest(actors.map(state));
  const witnesses = [0, Math.floor(count / 2), count - 1].map(i => new WeakRef(actors![i]));
  return {receipt, witnesses, release() {actors = null;}};
}
const memory: unknown[] = [];
for (const mode of plan.memory.states) for (const count of plan.memory.actorCounts) {
  const samples: Record<string, {retainedHeap: number; releasedHeap: number; retainedBytes: number; witnessesReleased: boolean}[]> = Object.fromEntries(keys.map(k => [k, []])); let expected = '';
  for (let trial = 0; trial < (validationOnly ? 1 : plan.memorySamples); trial++) for (let offset = 0; offset < keys.length; offset++) {
    const key = rotate(trial, offset), restore = apis[key].seedGlobalRandom(0xbc41);
    try {
      const batch = memoryBatch(apis[key], count, mode);
      if (!expected) expected = batch.receipt; else assert.equal(batch.receipt, expected, 'Memory workload differs: ' + mode);
      const retainedHeap = collect(); batch.release();
      await new Promise<void>(resolve => setImmediate(resolve));
      const releasedHeap = collect();
      assert(batch.witnesses.every(ref => ref.deref() === undefined), 'Released Actor witnesses remain reachable');
      if (!validationOnly) samples[key].push({retainedHeap, releasedHeap, retainedBytes: retainedHeap - releasedHeap, witnessesReleased: true});
    } finally {restore();}
  }
  memory.push({mode, count, receiptSha256: expected, witnessesReleased: true, ...(validationOnly ? {} : Object.fromEntries(keys.map(key => [key, {samples: samples[key], medianBytesPerActor: median(samples[key].map(s => s.retainedBytes)) / count}])))});
  console.log((validationOnly ? 'Validated memory ' : 'Measured memory ') + mode + '/' + count);
}
fs.writeFileSync(output, JSON.stringify({validationOnly, graphOrder: keys, node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model,
  planSha256: createHash('sha256').update(fs.readFileSync(planFile)).digest('hex'), scope: validationOnly ? 'Workload equality and release validation only. No timing or memory result.' : 'Controlled desktop Node comparison. Native paths include call-through observers. No device, renderer, FPS, allocation-volume or peak-memory claim.', results, memory}, null, 2) + '\n', {flag: 'wx'});
