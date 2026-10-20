// Benchmarks run in one process, alternating order. This is a contact kernel
// comparison, not a whole-frame or Steam Deck/mobile hardware claim.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { bootSimEngine, makeSimWorld } from '../src/sim/arena';
import { mulberry32 } from '../src/sim/rng';
import { Actor } from '../src/engine/actor';
import { SKILLS } from '../src/data/skills';
import { SUPPORTS } from '../src/data/supports';
import { rollItem } from '../src/engine/itemgen';
import { makeSkillInstance } from '../src/engine/skills';
import { rollSkillDamage, applyHit } from '../src/engine/damage';

const sdkRoot = path.resolve(process.argv[2]);
const { Engine, Content } = await import(pathToFileURL(path.join(sdkRoot, 'dist/index.js')).href);
const rawContent = JSON.parse(fs.readFileSync(path.join(sdkRoot, 'content/milestone-one.json'), 'utf8'));
bootSimEngine();
const world = makeSimWorld('magician', 2345);
world.meta.equipped.ring1 = rollItem({ baseId: 'ring_lapis', ilvl: 1, rarity: 'common', rng: mulberry32(123) })!;
world.meta.allocated.add('cross_int_pursuit');
world.recalcPlayer();
const hero = world.player;
const inst = makeSkillInstance(SKILLS.ruin, 5, 2);
inst.sockets = [{ def: SUPPORTS.corrosion, level: 2 }, { def: SUPPORTS.measured_blows, level: 1 }];
inst.treeNodes = ['ruin_studies'];
const startContent = performance.now();
const content = new Content(rawContent);
const compileContentMs = performance.now() - startContent;
const iterations = 20000, warmup = 3000, rounds = 7, seed = 659918;
function originalRun(count: number) {
  const target = new Actor('benchmark', 'enemy', { x: 0, y: 0 });
  target.life = 1e12;
  target.sheet.setBase('life', 1e12);
  target.sheet.setBase('chaosRes', .25);
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    let checksum = 0;
    const start = performance.now();
    for (let i = 0; i < count; i++) checksum += applyHit(hero, target, rollSkillDamage(hero, inst)).total;
    return { ms: performance.now() - start, checksum };
  } finally { Math.random = original; }
}
function extractedRun(count: number) {
  const startBuild = performance.now();
  const engine = new Engine(content, seed);
  const character = engine.character({ classId: 'magician', passivePoints: 1 });
  character.equip('lapis-reference', 'ring1');
  character.allocate('cross_int_pursuit');
  const skill = engine.skill({ id: 'ruin', level: 5, sockets: 2, treePoints: 1,
    supports: [{ id: 'corrosion', level: 2 }, { id: 'measured_blows', level: 1 }], nodes: ['ruin_studies'] });
  const target = engine.target({ life: 1e12, mods: [{ stat: 'chaosRes', kind: 'flat', value: .25 }] });
  engine.preview(character, skill); // Compile setup is measured separately, not hidden in steady-state timing.
  const buildSetupMs = performance.now() - startBuild;
  let checksum = 0;
  const start = performance.now();
  for (let i = 0; i < count; i++) checksum += engine.resolveHit(character, skill, target).damage;
  return { ms: performance.now() - start, checksum, planBuilds: engine.planBuilds, buildSetupMs };
}
originalRun(warmup); extractedRun(warmup);
const samples: unknown[] = [];
for (let round = 0; round < rounds; round++) {
  let original, extracted;
  if (round % 2) { extracted = extractedRun(iterations); original = originalRun(iterations); }
  else { original = originalRun(iterations); extracted = extractedRun(iterations); }
  if (Math.abs(original.checksum - extracted.checksum) > 1e-9 * Math.max(1, Math.abs(original.checksum))) throw new Error('Benchmark results differ');
  if (extracted.planBuilds !== 1) throw new Error('Repeated hit unexpectedly recompiled its loadout');
  samples.push({ round, first: round % 2 ? 'extracted' : 'original', original, extracted });
  console.log(`Round ${round + 1}: original ${original.ms.toFixed(1)} ms, extracted ${extracted.ms.toFixed(1)} ms; checksum equal`);
}
const median = (values: number[]) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const originalMedian = median(samples.map((s: any) => s.original.ms));
const extractedMedian = median(samples.map((s: any) => s.extracted.ms));
const output = {
  schemaVersion: 1, capturedAt: new Date().toISOString(),
  scope: 'Same build and 20,000 resolved spell contacts. Original path includes dormant full-game hooks and presentation bookkeeping; SDK implements the declared smaller capability. This is not a whole-game FPS benchmark.',
  environment: { node: process.version, platform: process.platform, arch: process.arch,
    cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryGiB: os.totalmem() / 2 ** 30 },
  iterations, warmup, rounds, seed, compileContentMs, samples,
  summary: {
    originalMedianMs: originalMedian, extractedMedianMs: extractedMedian,
    ratio: originalMedian / extractedMedian,
    originalMicrosecondsPerHit: originalMedian * 1000 / iterations,
    extractedMicrosecondsPerHit: extractedMedian * 1000 / iterations,
  },
  limits: ['Steam Deck not measured', 'Older phones/tablets not measured', 'No renderer, projectile movement, statuses, actors ticking or UI',
    'Heap deltas are not allocation measurements; no allocation claim is made from timing alone'],
};
const outputFile = path.join(sdkRoot, '.artifacts/benchmark.json');
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output.summary));
