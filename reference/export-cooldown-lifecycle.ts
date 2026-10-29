// Calls original game methods. This capture never imports the SDK.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine, makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {StatSheet, mod} from '../src/engine/stats';
import {makeSkillInstance, skillCooldownSeconds, type SkillEffect} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {ULT_QA} from '../src/engine/ultimates';

bootSimEngine();
const restore = seedGlobalRandom(0xc045), world = makeSimWorld('warrior', 0xc045);
const rows: unknown[] = [], A = '__clock_a', B = '__clock_b', C = '__clock_c';
type Event = unknown[];
function setup() {
  const actor = new Actor('clock-observation', 'player', {x: 500, y: 500});
  actor.sheet = new StatSheet();
  actor.sheet.setSource('clock-observation', [
    ...['life', 'mana', 'poise', 'energyShield'].map(id => mod(id, 'override', 1000)),
    ...['lifeRegen', 'lifeRegenPct', 'manaRegen', 'esRechargeRate', 'poiseRegenPct', 'critChance'].map(id => mod(id, 'override', 0)),
    ...['attackSpeed', 'castSpeed', 'effectDuration', 'cooldownRecovery', 'healTaken'].map(id => mod(id, 'override', 1))]);
  actor.life = actor.mana = 1000; actor.es = actor.poise = 50; actor.esDelay = 1000;
  const first = makeSkillInstance({...SKILLS.cleave, id: A, cooldown: 10}, 1);
  const second = makeSkillInstance({...SKILLS.firebolt, id: B, cooldown: 8}, 1);
  actor.skills = [first, second];
  const events: Event[] = [], get = actor.sheet.get.bind(actor.sheet), tagged = actor.sheet.hasTaggedMods.bind(actor.sheet);
  actor.sheet.get = (...args) => {
    const value = get(...args);
    if (args[0] === 'cooldownRecovery' || args[0] === 'addedCooldown' || args[0].startsWith('orbRefund_'))
      events.push(['stat', args[0], args[1] ? [...args[1]] : null, args[2] ?? null, value]);
    return value;
  };
  actor.sheet.hasTaggedMods = stat => { const value = tagged(stat); if (stat === 'cooldownRecovery') events.push(['tagged', value]); return value; };
  function watch(map: Map<string, number>, label: string, hook?: (id: string) => void) {
    const set = map.set.bind(map), del = map.delete.bind(map);
    map.set = (id, value) => { events.push([label, 'set', id, value]); hook?.(id); return set(id, value); };
    map.delete = id => { events.push([label, 'delete', id]); return del(id); };
    return map;
  }
  actor.cooldowns = watch(new Map([[A, 10], [B, 4], [C, 0.25]]), 'clock');
  actor.cooldownTotals = watch(new Map([[A, 10], [B, 8], [C, 1]]), 'total');
  const state = () => ({clocks: [...actor.cooldowns], totals: [...actor.cooldownTotals]});
  return {actor, first, second, events, watch, state};
}
try {
  for (const name of ['ordinary', 'expiry', 'empty', 'zero-dt', 'negative-rate', 'tagged', 'untagged-instance',
    'first-duplicate', 'live-insert', 'live-delete', 'replace-destination', 'global-read-once', 'partial-write-failure']) {
    const r = setup(), {actor, first, second, events} = r;
    if (name === 'empty') actor.cooldowns.clear();
    if (name === 'negative-rate') actor.sheet.setSource('rate', [mod('cooldownRecovery', 'override', -2)]);
    if (name === 'tagged' || name === 'first-duplicate') actor.sheet.setSource('rate', [mod('cooldownRecovery', 'override', 3, ['spell'])]);
    if (name === 'untagged-instance') first.def = {...first.def, innateMods: [mod('cooldownRecovery', 'override', 4)]};
    if (name === 'first-duplicate') actor.skills = [makeSkillInstance({...second.def, id: A}, 1), first, second];
    const original = actor.cooldowns;
    if (['live-insert', 'live-delete', 'replace-destination', 'global-read-once', 'partial-write-failure'].includes(name)) {
      actor.cooldowns = r.watch(original, 'outer', id => {
        if (id === A) {
          if (name === 'live-insert') original.set('__late', 2);
          if (name === 'live-delete') original.delete(B);
          if (name === 'replace-destination') actor.cooldowns = r.watch(new Map([['__new', 7]]), 'replacement');
          if (name === 'global-read-once') actor.sheet.setSource('changed-rate', [mod('cooldownRecovery', 'override', 9)]);
        }
        if (id === B && name === 'partial-write-failure') throw Error('clock write rejected');
      });
    }
    const before = r.state(); let error: string | null = null;
    try { actor.updateTimers(name === 'expiry' ? 20 : name === 'zero-dt' ? 0 : 0.5); }
    catch (caught) { error = (caught as Error).message; }
    if (name === 'ordinary') assert.deepEqual([...actor.cooldowns], [[A, 9.5], [B, 3.5]]);
    if (name === 'tagged') assert.equal(actor.cooldowns.get(B), 2.5);
    if (name === 'live-insert') assert.equal(actor.cooldowns.get('__late'), 1.5);
    if (name === 'global-read-once') assert.equal(actor.cooldowns.get(B), 3.5);
    if (name === 'partial-write-failure') { assert.equal(error, 'clock write rejected'); assert.equal(actor.cooldowns.get(A), 9.5); }
    rows.push({family: 'elapsed', name, before, after: r.state(), originalClocks: [...original], events, error});
  }
  for (const name of ['base', 'added', 'global', 'scoped', 'ratio-floor', 'no-clock', 'negative-levy-clamped', 'imposed', 'absorb', 'absorb-payload']) {
    const r = setup(), {actor, first, events} = r;
    if (name === 'added' || name === 'imposed') actor.sheet.setSource('price', [mod('addedCooldown', 'override', 3)]);
    if (name === 'global' || name === 'scoped') actor.sheet.setSource('global', [mod('cooldownRecovery', 'override', 2)]);
    if (name === 'scoped') actor.sheet.setSource('scoped', [mod('cooldownRecovery', 'override', 4, ['attack'])]);
    if (name === 'ratio-floor') actor.sheet.setSource('scoped', [mod('cooldownRecovery', 'override', 0.01, ['attack'])]);
    if (name === 'negative-levy-clamped') actor.sheet.setSource('price', [mod('addedCooldown', 'override', -12)]);
    if (name.startsWith('absorb')) first.def = {...first.def, guardArts: {absorb: {fraction: 1, duration: 2, cooldown: 7}}};
    if (name === 'absorb-payload') first.guardArtsPayload = true;
    const seconds = name === 'imposed' || name === 'no-clock' ? skillCooldownSeconds(actor, first, 0) : skillCooldownSeconds(actor, first);
    const expected: Record<string, number> = {base:10, added:13, global:10, scoped:5, 'ratio-floor':100, 'no-clock':0, 'negative-levy-clamped':10, imposed:3, absorb:7, 'absorb-payload':10};
    assert.equal(seconds, expected[name]); rows.push({family:'price', name, seconds, events});
  }
  for (const name of ['normal', 'nonpositive-preserves', 'ultimate-capped', 'ordinary-not-capped', 'total-write-failure', 'refund', 'refund-missing', 'refund-partial']) {
    const r = setup(), {actor, first, events} = r, before = r.state(), qa = {...ULT_QA};
    let error: string | null = null;
    try {
      if (name.includes('capped')) { ULT_QA.active = true; ULT_QA.cooldownCap = 3; }
      if (name === 'ultimate-capped') first.def = {...first.def, ultimate: {}};
      if (name === 'total-write-failure') actor.cooldownTotals.set = () => { throw Error('total write rejected'); };
      if (name === 'refund-partial') actor.cooldownTotals.delete = () => { throw Error('total delete rejected'); };
      if (name.startsWith('refund')) world['refundCooldown'](actor, name === 'refund-missing' ? '__missing' : A);
      else world['stampSkillCooldown'](actor, first, name === 'nonpositive-preserves' ? 0 : 20);
    } catch (caught) { error = (caught as Error).message; }
    finally { Object.assign(ULT_QA, qa); }
    if (name === 'ultimate-capped') assert.equal(actor.cooldowns.get(A), 3);
    if (name === 'nonpositive-preserves') assert.deepEqual(r.state(), before);
    rows.push({family:'stamp-refund', name, before, after:r.state(), events, error});
  }
  for (const name of ['empty', 'ordinary', 'duplicate-bar', 'negative-ignored', 'delete-on-expiry', 'unslotted', 'partial-stat-failure']) {
    const r = setup(), {actor, first, events} = r;
    actor.sheet.setSource('refund', [mod('orbRefund_life', 'override', name === 'negative-ignored' ? -2 : name === 'delete-on-expiry' ? 30 : 2)]);
    if (name === 'empty') actor.cooldowns.clear();
    if (name === 'duplicate-bar') actor.skills = [first, first];
    if (name === 'unslotted') actor.skills = [first];
    if (name === 'partial-stat-failure') {
      const get = actor.sheet.get.bind(actor.sheet); let calls = 0;
      actor.sheet.get = (...args) => { if (args[0] === 'orbRefund_life' && ++calls === 2) throw Error('refund stat rejected'); return get(...args); };
    }
    const before = r.state(); let error: string | null = null;
    try { world['refundOnOrb'](actor, 'life'); } catch (caught) { error = (caught as Error).message; }
    if (name === 'duplicate-bar') assert.equal(actor.cooldowns.get(A), 6);
    if (name === 'unslotted') assert.equal(actor.cooldowns.get(B), 4);
    rows.push({family:'orb-refund', name, before, after:r.state(), events, error});
  }
  for (const name of ['authored', 'empty-other', 'zero-still-notifies', 'signed-extension', 'delete-expired', 'snapshot-insert']) {
    const r = setup(), {actor, events} = r;
    const effect: SkillEffect = {type:'reduceCooldowns', seconds:name === 'signed-extension' ? -2 : name === 'zero-still-notifies' ? 0 : 2,
      fraction:name === 'authored' ? 0.25 : 0};
    const skill = makeSkillInstance({...SKILLS.time_dilation, effects:[effect]}, 1);
    actor.skills = [skill]; actor.cooldowns.set(skill.def.id, 16);
    if (name === 'empty-other') actor.cooldowns = r.watch(new Map([[skill.def.id,16]]), 'clock');
    if (name === 'delete-expired') actor.cooldowns.set(A, 1);
    if (name === 'snapshot-insert') {
      const clocks = actor.cooldowns; actor.cooldowns = r.watch(clocks, 'outer', id => { if (id === A) clocks.set('__late',9); });
    }
    const originalText = world.text; world.text = (_pos, text) => { events.push(['text',text]); };
    const before = r.state(); events.length = 0;
    try { world.executeSkill(actor, skill, actor.pos, {noCooldown:true,noRepeat:true}); }
    finally { world.text = originalText; }
    assert.equal(actor.cooldowns.get(skill.def.id),16);
    if (name === 'authored') assert.equal(actor.cooldowns.get(A),5.5);
    if (name === 'zero-still-notifies') assert(events.some(e=>e[0]==='text'&&e[1]==='time slips'));
    if (name === 'snapshot-insert') assert.equal(actor.cooldowns.get('__late'),9);
    rows.push({family:'skill-effect',name,before,after:r.state(),events});
  }
} finally { restore(); }
assert(process.argv[2]);
fs.writeFileSync(process.argv[2], JSON.stringify({schemaVersion:1, courses:rows.length, rows}, null, 2)+'\n', {flag:'wx'});
