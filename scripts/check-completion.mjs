import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root } from './reference-utils.mjs';
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/completion.json')));
assert.equal(manifest.schemaVersion, 1);
const ids = new Set();
for (const family of manifest.families) {
  assert.ok(!ids.has(family.id)); ids.add(family.id);
  assert.ok(['pending', 'partial', 'extracted'].includes(family.state));
  if (family.state !== 'pending') assert.ok(family.evidence.length > 0, `${family.id} needs evidence`);
  for (const file of family.evidence) {
    assert.ok(!file.includes('..') && !path.isAbsolute(file));
    assert.ok(fs.existsSync(path.join(root, file)), `Missing evidence: ${file}`);
  }
}
console.log(`${ids.size} scoped families tracked; ${manifest.families.filter(f => f.state !== 'extracted').length} still have extraction/integration work. This gate validates evidence references, not feature correctness.`);
if (process.argv.includes('--require-complete')) assert.ok(manifest.families.every(f => f.state === 'extracted' && f.remaining.length === 0), 'SDK completion criteria are not yet met');
