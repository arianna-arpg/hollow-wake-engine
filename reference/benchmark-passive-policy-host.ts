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
const [sdk, game, out] = process.argv.slice(2);
const adapted = async (file: string) => import(pathToFileURL(path.join(game, file)).href);
(await adapted('src/sim/arena.ts')).bootSimEngine();
const { passiveRefund: hostRefund } = await adapted('src/engine/passiveRefund.ts');
const { CLASSES: hostClasses } = await adapted('src/data/classes.ts');
const bytes = fs.readFileSync(path.join(sdk, 'baseline/milestone-eight/passives.json.gz'));
const fixture = JSON.parse(gunzipSync(bytes).toString('utf8'));
const cases = fixture.scenarios.filter((s: any) => s.name.startsWith('authored-')).map((s: any) => {
  const state = s.steps.at(-1).expected;
  const meta = (classes: typeof CLASSES) => ({ ...structuredClone(state), classDef: classes.find(c => c.id === state.classId)!, allocated: new Set<string>(state.allocated) });
  return { original: meta(CLASSES), host: meta(hostClasses), queries: state.allocated as string[] };
});
// Includes live content projection and first session creation, excludes imports and JSON parsing.
const firstStart = performance.now();
const first = hostRefund(cases[0].host, cases[0].queries[0]);
const firstPreviewMs = performance.now() - firstStart;
assert.deepEqual(first, passiveRefund(cases[0].original, cases[0].queries[0]));
for (const c of cases) for (const id of c.queries) assert.deepEqual(hostRefund(c.host, id), passiveRefund(c.original, id));
let checksum = 0;
function run(host: boolean): number {
  const start = performance.now();
  for (const c of cases) for (const id of c.queries) {
    const r = host ? hostRefund(c.host, id) : passiveRefund(c.original, id);
    checksum += r.points + (r.refusal === null ? 1 : r.refusal.length);
  }
  return performance.now() - start;
}
for (let i = 0; i < 6; i++) { run(false); run(true); }
const original: number[] = [], adapter: number[] = [];
for (let i = 0; i < 25; i++) {
  if (i % 2) { adapter.push(run(true)); original.push(run(false)); }
  else { original.push(run(false)); adapter.push(run(true)); }
}
const stats = (samples: number[]) => { const sorted = [...samples].sort((a, b) => a - b); return { samplesMs: samples, medianMs: sorted[12], p95Ms: sorted[23] }; };
const record = { scope: 'Actual installed-game refund helper with live metadata forwarding and shared content; warm previews over every final allocated node in 39 authored builds.',
  node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0].model,
  fixtureSha256: crypto.createHash('sha256').update(bytes).digest('hex'), cases: cases.length,
  queryCount: cases.reduce((n: number, c: any) => n + c.queries.length, 0), firstPreviewMs,
  graphNodes: fixture.authored.nodes.length, scratchBytesPerOwner: fixture.authored.nodes.length * 5,
  original: stats(original), adapter: stats(adapter), checksum,
  limits: ['Desktop only; no Steam Deck or older mobile measurements.', 'First preview is one cold sample, not a latency distribution.', 'Total heap and bytes allocated per query were not measured.', 'Excludes rendering, full game frames and content import/JSON parsing; no machine-dependent timing assertion.'] };
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ cases: record.cases, queryCount: record.queryCount, original: record.original.medianMs, adapter: record.adapter.medianMs, firstPreviewMs, scratchBytesPerOwner: record.scratchBytesPerOwner }));
