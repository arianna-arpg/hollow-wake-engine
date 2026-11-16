import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url'; import {gunzipSync} from 'node:zlib';
import {DeathBursts} from '../dist/death-bursts.js';
import {createDamagePipeline} from '../dist/damage-pipeline.js';
import {StatSheet} from '../dist/stats.js'; import {StatRules} from '../dist/stat-rules.js';
import {combatHitHost} from '../test/combat-hit-host.mjs';
import {readCatalogue} from './catalogue-tools.mjs'; import {buildCombatQueries} from './compile-combat-queries.mjs';
import {sha256} from './reference-utils.mjs';

const probe = process.argv.includes('--probe');
const archive = fs.readFileSync(probe ? '.artifacts/m3-death-bursts-probe.json.gz' : 'baseline/death-bursts/observations.json.gz');
const bytes = gunzipSync(archive), fixture = JSON.parse(bytes); assert(fixture.originalOnly);
if (!probe) {const a = JSON.parse(fs.readFileSync('baseline/death-bursts/acceptance.json')); assert.equal(sha256(archive), a.compressedSha256); assert.equal(sha256(bytes), a.sha256);}
const owned = fs.realpathSync('.artifacts'), work = fs.mkdtempSync(path.join(owned, 'm3-death-bursts-owned-'));
try {
  await buildCombatQueries(work);
  const {combatSkillQueries: q} = await import(pathToFileURL(path.join(work, 'queries.mjs')).href);
  const catalogue = readCatalogue(), table = name => Object.fromEntries(catalogue.tables[name].map(r => [r.id, r.value]));
  const rules = new StatRules(table('stats'), table('rules').statTrades);
  const plain = value => JSON.parse(JSON.stringify(value));
  const body = a => ({id: a.id, team: a.team, pos: {...a.pos}, radius: a.radius, tier: a.tier,
    life: a.life, mana: a.mana, es: a.es, ward: a.ward, absorb: a.absorb, esDelay: a.esDelay,
    esBroke: a.esBroke, hitFlash: a.hitFlash, hitFlashType: a.hitFlashType, dead: a.dead,
    downed: a.downed, invulnerable: a.invulnerable, poise: a.poise, poiseBroken: a.poiseBroken,
    insight: a.insight, endurance: a.endurance, evadeEntropy: a.evadeEntropy, evadeWindow: a.evadeWindow});
  for (const c of fixture.courses) {
    const host = combatHitHost(), actors = [host.caster, host.target], events = [], rays = [], flashes = [], pending = [];
    let draws = 0;
    for (const [index, a] of actors.entries()) {
      Object.assign(a, c.initial[index]); a.name = index ? 'Target' : 'Source'; a.sheet = new StatSheet(rules);
      a.sheet.setBase('life', 100); a.sheet.setBase('poise', 0);
      a.maxLife = () => a.sheet.get('life'); a.maxPoise = () => a.sheet.get('poise'); a.insightMomentum = () => 0;
      for (const [k, v] of Object.entries(index ? c.recipe.targetStats ?? {} : c.recipe.stats ?? {})) a.sheet.setBase(k, v);
    }
    const damage = createDamagePipeline({...host.input.damage, ...q, random: () => {draws++; return .5;}});
    const runtime = new DeathBursts(pending, fixture.rules, {
      actors: () => actors, seats: () => [actors[1]], hostile: (a, b) => a.team !== b.team,
      clamp: (at, radius, from) => {rays.push([plain(at), radius, from ? plain(from) : null]); return c.recipe.wall ? {x: Math.min(5, at.x), y: at.y} : {...at};},
      convert: damage.applyConversion, hit: damage.applyHit, mitigate: damage.mitigateTyped,
      kill: (a, silent, source) => {events.push(['kill', a.id, silent, source?.id]); a.dead = true;},
      text: (...args) => events.push(['text', ...plain(args)]),
      flash: (at, radius, color, life) => flashes.push({pos: at, radius, color, life, maxLife: life}),
      outcome: (a, kind, at) => events.push(['outcome', a.id, kind, plain(at)]),
    });
    if (c.recipe.direct) runtime.explode(actors[0], c.recipe.config.damageFrac);
    else runtime.spawn(actors[0], c.recipe.config);
    for (const [index, step] of c.steps.entries()) {
      if (step.dt) runtime.advance(step.dt);
      assert.deepEqual(plain({pending, actors: actors.map(body), events, rays, flashes, draws}), step.state, c.name + ': ' + index);
    }
  }
  console.log({passed: true, originalDeathBurstCourses: fixture.courses.length,
    transitions: fixture.courses.reduce((n, c) => n + c.steps.length, 0), actualSdkDamage: true, fullDeathQualified: false});
} finally {assert.equal(path.dirname(fs.realpathSync(work)), owned); fs.rmSync(work, {recursive: true, maxRetries: 3});}
