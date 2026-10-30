import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {createStatusDelivery} = await import(process.env.HWE_STATUS_DELIVERY_MODULE
  ? pathToFileURL(process.env.HWE_STATUS_DELIVERY_MODULE).href : '../dist/status-delivery.js');

function rig() {
  const events = [], hooks = {}, definitions = {impaled: {dischargeOnHit: true, color: 'steel'}, fire: {dischargeOnHit: true, color: 'red'}, doom: {color: 'violet'}};
  const record = (name, ...args) => {events.push([name, ...args]); hooks[name]?.(...args);};
  const actor = id => {
    const a = {id, pos: {east: id * 40, north: 7, height: 12}, radius: 10, team: 'ally', life: 900, dead: false,
      untargetable: false, statuses: [], metaInsts: new Map(), hitFlash: 0, healPower: 2,
      sheet: {get(key, tags, extra) {record('get', a, key, tags, extra); return a.healPower;},
        removeSource(key) {record('remove', a, key);}},
      healBy(n) {record('heal', a, n); if (!a.dead && n > 0) a.life += n;}};
    return a;
  };
  const caster = actor(1), first = actor(2), second = actor(3), actors = [caster, first, second], enemies = [first, second];
  first.team = second.team = 'enemy';
  const def = {id: 'draw', name: 'Draw', color: 'gold'}, spearDef = {id: 'spear', name: 'Spear', color: 'steel'}, inst = {level: 1, tree: false};
  const tags = new Set(['spell']), extra = [{value: 3}];
  const ports = {
    actors: () => actors, enemies: a => {record('enemies', a); return enemies;},
    distance: (a, b) => Math.hypot(a.east - b.east, a.north - b.north, a.height - b.height),
    copyPosition: at => {record('copy', at); return {...at};}, direction: (from, to) => {record('direction', from, to); return {from, to};},
    definition: id => {record('definition', id); return definitions[id];},
    transplant: (a, s, name, options) => {record('transplant', a, s, name, options); a.statuses.push({...s});},
    mitigateTyped: (a, amounts) => {record('mitigate', a, amounts); return Object.values(amounts).reduce((a, b) => a + b, 0);},
    kill: (a, silent, source) => {record('kill', a, silent, source); a.dead = true;},
    spearDefinition: () => {record('spearDefinition'); return spearDef;},
    hasTreeRecall: i => {record('tree', i); return i.tree;},
    effectiveLevel: i => {record('level', i); return i.level;},
    makeInstance: (d, level) => {const made = {def: d, level}; record('make', made); return made;},
    spawnProjectile: (...args) => record('spawn', ...args), text: (...args) => record('text', ...args),
    flash: (...args) => record('flash', ...args), failNote: (...args) => record('fail', ...args),
  };
  const service = createStatusDelivery(ports), siphonEffect = {type: 'siphonStatus', radius: 80, from: 'all', healPer: 5}, recallEffect = {type: 'recallImpales', radius: 80, damageScale: 1.2, spearShare: .5};
  return {events, hooks, definitions, caster, first, second, actors, enemies, def, spearDef, inst, tags, extra, ports, service, siphonEffect, recallEffect,
    siphon: () => service.siphon(caster, siphonEffect, 1, def, tags, extra, 'cosmetic'),
    recall: () => service.recall(caster, inst, recallEffect, 1, def)};
}
const status = (id = 'impaled', fields = {}) => ({id, remaining: 3, rupture: 100, ...fields});
const calls = (r, name) => r.events.filter(row => row[0] === name);
const spawned = r => calls(r, 'spawn').map(e => e[2]);

test('siphoning transfers reverse status order, then removes modifiers and heals with borrowed context', () => {
  const r = rig(), one = status('burn'), two = status('chill'); r.first.statuses = [one, two]; r.siphon();
  assert.deepEqual(calls(r, 'transplant').map(e => e[2]), [two, one]); assert.deepEqual(r.first.statuses, []);
  assert.deepEqual(r.events.filter(e => ['transplant', 'remove', 'get', 'heal'].includes(e[0])).map(e => e[0]), ['transplant', 'remove', 'get', 'heal', 'transplant', 'remove', 'get', 'heal']);
  assert.equal(r.caster.life, 920); assert.equal(calls(r, 'get')[0][3], r.tags); assert.equal(calls(r, 'get')[0][4], r.extra);
  assert.deepEqual(calls(r, 'transplant')[0].slice(3), ['Draw', {duration: 'remaining'}]);
  assert.deepEqual(calls(r, 'text').at(-1).slice(2), ['2 drawn', 'gold', 13, 22]);
  assert.deepEqual(calls(r, 'flash')[0].slice(2), [80, 'cosmetic', .3]);
});
test('siphon membership gates self, death, hidden bodies and every construct', () => {
  for (const gate of ['self', 'dead', 'untargetable', 'construct']) {
    const r = rig(); r.second.statuses = []; r.first.statuses = [status()];
    if (gate === 'self') r.actors.splice(0, r.actors.length, r.first); else if (gate === 'construct') r.first.construct = {breakable: false}; else r.first[gate] = true;
    r.service.siphon(gate === 'self' ? r.first : r.caster, r.siphonEffect, 1, r.def, r.tags, r.extra, 'x');
    assert.equal(calls(r, 'transplant').length, 0, gate); assert.equal(calls(r, 'fail').length, 1, gate);
  }
});
test('siphon team filters and inclusive scaled body edges are independent', () => {
  for (const from of ['allies', 'enemies', 'all']) {
    const r = rig(); r.first.team = 'ally'; r.first.statuses = [status('burn')]; r.second.statuses = [status('chill')]; r.siphonEffect.from = from; r.siphon();
    assert.deepEqual(r.caster.statuses.map(s => s.id), from === 'allies' ? ['burn'] : from === 'enemies' ? ['chill'] : ['burn', 'chill']);
  }
  const r = rig(); r.first.pos.east = r.caster.pos.east + 170; r.first.statuses = [status()];
  r.service.siphon(r.caster, r.siphonEffect, 2, r.def, r.tags, r.extra, 'x'); assert.equal(r.caster.statuses.length, 1);
  r.first.pos.east += .01; r.first.statuses = [status()]; r.siphon(); assert.equal(calls(r, 'fail').length, 1);
});
test('optional siphon status filters observe live changes between statuses', () => {
  const r = rig(); r.first.statuses = [status('burn'), status('chill'), status('doom')]; r.siphonEffect.statuses = ['chill'];
  r.hooks.transplant = () => {r.siphonEffect.statuses = ['burn'];}; r.siphon();
  assert.deepEqual(r.caster.statuses.map(s => s.id), ['chill', 'burn']); assert.deepEqual(r.first.statuses.map(s => s.id), ['doom']);
  r.siphonEffect.statuses = []; r.siphon(); assert.equal(calls(r, 'fail').length, 1);
});
test('declined transplant still removes, counts and heals the source status', () => {
  const r = rig(); r.ports.transplant = () => {}; r.first.statuses = [status()]; r.siphon();
  assert.equal(r.caster.statuses.length, 0); assert.equal(r.first.statuses.length, 0); assert.equal(r.caster.life, 910);
  assert.equal(calls(r, 'text').at(-1)[2], '1 drawn');
});
test('siphon healing reads live power per draw and honors zero versus negative healing', () => {
  const r = rig(); r.first.statuses = [status(), status()]; r.hooks.heal = () => {r.caster.healPower = 3;}; r.siphon(); assert.equal(r.caster.life, 925);
  const zero = rig(); zero.first.statuses = [status()]; zero.siphonEffect.healPer = 0; zero.siphon(); assert.equal(calls(zero, 'get').length, 0); assert.equal(calls(zero, 'heal').length, 0);
  const negative = rig(); negative.first.statuses = [status()]; negative.siphonEffect.healPer = -2; negative.siphon(); assert.equal(calls(negative, 'heal')[0][2], -4); assert.equal(negative.caster.life, 900);
});
test('siphon traverses its live collection and survives nested calls without shared counters', () => {
  const r = rig(); r.actors.splice(2, 1); r.first.statuses = [status('outer')]; r.second.statuses = [status('later')];
  r.hooks.transplant = () => {if (!r.actors.includes(r.second)) r.actors.push(r.second);}; r.siphon(); assert.deepEqual(r.caster.statuses.map(s => s.id), ['outer', 'later']);
  const nested = rig(); nested.first.statuses = [status('outer')]; nested.second.statuses = [status('inner')]; let once = false;
  nested.hooks.transplant = () => {if (!once) {once = true; nested.service.siphon(nested.caster, {...nested.siphonEffect, statuses: ['inner']}, 1, nested.def, nested.tags, nested.extra, 'inner');}};
  nested.siphon(); assert.deepEqual(calls(nested, 'text').map(e => e[2]), ['1 drawn', '1 drawn']); assert.equal(nested.caster.life, 920);
});
test('recall discharges typed banks and returns a physical spear with independent identity', () => {
  const r = rig(); const bank = status('fire', {rupture: 200, ruptureType: 'fire'}); r.first.statuses = [bank]; r.recall();
  assert.deepEqual(calls(r, 'mitigate')[0][2], {fire: 240}); assert.equal(r.first.life, 660); assert.equal(r.first.hitFlash, .12); assert.equal(r.first.hitFlashType, 'fire');
  const flight = calls(r, 'spawn')[0]; assert.equal(flight[1], r.caster); assert.notEqual(flight[3], r.first.pos); assert.deepEqual(flight[3], r.first.pos);
  assert.deepEqual(flight[4], {from: r.first.pos, to: r.caster.pos}); assert.deepEqual(flight[5], {flat: {physical: 100}});
  assert.equal(r.caster.metaInsts.get('__impale_spear'), flight[2]); assert.equal(r.service.isReturnedFrom(flight[2], r.inst), false);
  assert.deepEqual(calls(r, 'text').at(-1).slice(2), ['1 wrenched free!', 'gold', 13, 22]);
});
test('recall requires a discharge definition and a positive bank', () => {
  const r = rig(); r.first.statuses = [status('doom'), status('unknown'), status('impaled', {rupture: 0}), status('impaled', {rupture: -1}), status('impaled', {rupture: undefined})]; r.recall();
  assert.equal(r.first.statuses.length, 5); assert.equal(calls(r, 'mitigate').length, 0); assert.equal(calls(r, 'spawn').length, 0);
  assert.equal(calls(r, 'fail').length, 1);
  assert.deepEqual(calls(r, 'fail')[0].slice(2), ['draw:nospears', 'nothing lodged']);
});
test('recall uses exactly the queried victims and defaults missing bank types to physical', () => {
  const r = rig(); r.enemies.splice(1, 1); r.first.statuses = [status()]; r.second.statuses = [status()]; r.recall();
  assert.equal(calls(r, 'enemies').length, 1); assert.equal(calls(r, 'enemies')[0][1], r.caster);
  assert.deepEqual(calls(r, 'mitigate')[0][2], {physical: 120}); assert.equal(r.first.hitFlashType, 'physical');
  assert.equal(r.second.statuses.length, 1); assert.equal(r.second.life, 900);
});
test('recall trusts query membership but excludes breakable constructs and bodies beyond its scaled edge', () => {
  const r = rig(); r.first.construct = {breakable: true}; r.first.statuses = [status()]; r.second.construct = {breakable: false}; r.second.pos.east = r.caster.pos.east + 170; r.second.statuses = [status()];
  r.service.recall(r.caster, r.inst, r.recallEffect, 2, r.def); assert.equal(r.first.statuses.length, 1); assert.equal(r.second.statuses.length, 0);
  r.second.pos.east += .01; r.second.statuses = [status()]; r.service.recall(r.caster, r.inst, r.recallEffect, 2, r.def); assert.equal(r.second.statuses.length, 1);
  const trust = rig(); trust.first.team = 'ally'; trust.first.dead = true; trust.first.untargetable = true; trust.first.statuses = [status()]; trust.recall(); assert.equal(trust.first.statuses.length, 0);
});
test('recall reverse order and body order determine bank and projectile order', () => {
  const r = rig(); r.first.statuses = [status('impaled', {rupture: 100}), status('fire', {rupture: 200})]; r.second.statuses = [status('impaled', {rupture: 300})]; r.recall();
  assert.deepEqual(calls(r, 'spawn').map(e => e[5].flat.physical), [100, 50, 150]); assert.equal(calls(r, 'text').at(-1)[2], '3 wrenched free!');
});
test('bank removal precedes mitigation and live bank capture; text cannot change the captured bank', () => {
  const r = rig(), s = status(); r.first.statuses = [s]; r.hooks.remove = () => {assert.equal(r.first.statuses.length, 0); s.rupture = 250;};
  r.hooks.text = at => {if (at === r.first.pos) s.rupture = 700;}; r.recall(); assert.equal(r.first.life, 600); assert.equal(calls(r, 'spawn')[0][5].flat.physical, 125);
});
test('default, zero and negative damage and spear shares retain separate semantics', () => {
  for (const [damageScale, spearShare, life, physical] of [[undefined, undefined, 800, 50], [0, 0, 900, 0], [-1, -.5, 900, -50]]) {
    const r = rig(); Object.assign(r.recallEffect, {damageScale, spearShare}); r.first.statuses = [status()]; r.recall();
    assert.equal(r.first.life, life); assert.equal(calls(r, 'spawn')[0][5].flat.physical, physical); assert.equal(r.first.statuses.length, 0);
  }
});
test('absorbed bursts still consume the bank and launch; invulnerability is owned by mitigation', () => {
  const r = rig(); r.first.invulnerable = true; r.first.statuses = [status()]; r.ports.mitigateTyped = () => 0; r.recall();
  assert.equal(r.first.life, 900); assert.equal(r.first.hitFlash, 0); assert.equal(r.first.statuses.length, 0); assert.equal(calls(r, 'spawn').length, 1);
  const raw = rig(); raw.first.invulnerable = true; raw.first.statuses = [status()]; raw.recall(); assert.equal(raw.first.life, 780);
});
test('recall rereads definition color after mitigation and falls back only when absent', () => {
  const r = rig(); r.first.statuses = [status('impaled', {ruptureType: 'cold'})]; r.hooks.mitigate = () => {delete r.definitions.impaled;}; r.recall();
  assert.deepEqual(calls(r, 'text')[0].slice(2), ['120', '#c8ccd8', 12]); assert.equal(r.first.hitFlashType, 'cold');
});
test('lethal recall lands, flashes and reports damage before death with original credit', () => {
  const r = rig(); r.first.life = 100; r.first.statuses = [status()]; r.hooks.kill = (target, silent, caster) => {assert.equal(target.life, -20); assert.equal(target.hitFlash, .12); assert.equal(silent, false); assert.equal(caster, r.caster);}; r.recall();
  assert.equal(r.first.dead, true); assert(r.events.findIndex(e => e[0] === 'text') < r.events.findIndex(e => e[0] === 'kill'));
  const already = rig(); already.first.life = 1; already.first.dead = true; already.first.statuses = [status()]; already.recall(); assert.equal(calls(already, 'kill').length, 0);
});
test('native recall caches per caster, replaces at changed level and reads effective level lazily', () => {
  const r = rig(); r.first.statuses = [status()]; r.recall(); const first = spawned(r)[0]; assert.equal(calls(r, 'level').length, 1);
  r.first.statuses = [status()]; r.recall(); assert.equal(spawned(r)[1], first); assert.equal(calls(r, 'make').length, 1);
  r.inst.level = 4; r.first.statuses = [status()]; r.recall(); assert.notEqual(spawned(r)[2], first); assert.equal(spawned(r)[2].level, 4);
  assert.equal(calls(r, 'level').length, 4);
});
test('tree returns have distinct payloads and exact granting-instance identity across simulations', () => {
  const r = rig(); r.inst.tree = true; r.first.statuses = [status(), status()]; r.recall(); const [one, two] = spawned(r);
  assert.notEqual(one, two); assert.equal(r.caster.metaInsts.size, 0); assert(r.service.isReturnedFrom(one, r.inst)); assert(r.service.isReturnedFrom(two, r.inst));
  assert.equal(r.service.isReturnedFrom(one, {...r.inst}), false); assert.equal(createStatusDelivery(r.ports).isReturnedFrom(one, r.inst), false);
  const other = {...r.inst}; r.first.statuses = [status()]; r.service.recall(r.caster, other, r.recallEffect, 1, r.def); const third = spawned(r)[2];
  assert.equal(r.service.isReturnedFrom(third, r.inst), false); assert(r.service.isReturnedFrom(third, other));
  const survivors = [one, two, third].filter(spear => !r.service.isReturnedFrom(spear, r.inst)); assert.deepEqual(survivors, [third]);
});
test('missing spear definitions do not suppress spending or the success count', () => {
  const r = rig(); r.ports.spearDefinition = () => undefined; r.first.statuses = [status()]; r.recall();
  assert.equal(r.first.life, 780); assert.equal(r.first.statuses.length, 0); assert.equal(calls(r, 'make').length, 0); assert.equal(calls(r, 'text').at(-1)[2], '1 wrenched free!');
});
test('death and presentation callbacks can change level and share before the return is made', () => {
  const r = rig(); r.first.life = 1; r.first.statuses = [status()]; r.hooks.text = at => {if (at === r.first.pos) r.recallEffect.spearShare = .9;}; r.hooks.kill = () => {r.inst.level = 5;}; r.recall();
  assert.equal(spawned(r)[0].level, 5); assert.equal(calls(r, 'spawn')[0][5].flat.physical, 90);
});
test('nested recall owns its captures and counters while observing already removed banks', () => {
  const r = rig(); r.first.statuses = [status()]; r.second.statuses = [status('fire')]; let nested = false;
  r.hooks.spawn = () => {if (!nested) {nested = true; r.service.recall(r.caster, r.inst, {...r.recallEffect, damageScale: .5}, 1, r.def);}}; r.recall();
  assert.equal(r.first.life, 780); assert.equal(r.second.life, 850); assert.equal(calls(r, 'spawn').length, 2); assert.deepEqual(calls(r, 'text').filter(e => e[5] === 22).map(e => e[2]), ['1 wrenched free!', '1 wrenched free!']);
});
test('siphon callback failures retain exactly the preceding phase writes', () => {
  for (const hook of ['transplant', 'remove', 'get', 'heal']) {
    const r = rig(); r.first.statuses = [status()]; r.hooks[hook] = () => {throw Error(hook);}; assert.throws(r.siphon, new RegExp(hook));
    assert.equal(r.first.statuses.length, hook === 'transplant' ? 1 : 0, hook); assert.equal(r.caster.life, 900); assert.equal(calls(r, 'text').length, 0);
  }
});
test('recall callback failures retain prior bank writes and never emit final success', () => {
  for (const hook of ['remove', 'mitigate', 'text', 'spawn']) {
    const r = rig(); r.first.statuses = [status()]; r.hooks[hook] = () => {throw Error(hook);}; assert.throws(r.recall, new RegExp(hook));
    assert.equal(r.first.statuses.length, 0); assert.equal(r.first.life, ['text', 'spawn'].includes(hook) ? 780 : 900);
    assert.equal(calls(r, 'text').filter(e => e[5] === 22).length, 0);
  }
});
test('failed tree spawn keeps the association needed to retire any partially created flight', () => {
  const r = rig(); r.inst.tree = true; r.first.statuses = [status()]; let made;
  r.hooks.spawn = (_a, inst) => {made = inst; throw Error('flight');}; assert.throws(r.recall, /flight/); assert(r.service.isReturnedFrom(made, r.inst));
});
