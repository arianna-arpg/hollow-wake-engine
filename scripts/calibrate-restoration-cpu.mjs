import fs from 'node:fs';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {sha256, writeJSON} from './reference-utils.mjs';

const [output] = process.argv.slice(2);
assert(output && !fs.existsSync(output), 'Supply a new calibration output file');
const file = 'baseline/milestone-forty-three/measurement-diagnosis-plan.json';
const bytes = fs.readFileSync(file), plan = JSON.parse(bytes), p = plan.counterCalibration;
assert.equal(plan.decision, 'restoration-measurement-diagnosis/v1');
assert.equal(typeof process.threadCpuUsage, 'function');
const total = c => c.user + c.system;
const median = a => a.slice().sort((x,y) => x-y)[Math.floor(a.length/2)];
const rows = [], increments = {process: new Set(), thread: new Set()};
let previous = {process: process.cpuUsage(), thread: process.threadCpuUsage()};
for (let i = 0; i < p.resolutionReads; i++) {
  const next = {process: process.cpuUsage(), thread: process.threadCpuUsage()};
  for (const key of ['process','thread']) {
    const delta = total(next[key]) - total(previous[key]);
    assert(delta >= 0); increments[key].add(delta);
  }
  previous = next;
}
for (let cycle = 0; cycle < p.cycles; cycle++) {
  for (const mode of ['idle','busy']) {
    const processStart = process.cpuUsage(), threadStart = process.threadCpuUsage();
    const start = performance.now();
    if (mode === 'idle') await delay(p.idleMilliseconds);
    else while (performance.now() - start < p.busyMilliseconds) { /* CPU control */ }
    const elapsedMs = performance.now() - start;
    const thread = process.threadCpuUsage(threadStart), processCpu = process.cpuUsage(processStart);
    assert(total(thread) >= 0 && total(processCpu) >= 0);
    rows.push({cycle,mode,elapsedMs,threadCpuMicroseconds:thread,processCpuMicroseconds:processCpu});
  }
}
const threadMedianMs = mode => median(rows.filter(r=>r.mode===mode).map(r=>total(r.threadCpuMicroseconds)/1000));
const busyMedianMs = threadMedianMs('busy'), idleMedianMs = threadMedianMs('idle');
const passed = busyMedianMs >= p.busyControlMinimumMedianThreadCpuMilliseconds && idleMedianMs <= p.idleControlMaximumMedianThreadCpuMilliseconds && busyMedianMs > idleMedianMs;
assert(fs.readFileSync(file).equals(bytes));
writeJSON(output, {schemaVersion:1,passed,node:process.version,platform:process.platform,planSha256:sha256(bytes),
  observedCounterIncrementsMicroseconds:Object.fromEntries(Object.entries(increments).map(([k,v])=>[k,[...v].sort((a,b)=>a-b)])),
  busyMedianThreadCpuMs:busyMedianMs,idleMedianThreadCpuMs:idleMedianMs,rows,
  scope:'Capability and observed resolution control. Units do not establish counter precision; CPU spans include counter-read overhead.'});
assert(passed, 'CPU counter control failed; stop game measurements');
console.log({passed,busyMedianMs,idleMedianMs,increments:Object.fromEntries(Object.entries(increments).map(([k,v])=>[k,[...v].sort((a,b)=>a-b)]))});
