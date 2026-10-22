import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {GuardCasting, guardBashReady, guardAiHold, guardDuration} from '../dist/guard-casting.js';
const fixture = JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twenty-eight/guard-casting.json.gz', import.meta.url))));
const wire = value => JSON.parse(JSON.stringify(value));
const config = {beatInterval: 1, releaseFloor: .25, armTime: 1};
const state = () => ({mode: 'guard', held: true, channelTime: 0, shield: 60, maxShield: 60});
function ports(overrides = {}) {
  return {
    spec: () => ({}), seated: () => true, holdBonus: () => 0, aim: () => {},
    bash: () => ({}), context: () => undefined, bashStat: (_a, _c, key) => key === 'bashInvert' ? 0 : 1,
    supports: () => {}, trigger: () => {}, pulse: () => {}, dead: a => !!a.dead,
    time: () => 0, facing: () => 0, plantUntil: () => {}, lower: () => {},
    end: (a, _s, recovery) => { a.cast = null; a.recovery = recovery; }, cleanup: () => {},
    cooldown: () => 0, stampCooldown: () => {}, deliverBash: () => {}, ...overrides,
  };
}
const scalar = value => value ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'aim').map(([k, v]) => [k, v ?? null])) : null;
test('guard readiness matches 284 original observations', () => {
  assert.equal(fixture.readiness.length, 284);
  for (const row of fixture.readiness) assert.deepEqual(guardBashReady(row.input), row.result, JSON.stringify(row.input));
});
test('guard lifecycle phases reproduce original hold, pulse and release decisions', () => {
  let comparisons = 0;
  for (const course of fixture.courses) {
    // Native arts, reactive buffs, AI and shared interruption are separately
    // exercised through the installed full-game differential course.
    if (course.ai || course.name.startsWith('native') || course.name.includes('guard-beat') || course.name.includes('stun')) continue;
    for (const step of course.steps) {
      if (!step.terms || !step.beforeCast?.cast) continue;
      const terms = step.terms, actor = structuredClone(step.beforeCast);
      actor.cast = Object.fromEntries(Object.entries(actor.cast).map(([k, v]) => [k, v ?? undefined]));
      const calls = [], runtime = new GuardCasting(ports({
        spec: () => terms.spec, seated: () => terms.seat, holdBonus: () => terms.holdTime,
        bash: () => terms.bash, bashStat: (_a, _c, key) => terms[{bashFloor: 'floor', bashInvert: 'invert', bashArmTime: 'armTime'}[key]],
        supports: () => calls.push({kind: 'supports'}), trigger: a => calls.push({kind: 'trigger', event: 'guardBeat', casting: !!a.cast}),
        pulse: (_a, _s, skill) => calls.push({kind: 'execute', skill}),
        lower: a => calls.push({kind: 'lower', casting: !!a.cast}),
        cooldown: () => terms.cooldown, stampCooldown: (a, _s, duration) => calls.push({kind: 'cooldown', duration, casting: !!a.cast}),
        deliverBash: (a, _s, _b, payload) => calls.push({kind: 'bash', payload, casting: !!a.cast}),
      }), config);
      runtime.advance(actor, actor.cast, step.command.dt);
      const expected = step.calls.filter(c => ['supports', 'lower', 'cooldown', 'bash'].includes(c.kind)
        || c.kind === 'trigger' && c.event === 'guardBeat' || c.kind === 'execute' && c.skill === 'taunt_pulse')
        .map(c => c.kind === 'supports' ? {kind: c.kind} : c.kind === 'execute' ? {kind: c.kind, skill: c.skill}
          : {kind: c.kind, ...(c.kind === 'trigger' ? {event: c.event} : c.kind === 'cooldown' ? {duration: c.duration} : c.kind === 'bash' ? {payload: c.payload} : {}), casting: !!c.before.cast});
      const label = course.name + '/' + course.steps.indexOf(step);
      assert.deepEqual(calls, expected, label + ' effects');
      assert.deepEqual(scalar(actor.cast), scalar(step.after.cast), label + ' cast');
      assert.equal(actor.recovery, step.after.recovery, label + ' recovery');
      comparisons++;
    }
  }
  assert(comparisons >= 60, `Only ${comparisons} lifecycle phases compared`);
});
test('release lowers active arts before rereading bash and shield; cleanup precedes cooldown and delivery', () => {
  const actor = {cast: state()}, order = [];
  actor.cast.held = false; actor.cast.channelTime = 1;
  let bash = {name: 'old'}, runtime;
  runtime = new GuardCasting(ports({
    bash: () => bash,
    lower: (a, s) => { assert.equal(a.cast, s); order.push('lower'); s.shield = 30; bash = {name: 'new'}; },
    end: (a, _s, recovery) => { order.push('end'); a.cast = null; a.recovery = recovery; },
    cleanup: a => { assert.equal(a.cast, null); order.push('cleanup'); },
    cooldown: () => 5,
    stampCooldown: (a, _s, duration) => { assert.equal(a.cast, null); assert.equal(duration, 5); order.push('cooldown'); },
    deliverBash: (a, _s, actual, payload) => { assert.equal(a.cast, null); assert.equal(actual.name, 'new'); assert.equal(payload, 30); order.push('bash'); },
  }), config);
  runtime.advance(actor, actor.cast, 0);
  assert.deepEqual(order, ['lower', 'end', 'cleanup', 'cooldown', 'bash']); assert.equal(actor.recovery, .2);
});
test('guard refresh precedes reactive effects and entry duration stays fixed for this update', () => {
  const actor = {cast: state()}, spec = {maxDuration: 1}, stats = {floor: 1, duration: 0}; let emitted = 0;
  const runtime = new GuardCasting(ports({
    spec: () => spec, holdBonus: () => stats.duration,
    bashStat: (_a, _c, key) => key === 'bashFloor' ? stats.floor : key === 'bashInvert' ? 0 : 1,
    trigger: () => { stats.floor = 2; stats.duration = 4; },
    deliverBash: (_a, s) => { assert.equal(s.bashAt, .25); emitted++; },
  }), config);
  runtime.advance(actor, actor.cast, 1);
  assert.equal(actor.cast, null); assert.equal(emitted, 1);
  actor.cast = state(); runtime.refresh(actor, actor.cast); assert.equal(actor.cast.bashAt, .5);
  runtime.advance(actor, actor.cast, 1); assert(actor.cast);
});
test('AI warning commits once, holds through windup, and pressure can deny the bash', () => {
  const actor = {cast: {...state(), aiHold: .25, aiGuardWindup: .2}}, planted = []; let now = 0, bashes = 0;
  const runtime = new GuardCasting(ports({seated: () => false, time: () => now,
    plantUntil: (_a, deadline) => planted.push(deadline), facing: () => 2,
    deliverBash: () => bashes++,
  }), config);
  now = .8; runtime.advance(actor, actor.cast, .8);
  assert.equal(actor.cast.aiGuardReleaseAt, 1); assert.equal(actor.cast.aiGuardFacing, 2); assert.deepEqual(planted, [1]);
  assert.equal(guardAiHold(actor.cast), 1);
  actor.cast.shield = 6; now = .9; runtime.advance(actor, actor.cast, .1); assert(actor.cast.held);
  now = 1; runtime.advance(actor, actor.cast, .1); assert.equal(actor.cast, null); assert.equal(bashes, 0); assert.deepEqual(planted, [1]);
  assert.equal(guardAiHold({...state(), aiHold: .1, bashAt: .25, bashArmAt: 1}), 1);
  assert.equal(guardAiHold({...state(), aiHold: .1, bashAt: .25, bashArmAt: 1, aiGuardEarly: true}), .1);
  assert.equal(guardAiHold({...state(), mode: 'channel', aiHold: .1, bashAt: .25, bashArmAt: 1}), .1);
  assert.equal(guardAiHold(state()), Infinity);
});
test('component pulses retain carry and still precede cleanup on release or death', () => {
  for (const dead of [false, true]) {
    const actor = {cast: state(), dead: false}, calls = [];
    const runtime = new GuardCasting(ports({spec: () => ({pulse: {interval: 1.75, skillId: 'mend'}}),
      pulse: (a, _s, skill) => { assert(a.cast); calls.push(skill); }, lower: () => calls.push('lower'),
    }), config);
    runtime.advance(actor, actor.cast, 5); assert.equal(actor.cast.guardPulseT, -1.5); assert.deepEqual(calls, ['mend']);
    actor.dead = dead; actor.cast.held = false; runtime.advance(actor, actor.cast, 0);
    assert.deepEqual(calls, ['mend', 'mend', 'lower']); assert.equal(actor.cast, null);
  }
});
test('one binding isolates borrowed actors; missing bash clears obsolete readiness', () => {
  const a = {cast: state()}, b = {cast: state()}; let enabled = true;
  const runtime = new GuardCasting(ports({bash: () => enabled ? {} : undefined}), config);
  runtime.advance(a, a.cast, .25); runtime.advance(b, b.cast, .75);
  assert.equal(a.cast.channelTime, .25); assert.equal(b.cast.channelTime, .75);
  enabled = false; runtime.refresh(a, a.cast);
  assert.equal(a.cast.bashAt, undefined); assert.equal(a.cast.bashLow, undefined); assert.equal(a.cast.bashArmAt, undefined);
  assert.equal(b.cast.bashAt, .25); assert(!guardBashReady(a.cast).ready);
});
test('invalid frames and reentry fail explicitly; completed effects are not rolled back', () => {
  const actor = {cast: state()}, copy = wire(actor); let runtime;
  runtime = new GuardCasting(ports({supports: (a, s) => { s.shield = 42; runtime.refresh(a, s); }}), config);
  assert.throws(() => runtime.advance(actor, actor.cast, NaN), /finite/); assert.deepEqual(actor, copy);
  assert.throws(() => runtime.advance(actor, actor.cast, .5), /Reentrant/); assert.equal(actor.cast.shield, 42); assert.equal(actor.cast.channelTime, .5);
  runtime.refresh(actor, actor.cast); // the reentry lock is cleared after an exception
  assert.throws(() => new GuardCasting(ports(), {...config, beatInterval: 0}), /positive/);
  assert.throws(() => new GuardCasting(ports({lower: null}), config), /lower port/);
  assert.throws(() => guardDuration(1, Infinity), /finite/); assert.equal(guardDuration(.6, -5), .05);
  assert.throws(() => guardBashReady({channelTime: -1}), /nonnegative/);
});
