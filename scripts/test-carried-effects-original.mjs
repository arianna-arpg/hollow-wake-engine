import fs from 'node:fs'; import assert from 'node:assert/strict'; import {gunzipSync} from 'node:zlib';
import {createCarriedEffects} from '../dist/carried-effects.js';
import {StatSheet} from '../dist/stats.js'; import {StatRules} from '../dist/stat-rules.js';
import {readCatalogue} from './catalogue-tools.mjs'; import {sha256} from './reference-utils.mjs';
const probe = process.argv.includes('--probe');
const archive = fs.readFileSync(probe ? '.artifacts/m3-carried-effects-probe.json.gz' : 'baseline/carried-effects/observations.json.gz');
const bytes = gunzipSync(archive), fixture = JSON.parse(bytes); assert(fixture.originalOnly && fixture.contactSelectionOnly);
if (!probe) {const a = JSON.parse(fs.readFileSync('baseline/carried-effects/acceptance.json')); assert.equal(sha256(archive), a.compressedSha256); assert.equal(sha256(bytes), a.sha256);}
const catalogue = readCatalogue(), table = name => Object.fromEntries(catalogue.tables[name].map(r => [r.id, r.value]));
const stats = new StatRules(table('stats'), table('rules').statTrades), plain = value => JSON.parse(JSON.stringify(value));
for (const c of fixture.courses) {
  const recipe = c.recipe, controllers = createCarriedEffects(fixture.rules), controller = controllers[recipe.family];
  const actors = c.actors.map((input, index) => ({...input, level: 1, pos: index ? {x: 60 * Math.cos((index - 1) * Math.PI / 4), y: 60 * Math.sin((index - 1) * Math.PI / 4)} : {x: 0, y: 0},
    tier: 0, dead: false, downed: false, untargetable: false, sheet: new StatSheet(stats)}));
  const owner = actors[0], stat = ({satellites: 'satelliteCount_', auroras: 'auroraCapacity_', guardians: 'guardianCount_', creepers: 'creeperCount_'})[recipe.family] + recipe.id;
  owner.sheet.setBase(stat, 2); const instances = new Map(Object.entries(fixture.definitions).map(([id, def]) => [id, {def, level: 1}]));
  const events = []; let frame = 0, blocked = false, active = true;
  const context = {active: () => active, elapsed: (_a, dt) => dt,
    enemies: a => actors.filter(b => b.team !== a.team && !b.dead), hostile: (a, b) => a.team !== b.team,
    clear: () => !blocked, instance: (_a, id) => instances.get(id),
    hit: (a, i, target) => {events.push(['hit', frame, a.id, i.def.id, target.id]); if (recipe.mutation === 'retire-on-hit') controller.retire(a);},
    radius: (_a, i) => i.def.delivery.radius ?? 5,
    launch: (a, i, from, direction) => events.push(['launch', frame, a.id, i.def.id, plain(from), direction]),
    move: (_a, from, to, _radius, distance) => {if (blocked) return {...from}; const length = Math.hypot(to.x - from.x, to.y - from.y), scale = length ? Math.min(1, distance / length) : 0;
      return {x: from.x + (to.x - from.x) * scale, y: from.y + (to.y - from.y) * scale};}};
  for (frame = 0; frame < c.steps.length; frame++) {
    if (frame === 10) {
      switch (recipe.mutation) {
        case 'teleport': owner.pos = {x: 500, y: 0}; break;
        case 'allegiance': owner.faction = 'new-side'; break;
        case 'removed': owner.sheet.setBase(stat, 0); break;
        case 'downed': owner.downed = true; break;
        case 'inactive': active = false; break;
        case 'blocked': blocked = true; break;
        case 'resize': owner.sheet.setBase(stat, 3); break;
      }
    }
    controller.update(actors, .25, context);
    if (frame % 4 === 0) {
      if (recipe.family === 'guardians') events.push(['intercept', frame, controllers.guardians.intercept(actors[1], 0, {x: 200, y: 0}, {x: -200, y: 0}, 4, context) ?? null]);
      else if (recipe.family === 'satellites') {
        const result = controllers.satellites.reflectProjectiles(actors[1], 0, {x: 200, y: 0}, {x: -200, y: 0}, 10, context);
        events.push(['reflect', frame, result ? {...result, owner: result.owner.id} : null]);
      }
    }
    assert.deepEqual(plain({visuals: controller.visuals, flights: recipe.family === 'satellites' ? controllers.satellites.flights.visuals : [], events}), c.steps[frame], c.name + ': ' + frame);
  }
  controller.retire(owner); assert.deepEqual(plain(controller.visuals), c.retired);
  controller.clear(); assert.deepEqual(plain(controller.visuals), c.cleared);
}
console.log({passed: true, originalCarriedCourses: fixture.courses.length,
  transitions: fixture.courses.reduce((n, c) => n + c.steps.length, 0), contactSelectionOnly: true, allCombatFamiliesQualified: false});
