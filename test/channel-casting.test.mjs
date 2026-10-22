import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {ChannelCasting, channelInterval, channelWindup, channelRamp, channelCurve, advanceChannelPersistence} from '../dist/channel-casting.js';
const wire = value => JSON.parse(JSON.stringify(value));
const fixture = JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twenty-seven/channel-casting.json.gz', import.meta.url))));
const state = () => ({total: .5, held: true, baseMult: 1, channelTime: 0, pulseTimer: .5});
function host(overrides = {}) {
  return {
    spec: () => ({interval: .5}), dead: actor => !!actor.dead,
    stat: (_a, _s, key) => key === 'effectDuration' ? 1 : 1, speed: () => 1,
    brim: actor => actor.bank ??= {fill: 0}, releaseBrim: actor => actor.bank,
    trigger: () => {}, tapFinish: () => {}, rune: () => {}, aim: () => true,
    end: (actor, _s, recovery) => { actor.cast = null; actor.recovery = recovery; },
    cooldown: () => 0, stampCooldown: () => {}, releaseEffects: () => {},
    release: () => {}, persist: () => {}, supports: () => {}, target: () => undefined,
    context: () => undefined, cost: () => ({mana: 4, life: 0}),
    canAfford: (a, c) => a.mana >= c.mana && a.life > c.life,
    pay: (a, _s, c) => { a.mana -= c.mana; a.life -= c.life; }, random: () => .5,
    pulseStat: () => 0, construct: () => false, pulse: () => {}, cue: () => {}, ...overrides,
  };
}
const payloadKeys = ['dmgMult', 'aoeMult', 'arcMult', 'bonusProjectiles', 'paidCost', 'noCooldown'];
const payload = x => Object.fromEntries(payloadKeys.filter(k => x[k] !== undefined).map(k => [k, x[k]]));
const scalarState = x => x ? Object.fromEntries(Object.entries(x).filter(([k]) => !['aim', 'lockedAim', 'gather'].includes(k)).map(([k, v]) => [k, v ?? null])) : null;
test('channel phases reproduce original clocks, prices, ramps, release and persistence', () => {
  let comparisons = 0;
  for (const course of fixture.courses) {
    // These are isolated lifecycle courses. Native effects and triggered buffs
    // are compared separately in the installed full-game differential course.
    if (course.name.startsWith('native') || course.name.includes('trigger-changes')) continue;
    for (const step of course.steps) {
      if (!step.terms || step.terms.stunned) continue;
      const before = step.beforeCast, terms = step.terms;
      const actor = {...structuredClone(before), cast: Object.fromEntries(Object.entries(before.cast).map(([k, v]) => [k, v ?? undefined]))};
      actor.cast.gather = terms.gather;
      actor.bank = actor.brims[0];
      const calls = [], draws = [];
      const execution = (a, options) => calls.push({kind: 'execute', options: payload(options), cast: !!a.cast, recovery: a.recovery});
      const runtime = new ChannelCasting(host({
        spec: () => terms.channel, stat: (_a, _s, key) => terms.stats[key], speed: () => terms.speed,
        brim: a => { if (!a.bank) { a.bank = {id: course.skill, fill: 0}; a.brims.push(a.bank); } return a.bank; },
        trigger: (a, s, on) => calls.push(wire({kind: 'trigger', on, cast: !!a.cast, held: s.held, hitCap: s.hitCap})),
        tapFinish: () => calls.push({kind: 'tap', on: 'channelFinish'}),
        cooldown: () => terms.cooldown,
        stampCooldown: (a, _s, value) => { const map = new Map(a.cooldowns); map.set(course.skill, value); a.cooldowns = [...map]; },
        release: (a, _s, _track, options) => execution(a, options),
        persist: (a, _s, plan) => a.persists.push(plan),
        supports: () => calls.push({kind: 'supports'}), target: () => terms.targeting,
        cost: () => structuredClone(terms.cost),
        pay: (a, _s, cost) => { calls.push(wire({kind: 'pay', cost, before: {mana: a.mana, life: a.life}, cast: !!a.cast})); a.mana -= cost.mana; a.life -= cost.life; },
        random: () => { const n = step.draws[draws.length]; draws.push(n); return n; },
        pulseStat: (_a, _c, key) => terms.stats[key], construct: () => terms.construct,
        pulse: (a, _s, _track, _target, options) => execution(a, {...options, noCooldown: true}),
      }), terms.beatInterval);
      runtime.advance(actor, actor.cast, step.command.dt);
      const expected = step.calls.filter(c => ['execute', 'pay', 'supports'].includes(c.kind)
        || (c.kind === 'trigger' && ['channelBeat', 'channelFinish'].includes(c.on)) || (c.kind === 'tap' && c.on === 'channelFinish'))
        .map(c => c.kind === 'execute' ? {kind: c.kind, options: payload(c.options), cast: c.cast, recovery: c.recovery} : c);
      const label = course.name + '/' + course.steps.indexOf(step);
      assert.deepEqual(calls, expected, label + ' calls');
      assert.deepEqual(scalarState(actor.cast), scalarState(step.after.cast), label + ' state');
      assert.equal(actor.recovery, step.after.recovery, label + ' recovery');
      assert.equal(actor.mana, step.after.mana, label + ' mana'); assert.equal(actor.life, step.after.life, label + ' life');
      assert.deepEqual(actor.brims, step.after.brims, label + ' bank');
      assert.deepEqual(actor.persists, step.after.persists, label + ' persists');
      // Full delivery can stamp its own cooldown; compare end-clock policy only.
      if (terms.channel.cooldownOnEnd) assert.deepEqual(actor.cooldowns, step.after.cooldowns, label + ' cooldown');
      comparisons++;
    }
  }
  assert.equal(comparisons, 79); console.log('Compared ' + comparisons + ' original channel phases.');
});

test('phase reads observe trigger and payment changes without replacing captured context', () => {
  const actor = {cast: state(), mana: 30, life: 10, ramp: 0}, events = [], initialContext = {modifier: 1};
  const runtime = new ChannelCasting(host({
    context: () => { events.push('context'); return initialContext; },
    trigger: (a, _s, event) => { events.push(event); a.ramp = .5; },
    cost: () => { events.push('quote'); return {mana: 4, life: 0}; },
    pay: (a, _s, c) => { events.push('pay'); a.mana -= c.mana; a.ramp = 1; },
    pulseStat: (a, ctx, key) => { assert.equal(ctx, initialContext); return key === 'channelRamp' ? a.ramp : 0; },
    pulse: (_a, _s, _t, _target, options) => events.push(options.dmgMult),
  }), .5);
  runtime.advance(actor, actor.cast, .5);
  assert.deepEqual(events, ['channelBeat', 'context', 'quote', 'pay', 1.5]);
  const capped = {cast: state(), mana: 30, life: 10, fill: 1};
  const capRuntime = new ChannelCasting(host({
    spec: () => ({interval: .5, maxHold: .5, brim: {fillTime: 2, spend: false}, release: {pulses: false}}),
    stat: (a, _s, key) => key === 'brimFill' ? a.fill : 1,
    trigger: (a, s, event) => { if (event === 'channelFinish') { assert(s.finishRolled && s.hitCap && !s.held); a.fill = 2; } },
  }), .5);
  capRuntime.advance(capped, capped.cast, .5); assert.equal(capped.bank.fill, .5);
});

test('failed target and unfunded pulse do not consume jitter; payment precedes draw', () => {
  const actor = {cast: state(), mana: 0, life: 1}, events = [];
  let missing = true;
  const runtime = new ChannelCasting(host({
    spec: () => ({interval: .5, intervalJitter: [.5, 1.5]}), target: () => missing ? null : undefined,
    pay: () => events.push('pay'), random: () => { events.push('draw'); return 0; },
    pulse: () => events.push('pulse'),
  }), .5);
  runtime.advance(actor, actor.cast, .5); assert.equal(actor.cast.held, true); assert.equal(actor.cast.pulseTimer, .5);
  missing = false; runtime.advance(actor, actor.cast, .5); assert.equal(actor.cast.held, false); assert.deepEqual(events, []);
  assert(actor.cast); runtime.advance(actor, actor.cast, 0); assert.equal(actor.cast, null);
  actor.cast = state(); actor.mana = 4; runtime.advance(actor, actor.cast, .5);
  assert.deepEqual(events, ['pay', 'draw', 'pulse']); assert.equal(actor.cast.pulseTimer, .25);
});

test('bounded beats preserve carry, interleaved actors and one finish', () => {
  const a = {cast: state(), mana: 100, life: 10}, b = {cast: state(), mana: 100, life: 10};
  const events = [];
  const runtime = new ChannelCasting(host({trigger: (a, _s, e) => events.push([a, e]), pulse: a => events.push([a, 'pulse'])}), .5);
  runtime.advance(a, a.cast, 5); runtime.advance(b, b.cast, .25);
  assert.equal(a.cast.pulseTimer, -4); assert.equal(a.cast.trigBeat, -4); assert.equal(b.cast.pulseTimer, .25);
  assert.deepEqual(events, [[a, 'channelBeat'], [a, 'pulse']]);
  runtime.advance(a, a.cast, 0); assert.equal(a.cast.pulseTimer, -3.5); assert.equal(a.mana, 92);
  const c = {cast: state(), mana: 10, life: 10}; let finishes = 0;
  new ChannelCasting(host({spec: () => ({interval: .5, maxHold: 1, brim: {fillTime: 1, autoRelease: true}}),
    trigger: (_a, _s, event) => { if (event === 'channelFinish') finishes++; }}), .5).advance(c, c.cast, 1);
  assert.equal(finishes, 1); assert.equal(c.cast, null);
});

test('release clears casting before effects and preserves the initial target reference', () => {
  const a = {cast: {...state(), held: false}, mana: 10, life: 10}, initial = {id: 'marked'}, events = [];
  new ChannelCasting(host({spec: () => ({interval: .5, cooldownOnEnd: true, release: {}}), cooldown: () => 2,
    stampCooldown: (a, _s, d) => { assert.equal(a.cast, null); events.push(['clock', d]); },
    releaseEffects: a => { assert.equal(a.cast, null); assert.equal(a.recovery, .15); events.push('effects'); },
    release: (_a, _s, _track, _payload, target) => { assert.equal(target, initial); events.push('release'); },
  }), .5).advance(a, a.cast, 0, initial);
  assert.deepEqual(events, [['clock', 2], 'effects', 'release']);
});

test('persistence expires before a due beat and carries at most one pulse per frame', () => {
  const p = {timer: 0, interval: .5, remaining: 4, total: 4, powerMult: 2, fade: .25};
  assert.equal(advanceChannelPersistence(p, 1, false), 1.625); assert.equal(p.timer, -.5);
  assert.equal(advanceChannelPersistence(p, 0, false), 1.625); assert.equal(p.timer, 0);
  assert.equal(advanceChannelPersistence(p, 3, false), null);
  assert.equal(advanceChannelPersistence({...p, remaining: 3}, 0, true), null);
  assert.equal(advanceChannelPersistence({...p, remaining: 3, timer: 1}, .25, false), undefined);
});

test('numeric helpers preserve authored floors and curves, with explicit invalid-input errors', () => {
  assert.equal(channelInterval(.3, 2), .15); assert.equal(channelInterval(0, 2), .1);
  assert.equal(channelWindup(-1, 1), 0); assert.equal(channelWindup(1, 2), .5);
  assert.equal(channelRamp({per: .5, max: 5, curve: 'quadratic'}, 2), 2);
  assert.equal(channelRamp({per: .5, max: 5, curve: 'exponential'}, 2), 1.5);
  assert.equal(channelRamp({per: -.5, max: 0}, 2), -1);
  assert.equal(channelCurve('quadIn', .5), .25); assert.equal(channelCurve('quadOut', .5), .75);
  for (const kind of ['linear', 'quadIn', 'quadOut', 'cubicIn', 'cubicOut', 'expoIn', 'expoOut', 'sqrt', 'smooth']) {
    assert.equal(channelCurve(kind, -1), 0); assert.equal(channelCurve(kind, 2), 1);
  }
  assert.equal(channelCurve('breath', .5), 1);
  assert.throws(() => channelInterval(1, 0), /positive/); assert.throws(() => channelWindup(NaN, 1), /finite/);
  assert.throws(() => channelCurve('unknown', 1), /Unknown/); assert.throws(() => channelRamp({per: 1, max: 1, curve: 'unknown'}, 1), /Unknown/);
});

test('bound ports, invalid frames and callback reentry do not wedge the binding', () => {
  const a = {cast: state(), mana: 10, life: 10}; let runtime;
  const ports = host({marker: 7, spec() { assert.equal(this.marker, 7); return {interval: .5}; }, pulse: () => runtime.advance(a, a.cast, 0)});
  runtime = new ChannelCasting(ports, .5); ports.spec = () => { throw new Error('Replaced port'); };
  assert.throws(() => runtime.advance(a, a.cast, -1), /nonnegative/); assert.equal(a.mana, 10);
  assert.throws(() => runtime.advance(a, a.cast, NaN), /finite/);
  assert.throws(() => runtime.advance(a, a.cast, .5), /Reentrant/); assert.equal(a.mana, 6);
  a.cast.held = false; runtime.advance(a, a.cast, 0); assert.equal(a.cast, null);
  assert.throws(() => new ChannelCasting({...host(), pay: null}, .5), /pay port/);
});
