import test from 'node:test';
import assert from 'node:assert/strict';
const {createProcCasting, heldProcSkill} = await import(process.env.HWE_PROC_CASTING_MODULE || '../dist/proc-casting.js');

function setup(type = 'projectile') {
  const skill = {id: 'bolt', delivery: {type}}, actor = {pos: [1, 2, 3], level: 5, skills: [], facing: {angle: .25}};
  const target = {pos: [10, 20, 30], level: 1, skills: []};
  const events = [], shots = [], executions = [], created = [], seats = new Map();
  const heldPorts = {
    instances: a => a.skills,
    seat: a => {events.push('seat'); return seats.get(a);},
    granted: (s, id) => {events.push('grant'); return s.granted.get(id);},
    learned: (s, id) => {events.push('learn'); return s.learned.get(id);},
  };
  const ports = {
    definition: id => {events.push('definition'); return id === skill.id ? skill : undefined;},
    heldInstance: (a, id) => {events.push('held'); return heldProcSkill(a, id, heldPorts);},
    effectiveLevel: i => {events.push('level'); return i.level;},
    makeInstance: (def, level, depth) => {events.push('make'); const i = {def, level, sockets: [], procChainDepth: depth}; created.push(i); return i;},
    copyPosition: p => [...p],
    direction: (from, to) => ({angle: Math.atan2(to[1] - from[1], to[0] - from[0])}),
    facing: a => a.facing, rotate: (bearing, radians) => ({angle: bearing.angle + radians}),
    ringDirection: angle => ({angle}),
    random: (min, max) => {events.push(['random', min, max]); return .5;},
    randomInt: (min, max) => {events.push(['count', min, max]); return max;},
    spawnProjectile: (a, i, from, direction, options) => {
      events.push('spawn'); shots.push({a, i, from, direction, options, hits: new Map()});
    },
    lockLastProjectile: a => {events.push('lock'); shots.at(-1).hits.set(a, Infinity);},
    executeSkill: (a, i, origin, options) => {events.push('execute'); executions.push({a, i, origin, options});},
  };
  const service = createProcCasting(ports);
  const spec = {skillId: 'bolt', count: [2, 2]};
  const cast = (changes = {}, victim = target, inst = null, aim) => service.cast(actor, inst, victim, 7, {...spec, ...changes}, aim);
  return {skill, actor, target, events, shots, executions, created, seats, heldPorts, ports, service, cast};
}

test('missing definition refuses before copying, randomness or ownership', () => {
  const h = setup(); h.ports.copyPosition = () => {throw Error('unreachable');};
  assert.equal(h.cast({skillId: 'missing'}), false); assert.deepEqual(h.events, ['definition']);
});
test('zero count captures the site and consumes the count draw, then stops', () => {
  const h = setup(); let copies = 0; h.ports.copyPosition = p => {copies++; return [...p];};
  assert.equal(h.cast({count: [0, 0], own: true}), false);
  assert.equal(copies, 1); assert.deepEqual(h.events, ['definition', ['count', 0, 0]]);
});
test('anchored ring preserves three-dimensional position and locks each launch', () => {
  const h = setup(); assert.equal(h.cast(), true);
  assert.deepEqual(h.shots.map(s => s.direction.angle), [.5, .5 + Math.PI]);
  assert.deepEqual(h.shots[0].from, [10, 20, 30]); assert.notEqual(h.shots[0].from, h.target.pos);
  assert.equal(h.shots[0].from, h.shots[1].from);
  assert(h.shots.every(s => s.hits.get(h.target) === Infinity && s.options.depth === 7));
  assert.deepEqual(h.events.slice(-5), ['spawn', 'lock', 'make', 'spawn', 'lock']);
});
test('synthetic occurrences are distinct host-created instances at the captured depth', () => {
  const h = setup(); h.cast();
  assert.notEqual(h.shots[0].i, h.shots[1].i);
  for (let n = 0; n < 2; n++) {
    assert.equal(h.shots[n].i, h.created[n]); assert.equal(h.created[n].procChainDepth, 7);
    assert.equal(h.shots[n].i.sockets, h.created[n].sockets); assert.equal(h.shots[n].i.procChainDepth, 7);
    assert.equal(h.shots[n].i.level, 3);
  }
});
test('own bar identity is reused without synthetic stamping or seat lookup', () => {
  const h = setup(); const held = {def: h.skill, level: 9, procChainDepth: 2}; h.actor.skills = [null, held];
  h.cast({own: true}); assert(h.shots.every(s => s.i === held));
  assert.equal(held.procChainDepth, 2); assert(!h.events.includes('seat')); assert.equal(h.created.length, 0);
});
test('held search preserves bar, grant, learned and unseated precedence', () => {
  const h = setup(), granted = {def: h.skill, level: 4}, learned = {def: h.skill, level: 8};
  assert.equal(heldProcSkill(h.actor, 'bolt', h.heldPorts), null);
  h.seats.set(h.actor, {granted: new Map([['bolt', granted]]), learned: new Map([['bolt', learned]])});
  h.events.length = 0; assert.equal(heldProcSkill(h.actor, 'bolt', h.heldPorts), granted);
  assert.deepEqual(h.events, ['seat', 'grant']);
  h.seats.get(h.actor).granted.clear(); assert.equal(heldProcSkill(h.actor, 'bolt', h.heldPorts), learned);
  h.actor.skills.push(granted); assert.equal(heldProcSkill(h.actor, 'bolt', h.heldPorts), granted);
});
test('own false never looks up held skills; triggering level is captured once', () => {
  const h = setup(); const trigger = {def: {id: 'trigger'}, level: 6};
  const spawn = h.ports.spawnProjectile; h.ports.spawnProjectile = (...args) => {spawn(...args); trigger.level = 99;};
  h.cast({}, h.target, trigger); assert.deepEqual(h.shots.map(s => s.i.level), [6, 6]);
  assert.equal(h.events.filter(e => e === 'level').length, 1); assert(!h.events.includes('held'));
});
test('held identity remains live between deliveries', () => {
  const h = setup(); const held = {def: h.skill, level: 4}; h.actor.skills = [held]; const levels = [];
  const spawn = h.ports.spawnProjectile; h.ports.spawnProjectile = (...args) => {levels.push(args[1].level); spawn(...args); held.level = 9;};
  h.cast({own: true}); assert.deepEqual(levels, [4, 9]);
});
test('missing owned copy falls back to the triggering instance level', () => {
  const h = setup(); h.cast({own: true}, null, {def: {id: 'source'}, level: 11});
  assert.deepEqual(h.shots.map(s => s.i.level), [11, 11]);
});
test('low-level caster fallback is at least level one', () => {
  const h = setup(); h.actor.level = 0; h.cast(); assert(h.shots.every(s => s.i.level === 1));
});
test('aimed fan leaves the hand and still consumes its unused ring phase', () => {
  const h = setup(); h.cast({spread: 90}, null, null, [1, 12, 80]);
  assert.deepEqual(h.shots.map(s => s.direction.angle), [Math.PI / 4, 3 * Math.PI / 4]);
  assert.deepEqual(h.shots[0].from, h.actor.pos); assert.notEqual(h.shots[0].from, h.actor.pos);
  assert(h.events.some(e => Array.isArray(e) && e[0] === 'random'));
  assert(h.shots.every(s => s.hits.size === 0));
});
test('unanchored ring spelling retains forward fan default', () => {
  const h = setup(); h.cast({spread: 'ring'}, null);
  assert.deepEqual(h.shots.map(s => s.direction.angle), [.25, .25]);
});
test('self changes the origin but target still supplies projectile bearing', () => {
  const h = setup(); h.cast({at: 'self', spread: 0});
  assert.deepEqual(h.shots[0].from, h.actor.pos);
  assert.equal(h.shots[0].direction.angle, Math.atan2(18, 9)); assert.equal(h.shots[0].hits.size, 0);
});
test('self-target bearing uses aim then facing; singleton fan cannot divide by zero', () => {
  const h = setup(); h.cast({count: [1, 1], spread: 90}, h.actor, null, [1, 12, 3]);
  assert.equal(h.shots[0].direction.angle, Math.PI / 2);
  h.cast({count: [1, 1], spread: 90}, h.actor); assert.equal(h.shots[1].direction.angle, .25);
});
test('zero multiplier is retained and read once for all occurrences', () => {
  const h = setup(), spec = {skillId: 'bolt', count: [2, 2], mult: 0};
  const spawn = h.ports.spawnProjectile; h.ports.spawnProjectile = (...args) => {spawn(...args); spec.mult = 8;};
  h.service.cast(h.actor, null, h.target, 7, spec);
  assert.deepEqual(h.shots.map(s => s.options.mult), [0, 0]);
});
test('target movement after the count draw cannot move the captured origin', () => {
  const h = setup(); const count = h.ports.randomInt;
  h.ports.randomInt = (...args) => {h.target.pos = [90, 90, 90]; return count(...args);};
  h.cast(); assert.deepEqual(h.shots[0].from, [10, 20, 30]);
});
test('shared launch position mutations remain visible to later occurrences', () => {
  const h = setup(), seen = []; const spawn = h.ports.spawnProjectile;
  h.ports.spawnProjectile = (...args) => {seen.push(args[2][0]); spawn(...args); args[2][0] += 5;};
  h.cast(); assert.deepEqual(seen, [10, 15]); assert.equal(h.target.pos[0], 10);
});
test('lock applies to the host last projectile after a nested spawn', () => {
  const h = setup(); const spawn = h.ports.spawnProjectile;
  h.ports.spawnProjectile = (...args) => {spawn(...args); h.shots.push({hits: new Map()});};
  h.cast({count: [1, 1]}); assert.equal(h.shots[0].hits.size, 0); assert.equal(h.shots[1].hits.get(h.target), Infinity);
});
test('centered delivery shares origin but gives each call its own target info', () => {
  const h = setup('nova'); h.cast({mult: .5});
  const [a, b] = h.executions; assert.equal(a.origin, b.origin); assert.notEqual(a.options.targetInfo.pos, b.options.targetInfo.pos);
  assert.notEqual(a.origin, a.options.targetInfo.pos); assert.deepEqual(a.origin, h.target.pos);
  assert.deepEqual(a.options, {targetInfo: {pos: [10, 20, 30]}, dmgMult: .5, noCooldown: true, noRepeat: true, noFollowUp: true, keepFacing: true});
  assert(!h.events.some(e => Array.isArray(e) && e[0] === 'random'));
});
test('centered aim and self positioning preserve copy ownership', () => {
  const h = setup('instant'), aim = [30, 40, 50]; h.cast({}, null, null, aim);
  assert.deepEqual(h.executions[0].origin, aim); assert.notEqual(h.executions[0].origin, aim);
  h.cast({at: 'self'}, h.target, null, aim); assert.deepEqual(h.executions[2].origin, h.actor.pos);
});
test('callback failure keeps prior delivery and skips later locks or shots', () => {
  const h = setup(), error = Error('host failure'); const spawn = h.ports.spawnProjectile;
  h.ports.spawnProjectile = (...args) => {spawn(...args); throw error;};
  assert.throws(() => h.cast(), e => e === error); assert.equal(h.shots.length, 1); assert.equal(h.shots[0].hits.size, 0);
});
test('reentrant casting retains each invocation origin, depth and magnitude', () => {
  const h = setup('nova'); const execute = h.ports.executeSkill; let nested = false;
  h.ports.executeSkill = (...args) => {execute(...args); if (!nested) {nested = true; h.service.cast(h.actor, null, null, 12, {skillId: 'bolt', count: [1, 1], mult: 0}, [9, 8, 7]);}};
  h.cast({mult: .5}); assert.deepEqual(h.executions.map(e => [e.i.procChainDepth, e.options.dmgMult, e.origin]), [[7, .5, [10, 20, 30]], [12, 0, [9, 8, 7]], [7, .5, [10, 20, 30]]]);
});

test('opaque class instances preserve prototype methods and private state', () => {
  const h = setup();
  class Instance {
    #depth;
    constructor(def, level, depth) {this.def = def; this.level = level; this.#depth = depth;}
    chainDepth() {return this.#depth;}
  }
  h.ports.makeInstance = (def, level, depth) => new Instance(def, level, depth);
  h.cast();
  for (const shot of h.shots) {assert(shot.i instanceof Instance); assert.equal(shot.i.chainDepth(), 7);}
  assert.notEqual(h.shots[0].i, h.shots[1].i);
});
test('hosts may use numeric instance handles backed by their own tables', () => {
  const h = setup(), records = new Map(); let next = 20;
  h.ports.makeInstance = (def, level, depth) => {const id = ++next; records.set(id, {def, level, depth}); return id;};
  h.cast(); assert.deepEqual(h.shots.map(s => s.i), [21, 22]);
  assert.deepEqual([...records.values()].map(r => [r.level, r.depth]), [[3, 7], [3, 7]]);
});
test('zero-valued held and triggering handles retain their effective level lookup', () => {
  const h = setup(), levels = []; h.ports.heldInstance = () => 0;
  h.ports.effectiveLevel = id => {levels.push(id); return 11;};
  h.cast({own: true}); assert(h.shots.every(s => s.i === 0)); assert.deepEqual(levels, [0]);
  h.cast({}, null, 0); assert.deepEqual(levels, [0, 0]); assert(h.shots.slice(2).every(s => s.i.level === 11));
});
test('zero is a valid seat identity for the held-copy helper', () => {
  const h = setup(), held = {def: h.skill, level: 4};
  h.heldPorts.seat = () => 0;
  h.heldPorts.granted = seat => {assert.equal(seat, 0); return held;};
  h.heldPorts.learned = () => {throw Error('Must not inspect learned copies');};
  assert.equal(heldProcSkill(h.actor, 'bolt', h.heldPorts), held);
});
test('zero is a valid scalar aim for centered delivery and projectile bearing', () => {
  for (const type of ['nova', 'projectile']) {
    const h = setup(type); h.actor.pos = 5;
    h.ports.copyPosition = p => p; h.ports.direction = (from, to) => ({angle: to - from});
    h.cast({}, null, null, 0);
    if (type === 'nova') assert(h.executions.every(e => e.origin === 0 && e.options.targetInfo.pos === 0));
    else assert(h.shots.every(s => s.from === 5 && s.direction.angle === -5));
  }
});
