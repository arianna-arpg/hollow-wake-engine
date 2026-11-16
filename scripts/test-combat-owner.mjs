import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {buildCombatContent} from './compile-combat-content.mjs';
import {createCombatOwner} from '../adapters/embedded/combat-owner.mjs';
import {inspectCombatOwner} from './combat-owner-closure.mjs';
import {emptyCombatSpace} from '../test/combat-empty-space.mjs';
import {createCombatAdmission} from '../adapters/embedded/combat-admission.mjs';
import {installCombatClock} from '../adapters/embedded/combat-clock-services.mjs';

const parent = fs.realpathSync('.artifacts'), work = fs.mkdtempSync(path.join(parent, 'm3-owner-owned-'));
try {
  await buildCombatContent(path.join(work, 'content'));
  const {combatContent: content} = await import(pathToFileURL(path.join(work, 'content/content.mjs')));
  const q = {...content.queries, ...content.hitQueries};
  const host = {space: emptyCombatSpace()}, admission = createCombatAdmission(content, host);
  const owner = createCombatOwner(content, host, {seed: 1234, admit: admission.admit});
  const {w} = owner;
  const clock = installCombatClock(owner, content);
  const actor = w.allocateActor('Hero', 'player', {x: 400, y: 400});
  actor.kind = 'player'; actor.sheet.setBase('life', 1000); actor.sheet.setBase('mana', 1000);
  actor.life = actor.maxLife(); actor.mana = actor.maxMana();
  w.actors.push(actor);
  const seat = {id: 'hero', actor, meta: {knownSkills: new Map(), stances: new Map(), attrs: Object.fromEntries(Object.keys(q.ATTRIBUTES).map(id => [id, 100]))}, reviveDwellBy: new Map(), lastActedAt: -999};
  w.seats.push(seat); w.localSeat = seat;
  const missing = inspectCombatOwner(process.cwd(), w);
  assert.deepEqual(missing, [], 'Internal SDK owner calls must all resolve');
  const ordinary = Object.values(q.SKILLS).find(d => d.id === 'firebolt'); assert(ordinary);
  const skill = q.makeSkillInstance(ordinary, 1); actor.skills = [skill]; seat.meta.knownSkills.set(ordinary.id, skill);
  const beforeAdmission = () => ({mana: actor.mana, life: actor.life, casting: actor.casting, random: owner.rng.draws,
    cursors: actor.metaInsts.size, cooldowns: [...actor.cooldowns], runes: [...actor.runes], projectiles: w.projectiles.length, zones: w.zones.length});
  const rejectWithoutPayment = inst => {
    const before = beforeAdmission(); let targeting = 0;
    const resolve = w.resolveTargeting; w.resolveTargeting = (...args) => {targeting++; return resolve(...args);};
    try {assert.equal(w.useSkill(actor, inst, {x: 600, y: 400}, true), false);}
    finally {w.resolveTargeting = resolve;}
    assert.deepEqual(beforeAdmission(), before); assert.equal(targeting, 0);
  };
  const ray = host.space.castGridRay; delete host.space.castGridRay;
  rejectWithoutPayment(skill); host.space.castGridRay = ray;
  rejectWithoutPayment(q.makeSkillInstance({...ordinary, effects: [{type: 'unknown-test-effect'}]}, 1));
  for (const id of ['glare_ice', 'invoke_glaciation', 'vent_hop', 'zephyr_step']) rejectWithoutPayment(q.makeSkillInstance(q.SKILLS[id], 1));
  const support = Object.values(q.SUPPORTS).find(def => {
    const trial = q.makeSkillInstance(ordinary, 1); trial.sockets = [{def, level: 1}];
    return q.hostSockets(trial).length === 1;
  });
  assert(support);
  const held = q.makeSkillInstance(ordinary, 1);
  assert.equal(admission.inspect(actor, held), null);
  // Same retained skill, replaced socket contents: no identity-only admission cache.
  held.sockets = [{def: {...support, mods: [], meta: {skillId: 'glare_ice', label: 'test'}}, level: 1}];
  assert.equal(admission.inspect(actor, held)?.service, 'fields.terrain'); rejectWithoutPayment(held);
  const invoker = Object.values(q.SKILLS).find(def => def.invokes); assert(invoker);
  actor.runes = ['rime', 'rime', 'rime']; rejectWithoutPayment(q.makeSkillInstance(invoker, 1)); actor.runes = [];
  assert(w.useSkill(actor, skill, {x: 600, y: 400}, true), JSON.stringify(w.signals));
  for (let i = 0; i < 20 && !w.projectiles.length; i++) clock.advance(.1);
  assert(w.projectiles.length > 0, 'Paid cast must deliver through actual execution and projectile services');
  assert(actor.mana < actor.maxMana(), 'Cast must pay once');
  const before = w.projectiles[0].pos.x; w.updateProjectiles(.05); assert(w.projectiles[0].pos.x > before);
  console.log({passed: true, internalAssembly: true, closedOwnerCalls: true, sharedPaidProjectileCast: true,
    prepaymentRefusalCases: 8, retainedSupportAdmission: true, invocationAdmission: true,
    publicAdmissionQualified: false, allCombatFamiliesQualified: false});
} finally {
  assert.equal(path.dirname(fs.realpathSync(work)), parent);
  fs.rmSync(work, {recursive: true, maxRetries: 3});
}
