import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildItemContent } from './compile-item-content.mjs';
import { root, verifyReference, writeJSON } from './reference-utils.mjs';
const reference = path.join(root, '.reference'), output = path.join(root, '.artifacts/item-package');
verifyReference(reference, JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'))));
buildItemContent(output);
const script = path.join(reference, 'balance/benchmark-engine-items.ts');
fs.copyFileSync(path.join(root, 'reference/benchmark-items.ts'), script);
const runs = [];
for (let n = 0; n < 5; n++) for (const mode of ['original', 'sdk']) {
  const result = spawnSync(process.execPath, ['--import','tsx',script,mode,path.join(root,'dist/item-rules.js'),path.join(output,'items.json')], { cwd: reference, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  runs.push(JSON.parse(result.stdout.trim().split('\n').at(-1)));
}
assert.ok(runs.every(r => Number.isFinite(r.checksum)));
assert.equal(new Set(runs.map(r => r.checksum)).size, 1, 'Original and SDK workload results differ');
const report = { node: process.version, cpu: os.cpus()[0]?.model, platform: process.platform,
  workload: '1000 warmup items, 5000 measured rare items across droppable bases, level 21; roll plus modifier compilation; batches of 20',
  caveats: ['Desktop only, no target-device claim', 'Original content is booted before timing; only SDK JSON parse, copy and validation load is timed',
    'Fresh process per run; item and modifier outputs are discarded after checksumming; no renderer or frame latency',
    'Validation and ownership copies are included in the SDK path; memory/allocation volume not measured'], runs };
writeJSON(path.join(root, '.artifacts/item-performance.json'), report); console.log(JSON.stringify(report, null, 2));
