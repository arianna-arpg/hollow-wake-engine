import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const input = createInterface({input: process.stdin, crlfDelay: Infinity});
const acknowledgements = input[Symbol.asyncIterator]();
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const digest = value => createHash('sha256').update(value).digest('hex');
const measured = !job.verifyOnly;
const start = () => measured ? process.hrtime.bigint() : 0n;
const elapsed = before => measured ? Number(process.hrtime.bigint() - before) : null;
async function stage(name, extra = {}) {
  emit({type: 'stage', stage: name, nodeMemory: process.memoryUsage(), ...extra});
  assert.equal((await acknowledgements.next()).value, 'continue', 'Memory observer acknowledgement');
}
await stage('worker-ready', {node: process.version});
let bundle = fs.readFileSync(job.bundle, 'utf8'), content = fs.readFileSync(job.input, 'utf8');
if (job.mode === 'memory') await stage('inputs-loaded');
const initializationStart = start();
let context = vm.createContext({});
vm.runInContext(bundle, context, {filename: 'verified-session-bundle.js'});
let factory = vm.runInContext('(function(raw){const root=HollowWakeSession.create(JSON.parse(raw));return request=>JSON.stringify(HollowWakeSession.dispatch(root,JSON.parse(request)));})', context);
let invoke = factory(content);
const initializationNs = elapsed(initializationStart);
function call(request) {
  const result = JSON.parse(invoke(typeof request === 'string' ? request : JSON.stringify({version: 1, ...request})));
  assert.equal(result.ok, true, result.message);
  return result;
}
const create = () => call({op: 'create', config: job.config}).handle;
const destroy = handle => call({op: 'destroy', handle});

if (job.mode === 'memory') {
  await stage('content-loaded', {initializationNs, callerInputsRetained: true});
  bundle = content = null;
  assert.equal(typeof globalThis.gc, 'function');
  globalThis.gc(); globalThis.gc();
  await stage('content-after-input-release-gc', {callerInputsRetained: false});
  const handles = [create()];
  await stage('one-session');
  while (handles.length < 8) handles.push(create());
  await stage('eight-sessions');
  call({op: 'batch', handle: handles[0], commands: job.active});
  let checkpoint = invoke(JSON.stringify({version: 1, op: 'snapshot', handle: handles[0]}));
  assert.equal(checkpoint, JSON.stringify(job.checkpoint));
  await stage('checkpoint-retained', {checkpointBytes: Buffer.byteLength(checkpoint)});
  for (const handle of handles) destroy(handle);
  invoke = factory = context = bundle = content = checkpoint = null;
  await stage('disposed');
  assert.equal(typeof globalThis.gc, 'function');
  globalThis.gc(); globalThis.gc();
  await stage('after-explicit-gc');
  emit({type: 'complete', passed: true, mode: job.mode, initializationNs});
} else {
  const warmups = job.verifyOnly ? 0 : job.plan.warmups;
  const samples = job.verifyOnly ? 1 : job.plan.samples;
  const checkpointText = JSON.stringify(job.checkpoint);
  const restoreRequest = JSON.stringify({version: 1, op: 'restore', snapshot: job.checkpoint.snapshot});
  for (let iteration = 0; iteration < warmups + samples; iteration++) {
    let responses, snapshotText, requests, handle;
    if (job.mode === 'throughput') {
      handle = create();
      if (job.case.setup.length) call({op: 'batch', handle, commands: job.case.setup});
      requests = [];
      for (let offset = 0; offset < job.case.commands.length; offset += job.case.batchSize)
        requests.push(JSON.stringify({version: 1, op: 'batch', handle, commands: job.case.commands.slice(offset, offset + job.case.batchSize)}));
      responses = new Array(requests.length);
    } else {assert.equal(job.mode, 'checkpoint'); responses = new Array(job.plan.checkpointRounds);}
    const heapBefore = process.memoryUsage().heapUsed;
    const before = start();
    if (job.mode === 'throughput') for (let i = 0; i < requests.length; i++) responses[i] = invoke(requests[i]);
    else for (let i = 0; i < responses.length; i++) {
      const restored = call(restoreRequest).handle;
      responses[i] = invoke(JSON.stringify({version: 1, op: 'snapshot', handle: restored}));
      destroy(restored);
    }
    const durationNs = elapsed(before);
    const heapAfter = process.memoryUsage().heapUsed;
    if (job.mode === 'throughput') {
      assert.deepEqual(responses, job.case.responseTexts);
      snapshotText = invoke(JSON.stringify({version: 1, op: 'snapshot', handle}));
      assert.equal(snapshotText, job.case.snapshotText);
      destroy(handle);
    } else {for (const response of responses) assert.equal(response, checkpointText); snapshotText = checkpointText;}
    emit({type: 'sample', warmup: iteration < warmups, iteration, elapsedNs: durationNs,
      calls: job.mode === 'throughput' ? responses.length : responses.length * 3,
      commands: job.mode === 'throughput' ? job.case.commands.length : null,
      responseBytes: responses.reduce((sum, value) => sum + Buffer.byteLength(value), 0),
      observationsSha256: digest(responses.join('\n')), snapshotSha256: digest(snapshotText),
      v8HeapUsedDeltaBytes: heapAfter - heapBefore, exactResponses: true});
  }
  emit({type: 'complete', passed: true, mode: job.mode, initializationNs});
}
input.close(); process.stdin.pause();
