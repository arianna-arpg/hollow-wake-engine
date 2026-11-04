import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createLifecycleWorkload } from '../tools/device-lifecycle/workload.mjs';
import { root } from './reference-utils.mjs';
const pack = JSON.parse(fs.readFileSync(path.join(root, 'content/milestone-one.json'), 'utf8'));
const definition = JSON.parse(fs.readFileSync(path.join(root, 'baseline/milestone-two/authored.json'), 'utf8')).timedDamage;
const runs = [];
const workerCount = Number(process.argv[2]);
if (!workerCount) for (const count of [100, 500, 1000]) {
  const child = execFileSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), String(count)], { encoding: 'utf8' });
  runs.push(...JSON.parse(child).runs);
}
for (const count of workerCount ? [workerCount] : []) {
  global.gc?.(); const before = process.memoryUsage().heapUsed;
  const {frame,read}=createLifecycleWorkload(pack,definition,count);
  for (let i = 0; i < 300; i++) frame();
  const builds = read().planBuilds;
  global.gc?.(); const retained = process.memoryUsage().heapUsed - before;
  const times = [], cpu = process.cpuUsage();
  for (let i = 0; i < 1200; i++) { const at = performance.now(); frame(); times.push(performance.now() - at); }
  const used = process.cpuUsage(cpu);
  global.gc?.(); const growth = process.memoryUsage().heapUsed - before - retained;
  const {completions,ticks,checksum,planBuilds}=read();
  assert.equal(planBuilds, builds, 'Stable builds should never recompile per frame');
  assert.ok(growth < 2 * 1024 * 1024, 'Retained workload growth exceeds 2 MiB');
  times.sort((a, b) => a - b);
  runs.push({ actors: count, measuredFrames: 1200, fixedDt: 1 / 60,
    p50ms: times[600], p95ms: times[1140], worstMs: times.at(-1),
    cpuMs: (used.user + used.system) / 1000, retainedHeapBytes: retained, retainedGrowthBytes: growth,
    planBuilds: builds, completionsIncludingWarmup: completions, dotTicksIncludingWarmup: ticks, checksum });
}
const report = { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model,
  gcExposed: !!global.gc, note: 'Desktop CPU/memory evidence only. No Steam Deck or mobile timing claim. Heap retention is not total allocations or peak RSS. Synthetic zero-cost actors sustain the loop.', runs };
fs.mkdirSync(path.join(root, '.artifacts'), { recursive: true });
if (!workerCount) fs.writeFileSync(path.join(root, '.artifacts/lifecycle-performance.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
