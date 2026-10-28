import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {root, sha256, listFiles, writeJSON} from './reference-utils.mjs';

const args = process.argv.slice(2), verifyOnly = args[0] === '--verify';
assert.equal(process.platform, 'win32'); assert.equal(process.arch, 'x64');
assert(verifyOnly || args[0] === '--measure');
const read = file => JSON.parse(fs.readFileSync(file));
const hash = file => sha256(fs.readFileSync(file));
const map = directory => Object.fromEntries(listFiles(directory).map(file => [file, hash(path.join(directory, file))]));
const plan = read(path.join(root, 'experiments/item-index/measurement-plan.json'));
const gates = read(path.join(root, 'experiments/item-index/content-plan.json'));
assert.equal(plan.parent, gates.id);
const sourceFiles = ['scripts/benchmark-content-index.mjs', 'scripts/reference-utils.mjs',
  'experiments/embedded-js/measurements/node-worker.mjs', 'experiments/embedded-js/measurements/Worker.cs',
  'experiments/embedded-js/native/dotnet/Embedded.cs', 'experiments/embedded-js/native/dotnet/NuGet.Config',
  ...['content-index.ts', 'content-variant.mjs', 'content-plan.json', 'measurement-plan.json', 'Memory.cs', 'Memory.csproj']
    .map(file => 'experiments/item-index/' + file)];
const sources = Object.fromEntries(sourceFiles.map(file => [file, hash(path.join(root, file))]));
const directory = fs.mkdtempSync(path.join(root, verifyOnly ? '.artifacts/content-index-verification-' : '.artifacts/content-index-measurement-'));
const receipt = path.join(directory, 'verification.json');
const report = {schemaVersion: 1, startedAt: new Date().toISOString(), passed: false, status: 'started', verifyOnly, plan, gates, sources,
  environment: {node: process.version, os: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length}, cases: []};
writeJSON(path.join(root, verifyOnly ? '.artifacts/content-index-verification-latest.json' : '.artifacts/content-index-measurement-latest.json'), {directory, receipt});
const environment = {...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1'};
let pins = {}, candidate, cost, native, data, memoryAssembly;
function checkPins() {
  for (const [file, expected] of Object.entries(sources)) assert.equal(hash(path.join(root, file)), expected, file);
  for (const [file, expected] of Object.entries(pins)) assert.equal(hash(file), expected, file);
  if (candidate) {
    assert.deepEqual(map(path.join(root, 'dist')), candidate.baselineRuntime);
    assert.deepEqual(map(path.join(candidate.baseline, 'dist')), candidate.baselineRuntime);
    assert.deepEqual(map(path.join(candidate.candidate, 'dist')), candidate.candidateRuntime);
  }
}
function invokeFactory(bundle) {
  const context = vm.createContext({}); vm.runInContext(fs.readFileSync(bundle, 'utf8'), context);
  return vm.runInContext('(raw=>{const root=HollowWakeSession.create(JSON.parse(raw));return request=>JSON.stringify(HollowWakeSession.dispatch(root,JSON.parse(request)));})', context)(fs.readFileSync(native.input, 'utf8'));
}
function forgeCase(invoke, name, count, warm) {
  const call = request => { const result = JSON.parse(invoke(JSON.stringify({version: 1, ...request}))); assert.equal(result.ok, true); return result; };
  const make = id => ({op: 'forgeStore', id, options: {baseId: 'ring_lapis', ilvl: 21, rarity: 'rare', affixes: [{id: 'attr_intelligence'}]}});
  const handle = call({op: 'create', config: data.config}).handle, setup = warm ? [make('warm-ring')] : [];
  if (setup.length) assert(call({op: 'batch', handle, commands: setup}).results[0].inserted);
  const commands = Array.from({length: count}, (_, i) => make('ring-' + i));
  const response = call({op: 'batch', handle, commands});
  for (const result of response.results) assert.equal(result.item?.affixes?.[0]?.id, 'attr_intelligence', 'A legal affix must survive pool gating');
  const snapshotText = invoke(JSON.stringify({version: 1, op: 'snapshot', handle}));
  call({op: 'destroy', handle});
  return {name, batchSize: count, commands, setup, responseTexts: [JSON.stringify(response)], snapshotText};
}
async function worker(host, variant, test, order, repeat = 0, startup = false) {
  const label = [order, host, variant, startup ? 'initialization' : test?.name ?? 'checkpoint', repeat].join('-');
  const location = path.join(directory, label); fs.mkdirSync(location);
  const job = {mode: test ? 'throughput' : 'checkpoint', verifyOnly, plan: startup ? {...plan, warmups: 0, samples: 1} : plan,
    config: data.config, checkpoint: data.checkpoint, checkpointText: JSON.stringify(data.checkpoint), case: test,
    library: native.library, input: native.input, bundle: native.bundles[variant].file};
  const file = path.join(location, 'job.json'); fs.writeFileSync(file, JSON.stringify(job) + '\n', {flag: 'wx'});
  const child = spawn(host === 'node' ? process.execPath : 'dotnet', host === 'node'
    ? [path.join(root, 'experiments/embedded-js/measurements/node-worker.mjs'), file] : [cost.built.managed, file],
  {cwd: cost.built.directory, env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
  const events = []; let buffer = '', stderr = '', failure;
  const timeout = setTimeout(() => {failure ??= new Error('Worker timeout'); child.kill();}, 120000);
  child.stderr.setEncoding('utf8'); child.stderr.on('data', value => {stderr += value;}); child.stdout.setEncoding('utf8');
  child.stdout.on('data', value => {
    buffer += value; let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1); if (!line) continue;
      try {
        const event = JSON.parse(line); events.push(event);
        if (event.type === 'stage') {assert.equal(event.stage, 'worker-ready'); child.stdin.write('continue\n');}
        else if (event.type === 'complete') child.stdin.end(); else assert.equal(event.type, 'sample');
      } catch (error) {failure ??= error; child.kill();}
    }
  });
  child.on('error', error => {failure ??= error;}); child.stdin.on('error', error => {failure ??= error; child.kill();});
  const completion = await new Promise(resolve => child.on('close', (code, signal) => resolve({code, signal}))); clearTimeout(timeout);
  fs.writeFileSync(path.join(location, 'events.jsonl'), events.map(event => JSON.stringify(event)).join('\n') + '\n');
  fs.writeFileSync(path.join(location, 'stderr.txt'), stderr);
  assert(!failure, failure?.stack); assert.equal(completion.signal, null); assert.equal(completion.code, 0, stderr); assert.equal(buffer.trim(), '');
  const last = events.at(-1); assert.equal(last?.type, 'complete'); assert.equal(last.passed, true);
  const samples = events.filter(event => event.type === 'sample'), expected = test?.responseTexts ?? Array(plan.checkpointRounds).fill(JSON.stringify(data.checkpoint));
  assert.equal(samples.length, verifyOnly || startup ? 1 : plan.warmups + plan.samples);
  for (const sample of samples) {
    assert.equal(sample.exactResponses, true); assert.equal(sample.observationsSha256, sha256(expected.join('\n')));
    assert.equal(sample.snapshotSha256, sha256(test?.snapshotText ?? JSON.stringify(data.checkpoint)));
    assert.equal(sample.responseBytes, expected.reduce((sum, value) => sum + Buffer.byteLength(value), 0));
    assert(verifyOnly ? sample.elapsedNs === null : Number.isFinite(sample.elapsedNs) && sample.elapsedNs > 0);
    assert.equal(sample.iteration, samples.indexOf(sample)); assert.equal(sample.warmup, !verifyOnly && !startup && sample.iteration < plan.warmups);
  }
  assert(verifyOnly ? last.initializationNs === null : Number.isFinite(last.initializationNs) && last.initializationNs > 0);
  const result = {label, host, variant, workload: startup ? 'initialization' : test?.name ?? 'checkpoint', order, repeat,
    startupWarmup: startup && repeat < plan.warmups, initializationNs: last.initializationNs, samples,
    raw: Object.fromEntries(['job.json', 'events.jsonl', 'stderr.txt'].map(file => [label + '/' + file, hash(path.join(location, file))]))};
  report.cases.push(result); writeJSON(receipt, report);
  if (!startup || repeat % 8 === 0) console.log({label, passed: true});
}
async function ambient(order) {
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const before = os.cpus(); await new Promise(resolve => setTimeout(resolve, 2000));
    const processors = os.cpus().map((cpu, i) => {const previous = before[i].times;
      const total = Object.keys(cpu.times).reduce((sum, key) => sum + cpu.times[key] - previous[key], 0);
      return {processor: i, busyFraction: 1 - (cpu.times.idle - previous.idle) / total};});
    samples.push({processors, meanBusyFraction: processors.reduce((sum, value) => sum + value.busyFraction, 0) / processors.length});
  }
  (report.ambientCpu ??= []).push({order, samples}); writeJSON(receipt, report);
}
function summarize(values) {
  assert.equal(values.length, plan.samples); values.sort((a, b) => a - b);
  return {medianNs: values[Math.floor(values.length / 2)], p95Ns: values[Math.ceil(values.length * .95) - 1], minNs: values[0], maxNs: values.at(-1)};
}
try {
  if (verifyOnly) {
    assert.equal(args.length, 5); assert.equal(args[1], '--candidate-proof'); assert.equal(args[3], '--cost-proof');
    const candidateDirectory = fs.realpathSync(args[2]), costDirectory = fs.realpathSync(args[4]);
    candidate = read(path.join(candidateDirectory, 'build-verification.json'));
    native = read(path.join(candidateDirectory, 'native/verification.json')); cost = read(path.join(costDirectory, 'verification.json'));
    assert(candidate.passed && native.passed && cost.passed && cost.verifyOnly && cost.inputsUnchanged);
    const proofFiles = ['build-verification.json', 'unit-verification-v2.json', 'pool-probes/verification.json', 'shared-owners-v2.json', 'native/verification.json'].map(file => path.join(candidateDirectory, file));
    for (const file of proofFiles) assert(read(file).passed, file);
    for (const [file, expected] of Object.entries(candidate.sources)) assert.equal(hash(path.join(root, file)), expected, file);
    for (const [file, expected] of Object.entries(cost.sources)) assert.equal(hash(path.join(root, file)), expected, file);
    pins = {...cost.pins, ...Object.fromEntries([...proofFiles, path.join(costDirectory, 'verification.json'), native.library, native.input,
      ...Object.values(native.bundles).map(value => value.file)].map(file => [file, hash(file)]))};
    assert.equal(hash(native.library), native.librarySha256); assert.equal(hash(native.input), native.inputSha256);
    for (const value of Object.values(native.bundles)) assert.equal(hash(value.file), value.sha256);
    data = read(cost.built.dataFile); data.cases = data.cases.filter(test => test.batchSize === 64);
    const invoke = invokeFactory(native.bundles.baseline.file);
    data.cases.push(forgeCase(invoke, 'first-forge', 1, false), forgeCase(invoke, 'steady-forge', 64, true));
    const workloadFile = path.join(directory, 'workload.json'); fs.writeFileSync(workloadFile, JSON.stringify(data) + '\n'); pins[workloadFile] = hash(workloadFile);
    writeJSON(path.join(directory, 'global.json'), {sdk: {version: cost.built.dotnetSdk, rollForward: 'disable'}});
    const output = path.join(directory, 'managed'), intermediate = path.join(directory, 'managed-obj') + path.sep;
    const fd = fs.openSync(path.join(directory, 'build.txt'), 'wx');
    try {execFileSync('dotnet', ['build', path.join(root, 'experiments/item-index/Memory.csproj'), '-c', 'Release', '-o', output,
      '-p:BaseIntermediateOutputPath=' + intermediate, '-p:MSBuildProjectExtensionsPath=' + intermediate,
      '-p:NuGetAudit=false', '-p:UseSharedCompilation=false', '--disable-build-servers', '--configfile',
      path.join(root, 'experiments/embedded-js/native/dotnet/NuGet.Config')],
    {cwd: directory, env: {...environment, DOTNET_CLI_HOME: path.join(directory, 'dotnet-home')}, windowsHide: true, stdio: ['ignore', fd, fd], timeout: 120000});
    } finally {fs.closeSync(fd);}
    memoryAssembly = path.join(output, 'Memory.dll');
    for (const file of listFiles(output)) pins[path.join(output, file)] = hash(path.join(output, file));
    Object.assign(report, {candidate, cost, native, workloadFile, memoryAssembly, pins});
  } else {
    assert.equal(args.length, 3); assert.equal(args[1], '--verification'); const verifiedFile = path.join(fs.realpathSync(args[2]), 'verification.json');
    const verified = read(verifiedFile); assert(verified.passed && verified.verifyOnly && verified.inputsUnchanged);
    assert.deepEqual(verified.sources, sources); assert.deepEqual(verified.plan, plan); assert.deepEqual(verified.gates, gates);
    ({candidate, cost, native, memoryAssembly} = verified); pins = {...verified.pins, [verifiedFile]: hash(verifiedFile)}; data = read(verified.workloadFile);
    Object.assign(report, {candidate, cost, native, memoryAssembly, pins, verifiedFile});
  }
  checkPins(); writeJSON(receipt, report);
  for (const order of verifyOnly ? ['verification'] : plan.orders) {
    if (!verifyOnly) await ambient(order);
    const variants = order === 'reverse' ? [...plan.variants].reverse() : plan.variants;
    const hosts = order === 'reverse' ? [...plan.hosts].reverse() : plan.hosts;
    const tests = [...data.cases, undefined]; if (order === 'reverse') tests.reverse();
    for (const test of tests) for (const host of hosts) for (const variant of variants) await worker(host, variant, test, order);
    if (!verifyOnly) for (const host of hosts) for (let repeat = 0; repeat < plan.warmups + plan.samples; repeat++)
      for (const variant of variants) await worker(host, variant, data.cases.find(test => test.name === 'first-forge'), order, repeat, true);
  }
  report.memory = {};
  for (const variant of plan.variants) {
    const test = data.cases.find(test => test.name === 'first-forge');
    const file = path.join(directory, variant + '-memory-job.json');
    fs.writeFileSync(file, JSON.stringify({library: native.library, input: native.input, bundle: native.bundles[variant].file,
      config: data.config, commands: test.commands, responseText: test.responseTexts[0], snapshotText: test.snapshotText}));
    const raw = execFileSync('dotnet', [memoryAssembly, file], {cwd: path.dirname(memoryAssembly), env: environment, windowsHide: true, encoding: 'utf8', timeout: 60000});
    fs.writeFileSync(path.join(directory, variant + '-memory.json'), raw); const value = JSON.parse(raw); assert(value.passed);
    assert.equal(value.owners, 8); assert.equal(value.disposed.LiveBytes, 0); assert.equal(value.disposed.LiveBlocks, 0); report.memory[variant] = value;
  }
  const baseMemory = report.memory.baseline, nextMemory = report.memory.candidate;
  report.memoryGate = {contentDifferenceBytes: nextMemory.content.LiveBytes - baseMemory.content.LiveBytes,
    additionalOwnerBytes: (nextMemory.warmedOwners.LiveBytes - nextMemory.content.LiveBytes) - (baseMemory.warmedOwners.LiveBytes - baseMemory.content.LiveBytes)};
  report.memoryGate.passed = report.memoryGate.additionalOwnerBytes <= gates.memory.maximumAdditionalTrackedNativeBytes;
  if (!verifyOnly) {
    report.comparisons = [];
    for (const order of plan.orders) for (const host of plan.hosts) for (const workload of [...data.cases.map(test => test.name), 'checkpoint', 'initialization']) {
      const values = variant => report.cases.filter(value => value.order === order && value.host === host && value.variant === variant && value.workload === workload);
      const summary = variant => summarize(workload === 'initialization' ? values(variant).filter(value => !value.startupWarmup).map(value => value.initializationNs)
        : values(variant).flatMap(value => value.samples.filter(sample => !sample.warmup).map(sample => sample.elapsedNs)));
      const baseline = summary('baseline'), candidate = summary('candidate');
      const medianChangePercent = (candidate.medianNs / baseline.medianNs - 1) * 100, p95ChangePercent = (candidate.p95Ns / baseline.p95Ns - 1) * 100;
      const passed = workload === 'inventory' ? medianChangePercent <= -gates.timing.primaryMinimumMedianImprovementPercent
        : medianChangePercent <= gates.timing.maximumControlMedianRegressionPercent && p95ChangePercent <= gates.timing.maximumControlP95RegressionPercent;
      report.comparisons.push({order, host, workload, baseline, candidate, medianChangePercent, p95ChangePercent, passed});
    }
    report.accepted = report.memoryGate.passed && report.comparisons.every(value => value.passed);
  }
  report.passed = true; report.status = 'completed';
} catch (error) {report.status = 'failed'; report.error = error.stack; throw error;}
finally {checkPins(); report.inputsUnchanged = true; writeJSON(receipt, report); console.log({directory, passed: report.passed, accepted: report.accepted, cases: report.cases.length});}
