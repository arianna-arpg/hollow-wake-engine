import test from 'node:test';
import assert from 'node:assert/strict';
import { CastSeals } from '../dist/cast-seals.js';
import { SkillInstances } from '../dist/skill-instances.js';
import { SkillIntent } from '../dist/skill-intent.js';

function fixture() {
  const definitions = Object.fromEntries(['host', 'art', 'step', 'other', 'device'].map(id => [id, { id, effects: [] }]));
  definitions.device.effects = [{ type: 'relocateConstruct' }];
  const create = (def, level = 1) => ({ def, level, sockets: [], grafts: [] });
  const host = create(definitions.host);
  const actor = { skills: [host], metaInsts: new Map(), activeAuras: new Map(), strobes: new Map(), venting: new Set(), pools: new Map(), charges: new Map() };
  const state = { time: 10, seal: undefined, closed: false, seat: { known: new Set(['host']) }, requirement: undefined,
    trigger: false, gate: true, cost: undefined, target: undefined, targetReady: false, canUse: false, selection: null, conversion: undefined, converts: true, events: [] };
  const instances = new SkillInstances({ skill: id => definitions[id], create, effectiveLevel: inst => inst.level + Math.floor(inst.bonusLevels ?? 0) + (inst.socketBonus ?? 0), treeMods: inst => inst.liveTreeMods });
  const ports = {
    time: () => state.time,
    castSeal: () => { state.events.push('seal'); return state.seal; },
    sealShuts: () => { state.events.push('seal-match'); return state.closed; },
    seat: () => state.seat, knownSkill: (seat, id) => seat.known.has(id),
    requirementShortfall: () => { state.events.push('requirements'); return state.requirement; },
    trigger: () => { state.events.push('trigger'); return state.trigger; },
    gatesMet: () => { state.events.push('gates'); return state.gate; },
    chargeCost: () => { state.events.push('charge-price'); return state.cost; },
    targeting: () => { state.events.push('target-spec'); return state.target; },
    qualifiedTargetAvailable: () => { state.events.push('target-query'); return state.targetReady; },
    canUse: (_actor, inst) => { state.events.push(['admit', inst.def.id]); return state.canUse; },
    mimicSelected: () => { state.events.push('selection'); return state.selection; },
    mimicPowerMods: () => [{ power: 0.85 }],
    conversion: () => { state.events.push('conversion'); return state.conversion; },
    conversionHolds: () => { state.events.push('convert-rule'); return state.converts; },
  };
  const intent = new SkillIntent(instances, ports);
  return { definitions, create, host, actor, state, instances, ports, intent };
}

test('cast seals preserve hard locks, seat scope and id/tag/law short-circuit order', () => {
  const events = [], seals = new CastSeals(() => { events.push('tags'); return new Set(['spell']); });
  seals.register('allow', () => { events.push('law'); return true; });
  const ctx = { inst: { def: { id: 'art' }, hostSkillId: 'host' }, seated: true };
  assert(seals.matches({ ids: ['host'], tags: ['spell'], laws: ['allow'] }, ctx)); assert.deepEqual(events, []);
  assert(seals.matches({ tags: ['spell'], laws: ['allow'] }, ctx)); assert.deepEqual(events, ['tags']);
  events.length = 0;
  assert.equal(seals.shuts({ binds: 'seats', shut: { laws: ['allow'] } }, { ...ctx, seated: false }), false); assert.deepEqual(events, []);
  assert(seals.shuts({ open: { laws: ['allow'] }, shut: { ids: ['art'] } }, ctx)); assert.deepEqual(events, []);
  assert(seals.shuts({}, ctx)); assert.equal(seals.shuts({ mode: 'open' }, ctx), false);
  assert.equal(seals.matches({ laws: ['missing'] }, ctx), false);
});

test('cast law replacement is live, ordered and isolated, including replacement during a fold', () => {
  const a = new CastSeals(() => new Set()), b = new CastSeals(() => new Set()), seen = [];
  a.register('first', ctx => { seen.push(ctx); a.register('second', () => true); return false; });
  a.register('second', () => false);
  const ctx = { inst: { def: { id: 'art' } }, seated: true };
  assert(a.matches({ laws: ['first', 'second'] }, ctx)); assert.equal(seen[0], ctx);
  assert.deepEqual(a.ids(), ['first', 'second']); assert.deepEqual(b.ids(), []);
  const copy = a.ids(); copy.pop(); assert(a.known('second')); assert.equal(b.known('second'), false);
  a.register('throw', () => { throw new Error('law failure'); });
  assert.throws(() => a.shuts({ shut: { laws: ['throw'] } }, ctx), /law failure/);
  assert(a.matches({ laws: ['second'] }, ctx));
});

test('cast seal diagnostics retain authored order, duplicates and the open-ground hint', () => {
  const seals = new CastSeals(() => new Set());
  assert.deepEqual(seals.issues({ mode: 'open', open: { ids: ['x', 'x'], laws: ['y'] } }, () => false), [
    "open.ids names no skill 'x'", "open.ids names no skill 'x'", "open.laws names no registered law 'y'", "mode 'open' with no shut row seals nothing — drop the seal",
  ]);
});

test('HUD readiness is supplementary and preserves trigger, seal and pool early refusals', () => {
  const { intent, actor, host, state } = fixture();
  assert.equal(intent.hudUsable(actor, host), true); assert.equal(intent.pressUsable(actor, host), false);
  state.events = []; state.trigger = true; state.seal = {}; state.closed = true;
  assert.equal(intent.hudUsable(actor, host), false); assert.deepEqual(state.events, ['trigger']);
  state.events = []; state.trigger = false;
  assert.equal(intent.hudUsable(actor, host), false); assert.deepEqual(state.events, ['trigger', 'seal', 'seal-match']);
  state.events = []; state.closed = false; host.def.pool = { id: 'p', min: 2 }; actor.pools.set('p', 1);
  assert.equal(intent.hudUsable(actor, host), false); assert(!state.events.includes('gates'));
  actor.venting.add('p'); assert(intent.hudUsable(actor, host));
});

test('HUD charge gates distinguish optional, fixed and all-charge prices', () => {
  const { intent, actor, host, state } = fixture();
  state.cost = { charge: 'x', amount: 'all' }; assert.equal(intent.hudUsable(actor, host), false);
  actor.charges.set('x', 1); assert(intent.hudUsable(actor, host));
  state.cost = { charge: 'x', amount: 1, minimum: 2 }; assert.equal(intent.hudUsable(actor, host), false);
  state.cost.optional = true; assert(intent.hudUsable(actor, host));
  state.cost = { charge: 'x', amount: 'all', minimum: 0 }; actor.charges.clear(); assert(intent.hudUsable(actor, host));
});

test('HUD never resolves corpse side effects and only queries qualified targets after gates', () => {
  const { intent, actor, host, state } = fixture();
  state.target = { target: 'corpse', requiresStatus: 'poison' };
  assert(intent.hudUsable(actor, host)); assert(!state.events.includes('target-query'));
  state.target.target = 'enemy'; assert.equal(intent.hudUsable(actor, host), false);
  state.events = []; state.gate = false; assert.equal(intent.hudUsable(actor, host), false); assert(!state.events.includes('target-query'));
  state.gate = true; state.targetReady = true; assert(intent.hudUsable(actor, host));
});

test('requirements honor seat, gift, known-skill and active-toggle exemptions with live reads', () => {
  const { intent, actor, host, state } = fixture(); state.requirement = 'needs STR 12';
  assert.equal(intent.requirementRefusal(actor, host), 'needs STR 12');
  state.events = []; host.devGift = true; assert.equal(intent.requirementRefusal(actor, host), undefined); assert.deepEqual(state.events, []);
  host.devGift = false; actor.activeAuras.set('host', {}); assert.equal(intent.requirementRefusal(actor, host), undefined);
  actor.activeAuras.clear(); actor.strobes.set('host', {}); assert.equal(intent.requirementRefusal(actor, host), undefined);
  actor.strobes.clear(); state.seat.known.clear(); assert.equal(intent.requirementRefusal(actor, host), undefined);
  state.seat = undefined; assert.equal(intent.requirementRefusal(actor, host), undefined);
});

test('a seal returns its original object and prevents minting or actor admission', () => {
  const { intent, actor, host, state } = fixture(); host.def.mimic = {}; state.selection = { sid: 'art' }; state.seal = {}; state.closed = true;
  assert.equal(intent.castSealed(actor, host), state.seal); state.events = [];
  assert.equal(intent.pressUsable(actor, host), false); assert.equal(actor.metaInsts.size, 0); assert.deepEqual(state.events, ['seal', 'seal-match']);
});

test('mimic, combo and conversion query precedence differs from empty mimic face fallback', () => {
  const { intent, actor, host, state, definitions } = fixture();
  host.def.mimic = {}; host.def.comboChain = { skills: ['step'], window: 2 }; host.state = { comboAt: 10, comboIdx: 1 };
  state.conversion = { when: 'yes', skillId: 'other' }; state.selection = { sid: 'art' }; state.canUse = true;
  assert.equal(intent.slotFace(actor, host), definitions.art); assert(intent.pressUsable(actor, host));
  const art = actor.metaInsts.get('host:art'); assert.equal(art.sockets, host.sockets); assert.deepEqual(art.extraMods, [{ power: 0.85 }]);
  state.selection = null; assert.equal(intent.slotFace(actor, host), definitions.step); assert.equal(intent.pressUsable(actor, host), false);
  delete host.def.mimic; state.events = []; assert(intent.pressUsable(actor, host)); assert.deepEqual(state.events.at(-1), ['admit', 'step']);
  state.time = 12.0001; assert.equal(intent.slotFace(actor, host), definitions.other); assert(intent.pressUsable(actor, host));
  assert.equal(actor.metaInsts.get('host:other').sockets, host.sockets);
});

test('queued steps include the exact window endpoint and preserve lazy cursor creation', () => {
  const { intent, actor, host, state } = fixture(); host.def.comboChain = { skills: ['step'], window: 2 };
  assert.equal(host.state, undefined); assert.equal(intent.queuedStep(actor, host), null); assert.deepEqual(host.state, {});
  host.state.comboAt = 10; host.state.comboIdx = 1; state.time = 12; assert.equal(intent.queuedStep(actor, host)?.def.id, 'step');
  state.time += 0.00001; assert.equal(intent.queuedStep(actor, host), null);
});

test('cursor ownership isolates borrowed constructs by simulation and actor while own bars retain instance state', () => {
  const f = fixture(), g = fixture(), { actor, host, instances, create } = f;
  const own = instances.cursor(actor, host); actor.construct = {}; actor.skills = [];
  const borrowed = instances.cursor(actor, host); assert.notEqual(borrowed, own);
  assert.equal(instances.cursor(actor, create(host.def)), borrowed);
  assert.notEqual(g.instances.cursor(actor, host), borrowed);
  const otherActor = { ...actor, metaInsts: new Map() }; assert.notEqual(instances.cursor(otherActor, host), borrowed);
  actor.skills = [host]; assert.equal(instances.cursor(actor, host), own); actor.skills = []; assert.equal(instances.cursor(actor, host), borrowed);
  actor.construct = undefined; assert.equal(instances.cursor(actor, host), own);
});

test('combo cache keeps base-level arithmetic and refreshes borrowed sockets, grafts and tree modifiers', () => {
  const { instances, actor, host, create } = fixture();
  host.def.comboChain = { skills: ['host', 'step', 'missing'], window: 2 }; host.bonusLevels = 1.9; host.socketBonus = 5;
  for (const n of [-1, 0, 1, 3, 4]) assert.equal(instances.step(actor, host, n), null);
  const step = instances.step(actor, host, 2); assert.equal(step.level, 2); assert.equal(step.hostSkillId, 'host'); assert.equal(step.chainOf, 'host');
  host.sockets = [{}]; host.grafts = [{}]; host.liveTreeMods = [{}];
  assert.equal(instances.step(actor, host, 2), step); assert.equal(step.sockets, host.sockets); assert.equal(step.grafts, host.grafts); assert.equal(step.comboTreeMods, host.liveTreeMods);
  host.bonusLevels = 2; assert.notEqual(instances.step(actor, host, 2), step);
  const secondActor = { ...actor, metaInsts: new Map() }; assert.notEqual(instances.step(secondActor, host, 2), instances.step(actor, host, 2));
  assert.equal(instances.step(actor, create({ id: 'plain', effects: [] }), 1), null);
});

test('meta cache uses effective levels, command scope and exact relocation host identity', () => {
  const { instances, actor, host, create } = fixture(); host.socketBonus = 2;
  const art = instances.meta(actor, host, 'art'); assert.equal(art.level, 3); assert.equal(art.hostSkillId, 'host');
  const same = { ...create(host.def), socketBonus: 2 }; assert.equal(instances.meta(actor, same, 'art'), art);
  same.level = 2; same.def = { ...same.def, effects: [{ type: 'commandMinions' }] };
  const command = instances.meta(actor, same, 'art'); assert.notEqual(command, art); assert.equal(command.hostSkillId, undefined);
  const device = instances.meta(actor, host, 'device'); assert.equal(instances.relocationHost(device), host);
  assert.equal(instances.meta(actor, host, 'device'), device);
  const otherDevice = instances.meta(actor, { ...host }, 'device'); assert.notEqual(otherDevice, device);
  assert.equal(instances.relocationHost(device), host);
  const count = actor.metaInsts.size; assert.throws(() => instances.meta(actor, host, 'missing'), /Unknown meta skill/); assert.equal(actor.metaInsts.size, count);
});

test('a later admission exception retains the mint and shared payload; policies snapshot ports, not live state', () => {
  const f = fixture(), { actor, host, instances, ports, state } = f;
  const intent = new SkillIntent(instances, { ...ports, canUse: () => { throw new Error('host failure'); } });
  host.def.mimic = {}; state.selection = { sid: 'art' };
  assert.throws(() => intent.pressUsable(actor, host), /host failure/);
  assert.equal(actor.metaInsts.get('host:art').sockets, host.sockets);
  ports.canUse = () => { throw new Error('replaced port'); }; state.canUse = true;
  assert(f.intent.pressUsable(actor, host));
});
