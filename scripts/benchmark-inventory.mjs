import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { root, writeJSON, verifyReference } from './reference-utils.mjs';
const reference = path.join(root, '.reference'), script = path.join(reference, 'balance/benchmark-engine-inventory.ts');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'))); verifyReference(reference, lock);
fs.copyFileSync(path.join(root, 'reference/benchmark-inventory.ts'), script);
const runs = [];
for (let repeat = 0; repeat < 5; repeat++) for (const mode of ['original', 'indexed']) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script, mode, path.join(root, 'dist/index.js')], { cwd: reference, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  runs.push(JSON.parse(result.stdout.trim().split('\n').at(-1)));
}
assert.equal(new Set(runs.map(r => r.checksum)).size, 1, 'Compared inventory queries must agree');
const report = { node: process.version, cpu: os.cpus()[0]?.model, platform: process.platform,
  workload: '12x12 grid, 108 one-cell items, 512000 item-at and 512000 can-place reads per run; 200 warmup and 500 measured batches',
  caveats: ['Query benchmark only; excludes UI, transactions, payload copying and game frames', 'Fresh process for each run; both implementations loaded; no memory comparison', 'Desktop only, not target hardware'], runs };
writeJSON(path.join(root, '.artifacts/inventory-performance.json'), report); console.log(JSON.stringify(report, null, 2));
