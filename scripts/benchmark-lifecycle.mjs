import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Engine, CastRuntime, TimedDamage } from '../dist/index.js';
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
  const engine = new Engine(pack, 12345), skill = engine.skill({ id: 'ruin', level: 1, sockets: 0, treePoints: 0 });
  const actors = Array.from({ length: count }, (_, i) => {
    const character = engine.character({ classId: 'magician', passivePoints: 1 });
    character.sheet.setSource('cast-rate', [{ stat: 'castSpeed', kind: 'more', value: (i % 5) / 10 }]);
    const profile = engine.castProfile(character, skill); profile.cost = { mana: 0, life: 0 }; profile.cooldown = .5;
    return { character, profile, cast: new CastRuntime({ mana: 100, life: 100 }),
      dot: new TimedDamage(definition), target: engine.target({ life: 1e9 }) };
  });
  let completions = 0, checksum = 0, ticks = 0;
  const frame = () => {
    for (const a of actors) {
      if (!a.cast.busy && a.cast.useLock <= 0 && !a.cast.cooldown(skill.definition.id)) a.cast.press(a.profile);
      const event = a.cast.advance(1 / 60);
      if (event?.kind === 'completed') {
        completions++;
        checksum += engine.resolveHit(a.character, skill, a.target).damage;
        // Host-selected resolved application; this benchmark does not invent a Ruin proc rule.
        a.dot.apply(10);
      }
      if (a.dot.present) { ticks++; checksum += a.target.receiveDot(a.dot.advance(1 / 60), 'fire'); }
    }
  };
  for (let i = 0; i < 300; i++) frame();
  const builds = engine.planBuilds;
  global.gc?.(); const retained = process.memoryUsage().heapUsed - before;
  const times = [], cpu = process.cpuUsage();
  for (let i = 0; i < 1200; i++) { const at = performance.now(); frame(); times.push(performance.now() - at); }
  const used = process.cpuUsage(cpu);
  global.gc?.(); const growth = process.memoryUsage().heapUsed - before - retained;
  assert.equal(engine.planBuilds, builds, 'Stable builds should never recompile per frame');
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
