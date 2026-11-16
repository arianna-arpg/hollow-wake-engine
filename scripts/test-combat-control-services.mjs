import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {sha256} from './reference-utils.mjs';
import {buildCombatContent} from './compile-combat-content.mjs';
import {installSharedCombat} from '../adapters/embedded/combat-shared-services.mjs';
import {installCombatHostServices} from '../adapters/embedded/combat-host-services.mjs';
import {installCombatCasting} from '../adapters/embedded/combat-casting-services.mjs';
import {installCombatRecovery} from '../adapters/embedded/combat-recovery-services.mjs';
import {installCombatControls} from '../adapters/embedded/combat-control-services.mjs';

function fixture(name) {
  const archive = fs.readFileSync(`baseline/${name}/observations.json.gz`), bytes = gunzipSync(archive);
  const acceptance = JSON.parse(fs.readFileSync(`baseline/${name}/acceptance.json`));
  assert.equal(sha256(archive), acceptance.compressedSha256); assert.equal(sha256(bytes), acceptance.sha256);
  const data = JSON.parse(bytes); assert(data.originalOnly); return data;
}
const parent = fs.realpathSync('.artifacts'), work = fs.mkdtempSync(path.join(parent, 'm3-controls-owned-'));
try {
  await buildCombatContent(path.join(work, 'content'));
  const {combatContent: content} = await import(pathToFileURL(path.join(work, 'content/content.mjs')));
  const q = {...content.queries, ...content.hitQueries};
  function owner(firstId, random) {
    const unused = () => assert.fail('Unexpected host query in control course');
    const space = Object.fromEntries(['arena', 'isWalkable', 'pointInSolid', 'dwellReachable', 'clipShot', 'nearestBody', 'inAoeBody', 'noteBodyHit', 'reachTo', 'strikeSurfaces', 'frontSplash', 'bodyWhere', 'freeSpot', 'emergenceGround'].map(n => [n, unused]));
    Object.assign(space, {clamp: p => p, layerAt: () => 0, lineOfSight: () => true, lineOfFire: () => true});
    const w = {host: {space}, observers: {}, time: 1, nextActorId: firstId, actors: [], seats: [], corpses: [], signals: [], flashes: [],
      random, failNoteAt: new Map(), pendingFuses: [], pendingBursts: [], pendingPersists: [], zones: [], projectiles: []};
    const shared = installSharedCombat(w, content);
    installCombatHostServices(w, content); installCombatCasting(w, content); installCombatRecovery(w, content, shared);
    const controls = installCombatControls(w, content);
    return {w, controls};
  }
  const original = fixture('grab'); let observations = 0;
  for (const course of original.courses) {
    const values = course.steps.at(-1).draws; let drawn = 0;
    const {w, controls} = owner(course.initial[0].id, () => {assert(drawn < values.length, 'Extra random draw'); return values[drawn++];});
    const skill = q.makeSkillInstance({id: 'm3-grab', name: 'Grab', description: '', tags: ['melee'], color: '#fff', manaCost: 0, useTime: 0, cooldown: 0,
      delivery: {type: 'self'}, effects: [{type: 'grabSeize', grab: {verb: 'carry'}}]}, 1);
    const actors = course.initial.map((initial, i) => {
      const actor = w.allocateActor(['holder', 'victim', 'receiver'][i], i === 1 ? 'enemy' : 'player', {...initial.pos});
      assert.equal(actor.id, initial.id); actor.radius = 10;
      for (const [stat, value] of Object.entries({life: 100, weight: 1, healTaken: 1})) actor.sheet.setBase(stat, value);
      actor.life = initial.life; actor.poise = actor.es = actor.ward = actor.endurance = 0;
      actor.skills = i === 1 ? [] : [skill]; return actor;
    });
    w.actors = actors;
    const [holder, victim, receiver] = actors, runtime = controls.grabs;
    const snapshot = () => JSON.parse(JSON.stringify(actors.map(a => ({id: a.id, pos: {...a.pos}, facing: a.facing, life: a.life,
      grip: a.gripping, held: a.heldBy, untargetable: a.untargetable, proof: a.grabProofUntil, statuses: a.statuses.map(s => s.id), target: a.aiTargetId}))));
    for (const {step, expected, draws} of course.steps) {
      switch (step.kind) {
        case 'seize': assert(runtime.seize(holder, skill, victim, course.grab)); break;
        case 'advance': w.time = step.time; runtime.advance(step.dt); break;
        case 'release': runtime.release(holder); break;
        case 'sever': holder.gripping.severed = 1; runtime.advance(.1); break;
        case 'struggle': holder.gripping.struggle = 1; runtime.advance(.1); break;
        case 'orphan': w.actors = [victim, receiver]; runtime.advance(.1); break;
        case 'handoff': assert(runtime.handoff(holder, victim, {})); break;
        default: assert.fail('Unknown control transition');
      }
      assert.deepEqual(snapshot(), expected, course.name + ':' + step.kind);
      assert.equal(drawn, draws.length, 'Original random continuation'); observations++;
    }
  }
  const possession = fixture('possession');
  for (const c of possession.courses) {
    const {w, controls} = owner(c.initial.controller.actor, () => .5); w.time = 10;
    const skill = q.makeSkillInstance(q.SKILLS.possession, 1);
    const bodies = c.initial.bodies.map((initial, i) => {
      w.nextActorId = initial.id;
      const actor = w.allocateActor(i ? 'body' : 'hero', initial.team, {...initial.pos});
      actor.radius = initial.radius; actor.kind = initial.kind;
      actor.sheet.setBase('life', i ? 100 : c.maxLife); actor.life = initial.life;
      if (i) {actor.defId = 'skeleton_warrior'; actor.faction = 'wild';}
      else {for (const [stat, value] of Object.entries(c.terms)) actor.sheet.setBase(stat, value); actor.skills = [skill];}
      return actor;
    });
    const [hero, target] = bodies, seat = {id: c.initial.controller.id, actor: hero};
    w.actors = [...bodies]; w.seats = [seat]; w.localSeat = seat;
    const inspect = () => JSON.parse(JSON.stringify({controller: {id: seat.id, actor: seat.actor.id, home: seat.home?.id}, roster: w.actors.map(a => a.id),
      bodies: bodies.map(a => ({id: a.id, life: a.life, dead: a.dead, pos: {...a.pos}, radius: a.radius, team: a.team, kind: a.kind,
        skills: a.skills.map(s => s?.def.id ?? null), statuses: a.statuses.map(s => s.id), vacated: a.vacated, ride: a.possession,
        cooldowns: [...a.cooldowns], totals: [...a.cooldownTotals],
        sources: ['possessed', 'vacated'].map(id => [id, a.sheet.getSourceMods(id)]).filter(([, mods]) => mods !== undefined)}))}));
    controls.possession.seize(hero, skill, target, c.spec);
    assert.deepEqual(inspect(), c.entered, c.reason + ':enter');
    if (c.reason === 'duration') {w.time = c.time; controls.possession.advance(.1);}
    else if (c.reason === 'huskPain') {hero.life -= hero.maxLife() * possession.rules.endOn.huskLostFrac; controls.possession.advance(.1);}
    else if (c.reason === 'huskSeized') {hero.heldBy = 999; controls.possession.advance(.1);}
    else if (c.reason === 'travel') {target.pos = {x: 900, y: 650}; controls.possession.advance(.1); controls.possession.eject(seat, c.reason);}
    else controls.possession.eject(seat, c.reason);
    assert.deepEqual(inspect(), c.final, c.reason + ':return');
    observations += 2;
  }
  console.log({passed: true, originalSharedGrabCourses: original.courses.length, originalSharedPossessionCourses: possession.courses.length,
    observations, accountDependency: false, allCombatFamiliesQualified: false});
} finally {
  assert.equal(path.dirname(fs.realpathSync(work)), parent);
  fs.rmSync(work, {recursive: true, maxRetries: 3});
}
