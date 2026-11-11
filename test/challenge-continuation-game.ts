import {copyChallengeState} from '@hollow-wake/engine/combat/challenge-continuation';
// Closed component fixture, not a production World copier. Each comparison
// uses fresh disposable simulation worlds so the original actor-ID mint and
// seeded RNG start at the same episode boundary, including future device births.
import assert from 'node:assert/strict';
import {bootSimEngine, makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {makeSkillInstance, type SkillInstance} from '../src/engine/skills';
import {challengeDelivery} from '../src/engine/challengeSpec';
import {mod} from '../src/engine/stats';

bootSimEngine();
const borrowed = new Map<object, number>();
function content(value: unknown): void {
  if (!value || typeof value !== 'object' || borrowed.has(value)) return;
  borrowed.set(value, borrowed.size);
  for (const d of Object.values(Object.getOwnPropertyDescriptors(value))) {assert(!d.get && !d.set); content(d.value);}
}
for (const value of [...Object.values(SKILLS), ...Object.values(SUPPORTS)]) content(value);
function seeded<T>(seed: number, fn: () => T): T {
  const restore = seedGlobalRandom(seed); try {return fn();} finally {restore();}
}
type Mode = 'ready' | 'retired' | 'flight' | 'device' | 'echoes';
function setup(mode: Mode) {
  return seeded(0x7760, () => {
    const w = makeSimWorld('tamer', 0x7760), p = w.player;
    const t = new Actor('Continuation target', 'enemy', {x: p.pos.x + 20, y: p.pos.y});
    t.tier = p.tier; t.sheet.setSource('rig', [mod('life', 'flat', 100000), mod('evasion', 'override', 0), mod('blockChance', 'override', 0)]); t.fillResources();
    w.actors = [p, t]; w.walk = null; w.time = 2; p.buffs.clear();
    p.sheet.setSource('rig', [mod('accuracy', 'override', 100000), mod('critChance', 'override', 0)]);
    const host = makeSkillInstance(SKILLS.goad, 20);
    host.treeNodes = mode === 'ready' || mode === 'retired'
      ? ['barbed_challenge', 'ready_challenge', 'cheap_challenge', 'swift_challenge', 'deep_barb', 'patient_barb', 'feeding_barb']
      : ['pack_challenge', 'seeking_challenge', 'large_challenge', 'piercing_challenge'];
    p.skills = [host]; const cast = w.challenges.prepare(p, host, true), retained = [host, cast];
    if (mode === 'ready' || mode === 'retired') {
      w.challenges.completed(p, cast); retained.push(w.challenges.prepare(p, host, true));
      w.challenges.afterHit(p, retained[2], t, 10, 0, 1);
      retained.push(...w.projectiles.map(q => q.inst));
      if (mode === 'retired') {w.challenges.clearAll(); retained.push(w.challenges.prepare(p, host, false));}
    } else {
      w.challenges.toss(p, cast, t.pos, challengeDelivery(host)!, 2);
      w.challenges.update(mode === 'flight' ? 0.05 : 0.2);
      if (mode !== 'flight') {
        const e = (w.challenges as any).effigies[0]; assert(e?.creeper);
        t.applyStatus('taunted', 0, 2, 'Diagnostic device call', {casterId: e.body.id});
        const random = Math.random; Math.random = () => 0;
        try {w.challenges.afterHit(e.body, e.body.construct.castInst, t, 1, 0, 1);} finally {Math.random = random;}
        assert.equal((w.challenges as any).shocks.length, 1);
        if (mode === 'echoes') {w.time = (w.challenges as any).shocks[0].due; w.challenges.update(0);}
      }
    }
    return {w, p, t, host, retained, mode};
  });
}
type Fixture = ReturnType<typeof setup>;
const actorKeys = ['id', 'life', 'mana', 'es', 'level', 'dead', 'downed', 'tier', 'team', 'name', 'radius', 'facing',
  'lifespan', 'untargetable', 'invulnerable', 'passive', 'noBounty', 'color', 'shape', 'look', 'pos', 'skills',
  'statuses', 'cooldowns', 'cooldownTotals', 'skillRecoveryLocks', 'buffs', 'charges', 'owner', 'construct', 'summonInst', 'sourceSkillId'] as const;
function handles(h: Fixture) {
  const skills: SkillInstance[] = [];
  const add = (i: SkillInstance) => {if (skills.includes(i)) return; skills.push(i); if (i.challengeHost) add(i.challengeHost);};
  for (const i of h.retained) add(i);
  for (const a of h.w.actors) {for (const i of a.skills) if (i) add(i); if (a.construct?.castInst) add(a.construct.castInst); if (a.summonInst) add(a.summonInst);}
  for (const q of [...h.w.projectiles, ...h.w.zones, ...h.w.pendingRepeats, ...h.w.pendingFuses]) add(q.inst);
  const c = h.w.challenges as any;
  for (const l of c.landings) add(l.cast.inst); for (const e of c.effigies) add(e.cast.inst);
  return skills;
}
function pack(value: unknown, seen = new Map<object, number>()): unknown {
  if (value === undefined) return {undefined: true};
  if (typeof value === 'number' && !Number.isFinite(value)) return {number: String(value)};
  if (value === null || typeof value !== 'object') {assert.notEqual(typeof value, 'function'); return value;}
  if (value instanceof Actor) return {actor: value.id};
  if (borrowed.has(value)) return {content: borrowed.get(value)};
  if (seen.has(value)) return {ref: seen.get(value)}; seen.set(value, seen.size);
  if (value instanceof Map) return {map: [...value].map(([k, v]) => [pack(k, seen), pack(v, seen)])};
  if (value instanceof Set) return {set: [...value].map(v => pack(v, seen))};
  if (Array.isArray(value)) return value.map(v => pack(v, seen));
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pack(v, seen)]));
}
function capture(h: Fixture) {
  const c = h.w.challenges as any, skills = handles(h);
  return pack({time: h.w.time, skills, roster: h.w.actors,
    actors: h.w.actors.map(a => ({state: Object.fromEntries(actorKeys.map(k => [k, a[k]])),
      sources: a.sheet.sourceNames().map(k => [k, a.sheet.getSourceMods(k)])})),
    controller: {states: [...c.states], casts: skills.map(i => c.casts.get(i)), landings: c.landings, effigies: c.effigies, shocks: c.shocks},
    projectiles: h.w.projectiles, zones: h.w.zones, repeats: h.w.pendingRepeats, fuses: h.w.pendingFuses, flashes: h.w.flashes});
}
function detach(source: Fixture): Fixture {
  const before = capture(source), w = seeded(0x7760, () => makeSimWorld('tamer', 0x7760)); w.walk = null;
  assert.equal(source.w.pendingSalvos.length + source.w.pendingSteps.length + source.w.pendingFollowUps.length, 0, 'Other carriers require separate admission');
  const actors = new Map(source.w.actors.map(a => [a, a === source.p ? w.player : new Actor(a.name, a.team, {...a.pos})]));
  const copies = new Map<object, any>(actors);
  function copy<T>(value: T): T {
    if (value === null || typeof value !== 'object') {assert.notEqual(typeof value, 'function', 'Unadmitted callback'); return value;}
    if (copies.has(value)) return copies.get(value); if (borrowed.has(value)) return value;
    let result: any;
    if (value instanceof Map) {result = new Map(); copies.set(value, result); for (const [k, v] of value) result.set(copy(k), copy(v)); return result;}
    if (value instanceof Set) {result = new Set(); copies.set(value, result); for (const v of value) result.add(copy(v)); return result;}
    assert(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype, 'Unadmitted class or actor');
    result = Array.isArray(value) ? [] : {}; copies.set(value, result); assert.equal(Object.getOwnPropertySymbols(value).length, 0);
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      assert(!d.get && !d.set, 'Unadmitted accessor'); if (k === 'length' && Array.isArray(value)) continue;
      Object.defineProperty(result, k, {...d, value: copy(d.value)});
    }
    if (Array.isArray(value)) result.length = value.length; return result;
  }
  const skills = new Map(handles(source).map(i => [i, copy(i)]));
  for (const [a, b] of actors) {
    for (const key of actorKeys) (b as any)[key] = copy(a[key]);
    for (const id of b.sheet.sourceNames()) b.sheet.removeSource(id);
    for (const id of a.sheet.sourceNames()) b.sheet.setSource(id, copy(a.sheet.getSourceMods(id)!));
    const sheet = a.sheet as any;
    for (const [id, value] of sheet.baseOverrides) b.sheet.setBase(id, value);
    b.sheet.setConditions([...sheet.conditions]); b.sheet.setGauges([...sheet.gauges]);
  }
  w.actors = copy(source.w.actors); w.time = source.w.time; w.flashes = copy(source.w.flashes);
  w.projectiles = copy(source.w.projectiles); w.zones = copy(source.w.zones);
  w.pendingRepeats = copy(source.w.pendingRepeats); w.pendingFuses = copy(source.w.pendingFuses);
  const target = {w, p: actors.get(source.p)!, t: actors.get(source.t)!, host: skills.get(source.host)!, retained: copy(source.retained), mode: source.mode};
  copyChallengeState(source.w.challenges, w.challenges, {actors, skills, spec: copy, point: copy, delivery: copy});
  assert.deepEqual(capture(source), before); assert.deepEqual(capture(target), before); return target;
}
function course(h: Fixture) {
  const rows: unknown[] = [];
  const step = (fn: () => void) => {seeded(0x7770 + rows.length, fn); rows.push(capture(h));};
  if (h.mode === 'ready' || h.mode === 'retired') {
    step(() => h.w.challenges.beforeEffects(h.p, h.retained[2], h.t, 10, 0));
    step(() => h.w.challenges.afterHit(h.p, h.retained[2], h.t, 10, 0, 1));
    step(() => {h.w.time = 12; h.w.challenges.completed(h.p, h.retained[1]);});
  } else {
    step(() => {h.w.time += 0.2; h.w.challenges.update(0.2);});
    step(() => {const shock = (h.w.challenges as any).shocks[0]; if (shock) h.w.time = shock.due - 0.001; h.w.challenges.update(0);});
    step(() => {const shock = (h.w.challenges as any).shocks[0]; if (shock) h.w.time = shock.due; h.w.challenges.update(0);});
  }
  step(() => h.w.challenges.clearAll());
  step(() => {h.w.time += 2; h.w.challenges.update(0.2);});
  step(() => {assert.equal(h.w.challenges.prepare(h.p, h.retained[1], true), h.retained[1]);});
  return rows;
}
let stages = 0;
for (const mode of ['ready', 'retired', 'flight', 'device', 'echoes'] as const) {
  const source = setup(mode), before = capture(source), target = detach(source);
  const actual = course(target); assert.deepEqual(capture(source), before, 'Private continuation changed its source');
  const control = setup(mode); assert.deepEqual(capture(control), before, 'Fresh control differs from the copied checkpoint');
  assert.deepEqual(actual, course(control), 'Copied challenge continuation differs from uninterrupted control'); stages += actual.length;
}
assert.equal(stages, 30);
console.log('Challenge private continuation: 5 courses, 30 stages passed');
