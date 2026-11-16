import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {buildCombatContent} from './compile-combat-content.mjs';
import {installSharedCombat} from '../adapters/embedded/combat-shared-services.mjs';
import {installCombatCasting} from '../adapters/embedded/combat-casting-services.mjs';

// Binding integration evidence, not a substitute for the composed delivery
// courses. Release is explicitly observed at the execution boundary here.
const parent = fs.realpathSync('.artifacts');
const work = fs.mkdtempSync(path.join(parent, 'm3-casting-services-owned-'));
try {
  await buildCombatContent(path.join(work, 'content'));
  const {combatContent: content} = await import(pathToFileURL(path.join(work, 'content/content.mjs')));
  const q = content.hitQueries;
  const makeOwner = () => {
    let seed = 1337;
    const w = {host: {}, observers: {}, time: 0, nextActorId: 1, actors: [], seats: [], flashes: [],
      pendingFuses: [], pendingBursts: [], pendingPersists: [], pendingRepeats: [], projectiles: [], zones: [],
      lite: {liveCount: 0}, releases: [], notices: [], failNoteAt: new Map(),
      random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296),
      seatOf: actor => w.seats.find(s => s.actor === actor), actorById: id => w.actors.find(a => a.id === id),
      markSeatActed: actor => {actor.acted = true;},
      text: (...args) => {w.random(); w.notices.push(args);},
      executeSkill: (actor, inst, aim, options) => {w.releases.push({actor, inst, aim: {...aim}, options}); return true;},
      signal() {}, characterChanged() {}, markMetaDirty() {},
    };
    installSharedCombat(w, content);
    const casting = installCombatCasting(w, content);
    w.useSkill = (...args) => casting.dispatch.request(...args);
    const actor = w.allocateActor('Caster', 'player', {x: 0, y: 0});
    actor.kind = 'player';
    for (const [stat, value] of Object.entries({life: 1000, mana: 1000, poise: 100})) actor.sheet.setBase(stat, value);
    actor.fillResources();
    w.player = actor; w.actors.push(actor);
    const seat={actor,meta:{knownSkills:new Map(),stances:new Map(),attrs:Object.fromEntries(Object.keys(q.ATTRIBUTES).map(id=>[id,100]))}};
    w.seats.push(seat);w.localSeat=seat;
    return {w, actor, casting};
  };
  let checked = 0;
  for (const [id, mode] of [['firebolt', 'cast'], ['lightning_blast', 'charge'], ['infernal_ray', 'channel'], ['infinite_slashes', 'multitude']]) {
    const {w, actor} = makeOwner();
    assert(q.SKILLS[id], id);
    const inst = q.makeSkillInstance(q.SKILLS[id], 1);
    actor.skills.push(inst); w.seats[0].meta.knownSkills.set(id, inst);
    const price = actor.skillCost(inst), mana = actor.mana;
    assert.equal(w.useSkill(actor, inst, {x: 80, y: 0}, true), true, id);
    assert.equal(actor.casting?.mode, mode, id);
    assert.equal(actor.casting.inst, inst, 'Cast keeps the admitted skill identity');
    assert.equal(actor.mana, mode === 'channel' ? mana : mana - price.mana, id + ': payment');
    if (mode === 'charge') {
      w.updateCasting(actor, actor.casting.total);
      assert.equal(w.releases.length, 0, 'Player charge stays held at its cap');
      actor.casting.held = false; w.updateCasting(actor, 0);
    } else if (mode === 'channel') {
      w.updateCasting(actor, 1);
      assert(w.releases.length > 0, 'Channel releases a pulse through the same owner');
      assert(actor.mana < mana, 'Channel pays during its pulse');
      actor.casting.held = false; w.updateCasting(actor, 0);
    } else w.updateCasting(actor, actor.casting.total);
    assert(w.releases.length > 0, id + ': release');
    assert(w.releases.every(r => r.actor === actor && r.inst === inst), 'Releases preserve identities');
    assert.equal(actor.casting, null, id + ': retired cast');
    checked++;
  }
  {
    const first = makeOwner(), second = makeOwner();
    const a = q.makeSkillInstance(q.SKILLS.firebolt, 1), b = q.makeSkillInstance(q.SKILLS.firebolt, 1);
    first.actor.skills.push(a); second.actor.skills.push(b);
    first.actor.mana = 0;
    const before = {life: first.actor.life, mana: first.actor.mana, random: first.w.random};
    assert.equal(first.w.useSkill(first.actor, a, {x: 50, y: 0}), false);
    assert.equal(first.actor.life, before.life); assert.equal(first.actor.mana, before.mana);
    assert.equal(first.w.releases.length, 0); assert.equal(first.actor.casting, null);
    assert(second.w.useSkill(second.actor, b, {x: 50, y: 0}));
    second.actor.applyStatus('stun', 0, 1, 'interruption');
    second.w.updateCasting(second.actor, .1);
    assert.equal(second.actor.casting, null); assert.equal(second.w.releases.length, 0);
    assert.equal(first.actor.statuses.length, 0);
    checked += 2;
  }
  console.log({passed: true, composedCastingCases: checked, actualActorPayment: true,
    releaseBoundaryObserved: true, fullOwnerQualified: false, allCombatFamiliesQualified: false});
} finally {
  assert.equal(path.dirname(fs.realpathSync(work)), parent);
  fs.rmSync(work, {recursive: true, maxRetries: 3});
}
