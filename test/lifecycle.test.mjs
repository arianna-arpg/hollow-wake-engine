import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CastRuntime, Content, Engine } from '../dist/index.js';
const fixture = JSON.parse(fs.readFileSync(new URL('../baseline/milestone-two/lifecycle.json', import.meta.url)));
const profile = { skillId: 'spell', useTime: .75, cost: { mana: 6, life: 0 }, cooldown: 2, cooldownAt: 'completion' };
for (const scenario of fixture.casting) test(`original World trace: ${scenario.name}`, () => {
  let runtime = new CastRuntime({ mana: scenario.initial.mana, life: scenario.initial.life });
  let executed = 0, rate = 1;
  for (const step of scenario.steps) {
    const c = step.command;
    let event;
    if (c.type === 'press') {
      event = runtime.press(step.profile, { stunned: step.stunned });
      assert.equal(event.kind !== 'rejected', step.accepted);
    } else if (c.type === 'tick') event = runtime.advance(c.dt, { cooldownRecovery: rate, stunned: step.stunned, completionCooldown: step.completionCooldown });
    else if (c.type === 'resources') runtime.setResources(c);
    else if (c.type === 'rate') rate = c.value;
    else if (c.type === 'cancel') event = runtime.cancel();
    if (event?.kind === 'completed') executed++;
    const s = runtime.snapshot();
    const actual = { mana: s.resources.mana, life: s.resources.life, recovery: s.recovery,
      active: s.active ? { elapsed: s.active.elapsed, total: s.active.total } : null,
      cooldowns: s.cooldowns, executed };
    const { projectiles, ...expected } = step.expected;
    assert.deepEqual(actual, expected, `${scenario.name}: ${JSON.stringify(c)}`);
    assert.equal(projectiles, executed, 'Original completion really spawned the projectile');
    runtime = CastRuntime.restore(JSON.parse(JSON.stringify(s))); // Every transition survives a save roundtrip.
  }
});
test('compiled Firebolt cost, duration and cooldown quotes match original Actor reads', () => {
  const base = JSON.parse(fs.readFileSync(new URL('../content/milestone-one.json', import.meta.url)));
  const firebolt = JSON.parse(fs.readFileSync(new URL('../content/firebolt.json', import.meta.url)));
  for (const scenario of fixture.casting) {
    const pack = structuredClone(base), { cooldownAt = 'completion', ...variant } = scenario.variant ?? {};
    pack.skills.firebolt = { ...firebolt, ...variant };
    const e = new Engine(pack), c = e.character({ classId: 'magician', passivePoints: 1 });
    c.sheet.setSource('rig', ['castSpeed', 'cooldownRecovery', 'manaCost', 'manaUseCost'].map(stat => ({ stat, kind: 'override', value: 1 })));
    const skill = e.skill({ id: 'firebolt', level: 1, sockets: 0, treePoints: 0 });
    for (const step of scenario.steps) {
      const command = step.command;
      if (command.type === 'rate') c.sheet.setSource('rate', [{ stat: 'cooldownRecovery', kind: 'override', value: command.value }]);
      if (command.type === 'speed') c.sheet.setSource('speed', [{ stat: 'castSpeed', kind: 'override', value: command.value }]);
      if (command.type === 'addedCooldown') c.sheet.setSource('added', [{ stat: 'addedCooldown', kind: 'flat', value: command.value }]);
      if (step.profile) assert.deepEqual(e.castProfile(c, skill, cooldownAt), step.profile, scenario.name);
    }
  }
});
test('invalid frames and exhausted capacity cannot partially pay or tick', () => {
  const r = new CastRuntime({ mana: 100, life: 100 }, 1);
  r.press({ ...profile, useTime: 0 });
  r.advance(.2);
  let before = r.snapshot();
  assert.throws(() => r.press({ ...profile, skillId: 'other' }), /capacity/);
  assert.deepEqual(r.snapshot(), before);
  for (const [dt, frame] of [[-1, {}], [NaN, {}], [.2, { cooldownRecovery: -1 }], [.2, { cooldownRates: { spell: Infinity } }], [1, { completionCooldown: NaN }]]) {
    assert.throws(() => r.advance(dt, frame));
    assert.deepEqual(r.snapshot(), before);
  }
});
test('cancel, death and interleaved runtimes produce at most one completion', () => {
  const a = new CastRuntime({ mana: 100, life: 100 }), b = new CastRuntime({ mana: 100, life: 100 });
  a.press(profile); b.press(profile); a.cancel();
  assert.equal(a.advance(1), null);
  const completed = b.advance(1);
  assert.equal(completed.kind, 'completed'); assert.equal(b.advance(1), null);
  a.press(profile); assert.equal(a.advance(0, { dead: true }).kind, 'cancelled');
  assert.equal(a.mana, 88); assert.equal(b.mana, 94);
});
test('completion cooldown and token restore validation reject corrupt snapshots', () => {
  const r = new CastRuntime({ mana: 100, life: 100 }); r.press(profile);
  for (const change of [s => s.schemaVersion = 2, s => s.active.elapsed = 10,
    s => s.active.token = s.nextToken, s => s.active.total = 0,
    s => s.cooldowns = [['a', 1], ['a', 2]], s => s.active.profile.channel = true,
    s => s.active = false, s => delete s.active, s => s.active.profile.skillId = '__proto__']) {
    const state = r.snapshot(); change(state); assert.throws(() => CastRuntime.restore(state));
  }
  const event = r.advance(1, { completionCooldown: 7 });
  assert.equal(event.kind, 'completed'); assert.equal(r.cooldown('spell'), 7);
});
test('build changes invalidate casting quotes while active bars retain their quote', () => {
  const pack = JSON.parse(fs.readFileSync(new URL('../content/milestone-one.json', import.meta.url)));
  const e = new Engine(new Content(pack)), c = e.character({ classId: 'magician', passivePoints: 1 });
  const s = e.skill({ id: 'ruin', level: 1, sockets: 0, treePoints: 0 });
  const before = e.castProfile(c, s), r = new CastRuntime({ mana: 100, life: 100 });
  r.press(before); c.sheet.setSource('speed', [{ stat: 'castSpeed', kind: 'more', value: 1 }]);
  assert.equal(e.castProfile(c, s).useTime, before.useTime / 2);
  assert.equal(r.snapshot().active.profile.useTime, before.useTime);
});
