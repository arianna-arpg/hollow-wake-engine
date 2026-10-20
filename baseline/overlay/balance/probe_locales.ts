import assert from 'node:assert/strict';
import { makeSimWorld } from '../src/sim/arena';
import { localePrograms, compileLocale, validateLocaleProgram, localeProgram } from '../src/world/locales';
import { generateLayout, hasDoodadRule } from '../src/engine/levelgen';
import { hasDistrictBuilder } from '../src/engine/localeGen';
import { Rng } from '../src/core/rng';
import { regionKind } from '../src/world/regions';
import { featuresAt, featuresInRect, mapFeatureKind, registerMapFeature } from '../src/world/atlas';
import { riverPathsInRect } from '../src/world/relief';
import { countRoads, placeZoneAt, roadBudgetOf, settleWeb, type ZoneSpec } from '../src/engine/worldgen';
import { serializeZone, applyZone } from '../src/net/snapshot';
import { sanitizeWorldZones } from '../src/meta/worldstate';
import type { ZoneDef } from '../src/data/zones';
import { LOCALE_FRAGMENTS } from '../src/data/localeFragments';
import { transformFragment, validateLocaleFragment } from '../src/world/localeFragments';
import { extractTerrainFragment, type AuthoredMapDef } from '../src/engine/authoredMaps';
import { explorationLocalePools, pickExplorationLocale, expandExplorationSize, ZONE_VARIETY } from '../src/world/zoneVariety';
import { BIOMES } from '../src/world/biomes';
import { UNDER_SPANS, registerUnderSpan } from '../src/data/underspans';

const world = makeSimWorld('warrior', 0xa71a501);
const theme = world.zone.theme;
assert.throws(() => registerMapFeature({ ...mapFeatureKind('river_citadel')!, id: 'qa_invalid_locale',
  find: { kind: 'river-sites', minRun: 1, progress: [0.2, 0.8], chance: 1, salt: 1 } }), /invalid river-sites/);
const shapes = new Set<string>();
for (const program of localePrograms()) {
  assert.deepEqual(validateLocaleProgram(program, { builder: hasDistrictBuilder, doodad: hasDoodadRule,
    region: id => !!regionKind(id), walkable: id => !!regionKind(id)?.walkable }), []);
  const invalid = structuredClone(program);
  invalid.variants[0].links = [];
  assert.ok(validateLocaleProgram(invalid).some(e => e.includes('disconnected')));
  const unknown = structuredClone(program);
  unknown.variants[0].districts[0].builder = 'missing';
  assert.ok(validateLocaleProgram(unknown, { builder: hasDistrictBuilder }).some(e => e.includes('unknown builder')));
  for (const variant of program.variants) for (const seed of [17, 3000026, 90011, 81933]) {
    const locale = compileLocale(program, seed, variant.id);
    assert.deepEqual(compileLocale(program, seed, variant.id), locale);
    for (const riverSides of (locale.river ? [['w', 'e'], ['n', 's']] : [['w', 'e']])) {
      const def: ZoneDef = { id: 'qa_locale', name: program.label, level: 5, size: locale.size ?? program.size,
        theme, locale, layoutType: 'districts', layoutParams: { riverSides }, layout: [],
        seed, objective: { kind: 'clear' }, exits: [], map: { x: 0, y: 0 } };
      const entry = { x: 120, y: def.size.h / 2 }, exits = [{ x: def.size.w - 120, y: def.size.h / 2 }, { x: def.size.w / 2, y: 120 }];
      const generated = generateLayout(def, def.size, new Rng(seed), entry, exits);
      const grid = generated.walk!;
      assert.ok(generated.localeReport);
      for (const p of [...exits, ...generated.localeReport!.districts.map(d => d.center)]) assert.ok(grid.reachable!(entry, p), `${program.id}/${variant.id}: required destination reachable after all final passes`);
      const caves = generated.doodads.filter(d => d.kind === 'cave_entrance');
      assert.equal(caves.length, locale.districts.filter(d => d.cave).length);
      assert.equal(caves.length, generated.caveSeeds.length);
      for (const cave of caves) assert.ok(grid.reachable!(entry, cave.pos));
      if (locale.river) assert.ok(generated.localeReport!.crossings.length > 0, 'routes cross the actual water');
      if (locale.river) assert.ok(generated.localeReport!.crossings.some(p => grid.regionAt!(p.x, p.y) === locale.river!.crossing), 'crossing terrain survives final passes');
      let water = 0;
      const mask: string[] = [];
      for (let y = 15; y < def.size.h; y += 30) for (let x = 15; x < def.size.w; x += 30) {
        const kind = grid.regionAt!(x, y); mask.push(kind);
        if (kind === locale.river?.region) water++;
      }
      if (locale.river) assert.ok(water > 40, program.id + '/' + variant.id + '/' + seed + '/' + riverSides + ': river remains actual water outside the crossings');
      shapes.add(mask.join(','));
      const replay = generateLayout(JSON.parse(JSON.stringify(def)), def.size, new Rng(seed), entry, exits);
      assert.deepEqual(replay.localeReport, generated.localeReport);
      assert.deepEqual(replay.doodads, generated.doodads);
    }
  }
}
assert.equal(shapes.size, localePrograms().flatMap(p => p.variants).reduce((n, v) => n + (v.river ? 8 : 4), 0), 'different route graphs, orientations and seeds produce different terrain');
console.log('PASS locale programs validate, diversify geometry, preserve waterways and replay reachable routes and caves');

const refs = { region: (id: string) => !!regionKind(id), walkable: (id: string) => !!regionKind(id)?.walkable };
for (const fragment of Object.values(LOCALE_FRAGMENTS)) {
  assert.deepEqual(validateLocaleFragment(fragment, refs), []);
  assert.deepEqual(transformFragment(fragment, 4, false), fragment);
  assert.deepEqual(transformFragment(transformFragment(fragment, 0, true), 0, true), fragment);
  for (const mirror of [false, true]) for (const turns of [0, 1, 2, 3]) for (const side of [1500, 3600]) {
    const transformed = transformFragment(fragment, turns, mirror);
    assert.deepEqual(validateLocaleFragment(transformed, refs), []);
    const program = { id: 'qa_fragments', version: 1, label: 'Fragment test', size: { w: side, h: side }, variants: [{
      id: 'connections', weight: 1, entrance: 'entry', goal: 'piece', districts: [
        { id: 'entry', builder: 'open', at: [0.2, 0.2] as [number, number], size: [0.28, 0.28] as [number, number] },
        { id: 'piece', builder: 'fragment', at: [0.65, 0.65] as [number, number], size: [0.30, 0.30] as [number, number], fragment: transformed },
      ], links: [{ from: 'entry', to: 'piece', role: 'main' as const, width: 120 }],
    }] };
    assert.deepEqual(validateLocaleProgram(program, { ...refs, builder: hasDistrictBuilder }), []);
    const locale = compileLocale(program, 71), entry = { x: 100, y: side / 2 };
    const exits = [{ x: side - 100, y: side / 2 }, { x: side / 2, y: 100 }, { x: side / 2, y: side - 100 }];
    const def: ZoneDef = { ...structuredClone(world.zone), id: 'qa_fragment', size: program.size, layout: [],
      layoutType: 'districts', locale, seed: 71, exits: [], objective: { kind: 'clear' }, shape: 'rect' };
    delete def.landmarks; delete def.compositions; delete def.structures;
    const gen = generateLayout(def, def.size, new Rng(71), entry, exits);
    for (const p of [...exits, ...gen.localeReport!.districts.map(d => d.center)]) assert.ok(gen.walk!.reachable!(entry, p), `${fragment.id}/${turns}/${mirror}/${side}`);
  }
}
const source: AuthoredMapDef = { id: 'qa_source', name: 'Crop', tileset: 'meadow', cols: 9, rows: 9,
  grid: Array.from({ length: 9 }, () => '.........'), legend: { '.': { region: 'water' } } };
const crop = extractTerrainFragment(source, 'qa_crop', { x: 1, y: 1, w: 7, h: 7 }, { entry: [0.5, 0.5] });
assert.equal(crop.cells[0][0], 'water', 'crop resolves the source map legend');
assert.deepEqual(crop.source, { map: 'qa_source', x: 1, y: 1, w: 7, h: 7 });
source.grid[1] = '#########';
assert.equal(crop.cells[0][0], 'water', 'source edits cannot mutate a baked fragment');
assert.throws(() => extractTerrainFragment(source, 'bad', { x: 5, y: 1, w: 7, h: 7 }, {}), /escapes/);
console.log('PASS authored terrain extraction, all fragment transforms and minimum-size doorway connectivity');

for (const pool of explorationLocalePools()) {
  assert.ok(pool.biomes.every(b => BIOMES[b]), `${pool.id}: live biome references`);
  const counts = new Map<string, number>();
  for (let seed = 0; seed < 1000; seed++) {
    const choice = pickExplorationLocale(pool.biomes[0], seed) ?? 'fallback';
    counts.set(choice, (counts.get(choice) ?? 0) + 1);
  }
  assert.ok(counts.get('fallback')! > 500 && counts.get('fallback')! < 700, 'traditional layouts remain the majority');
  for (const row of pool.locales) assert.ok(counts.get(row.program)! > 120, 'every registered locale reaches exploration');
}
assert.equal(pickExplorationLocale('ocean', 73), undefined);
assert.deepEqual(expandExplorationSize({ w: 2000, h: 1500 }, 'surface'), { w: 2240, h: 1680 });
assert.deepEqual(expandExplorationSize({ w: 2000, h: 1500 }, 'cave'), { w: 2240, h: 1680 });
assert.deepEqual(expandExplorationSize({ w: 7000, h: 5900 }, 'surface'), { w: 7000, h: ZONE_VARIETY.maxExpandedAxis });
const varied = localeProgram('woodland_paths')!, plans = Array.from({ length: 100 }, (_, i) => compileLocale(varied, i));
assert.ok(new Set(plans.map(p => p.size!.w)).size > 80, 'size is continuous and seed-dependent');
assert.ok(plans.every(p => p.size!.w >= varied.size.w * varied.sizeScale![0] && p.size!.w <= varied.size.w * varied.sizeScale![1]));
assert.ok(plans.every(p => p.districts.every(d => !d.choices) && p.links.every(l => l.chance === undefined)), 'choices and shortcuts are baked');
const fragmentPlans = plans.filter(p => p.districts.some(d => d.fragment));
assert.ok(fragmentPlans.length > 80);
const baked = structuredClone(fragmentPlans[0]);
const copyProgram = structuredClone(varied);
copyProgram.variants[0].districts[1].choices![0].fragment!.cells[0][0] = 'water';
assert.deepEqual(fragmentPlans[0], baked, 'saved plans do not depend on mutable authored content');
const badShortcut = structuredClone(varied);
badShortcut.variants[0].links[0].chance = 0.5;
badShortcut.variants[0].links[1].chance = 0.5;
assert.ok(validateLocaleProgram(badShortcut).some(e => e.includes('disconnected')));
console.log('PASS exploration weights, size policy, independently baked choices and guaranteed route graph');

const fieldSeed = world.sim.biomeField.fieldSeed, origin = world.zone.map;
const min = { x: origin.x - 40000, y: origin.y - 40000 }, max = { x: origin.x + 40000, y: origin.y + 40000 };
const sites = featuresInRect(min, max).filter(f => mapFeatureKind(f.kind)?.destination);
assert.ok(sites.some(f => f.kind === 'river_citadel') && sites.some(f => f.kind === 'river_arches'), 'fixed seed must exercise both site families');
const site = sites.find(f => f.kind === 'river_citadel')!;
assert.ok(riverPathsInRect(site.seat, site.seat, fieldSeed).some(path => path.some(p => Math.hypot(p.x - site.seat.x, p.y - site.seat.y) < 1)), 'atlas destination stands on the drawn river');
for (const f of sites.slice(0, 12)) {
  assert.deepEqual(featuresAt(f.seat).find(h => h.feature.id === f.id)?.feature, f, 'mint and chart find the same full feature');
  assert.ok(featuresInRect(f.seat, f.seat).some(other => other.id === f.id), 'query window does not move or lose a site');
}
const anchor = (id: string, dx: number, dy: number): ZoneDef => ({ ...structuredClone(world.zone), id, objective: { kind: 'clear' },
  map: { x: site.seat.x + dx, y: site.seat.y + dy }, exits: [], veiled: true });
const a = anchor('qa_approach_a', -350, 0), b = anchor('qa_approach_b', 0, 350);
const map = { [a.id]: a, [b.id]: b };
const spec: ZoneSpec = { fieldBiome: true, tileset: 'meadow', biomeFor: () => 'plains', level: 5, forceFrontiers: 2, linkBack: true };
const def = placeZoneAt({ x: site.seat.x + 15, y: site.seat.y }, a, map, 91, spec);
map[def.id] = def;
assert.equal(def.destination?.feature, site.id);
assert.deepEqual(def.map, site.seat);
assert.equal(def.name, site.name);
assert.deepEqual(def.layoutParams?.riverSides, site.riverSides);
assert.equal(def.veiled, true);
const plan = structuredClone(def.locale);
const fromOther = placeZoneAt({ x: site.seat.x, y: site.seat.y + 15 }, b, map, 92, spec);
assert.equal(fromOther, def, 'second approach returns the same object and node');
assert.ok(def.exits.some(e => e.to === a.id) && def.exits.some(e => e.to === b.id));
assert.ok(b.exits.some(e => e.to === def.id));
assert.ok(!def.exits.some(e => e.to === def.id));
const count = def.exits.length;
placeZoneAt(site.seat, b, map, 93, spec);
assert.equal(def.exits.length, count, 'repeat approach does not duplicate roads');
assert.deepEqual(def.locale, plan);
settleWeb(map, null, { around: def.map });
assert.deepEqual(def.map, site.seat, 'settling cannot move a landmark off its atlas seat');
const next = placeZoneAt(site.seat, def, map, 94, { ...spec, linkBack: false });
map[next.id] = next;
assert.notEqual(next.id, def.id, 'leaving a landmark cannot lead back into itself');
assert.equal(placeZoneAt(site.seat, a, structuredClone(map), 95, { ...spec, linkBack: false, fieldBiome: false }).destination, undefined);
assert.equal(placeZoneAt(site.seat, a, structuredClone(map), 96, { ...spec, linkBack: false, layoutType: 'plains' }).destination, undefined);
assert.equal(placeZoneAt(site.seat, a, structuredClone(map), 97, { ...spec, linkBack: false, dimension: 'hell' }).destination, undefined);
console.log('PASS real atlas rivers create stable destinations, distinct approaches reconnect, directed mints stay explicit');

// THE ROAD BUDGET on the reconnect: fresh approaches link the destination
// only while it stands under its biome budget; at budget an approach
// consolidates onto its own anchor (returns it — no road cut either way),
// while an anchor already linked still resolves to the destination.
{
  const budget = roadBudgetOf(def);
  const seats = [[-350, 0], [0, 350]] as const;
  let n = 0;
  while (countRoads(def) < budget) {
    const [dx, dy] = seats[n % 2];
    const c = anchor(`qa_approach_c${n++}`, dx, dy);
    map[c.id] = c;
    assert.equal(placeZoneAt({ x: site.seat.x + 15, y: site.seat.y }, c, map, 200 + n, spec), def, 'an under-budget destination takes the approach');
    assert.ok(def.exits.some(e => e.to === c.id) && c.exits.some(e => e.to === def.id), 'the approach links both ways');
    assert.ok(n <= budget, 'the fill terminates at the budget');
  }
  assert.equal(countRoads(def), budget, 'the destination stands exactly at its budget');
  const over = anchor('qa_approach_over', -350, 0);
  map[over.id] = over;
  const doors = def.exits.length;
  assert.equal(placeZoneAt({ x: site.seat.x + 15, y: site.seat.y }, over, map, 300, spec), over, 'at budget the approach consolidates onto its anchor');
  assert.equal(def.exits.length, doors, 'the refusal cuts no door on the destination');
  assert.equal(over.exits.length, 0, 'nor on the anchor');
  assert.equal(placeZoneAt({ x: site.seat.x + 15, y: site.seat.y }, a, map, 301, spec), def, 'an already-linked anchor still resolves to the destination at budget');
  assert.equal(def.exits.length, doors, 'a plain resolve adds nothing');
}
console.log('PASS the atlas reconnect honors the road budget: approaches link under budget and consolidate at it');

// The real exploration chokepoint must honor a destination before ordinary
// nearest-node/expanse consolidation, and must not re-chart an existing site.
const realA = anchor('qa_real_a', -86, 0), realB = anchor('qa_real_b', 0, 78);
realA.exits = [{ to: '?', side: 'e', tileset: 'meadow' }];
realB.exits = [{ to: '?', side: 'n', tileset: 'meadow' }];
world.zoneMap[realA.id] = realA;
world.zoneMap[realB.id] = realB;
const chart = world as unknown as { chartFrontier(source: ZoneDef, exit: ZoneDef['exits'][number]): ZoneDef; caveEntrances: unknown[] };
const real = chart.chartFrontier(realA, realA.exits[0]);
realA.exits[0].to = real.id;
assert.equal(real.destination?.feature, site.id, 'real exploration reaches the atlas feature');
real.veiled = false;
const again = chart.chartFrontier(realB, realB.exits[0]);
realB.exits[0].to = again.id;
assert.equal(again, real);
assert.equal(again.veiled, false, 'a later approach cannot hide an already discovered destination');
world.loadZone(real.id, realA.id);
assert.ok(chart.caveEntrances.length > 0, 'the promised grotto is a real explorable entrance');
console.log('PASS real frontier travel prioritizes destinations and preserves discovery on reconnect');

Object.assign(world.zoneMap, map);
world.loadZone(def.id);
assert.equal(world.zone.id, def.id);
const packet = serializeZone(world), client = makeSimWorld('warrior', 0x8a7);
applyZone(client, packet);
assert.deepEqual(client.zone.locale, plan);
assert.deepEqual(client.zone.destination, def.destination);
assert.notEqual(client.zone.locale, packet.locale);
const state = JSON.parse(JSON.stringify(world.serializeWorldState()));
const saved = sanitizeWorldZones(state.zones, new Set())!;
assert.deepEqual(saved[def.id].locale, plan);
assert.deepEqual(saved[def.id].destination, def.destination);
const program = localeProgram(def.destination!.program)!;
const old = program.variants[0].districts[0].at[0];
try {
  program.variants[0].districts[0].at[0] += 0.01;
  world.loadZone(def.id);
  assert.deepEqual(world.zone.locale, plan, 'existing layout stays baked after registry edits');
} finally { program.variants[0].districts[0].at[0] = old; }
delete packet.locale; delete packet.destination;
applyZone(client, packet);
assert.equal(client.zone.locale, undefined);
assert.equal(client.zone.destination, undefined);
console.log('PASS real zone boot, saved plans, co-op isolation and legacy message clearing');

let mixed: ZoneDef | undefined, fallback = 0;
for (let i = 0; i < 100; i++) {
  const at = { x: 200000 + i * 700, y: 210000 };
  const mint: ZoneSpec = { fieldBiome: true, biomeFor: () => 'forest', seed: 22000 + i, level: 8, forceFrontiers: 2 };
  const generated = placeZoneAt(at, null, {}, 80000 + i, mint);
  if (generated.destination || generated.geo?.escarpment) continue;
  if (generated.locale) {
    assert.ok(['woodland_paths', 'ruin_quarters'].includes(generated.locale.program));
    assert.deepEqual(generated.size, generated.locale.size);
    assert.equal(generated.layoutType, 'districts');
    if (generated.locale.districts.some(d => d.fragment)) mixed = generated;
  } else {
    const pinned = placeZoneAt(at, null, {}, 80000 + i, { ...mint, layoutType: 'plains' });
    assert.deepEqual(generated.size, expandExplorationSize(pinned.size, 'surface'), 'ordinary fallback actually uses larger dimensions');
    assert.equal(pinned.locale, undefined, 'explicit layouts remain authoritative');
    fallback++;
  }
}
assert.ok(mixed && fallback > 10, 'real world mint produces mixed locales and traditional layouts');
world.zoneMap[mixed.id] = mixed;
const oldPolicy = UNDER_SPANS[mixed.biome!];
try {
  registerUnderSpan({ biome: mixed.biome!, chance: 1, reach: [1, 1], radius: 200, fresh: 0, exitless: 0,
    mouth: 'rootway_mouth', heldKind: 'rootheld' });
  const neighbor: ZoneDef = { ...structuredClone(mixed), id: 'qa_mixed_neighbor', map: { x: mixed.map.x + 50, y: mixed.map.y } };
  world.zoneMap[neighbor.id] = neighbor;
  (world as unknown as { underSpanPass(z: ZoneDef): void }).underSpanPass(mixed);
  assert.equal(mixed.underways?.[0].to, neighbor.id, 'mixed locale can initiate its biome underground network');
  assert.equal(neighbor.underways?.[0].to, mixed.id);
} finally {
  if (oldPolicy) UNDER_SPANS[mixed.biome!] = oldPolicy;
  else delete UNDER_SPANS[mixed.biome!];
}
world.loadZone(mixed.id);
const mouths = (world as unknown as { caveEntrances: { pos: { x: number; y: number }; underSpan?: string }[] }).caveEntrances.filter(c => c.underSpan);
assert.equal(mouths.length, 1, 'underground link has a real entrance');
assert.ok(world.walk!.reachable!(world.player.pos, mouths[0].pos), 'underground entrance is reachable in the mixed terrain');
const mixedPacket = serializeZone(world);
applyZone(client, mixedPacket);
assert.deepEqual(client.zone.locale, mixed.locale);
const serverFragment = mixed.locale!.districts.find(d => d.fragment)!.fragment!;
const clientFragment = client.zone.locale!.districts.find(d => d.fragment)!.fragment!;
assert.notEqual(clientFragment.cells, serverFragment.cells);
const mixedState = JSON.parse(JSON.stringify(world.serializeWorldState()));
assert.deepEqual(sanitizeWorldZones(mixedState.zones, new Set())![mixed.id].locale, mixed.locale);
console.log('PASS ordinary exploration mints larger mixed locales, preserves fallback layouts and carries fragments through save/co-op');
