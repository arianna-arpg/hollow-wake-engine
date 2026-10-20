import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { bootSimEngine } from '../src/sim/arena';
import { passiveRefund } from '../src/engine/passiveRefund';
import { CLASSES } from '../src/data/classes';
bootSimEngine();
const sdk = process.argv[2], out = process.argv[3];
const { PassivePolicy } = await import(pathToFileURL(path.join(sdk, 'dist/passive-policy.js')).href);
const bytes = fs.readFileSync(path.join(sdk, 'baseline/milestone-eight/passives.json.gz'));
const fixture = JSON.parse(gunzipSync(bytes).toString('utf8')), policy = new PassivePolicy(fixture.authored);
const cases = fixture.scenarios.filter((s: any) => s.name.startsWith('authored-')).map((s: any) => {
  const state = s.steps.at(-1).expected;
  const meta = { ...state, classDef: CLASSES.find(c => c.id === state.classId)!, allocated: new Set<string>(state.allocated) };
  return { meta, build: policy.create(state), queries: [...state.allocated] as string[] };
});
const queryCount = cases.reduce((sum: number, c: any) => sum + c.queries.length, 0);
for (const c of cases) for (const id of c.queries) assert.deepEqual(c.build.quoteRefund(id), passiveRefund(c.meta, id));
let checksum = 0;
function run(sdkMode: boolean): number {
  const t = performance.now();
  for (const c of cases) for (const id of c.queries) {
    const result = sdkMode ? c.build.quoteRefund(id) : passiveRefund(c.meta, id);
    checksum += result.points + (result.refusal === null ? 1 : result.refusal.length);
  }
  return performance.now() - t;
}
for (let i = 0; i < 6; i++) { run(false); run(true); }
const original: number[] = [], extracted: number[] = [];
for (let i = 0; i < 25; i++) {
  if (i % 2) { extracted.push(run(true)); original.push(run(false)); }
  else { original.push(run(false)); extracted.push(run(true)); }
}
const stats = (samples: number[]) => { const sorted = [...samples].sort((a,b) => a-b); return { samplesMs: samples, medianMs: sorted[12], p95Ms: sorted[23] }; };
const record = { scope: 'Warm refund previews over every final allocated node in the authored-class traces; excludes construction, JSON load, snapshots and game frames.',
  node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0].model,
  fixtureSha256: crypto.createHash('sha256').update(bytes).digest('hex'), cases: cases.length, queryCount,
  graphNodes: fixture.authored.nodes.length, scratchBytesPerBuild: fixture.authored.nodes.length * 5,
  original: stats(original), extracted: stats(extracted), checksum,
  limits: ['Desktop only; Steam Deck and older mobile hardware have not been measured.', 'Scratch arrays are bounded; total heap and allocated bytes per query were not measured.', 'No throughput assertion: timing depends on machine and contention.'] };
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ cases: cases.length, queryCount, original: record.original.medianMs, extracted: record.extracted.medianMs, scratchBytesPerBuild: record.scratchBytesPerBuild }));
