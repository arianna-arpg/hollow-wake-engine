import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {Actor} from '../src/engine/actor';
import {StatSheet, mod} from '../src/engine/stats';
import type {BuffEffect} from '../src/engine/skills';

bootSimEngine();
const rows: unknown[] = [];
function actor() {
  const p = new Actor('buff-host', 'player', {x: 0, y: 0});
  p.sheet = new StatSheet();p.sheet.setBase('life', 100);p.life = 50;
  p.buffs.clear();p.gainEvents = [];
  return p;
}
const effect = (extra: Partial<BuffEffect> = {}): BuffEffect => ({type: 'buff', id: 'one', duration: 4, mods: [mod('life', 'flat', 10)], storedCue: false, ...extra});
{
  const p = actor();assert.equal(p['sdkBuffRuntime'], undefined);
  p.updateTimers(0);p.spendBuffs('hit');p.consumeBuffStacks('absent');p.removeBuff('absent');
  assert.equal(p['sdkBuffRuntime'], undefined);
  p.addBuff(effect());assert(p['sdkBuffRuntime']);const runtime = p['sdkBuffRuntime'];
  p.removeBuff('one');p.updateTimers(0);assert.equal(p['sdkBuffRuntime'], runtime);
  rows.push({name: 'lazy-actor-runtime', emptyFrameAllocatesRuntime: false, retainedAfterUse: true});
}
{
  const p = actor(), def = effect({stackTimers: 'independent', maxStacks: 4}), clocks = [4, 8];
  p.buffs.set('one', {def, remaining: 8, stacks: 2, expiries: clocks});
  p.sheet.setSource('buff:one', [mod('life', 'flat', 20)]);
  assert.equal(p['sdkBuffRuntime'], undefined);p.updateTimers(1);assert(p['sdkBuffRuntime']);
  assert.equal(p.buffs.get('one')!.expiries, clocks);assert.deepEqual(clocks, [3, 7]);
  p.updateTimers(3);assert.deepEqual(clocks, [4]);assert.equal(p.sheet.get('life'), 110);
  rows.push({name: 'restored-map-starts-runtime', clocks: [...clocks], life: p.sheet.get('life')});
}
{
  const p = actor();for (const duration of [9, 2, 7, 4]) p.addBuff(effect({duration, stackTimers: 'independent', maxStacks: 4}));
  const clocks = p.buffs.get('one')!.expiries;p.consumeBuffStacks('one', 2);
  assert.equal(p.buffs.get('one')!.expiries, clocks);assert.deepEqual(clocks, [7, 4]);assert.equal(p.sheet.get('life'), 120);
  p.updateTimers(4);assert.deepEqual(clocks, [3]);assert.equal(p.sheet.get('life'), 110);
  rows.push({name: 'mixed-duration-oldest-consumption', clocks: [...clocks!], life: p.sheet.get('life')});
}
{
  const p = actor();p.addBuff(effect({duration: 1}));const remove = p.sheet.removeSource.bind(p.sheet);let checked = false;
  p.sheet.removeSource = id => {remove(id);assert.equal(p.buffs.size, 0);assert.throws(() => p['sdkBuffRuntime']!.advance(p, 1), /already active/);checked = true;};
  p.updateTimers(1);assert(checked);p.sheet.removeSource = remove;p.addBuff(effect());p.updateTimers(1);
  assert.equal(p.buffs.get('one')!.remaining, 3);rows.push({name: 'same-actor-reentry-rejected-and-recovered', remaining: 3});
}
{
  const a = actor(), b = actor();a.addBuff(effect({duration: 1}));b.addBuff(effect({duration: 4}));
  assert.notEqual(a['sdkBuffRuntime'], b['sdkBuffRuntime']);const remove = a.sheet.removeSource.bind(a.sheet);
  a.sheet.removeSource = id => {remove(id);b.updateTimers(1);};a.updateTimers(1);
  assert.equal(a.buffs.size, 0);assert.equal(b.buffs.get('one')!.remaining, 3);
  rows.push({name: 'independent-actor-runtimes', firstBuffs: 0, secondRemaining: 3});
}
{
  const p = actor();p.addBuff(effect({consumeOnUse: {}}));p.spendBuffs('use');assert.equal(p.buffs.size, 0);assert.equal(p.sheet.get('life'), 100);
  rows.push({name: 'unfiltered-legacy-use-consumption', buffs: 0, life: 100});
}
{
  const p = actor();p.addBuff(effect({maxStacks: 3, stacksOnApply: 3, storedCue: {profile: 'fire'}}));p.consumeBuffStacks('one', 2);
  assert.equal(p.procCuePulses.at(-1)!.count, 2);assert.equal(p.procCuePulses.at(-1)!.phase, 'release');
  const other = actor();other.addBuff(effect({maxStacks: 3, stacksOnApply: 3, storedCue: {profile: 'fire'}}));other.consumeBuffStacks('one', 5);
  assert.equal(other.procCuePulses.at(-1)!.count, 3);assert.equal(other.buffs.size, 0);
  rows.push({name: 'native-release-cue-uses-clamped-spend-count', partial: 2, overConsumption: 3});
}
{
  const p = actor(), calls: unknown[] = [];
  p.addBuff(effect({maxStacks: 3, stacksOnApply: 3, consumeOn: {on: 'hit'}}));
  const consume = p.consumeBuffStacks.bind(p);
  p.consumeBuffStacks = (id, count) => {calls.push({id, count});consume(id, count);};
  p.spendBuffs('hit');assert.deepEqual(calls, [{id: 'one', count: 1}]);
  assert.equal(p.buffs.get('one')!.stacks, 2);assert.equal(p.sheet.get('life'), 120);
  rows.push({name: 'event-spend-preserves-host-method-dispatch', calls, stacks: 2, life: 120});
}
assert.equal(rows.length, 8);
fs.writeFileSync(process.argv[2], JSON.stringify({scope: 'Independent SDK adapter acceptance cases; these are not additional original parity observations.', courses: rows.length, rows}, null, 2) + '\n');
