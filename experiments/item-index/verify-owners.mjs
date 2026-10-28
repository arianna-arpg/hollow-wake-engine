// Isolated experiment verification; production files and accepted fixtures remain unchanged.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { sha256, writeJSON } from "../../scripts/reference-utils.mjs";
const c = JSON.parse(fs.readFileSync(path.join(path.resolve(process.argv[2]), "build-verification.json"))), file = path.join(c.directory, "shared-owners-v2.json");
assert(!fs.existsSync(file));
const input = JSON.parse(fs.readFileSync(process.argv[3])), pack = input.items ?? input.item;
assert(pack?.affixes, "Locate the authoritative item pack");
const base = pack.bases.ring_lapis;
assert(base);
const tags = /* @__PURE__ */ new Set([base.category, ...base.tags ?? []]);
const theme = Object.values(pack.affixes).find((a) => a.themes?.length && a.tags?.some((tag) => tags.has(tag)) && !a.excludeTags?.some((tag) => tags.has(tag)))?.themes[0];
assert(theme);
const original = JSON.stringify(pack);
pack.bases.index_affinity_a = { ...structuredClone(base), id: "index_affinity_a", affinity: { [theme]: 9 } };
pack.bases.index_affinity_b = { ...structuredClone(base), id: "index_affinity_b", affinity: { [theme]: 0.1 } };
const modules = await Promise.all(["baseline", "candidate"].map((mode) => import(pathToFileURL(path.join(c[mode], "dist/item-rules.js")).href))), contents = modules.map((m) => new m.ItemContent(pack)), owners = modules.map((m, i) => Array.from({ length: 4 }, (_, owner) => new m.ItemRules(contents[i], 101 + owner * 977)));
assert.equal(JSON.stringify(contents[0].pack), JSON.stringify(contents[1].pack));
assert.equal(Object.getOwnPropertySymbols(contents[0]).length, 0);
const symbols = Object.getOwnPropertySymbols(contents[1]);
assert.equal(symbols.length, 1);
assert(Object.isFrozen(contents[1][symbols[0]]));
const observations = [];
for (let iteration = 0; iteration < 300; iteration++) for (let owner = 0; owner < 4; owner++) {
  const options = { baseId: iteration % 2 ? "index_affinity_a" : "index_affinity_b", ilvl: 1 + Math.floor(iteration / 2) * 13 % 100, rarity: Math.floor(iteration / 2) % 3 ? "rare" : "magic", fillRandom: true };
  const row = owners.map((list) => {
    const rules = list[owner], item = rules.forge(options);
    assert(item?.affixes.length > 0);
    return { item, mods: rules.compile(item), stats: rules.ownStats(item), state: rules.snapshot() };
  });
  assert.deepEqual(row[1], row[0], `${iteration}/${owner}`);
  observations.push(row[0]);
  if (iteration % 37 === 0) for (let variant = 0; variant < 2; variant++) owners[variant][owner] = modules[variant].ItemRules.restore(contents[variant], owners[variant][owner].snapshot());
}
let affinityDifferences = 0;
for (let seed = 1; seed <= 100; seed++) {
  const pairs = modules.map((m, i) => ["index_affinity_a", "index_affinity_b"].map((baseId) => new m.ItemRules(contents[i], seed).forge({ baseId, ilvl: 21, rarity: "rare", fillRandom: true })));
  assert.deepEqual(pairs[1], pairs[0]);
  if (JSON.stringify(pairs[0][0].affixes) !== JSON.stringify(pairs[0][1].affixes)) affinityDifferences++;
}
assert(affinityDifferences > 0, "Affinities must affect sampled results");
const output = path.join(c.directory, "shared-owner-observations-v2.json");
writeJSON(output, observations);
writeJSON(file, { passed: true, owners: 4, interleavedMints: observations.length, restoresPerVariant: 36, affinitySensitivitySeeds: 100, affinityDifferences, randomFillEnabled: true, pairedBasesShareLevelAndRarity: true, supersedes: "Version 1 exercised pool construction but omitted fillRandom, so it did not establish weighted affinity isolation", identicalTagBasesWithDifferentAffinities: true, sharedImmutableContent: true, fullItemsModifiersOwnStatsAndRandomState: true, sourcePackSha256: sha256(original), observationsSha256: sha256(fs.readFileSync(output)) });
console.log({ passed: true, file, interleavedMints: observations.length });
