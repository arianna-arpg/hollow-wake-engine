import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { buildCatalogue, buildDatabase } from './catalogue-tools.mjs';
import { root, writeJSON } from './reference-utils.mjs';

const mode = process.argv[2];
if (!mode) {
  fs.mkdirSync(path.join(root, '.artifacts'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, '.artifacts/catalogue-bench-'));
  buildCatalogue(directory); await buildDatabase(path.join(directory, 'content.sqlite'));
  const runs = [];
  for (const candidate of ['json', 'sqlite']) for (let repeat = 0; repeat < 5; repeat++) {
    const child = spawnSync(process.execPath, ['--expose-gc', process.argv[1], candidate, directory], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr); runs.push(JSON.parse(child.stdout));
  }
  assert.equal(new Set(runs.map(r => r.checksum)).size, 1, 'Compared reads must return the same content');
  const report = { node: process.version, cpu: os.cpus()[0]?.model, platform: process.platform,
    workload: '954 full skill records, 500 warmup reads + 20,000 deterministic point reads; parsed records returned in both modes',
    caveats: ['Fresh processes, warm OS file cache; not cold storage latency', 'SQLite native memory excluded from JS heap; RSS also reported',
      'JSON retains all selected skill definitions; SQLite prepares point reads and parses each returned record', 'Desktop only, not target hardware'],
    skillJsonBytes: fs.statSync(path.join(directory, 'tables/skills.json')).size,
    sqliteWholeCatalogueBytes: fs.statSync(path.join(directory, 'content.sqlite')).size, runs };
  writeJSON(path.join(root, '.artifacts/catalogue-performance.json'), report);
  console.log(JSON.stringify(report, null, 2));
} else {
  const directory = process.argv[3]; global.gc(); const before = process.memoryUsage(); const start = performance.now();
  let db, get;
  if (mode === 'json') {
    const rows = JSON.parse(fs.readFileSync(path.join(directory, 'tables/skills.json')));
    const map = new Map(rows.map(row => [row.id, row.value])); get = id => map.get(id);
  } else {
    db = new DatabaseSync(path.join(directory, 'content.sqlite'), { readOnly: true });
    const query = db.prepare("SELECT payload FROM records WHERE table_name='skills' AND id=?");
    get = id => JSON.parse(query.get(id).payload);
  }
  const loadMs = performance.now() - start;
  // Read ids after measuring load, in both modes. Equal input setup, outside lookup timing.
  const ids = JSON.parse(fs.readFileSync(path.join(directory, 'tables/skills.json'))).map(r => r.id);
  for (let n = 0; n < 500; n++) get(ids[n % ids.length]);
  global.gc(); const loaded = process.memoryUsage();
  const batches = []; let checksum = 0;
  for (let b = 0; b < 100; b++) {
    const now = performance.now();
    for (let n = 0; n < 200; n++) { const row = get(ids[((b * 200 + n) * 37) % ids.length]); checksum += row.id.length + row.name.length + row.useTime; }
    batches.push(performance.now() - now);
  }
  batches.sort((a, b) => a - b);
  console.log(JSON.stringify({ mode, loadMs, lookupBatch200P50Ms: batches[50], lookupBatch200P95Ms: batches[95],
    retainedHeapDelta: loaded.heapUsed - before.heapUsed, rssDelta: loaded.rss - before.rss, checksum }));
  db?.close();
}
