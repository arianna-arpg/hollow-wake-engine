// Isolated experiment verification; production files and accepted fixtures remain unchanged.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { root, sha256, writeJSON } from "../../scripts/reference-utils.mjs";
const c = JSON.parse(fs.readFileSync(path.join(path.resolve(process.argv[2]), "build-verification.json"))), directory = path.join(c.directory, "pool-probes");
assert(!fs.existsSync(directory));
fs.mkdirSync(directory);
const modules = {};
for (const mode of ["baseline", "candidate"]) {
  const source = fs.readFileSync(path.join(c[mode], "dist/item-core.js"), "utf8"), end = "return { rollItem, forgeItem, compileItemMods, foldOwnStats, resolveUniqueChoices, tierForIlvl };";
  assert.equal(source.split(end).length, 2);
  assert(source.includes("from './random.js'"));
  const code = source.replace(/from '(\.\/[^']+)'/g, (_, file2) => "from " + JSON.stringify(pathToFileURL(path.join(c[mode], "dist", file2)).href)).replace(end, end.replace("tierForIlvl", "tierForIlvl, __testPools: affixPoolsFor")), file = path.join(directory, mode + ".mjs");
  fs.writeFileSync(file, code, { flag: "wx" });
  modules[mode] = (await import(pathToFileURL(file))).itemOperations;
}
const pack = JSON.parse(fs.readFileSync(process.argv[3])).items;
let queries = 0, owners = 0;
const check = (content, bases) => {
  const baseline = modules.baseline(content, () => {
    throw Error("Pool query consumed identity");
  }), candidate = modules.candidate(content, () => {
    throw Error("Pool query consumed identity");
  });
  owners++;
  for (const base of bases) {
    const a = baseline.__testPools(base), b = candidate.__testPools(base);
    assert.deepEqual(b, a, base.id);
    assert.equal(new Set(b.prefix).size, b.prefix.length);
    assert.equal(new Set(b.suffix).size, b.suffix.length);
    assert.strictEqual(candidate.__testPools(base), b);
    queries++;
  }
  if (bases.length > 1) {
    const a = candidate.__testPools(bases[0]), b = candidate.__testPools(bases[1]);
    assert.notStrictEqual(a, b);
    assert.notStrictEqual(a.prefix, b.prefix);
    assert.notStrictEqual(a.suffix, b.suffix);
  }
  return candidate;
};
const authored = Object.values(pack.bases);
const first = check(pack, authored), second = check(pack, authored.slice().reverse());
assert.notStrictEqual(first.__testPools(authored[0]).prefix, second.__testPools(authored[0]).prefix);
const tagSets = [void 0, [], ["a"], ["b"], ["a", "b"], ["a", "a"], ["__proto__"], ["constructor"], ["ring"], ["a", "ring"]];
for (let rotation = 0; rotation < 10; rotation++) {
  const affixes = Object.fromEntries(Array.from({ length: 200 }, (_, i) => {
    const id = i < 5 ? String(5 - i) : "affix-" + i;
    return [id, { id, kind: i % 2 ? "suffix" : "prefix", tags: tagSets[(i + rotation) % tagSets.length], excludeTags: tagSets[(Math.floor(i / tagSets.length) + rotation) % tagSets.length] }];
  }));
  const bases = [];
  for (const tags of tagSets.slice(1)) for (const affixPool of [void 0, "open", "explicit"]) bases.push({ id: "base-" + bases.length, tags, category: "ring", affixPool });
  check({ ...pack, affixes }, bases);
}
const twins = [{ ...authored[0], id: "affinity-a", affinity: { fire: 1 } }, { ...authored[0], id: "affinity-b", affinity: { fire: 9 } }];
check(pack, twins);
const result = { passed: true, authoredBases: authored.length, authoredAffixes: Object.keys(pack.affixes).length, queries, owners, orderedMembership: true, openExplicitAndEmptyTags: true, duplicateAndReservedTags: true, exclusions: true, integerRegistryKeys: true, distinctBaseAndOwnerPools: true, randomAndIdentityUntouched: true, sourceHashes: Object.fromEntries(["baseline", "candidate"].map((mode) => [mode, c[mode + "Runtime"]?.["item-core.js"] ?? c.baselineRuntime["item-core.js"]])) };
writeJSON(path.join(directory, "verification.json"), result);
console.log(result);
