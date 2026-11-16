import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {buildCombatContent} from './compile-combat-content.mjs';
import {installSharedCombat} from '../adapters/embedded/combat-shared-services.mjs';
import {installCombatRecovery} from '../adapters/embedded/combat-recovery-services.mjs';

const parent = fs.realpathSync('.artifacts');
const work = fs.mkdtempSync(path.join(parent, 'm3-shared-services-owned-'));
try {
  const manifest = await buildCombatContent(path.join(work, 'content'));
  const {combatContent} = await import(pathToFileURL(path.join(work, 'content/content.mjs')));
  const makeOwner = () => ({host: {}, observers: {}, time: 0, nextActorId: 1, actors: [],
    seats: [], flashes: [], pendingFuses: [], projectiles: [], pendingRepeats: [], zones: [], tethers: [],
    random: () => .5, text() {}, signal() {}, showSkillArrival() {}});
  const first = makeOwner(), second = makeOwner();
  const one = installSharedCombat(first, combatContent), two = installSharedCombat(second, combatContent);
  const recovery = installCombatRecovery(first, combatContent, one);
  installCombatRecovery(second, combatContent, two);
  const a = first.allocateActor('First', 'player', {x: 0, y: 0}), b = second.allocateActor('Second', 'enemy', {x: 20, y: 0});
  for (const body of [a, b]) {
    body.sheet.setBase('life', 100); body.sheet.setBase('mana', 50);
    body.sheet.setBase('energyShield', 20); body.fillResources();
  }
  assert.equal(a.id, 1); assert.equal(b.id, 1);
  assert.notEqual(a.statuses, b.statuses); assert.notEqual(a.charges, b.charges);
  assert.notEqual(first.guardArts.state, second.guardArts.state);
  first.timeflow.hold({id: 'one-only', scale: 0});
  assert.equal(second.timeflow.worldScale(), 1);
  assert.equal(a.healBy(10), 0); a.life = 80; assert.equal(a.healBy(7), 7);
  a.payCost({mana: 3, life: 2}); assert.equal(a.life, 85); assert.equal(a.mana, 47);
  a.applyStatus('burn', 5, 1, 'test');
  const dot = a.updateTimers(.1, .1);
  assert(dot && dot.fire > 0);
  const before = a.es + a.life;
  first.damage.applyDot(a, dot.fire, 'fire');
  assert(a.es + a.life < before);
  assert.equal(b.life, 100); assert.equal(b.statuses.length, 0);
  first.actors.push(a); second.actors.push(b);
  const skill = combatContent.hitQueries.makeSkillInstance(combatContent.hitQueries.SKILLS.firebolt, 1);
  a.life = 50; a.sheet.setBase('healPower', 1); a.sheet.setBase('healTaken', 1); a.sheet.setBase('critChance', 0);
  assert.equal(first.applyHeal(a, skill, a, {amount: 9}), 9);
  assert.equal(a.life, 59); assert.equal(b.life, 100);
  const manaBeforeRestore = a.mana;
  first.applyRestore(a, {resource: 'mana', amount: 2}, {tags: ['spell']});
  assert.equal(a.mana, manaBeforeRestore + 2);
  recovery.buffs.apply(a, skill, {type: 'buff', id: 'composition-test', duration: 1,
    mods: [{stat: 'lifeRegen', kind: 'flat', value: 5}]}, 1, 1);
  assert(a.buffs.has('composition-test')); assert.equal(b.buffs.size, 0);
  assert.equal(one.ports.preparation.definitionTags, combatContent.hitQueries.skillContextTags);
  assert.equal(two.ports.preparation.definitionTags, combatContent.hitQueries.skillContextTags);
  assert(Object.isFrozen(combatContent.hitQueries.SKILLS));
  assert(Object.isFrozen(combatContent.hitQueries.STATUS_DEFS));
  assert(Object.isFrozen(combatContent.staticRules.mimic));
  assert.throws(() => {combatContent.staticRules.mimic.bankSize = 999;}, TypeError);
  console.log({passed: true, sharedActorHitRecoveryServices: true, independentOwners: 2, authoredBytes: manifest.files['content.mjs'].bytes,
    originalSourceRequiredAtRuntime: false, fullOwnerQualified: false, allCombatFamiliesQualified: false});
} finally {
  assert.equal(path.dirname(fs.realpathSync(work)), parent);
  fs.rmSync(work, {recursive: true, maxRetries: 3});
}
