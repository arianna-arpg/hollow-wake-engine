import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { PassivePolicy } from '../dist/passive-policy.js';
const fixture = JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-eight/passives.json.gz', import.meta.url))));
const strip = snapshot => { const { schemaVersion, capability, contentId, ...state } = snapshot; return state; };
const authored = new PassivePolicy(fixture.authored);

test('passive policy matches original allocation, choice, refund, realm and graft transitions', () => {
  let steps = 0, accepted = 0, rejected = 0;
  for (const scenario of fixture.scenarios) {
    const policy = scenario.policy ? new PassivePolicy(scenario.policy) : authored;
    let build = policy.create(scenario.initial);
    for (const row of scenario.steps) {
      const c = row.command, context = `${scenario.name} step ${steps} ${JSON.stringify(c)}`;
      if (c.type === 'allocate') {
        const result = build.allocate(c.id, { ledger: c.ledger ?? {}, openAllRealms: c.openAllRealms }, c.option);
        assert.equal(result.accepted, row.result, context); assert.deepEqual(result.rootsAdded.filter(id => id !== c.id), row.rootsAdded, context);
        if (result.accepted) accepted++; else rejected++;
      } else if (c.type === 'refund') {
        assert.deepEqual(build.quoteRefund(c.id), row.result.quote, context);
        const result = build.refund(c.id, c.serviceRefusal ?? null);
        assert.equal(result.refusal, row.result.refusal, context); assert.equal(result.refusal === null, row.result.accepted, context);
      } else if (c.type === 'quote') assert.deepEqual(build.quoteRefund(c.id), row.result, context);
      else if (c.type === 'choice') assert.equal(build.choiceLock(c.id, c.option), row.result, context);
      else if (c.type === 'roots') assert.deepEqual(build.ensureOpenRoots({ ledger: c.ledger ?? {}, openAllRealms: c.openAllRealms }), row.rootsAdded, context);
      else if (c.type === 'grant') build.grantRealmPoints(c.currency, c.amount);
      else if (c.type === 'bind') assert.equal(build.bindGraft(c.key, c.skillId, new Set(c.knownSkills)), row.result, context);
      else assert.fail(`Unknown command ${c.type}`);
      assert.deepEqual(strip(build.snapshot()), row.expected, context);
      if (++steps % 13 === 0) build = policy.restore(JSON.parse(JSON.stringify(build.snapshot())));
    }
  }
  assert.equal(steps, 9699); assert.ok(accepted > 1500 && rejected > 1500, `${accepted} accepts / ${rejected} refusals`);
});

function tiny() {
  return { schemaVersion: 1, capability: 'passive-policy/v1', contentId: 'test', defaultPick: 2, pickCost: 3, requireVocationGate: true,
    nodes: [{ id: 'root', name: 'Root' }, { id: 'a', name: 'A' }, { id: 'b', name: 'B' },
      { id: 'choice', name: 'Choice', choice: { group: 'g' } },
      { id: 'rroot', name: 'Realm root', realm: 'r' }, { id: 'rleaf', name: 'Realm leaf', realm: 'r' }],
    adjacency: { root: ['a','choice'], a: ['root','b'], b: ['a'], choice: ['root'], rroot: ['rleaf'], rleaf: ['rroot'] },
    groups: [{ id: 'g', options: [{ id: 'x' }, { id: 'y' }, { id: 'z' }] }],
    realms: [{ id: 'tree' }, { id: 'r', roots: ['rroot'], currency: 'favor', unlockLedger: 'opened' }],
    classes: [{ id: 'hero', startNode: 'root' }], vocations: [] };
}
const state = (extra = {}) => ({ classId: 'hero', allocated: ['root'], choices: {}, grafts: {}, vocations: [], passivePoints: 10, vocationPoints: 0, realmPoints: {}, ...extra });
const access = { ledger: {} };

test('point conservation, multi-pick costs, leaves and denied services are independent invariants', () => {
  const b = new PassivePolicy(tiny()).create(state());
  assert.equal(b.allocate('choice', access, 'x').accepted, true); assert.equal(b.allocate('choice', access, 'y').accepted, true);
  assert.equal(b.snapshot().passivePoints, 4); assert.equal(b.allocate('choice', access, 'z').accepted, false);
  assert.deepEqual(b.quoteRefund('choice'), { points: 6, currency: 'passive', refusal: null });
  const before = b.snapshot(); assert.equal(b.refund('choice', 'Closed').refusal, 'Closed'); assert.deepEqual(b.snapshot(), before);
  b.refund('choice'); assert.equal(b.snapshot().passivePoints, 10);
  assert.equal(b.allocate('a', access).accepted, true); assert.equal(b.allocate('b', access).accepted, true);
  assert.match(b.refund('a').refusal, /connected/); b.refund('b'); b.refund('a'); assert.equal(b.snapshot().passivePoints, 10);
});

test('root seeding on failed purchase is explicit, idempotent and retained through save/restore', () => {
  const p = new PassivePolicy(tiny()), b = p.create(state());
  assert.deepEqual(b.allocate('rleaf', access), { accepted: false, rootsAdded: [] });
  assert.deepEqual(b.allocate('rleaf', { ledger: { opened: 1 } }), { accepted: false, rootsAdded: ['rroot'] });
  const restored = p.restore(b.snapshot());
  assert.deepEqual(restored.ensureOpenRoots({ ledger: { opened: 1 } }), []);
  restored.grantRealmPoints('favor', 1.6); assert.equal(restored.allocate('rleaf', { ledger: { opened: 1 } }).accepted, true);
  assert.equal(restored.refund('rleaf').currency, 'favor'); assert.equal(restored.snapshot().realmPoints.favor, 2);
  assert.match(restored.refund('rroot').refusal, /freely/); assert.equal(restored.snapshot().passivePoints, 10);
});

test('cross-domain edges cannot rescue a detached branch, and an unrooted cycle is not an anchor', () => {
  const input = tiny(); input.adjacency.b.push('rroot'); input.adjacency.rroot.push('b');
  const b = new PassivePolicy(input).create(state({ allocated: ['root','a','b','rroot'] }));
  assert.match(b.quoteRefund('a').refusal, /connected/);
  input.adjacency.a.push('choice'); input.adjacency.choice.push('a','b'); input.adjacency.b.push('choice');
  const cycle = new PassivePolicy(input).create(state({ allocated: ['root','a','b','choice'], choices: { choice: ['x'] } }));
  assert.equal(cycle.quoteRefund('a').refusal, null); // A real alternate path from root remains.
  input.adjacency.root = ['a']; input.adjacency.choice = ['a','b'];
  const isolated = new PassivePolicy(input).create(state({ allocated: ['root','a','b','choice'], choices: { choice: ['x'] } }));
  assert.match(isolated.quoteRefund('a').refusal, /connected/);
});

test('owned state, immutable content, scratch and snapshots never leak across characters', () => {
  const source = tiny(), initial = state(), p = new PassivePolicy(source), a = p.create(initial), b = p.create(initial);
  source.nodes[0].name = 'Edited'; initial.allocated.push('b'); assert.equal(p.node('root').name, 'Root');
  assert.throws(() => p.pack.adjacency.root.push('b'), TypeError);
  a.allocate('a', access); const snap = a.snapshot(); snap.allocated.push('b'); snap.realmPoints.favor = 30;
  for (let i = 0; i < 100; i++) { assert.equal(a.quoteRefund('a').refusal, null); assert.match(b.quoteRefund('a').refusal, /not allocated/); }
  assert.deepEqual(b.snapshot().allocated, ['root']); assert.equal(a.snapshot().realmPoints.favor, undefined);
  assert.throws(() => p.restore({ ...a.snapshot(), contentId: 'different' }), /mismatch/);
});

test('vocation membership, gate toggle and currency are independent requirements', () => {
  const input = tiny(); input.nodes.push({ id: 'crest', name: 'Crest', vocation: 'v' }, { id: 'voc', name: 'Vocation leaf', vocation: 'v' });
  input.adjacency.crest = ['voc']; input.adjacency.voc = ['crest']; input.vocations = [{ id: 'v', root: 'crest', gate: 'a' }];
  const p = new PassivePolicy(input);
  const unearned = p.create(state({ allocated: ['root','a','crest'], vocationPoints: 4 }));
  assert.equal(unearned.allocate('voc', access).accepted, false);
  const gated = p.create(state({ allocated: ['root','crest'], vocations: ['v'], vocationPoints: 4 }));
  assert.equal(gated.allocate('voc', access).accepted, false); gated.allocate('a', access);
  assert.equal(gated.allocate('voc', access).accepted, true); assert.equal(gated.snapshot().vocationPoints, 3);
  assert.match(gated.refund('a').refusal, /Vocation/); assert.match(gated.refund('crest').refusal, /freely/);
  assert.equal(gated.refund('voc').currency, 'vocation'); assert.equal(gated.snapshot().vocationPoints, 4);
  input.requireVocationGate = false;
  const ungated = new PassivePolicy(input).create(state({ allocated: ['root','crest'], vocations: ['v'], vocationPoints: 1 }));
  assert.equal(ungated.allocate('voc', access).accepted, true); assert.equal(ungated.snapshot().passivePoints, 10);
  assert.equal(ungated.refund('voc').points, 1); assert.equal(ungated.snapshot().vocationPoints, 1);
});

test('malformed content and state fail before becoming executable policy', () => {
  for (const change of [
    p => p.nodes.push({ ...p.nodes[0] }), p => p.nodes[0].id = '__proto__', p => p.adjacency.a.push('missing'),
    p => p.nodes[1].mods = [], p => p.pickCost = 0, p => p.defaultPick = NaN,
    p => p.nodes[3].choice.group = 'missing', p => p.groups[0].options.push({ id: 'x' }),
    p => p.realms[1].roots = ['root'], p => p.nodes[1].vocation = 'missing',
  ]) { const input = tiny(); change(input); assert.throws(() => new PassivePolicy(input)); }
  const p = new PassivePolicy(tiny());
  for (const s of [state({ passivePoints: Infinity }), state({ passivePoints: -1 }), state({ allocated: ['root','missing'] }),
    state({ choices: { choice: ['x'] } }), state({ allocated: ['root','choice'], choices: { choice: ['x','x'] } }),
    state({ grafts: { stale: 'skill' } }), state({ vocations: ['missing'] })]) assert.throws(() => p.create(s));
  const b = p.create(state({ passivePoints: Number.MAX_SAFE_INTEGER, allocated: ['root','a'] }));
  const before = b.snapshot(); assert.throws(() => b.refund('a')); assert.deepEqual(b.snapshot(), before);
  assert.throws(() => b.grantRealmPoints('__proto__', 1)); assert.deepEqual(b.snapshot(), before);
});
