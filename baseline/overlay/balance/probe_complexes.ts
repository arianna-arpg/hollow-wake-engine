import assert from 'node:assert/strict';
import { makeSimWorld } from '../src/sim/arena';
import { featuresInRect, mapFeatureKind } from '../src/world/atlas';
import { landmarkComplexes, resolveComplexForm, validateLandmarkComplex } from '../src/world/landmarkComplexes';
import { materializeComplex } from '../src/engine/landmarkComplexGen';
import { placeZoneAt, settleWeb } from '../src/engine/worldgen';
import { compileLocale, localeProgram } from '../src/world/locales';
import { generateLayout } from '../src/engine/levelgen';
import { storyReachable, tierFloorAt, linkFlipTier } from '../src/engine/tiers';
import { regionKind } from '../src/world/regions';
import { Rng } from '../src/core/rng';
import { serializeZone, applyZone } from '../src/net/snapshot';
import { sanitizeWorldZones } from '../src/meta/worldstate';
import { zoneInfoFor } from '../src/world/zoneInfo';
import type { GridWalkField } from '../src/world/gridWalk';
import { START_ZONE, type ZoneDef } from '../src/data/zones';

const w = makeSimWorld('warrior', 0xa71a501);
const sites = featuresInRect({ x: -40000, y: -40000 }, { x: 40000, y: 40000 });
const regions: ZoneDef[][] = [];
for (const def of landmarkComplexes()) {
  assert.deepEqual(validateLandmarkComplex(def), []);
  const bad = structuredClone(def); bad.links = [];
  assert.ok(validateLandmarkComplex(bad).includes('disconnected complex'));
  const site = sites.find(f => f.kind === def.id)!;
  assert.ok(site, `${def.id}: atlas feature exists`);
  assert.equal(mapFeatureKind(site.kind)!.destination!.locale, def.stages.find(s => s.id === def.entrance)!.locale);
  const map: Record<string, ZoneDef> = {};
  const spec = { fieldBiome: true, biomeFor: () => 'forest', seed: 1001, level: 8, forceFrontiers: 1 };
  const root = placeZoneAt(site.seat, null, map, 1001, spec);
  map[root.id] = root;
  assert.equal(root.complex?.kind, def.id);
  const members = Object.values(map).filter(z => z.complex?.root === root.id);
  const form = def.forms?.find(f => f.id === root.complex?.form);
  assert.equal(members.length, (form ? resolveComplexForm(def, form) : def).stages.length);
  const before = structuredClone(members);
  const again = placeZoneAt(site.seat, null, map, 1002, spec);
  assert.equal(again, root, 'different approach reuses the entrance');
  assert.deepEqual(materializeComplex(root, map, def.id), [], 'materialization is idempotent');
  assert.deepEqual(members, before);
  for (const z of members) {
    assert.ok(z.locale && z.name.includes(z.complex!.stageLabel));
    assert.equal(z.biome, root.biome, 'region keeps its surrounding biome');
    assert.equal(z.caveDepth, undefined, 'overland caverns stay on the surface graph');
    if (z !== root) {
      assert.equal(z.kind, 'landmark_section');
      assert.ok(z.exits.every(e => e.to !== '?'));
      const exits = structuredClone(z.exits);
      placeZoneAt({ x: z.map.x + 55, y: z.map.y }, null, { [z.id]: z }, 991,
        { id: 'qa_neighbor', seed: 91, tileset: 'meadow', layoutType: 'plains', forceFrontiers: 0, noBackEdge: true });
      assert.deepEqual(z.exits, exits, 'interiors cannot acquire arbitrary outside roads');
    }
    for (const e of z.exits.filter(e => map[e.to]?.complex)) assert.ok(map[e.to].exits.some(back => back.to === z.id));
  }
  settleWeb(map, null, { around: root.map });
  assert.deepEqual(members.map(z => z.map), before.map(z => z.map), 'the whole landmark retains its chart footprint');
  const restored = sanitizeWorldZones(JSON.parse(JSON.stringify([w.zoneMap[START_ZONE], ...members])), new Set())!;
  assert.equal(Object.values(restored).length, members.length + 1);
  for (const z of members) {
    assert.deepEqual(restored[z.id].complex, z.complex);
    assert.deepEqual(restored[z.id].locale, JSON.parse(JSON.stringify(z.locale)));
  }
  regions.push(members);
}
console.log('PASS persistent atlas complexes, complete two-way stage graphs, sealed interiors, stable placement and saved plans');

for (const members of regions) {
  for (const z of members) w.zoneMap[z.id] = z;
  const root = members.find(z => z.complex!.root === z.id)!;
  w.loadZone(root.id);
  for (const e of root.exits.filter(e => e.posFrac)) {
    const live = w.exits.find(x => x.to === e.to)!;
    assert.ok(Math.hypot(live.pos.x - e.posFrac!.fx * root.size.w, live.pos.y - e.posFrac!.fy * root.size.h) < 1,
      'interior transition stands at its authored gate rather than a map edge');
  }
  assert.ok(zoneInfoFor(w, root.id).some(r => r.detail === root.complex!.stageLabel));
  const gate = w.exits.find(e => members.some(z => z.id === e.to))!;
  assert.ok(gate && w.walk!.reachable!(w.player.pos, gate.pos));
  (w as unknown as { travelThrough(e: typeof gate): void }).travelThrough(gate);
  assert.equal(w.zone.id, gate.to, 'real transition reaches the next section');
  const back = w.exits.find(e => e.to === root.id)!;
  assert.ok(back && w.walk!.reachable!(w.player.pos, back.pos));
  (w as unknown as { travelThrough(e: typeof back): void }).travelThrough(back);
  assert.equal(w.zone.id, root.id, 'the player can return through the same region');
  const internal = members.find(z => z.id !== root.id)!;
  w.loadZone(internal.id, root.id);
  const client = makeSimWorld('warrior', 12), packet = serializeZone(w);
  applyZone(client, packet);
  assert.deepEqual(client.zone.complex, internal.complex);
  assert.notEqual(client.zone.complex, packet.complex);
  delete packet.complex; applyZone(client, packet);
  assert.equal(client.zone.complex, undefined, 'older peers clear stale membership');
}
console.log('PASS real region traversal and returns, map information, multiplayer identity and stale clearing');

const program = localeProgram('overland_cave_galleries')!;
for (const variant of program.variants) for (const scale of program.sizeScale!) for (const seed of [17, 3000026, 90011, 81933]) {
  const size = { w: Math.round(program.size.w * scale), h: Math.round(program.size.h * scale) };
  const locale = compileLocale(program, seed, variant.id);
  const def: ZoneDef = { id: 'qa_layered_cave', name: 'Cavern', level: 8, size, seed, locale, layoutType: 'districts',
    theme: w.zone.theme, layout: [], exits: [], map: { x: 0, y: 0 }, objective: { kind: 'clear' } };
  const entry = { x: 120, y: size.h / 2 }, exits = [{ x: size.w - 120, y: size.h / 2 }];
  const surfaceDef = structuredClone(def); delete surfaceDef.locale!.underTier;
  const surface = generateLayout(surfaceDef, size, new Rng(seed), entry, exits).walk as GridWalkField;
  const generated = generateLayout(def, size, new Rng(seed), entry, exits), grid = generated.walk as GridWalkField;
  assert.equal(def.tiers?.kind, 'under');
  const links: { x: number; y: number }[] = [], floors: { x: number; y: number }[] = [];
  let shared = 0, covered = 0;
  for (let y = 15; y < size.h; y += 30) for (let x = 15; x < size.w; x += 30) {
    const kind = grid.regionAt(x, y);
    if (regionKind(kind)?.tierLink) links.push({ x, y });
    else assert.equal(tierFloorAt(kind, 0), tierFloorAt(surface.regionAt(x, y), 0), 'boring preserves the surface floor and rock');
    if (tierFloorAt(kind, 1)) { floors.push({ x, y }); if (tierFloorAt(kind, 0)) shared++; else covered++; }
  }
  assert.ok(links.length >= 8 && shared > 40 && covered > 40,
    `${variant.id}/${scale}/${seed}: real overlapping chambers (links=${links.length}, shared=${shared}, covered=${covered})`);
  assert.equal(linkFlipTier(grid.regionAt(links[0].x, links[0].y), 0), 1);
  for (const p of floors.filter((_, i) => i % Math.max(1, Math.floor(floors.length / 12)) === 0)) assert.ok(storyReachable(grid, entry, p, 1), 'every sampled lower chamber connects through a real crossing');
  for (const p of [...exits, ...generated.localeReport!.districts.map(d => d.center)]) assert.ok(grid.reachable(entry, p), 'surface routes survive the covered layer');
  const replay = generateLayout(JSON.parse(JSON.stringify(def)), size, new Rng(seed), entry, exits);
  assert.deepEqual(replay.doodads, generated.doodads);
}
console.log('PASS overlapping surface/cavern floors, connected chambers, tier crossings, size extremes and deterministic replay');
