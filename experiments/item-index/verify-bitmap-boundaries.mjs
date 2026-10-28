import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {writeJSON, sha256} from '../../scripts/reference-utils.mjs';

const directory = fs.realpathSync(process.argv[2]);
const proof = JSON.parse(fs.readFileSync(path.join(directory, 'build-verification.json')));
assert.equal(proof.implementation, 'bitmap');
const {itemOperations} = await import(pathToFileURL(path.join(directory, 'pool-probes/baseline.mjs')).href);
const {ItemAffixIndex} = await import(pathToFileURL(path.join(proof.candidate, 'dist/item-affix-index.js')).href);
const pack = JSON.parse(fs.readFileSync(process.argv[3])).items;
const widths = [0, 1, 31, 32, 33, 63, 64, 65, 127, 128, 129, 255, 256, 257, 4095, 4096, 4097];
let queries = 0;
for (const width of widths) {
  const affixes = Array.from({length: width}, (_, row) => ({id: 'row-' + row, kind: row % 2 ? 'suffix' : 'prefix',
    tags: ['all', 'row-' + row], excludeTags: row % 5 === 0 ? ['excluded'] : []}));
  const before = JSON.stringify(affixes), index = new ItemAffixIndex(affixes);
  const original = itemOperations({...pack, affixes: Object.fromEntries(affixes.map(affix => [affix.id, affix]))},
    () => {throw Error('Pool query consumed identity');});
  const selections = [[], ['missing'], ['all'], ['all', 'all'], ['all', 'excluded'],
    ...[...new Set([0, 30, 31, 32, 33, 62, 63, 64, width - 1])].filter(row => row >= 0 && row < width).map(row => ['row-' + row])];
  const retained = [];
  for (const tags of selections) {
    const base = {id: 'probe-' + queries++, tags, category: 'ring', affixPool: 'explicit'};
    const actual = index.pools(base), expected = original.__testPools(base);
    assert.deepEqual(actual, expected, `${width}/${tags.join(',')}`);
    retained.push({actual, copy: {prefix: [...actual.prefix], suffix: [...actual.suffix]}});
  }
  for (const value of retained) assert.deepEqual(value.actual, value.copy, 'Later queries changed a retained pool');
  assert.equal(JSON.stringify(affixes), before, 'Definitions changed');
}
const file = path.join(directory, 'bitmap-boundaries.json'); assert(!fs.existsSync(file));
writeJSON(file, {passed: true, widths, queries, unsignedBit31: true, wordTransitions: true, partialFinalWord: true,
  emptyCatalogue: true, exclusions: true, queryIsolation: true, originalOrderedOracle: true,
  moduleSha256: sha256(fs.readFileSync(path.join(proof.candidate, 'dist/item-affix-index.js')))});
console.log({passed: true, queries});
