import test from 'node:test';
import assert from 'node:assert/strict';
import { SkillRequest } from '../dist/skill-request.js';

function fixture(overrides = {}) {
  const inst = { def: { id: 'host', tags: [], delivery: { type: 'self' } }, sockets: [] };
  const actor = { id: 1, dead: false, skills: [inst], activeAuras: new Map(), overdrive: {}, life: 100, useLock: 0 };
  const seat = {}, bodySeat = {}, aim = {}, events = [];
  const state = { seal: undefined, replenish: undefined, trigger: false, requirement: undefined,
    conversion: undefined, selected: null, gate: undefined, effects: [], target: true, usable: true };
  const definitions = { art: { id: 'art', tags: [], delivery: { type: 'self' } } };
  const ports = {
    castSealed: () => { events.push('seal'); return state.seal; },
    hivecallMeta: () => { events.push('hive'); return true; },
    throngTravelProtected: () => { events.push('travel'); return false; },
    replenishingDelivery: () => { events.push('replenish'); return state.replenish; },
    forgetReplenishment: () => { events.push(['forget', inst.replenishmentPaused]); },
    seatOf: () => { events.push('seat'); return seat; },
    triggerSeat: () => { events.push('body-seat'); return bodySeat; },
    markMetaDirty: value => { events.push(['dirty', value]); },
    markCharacterDirty: () => { events.push('character'); },
    replenishmentFeedback: () => { events.push(['feedback', inst.replenishmentPaused]); },
    markSeatActed: () => { events.push('acted'); },
    isReflex: () => { events.push('reflex'); return false; },
    actorById: id => { events.push(['holder', id]); return state.holder; },
    mashPress: () => { events.push('mash'); return 3; },
    failNote: (_actor, key, text) => { events.push(['note', key, text]); },
    maxLife: () => { events.push('max-life'); return 100; },
    trigger: () => { events.push('trigger'); return state.trigger; },
    triggerArmed: input => { events.push(['armed', input.state !== undefined]); return !input.state.triggerOff; },
    requirementRefusal: () => { events.push('attributes'); return state.requirement; },
    conversion: () => { events.push('conversion'); return state.conversion; },
    definition: id => { events.push(['definition', id]); return definitions[id]; },
    conversionHolds: () => { events.push('convert-rule'); return true; },
    mint: (_actor, _host, id) => { events.push(['mint', id]); return state.minted = { def: definitions[id], sockets: [] }; },
    dispatch: (a, i, point, pressed) => { events.push(['dispatch', a, i, point, pressed]); return state.dispatched ?? true; },
    time: () => { events.push('time'); return 42; },
    mimicSelected: (_actor, time) => { events.push(['selection', time]); return state.selected; },
    mimicPowerMods: input => { events.push(['mimic-power', input.def.mimic]); return input.def.mimic; },
    unmetGate: () => { events.push('gate'); return state.gate; },
    effects: () => { events.push('effects'); return state.effects; },
    relocationTarget: (_actor, _inst, radius) => { events.push(['target', radius]); return state.target; },
    canUse: () => { events.push('admit'); return state.usable; },
    ...overrides,
  };
  const policy = new SkillRequest(ports);
  return { inst, actor, seat, bodySeat, aim, events, state, definitions, ports, policy,
    run: (pressed = true) => policy.preflight(actor, inst, aim, pressed) };
}

test('constructor performs no gameplay reads; port bindings are copied but state stays live', () => {
  const f = fixture(); assert.deepEqual(f.events, []);
  f.ports.castSealed = () => { throw new Error('replaced binding'); };
  assert.equal(f.run(), 'continue');
  assert.deepEqual(f.events, ['seal', 'travel', 'replenish', 'acted', 'trigger', 'attributes', 'conversion', 'gate', 'effects', 'admit']);
  assert.equal(f.inst.state, undefined);
  f.state.usable = false; assert.equal(f.run(), false);
  f.state.seal = {}; f.events.length = 0; assert.equal(f.run(), false); assert.deepEqual(f.events, ['seal']);
});

test('seals precede all mutation and speak only for explicit presses', () => {
  const f = fixture(); f.state.seal = { line: 'closed' }; f.actor.hiveForm = {}; f.inst.def.hivecall = {};
  assert.equal(f.run(), false); assert.deepEqual(f.events, ['seal', ['note', 'castseal', 'closed']]);
  f.events.length = 0; assert.equal(f.policy.preflight(f.actor, f.inst, f.aim), false); assert.deepEqual(f.events, ['seal']);
});

test('hive handling precedes travel refusal and coalesces missing handling', () => {
  for (const value of [true, false, undefined]) {
    const f = fixture({ hivecallMeta: () => value }); f.actor.hiveForm = {}; f.actor.throngDriven = true; f.inst.def.hivecall = {};
    assert.equal(f.run(), value ?? false); assert.deepEqual(f.events, ['seal']);
  }
});

test('each throng refusal stops before replenishment and seat activity', () => {
  for (const lane of ['travel', 'throngDriven', 'throngCarried']) {
    const f = fixture(lane === 'travel' ? { throngTravelProtected: () => true } : {});
    if (lane !== 'travel') f.actor[lane] = true;
    f.state.replenish = { replenish: { toggle: true } };
    assert.equal(f.run(), false); assert(!f.events.includes('replenish')); assert(!f.events.includes('acted'));
  }
});

test('replenishment toggle preserves state deletion and ordered completion before held checks', () => {
  const f = fixture(); f.state.replenish = { replenish: { toggle: true } }; f.actor.heldBy = 2;
  assert.equal(f.run(), true); assert.equal(f.inst.replenishmentPaused, true);
  assert.deepEqual(f.events, ['seal', 'travel', 'replenish', 'replenish', ['forget', true], 'seat', ['dirty', f.seat], 'character', ['feedback', true]]);
  f.events.length = 0; assert.equal(f.run(), true); assert(!Object.hasOwn(f.inst, 'replenishmentPaused'));
  assert.deepEqual(f.events.slice(4), [['forget', undefined], 'seat', ['dirty', f.seat], 'character', ['feedback', undefined]]);
});

test('replenishment rereads delivery and refuses AI, dead, downed and nonowned instances', () => {
  for (const lane of ['ai', 'dead', 'downed', 'unowned', 'untoggleable']) {
    const f = fixture(); f.state.replenish = { replenish: { toggle: lane !== 'untoggleable' } };
    if (lane === 'dead' || lane === 'downed') f.actor[lane] = true;
    if (lane === 'unowned') f.actor.skills = [];
    assert.equal(f.run(lane !== 'ai'), false); assert.equal(f.inst.replenishmentPaused, undefined);
    assert.equal(f.events.filter(x => x === 'replenish').length, lane === 'ai' ? 1 : 2);
    assert(!f.events.includes('acted'));
  }
  let reads = 0;
  const f = fixture({ replenishingDelivery: () => ++reads === 1 ? { replenish: { toggle: true } } : undefined });
  assert.equal(f.run(), false); assert.equal(reads, 2); assert.equal(f.inst.replenishmentPaused, undefined);
});

test('replenishment completion works without a seat; callback failure preserves prior state', () => {
  const f = fixture({ seatOf: () => undefined }); f.state.replenish = { replenish: { toggle: true } };
  assert.equal(f.run(), true); assert(!f.events.some(e => Array.isArray(e) && e[0] === 'dirty')); assert(f.events.includes('character'));
  const sentinel = new Error('forget failed'), g = fixture({ forgetReplenishment: () => { throw sentinel; } });
  g.state.replenish = f.state.replenish;
  assert.throws(() => g.run(), e => e === sentinel); assert.equal(g.inst.replenishmentPaused, true); assert(!g.events.includes('character'));
});

test('held refusals interrupt dwell and mash only the matching holder, including id zero', () => {
  for (const id of [1, 99, undefined]) {
    const f = fixture(); f.actor.heldBy = 0; f.state.trigger = true;
    if (id !== undefined) f.state.holder = { gripping: { id, struggle: 7 } };
    assert.equal(f.run(false), false);
    assert.equal(f.state.holder?.gripping.struggle, id === undefined ? undefined : id === 1 ? 10 : 7);
    assert(f.events.includes('acted')); assert(!f.events.includes('trigger'));
    assert.deepEqual(f.events.at(-1), ['note', 'grab:held', 'held fast — struggle!']);
  }
  const f = fixture({ isReflex: () => true }); f.actor.heldBy = 2;
  assert.equal(f.run(), 'continue'); assert(!f.events.some(e => Array.isArray(e) && e[0] === 'holder'));
});

test('gnaw exempts seated bodies and mounted movement refuses before attributes', () => {
  const f = fixture({ seatOf: () => undefined }); f.actor.clingTo = { id: 2, until: 10 }; f.actor.cling = { gnaw: {} };
  assert.equal(f.run(), false); assert(!f.events.includes('attributes'));
  delete f.actor.cling.gnaw; assert.equal(f.run(), 'continue');
  const g = fixture(); g.actor.clingTo = { id: 2, until: 10 }; g.actor.cling = { gnaw: {} }; assert.equal(g.run(), 'continue');
  g.actor.mountId = 0; g.inst.def.tags = ['movement']; g.events.length = 0; assert.equal(g.run(), false); assert(!g.events.includes('attributes'));
  g.inst.def.tags = []; assert.equal(g.run(), 'continue');
});

test('active aura debt precedes triggers; positive debt locks only its configured lane', () => {
  for (const lane of ['mana', 'life']) {
    const f = fixture(); f.inst.def.delivery = { type: 'aura', mode: 'toggle', overdrive: { lane } };
    f.actor.activeAuras.set('host', {}); f.actor.overdrive[lane] = { debt: 1 }; f.state.trigger = true;
    assert.equal(f.run(), false); assert(!f.events.includes('trigger')); assert.deepEqual(f.events.at(-1), ['note', 'host:debt', 'debt outstanding']);
    f.actor.overdrive[lane].debt = 0; assert.equal(f.run(), true);
    f.actor.activeAuras.clear(); f.actor.overdrive[lane].debt = 1; assert.equal(f.run(), true);
  }
});

test('life lock includes only life above the threshold and does not read inactive maximums', () => {
  const f = fixture(); f.inst.def.delivery = { type: 'aura', mode: 'toggle', lockAboveLife: .5 };
  assert.equal(f.run(), 'continue'); assert(!f.events.includes('max-life'));
  f.actor.activeAuras.set('host', {}); f.actor.life = 50; assert.equal(f.run(), 'continue');
  f.actor.life = 50.001; assert.equal(f.run(), false); assert.deepEqual(f.events.at(-1), ['note', 'host:locked', 'it will not let go']);
});

test('trigger toggles use body identity, initialize state before armed read, and preserve longer locks', () => {
  const f = fixture(); f.state.trigger = {}; f.actor.dead = true; f.state.requirement = 'missing';
  assert.equal(f.run(), true); assert.equal(f.inst.state.triggerOff, true); assert.equal(f.actor.useLock, .25);
  assert.deepEqual(f.events.slice(4), ['trigger', ['armed', true], 'body-seat', ['dirty', f.bodySeat]]);
  assert(!f.events.includes('seat')); assert(!f.events.includes('attributes'));
  f.actor.useLock = 2; assert.equal(f.run(), true); assert.equal(f.inst.state.triggerOff, false); assert.equal(f.actor.useLock, 2);
  const g = fixture(); g.state.trigger = true; assert.equal(g.run(false), false); assert.equal(g.inst.state, undefined);
  const h = fixture({ triggerSeat: () => undefined }); h.state.trigger = true; assert.equal(h.run(), true); assert.equal(h.actor.useLock, .25);
});

test('stale trigger depth clears even on attribute refusal; zero does not cause a write', () => {
  const f = fixture(); f.inst.state = { trigDepth: 4 }; f.state.requirement = 'needs power'; f.state.conversion = { skillId: 'art', when: 'always' };
  assert.equal(f.run(), false); assert.equal(f.inst.state.trigDepth, 0); assert(!f.events.includes('conversion'));
  assert.deepEqual(f.events.at(-1), ['note', 'host:req', 'needs power']);
  f.inst.state = Object.freeze({ trigDepth: 0 }); assert.equal(f.run(), false);
});

test('conversion precedes mimic, shares live sockets and forwards exact aim and press to dispatch', () => {
  const f = fixture(); f.inst.def.mimic = {}; f.state.conversion = { skillId: 'art', when: 'always' }; f.state.dispatched = false;
  assert.equal(f.run(false), false); assert.equal(f.state.minted.sockets, f.inst.sockets);
  assert.deepEqual(f.events.at(-1), ['dispatch', f.actor, f.state.minted, f.aim, false]);
  assert(!f.events.includes('time')); assert(!f.events.includes('gate')); assert(!f.events.includes('admit'));
});

test('conversion skips missing definitions and observes rule changes before mint', () => {
  const f = fixture(); f.state.conversion = { skillId: 'missing', when: 'always' };
  assert.equal(f.run(), 'continue'); assert(!f.events.includes('convert-rule'));
  const g = fixture(); g.state.conversion = { skillId: 'art', when: 'live' }; g.definitions.other = { id: 'other' };
  const p = new SkillRequest({ ...g.ports, conversionHolds: () => { g.state.conversion.skillId = 'other'; return true; } });
  assert.equal(p.preflight(g.actor, g.inst, g.aim, true), true); assert.equal(g.state.minted.def, g.definitions.other);
  const h = fixture({ conversionHolds: () => false }); h.state.conversion = { skillId: 'art', when: 'no' };
  assert.equal(h.run(), 'continue'); assert.equal(h.state.minted, undefined);
});

test('mimic samples time and live power after mint/socket assignment, and forwards missing-art notes', () => {
  const f = fixture(); f.inst.def.mimic = { power: .5 };
  assert.equal(f.run(), false); assert.deepEqual(f.events.at(-1), ['note', 'host:empty', 'no art captured']);
  f.state.selected = { sid: 'missing' }; assert.equal(f.run(), false);
  f.state.selected = { sid: 'art' }; f.events.length = 0;
  const replacement = { power: .9 };
  const p = new SkillRequest({ ...f.ports, mint: (...args) => { const out = f.ports.mint(...args); f.inst.def.mimic = replacement; return out; },
    mimicPowerMods: input => { assert.equal(f.state.minted.sockets, f.inst.sockets); return f.ports.mimicPowerMods(input); } });
  assert.equal(p.preflight(f.actor, f.inst, f.aim, true), true);
  assert.equal(f.state.minted.extraMods, replacement); assert(f.events.some(e => Array.isArray(e) && e[0] === 'selection' && e[1] === 42));
});

test('redirects re-enter authority and propagate the terminal result without host continuation', () => {
  const f = fixture(); f.state.conversion = { skillId: 'art', when: 'yes' };
  let requests = 0, policy;
  policy = new SkillRequest({ ...f.ports,
    castSealed: (_a, i) => i.def.id === 'art' ? {} : undefined,
    dispatch: (a, i, aim, pressed) => { requests++; const result = policy.preflight(a, i, aim, pressed); assert.notEqual(result, 'continue'); return result; } });
  assert.equal(policy.preflight(f.actor, f.inst, f.aim, true), false); assert.equal(requests, 1);
  assert(!f.events.includes('admit'));
});

test('prerequisite notes preserve empty strings and precede all relocation and admission work', () => {
  for (const note of [undefined, '', 'brimming']) {
    const f = fixture(); f.state.gate = { note }; f.state.effects = [{ type: 'relocateConstruct', radius: 4 }];
    assert.equal(f.run(), false); assert.deepEqual(f.events.at(-1), ['note', 'host:gate', note ?? 'not ready']);
    assert(!f.events.includes('effects')); assert(!f.events.includes('admit'));
  }
});

test('relocation queries retain authored order, stop at first missing target, and precede admission', () => {
  const f = fixture(); f.state.effects = [{ type: 'damage' }, { type: 'relocateConstruct', radius: 0 }, { type: 'relocateConstruct', radius: 9 }];
  let queries = 0;
  const p = new SkillRequest({ ...f.ports, relocationTarget: (a, i, r) => { f.ports.relocationTarget(a, i, r); return ++queries < 2; } });
  assert.equal(p.preflight(f.actor, f.inst, f.aim), false);
  assert.deepEqual(f.events.filter(e => Array.isArray(e) && e[0] === 'target'), [['target', 0], ['target', 9]]);
  assert.deepEqual(f.events.at(-1), ['note', 'host:device', 'no device from this skill in reach']); assert(!f.events.includes('admit'));
  f.events.length = 0; assert.equal(f.run(), 'continue'); assert.equal(f.events.at(-1), 'admit');
});

test('actor admission owns lazy state and exceptions; separate policies do not share answers', () => {
  const f = fixture({ canUse: actor => { actor.bank ??= { count: 0 }; return false; } });
  assert.equal(f.run(), false); assert.deepEqual(f.actor.bank, { count: 0 });
  const g = fixture(); assert.equal(g.run(), 'continue'); assert.equal(g.actor.bank, undefined);
  const sentinel = new Error('admission');
  const p = new SkillRequest({ ...g.ports, canUse: () => { throw sentinel; } });
  g.inst.state = { trigDepth: 2 }; assert.throws(() => p.preflight(g.actor, g.inst, g.aim), e => e === sentinel);
  assert.equal(g.inst.state.trigDepth, 0);
});
