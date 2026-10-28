import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {root, git, sha256, listFiles, writeJSON} from './reference-utils.mjs';
import {nativeEnvironment} from './native-tools.mjs';
import {workload} from '../experiments/embedded-js/measurements/workload.mjs';

assert.equal(process.platform, 'win32'); assert.equal(process.arch, 'x64');
const args = process.argv.slice(2), verifyOnly = args[0] === '--verify';
assert(verifyOnly || args[0] === '--measure');
const read = file => JSON.parse(fs.readFileSync(file));
const hashFile = file => sha256(fs.readFileSync(file));
const sourceDirectory = path.join(root, 'experiments/embedded-js/measurements');
const plan = read(path.join(sourceDirectory, 'plan.json'));
const sourceFiles = ['scripts/benchmark-embedded-library.mjs', 'scripts/native-tools.mjs', 'scripts/reference-utils.mjs',
  ...listFiles(sourceDirectory).map(file => 'experiments/embedded-js/measurements/' + file)];
const sources = Object.fromEntries(sourceFiles.map(file => [file, hashFile(path.join(root, file))]));
const runtime = Object.fromEntries(listFiles(path.join(root, 'dist')).map(file => [file, hashFile(path.join(root, 'dist', file))]));
const directory = fs.mkdtempSync(path.join(root, verifyOnly ? '.artifacts/embedded-cost-verification-' : '.artifacts/embedded-cost-measurement-'));
const receipt = path.join(directory, 'verification.json');
writeJSON(path.join(root, verifyOnly ? '.artifacts/embedded-cost-verification-latest.json' : '.artifacts/embedded-cost-measurement-latest.json'), {directory, receipt});
const report = {schemaVersion: 1, startedAt: new Date().toISOString(), passed: false, status: 'started', verifyOnly, plan, sources, runtimeMapSha256: sha256(JSON.stringify(runtime)),
  commit: git(root, ['rev-parse', 'HEAD']).trim(), environment: {node: process.version, platform: process.platform, arch: process.arch,
    os: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem()}, cases: []};
let pins, fixture, built, data;
const managedEnv = {...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1'};
const lines = file => fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
async function observeAmbientCpu(order) {
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const before = os.cpus();
    await new Promise(resolve => setTimeout(resolve, 2000));
    const after = os.cpus();
    assert.equal(after.length, before.length);
    const processors = after.map((cpu, index) => {
      const previous = before[index].times;
      const totalMs = Object.keys(cpu.times).reduce((sum, key) => sum + cpu.times[key] - previous[key], 0);
      assert(totalMs > 0);
      return {processor: index, totalMs, busyFraction: 1 - (cpu.times.idle - previous.idle) / totalMs};
    });
    samples.push({processors, meanBusyFraction: processors.reduce((sum, cpu) => sum + cpu.busyFraction, 0) / processors.length});
  }
  console.log({ambientCpuOrder: order, meanBusyFractions: samples.map(sample => sample.meanBusyFraction)});
  return {order, samples};
}
function checkPins() {
  for (const [file, hash] of Object.entries(sources)) assert.equal(hashFile(path.join(root, file)), hash, file);
  for (const [file, hash] of Object.entries(pins ?? {})) assert.equal(hashFile(file), hash, file);
  const actual = Object.fromEntries(listFiles(path.join(root, 'dist')).map(file => [file, hashFile(path.join(root, 'dist', file))]));
  assert.deepEqual(actual, runtime);
}
async function runCase(host, mode, test, order, repeat) {
  const label = [order, host, mode, test?.name, test?.batchSize, repeat].filter(value => value !== undefined).join('-');
  const location = path.join(directory, label); fs.mkdirSync(location);
  const job = {mode, verifyOnly, plan, config: data.config, checkpoint: data.checkpoint, checkpointText: JSON.stringify(data.checkpoint),
    active: data.active, case: test, library: fixture.library, bundle: fixture.bundle, input: fixture.input};
  const jobPath = path.join(location, 'job.json');
  // Compact JSON makes GetRawText in the managed host produce the same request bytes.
  fs.writeFileSync(jobPath, JSON.stringify(job) + '\n', {flag: 'wx'});
  const command = host === 'node-bundled-json' ? process.execPath : 'dotnet';
  const argv = host === 'node-bundled-json' ? ['--expose-gc', path.join(sourceDirectory, 'node-worker.mjs'), jobPath] : [built.managed, jobPath];
  const events = [], memories = [];
  const spawnedAt = process.hrtime.bigint();
  const child = spawn(command, argv, {cwd: built.directory, env: managedEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
  let buffer = '', errors = '', failure, readyLatencyNs = null;
  const timeout = setTimeout(() => {failure ??= new Error('Worker exceeded 120-second bound'); child.kill();}, 120000);
  child.stderr.setEncoding('utf8'); child.stderr.on('data', value => {errors += value;});
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', value => {
    buffer += value;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line); events.push(event);
        if (event.type === 'stage') {
          if (event.stage === 'worker-ready') readyLatencyNs = verifyOnly ? null : Number(process.hrtime.bigint() - spawnedAt);
          const memory = JSON.parse(execFileSync(built.memory, [String(child.pid)], {cwd: directory, windowsHide: true, encoding: 'utf8', timeout: 10000}));
          assert.equal(memory.pid, child.pid); assert(memory.privateCommitBytes > 0 && memory.workingSetBytes > 0);
          assert(memory.peakWorkingSetBytes >= memory.workingSetBytes);
          memories.push({stage: event.stage, ...memory}); child.stdin.write('continue\n');
        } else if (event.type === 'complete') child.stdin.end();
        else assert.equal(event.type, 'sample');
      } catch (error) {failure ??= error; child.kill();}
    }
  });
  child.on('error', error => {failure ??= error;});
  child.stdin.on('error', error => {failure ??= error; child.kill();});
  const completion = await new Promise(resolve => child.on('close', (code, signal) => resolve({code, signal})));
  clearTimeout(timeout);
  fs.writeFileSync(path.join(location, 'events.jsonl'), events.map(value => JSON.stringify(value)).join('\n') + '\n', {flag: 'wx'});
  fs.writeFileSync(path.join(location, 'stderr.txt'), errors, {flag: 'wx'});
  writeJSON(path.join(location, 'memory.json'), memories);
  assert(!failure, failure?.stack); assert.equal(completion.signal, null); assert.equal(completion.code, 0, label + ': ' + errors);
  assert.equal(buffer.trim(), ''); assert.equal(events.at(-1)?.type, 'complete'); assert.equal(events.at(-1).passed, true);
  const samples = events.filter(event => event.type === 'sample');
  assert.equal(samples.length, mode === 'memory' ? 0 : verifyOnly ? 1 : plan.warmups + plan.samples);
  const expected = test?.responseTexts ?? Array(plan.checkpointRounds).fill(JSON.stringify(data.checkpoint));
  for (const sample of samples) {
    assert.equal(sample.exactResponses, true); assert.equal(sample.observationsSha256, sha256(expected.join('\n')));
    assert.equal(sample.snapshotSha256, sha256(test?.snapshotText ?? JSON.stringify(data.checkpoint)));
    assert.equal(sample.responseBytes, expected.reduce((sum, value) => sum + Buffer.byteLength(value), 0));
    assert(verifyOnly ? sample.elapsedNs === null : Number.isFinite(sample.elapsedNs) && sample.elapsedNs > 0);
    assert.equal(sample.iteration, samples.indexOf(sample));
    assert.equal(sample.warmup, !verifyOnly && sample.iteration < plan.warmups);
    assert.equal(sample.calls, mode === 'throughput' ? expected.length : plan.checkpointRounds * 3);
    assert.equal(sample.commands, mode === 'throughput' ? test.commands.length : null);
  }
  for (const duration of [readyLatencyNs, events.at(-1).initializationNs])
    assert(verifyOnly ? duration === null : Number.isFinite(duration) && duration > 0);
  assert.deepEqual(memories.map(value => value.stage), mode === 'memory' ? plan.memoryStages : ['worker-ready']);
  const result = {label, host, mode, order, repeat, workload: test?.name, batchSize: test?.batchSize,
    readyLatencyNs, initializationNs: events.at(-1).initializationNs, samples, memory: memories,
    raw: Object.fromEntries(['job.json', 'events.jsonl', 'stderr.txt', 'memory.json'].map(file => [label + '/' + file, hashFile(path.join(location, file))]))};
  report.cases.push(result); writeJSON(receipt, report);
  console.log({label, passed: true, samples: samples.length});
}
try {
  if (verifyOnly) {
    assert.equal(args.length, 5); assert.equal(args[1], '--library-proof'); assert.equal(args[3], '--session-proof');
    const libraryDirectory = fs.realpathSync(args[2]), sessionDirectory = fs.realpathSync(args[4]);
    const libraryProof = read(path.join(libraryDirectory, 'verification.json')), sessionProof = read(path.join(sessionDirectory, 'verification.json'));
    assert(libraryProof.passed && libraryProof.inputsUnchanged && sessionProof.passed && sessionProof.inputsUnchanged);
    assert.equal(libraryProof.fixtureReceiptSha256, hashFile(path.join(sessionDirectory, 'verification.json')));
    assert.equal(libraryProof.runtimeMapSha256, report.runtimeMapSha256);
    for (const proof of [libraryProof, sessionProof]) for (const [file, hash] of Object.entries(proof.sourceHashes))
      assert.equal(hashFile(path.join(root, file)), hash, file);
    fixture = {library: path.join(libraryDirectory, 'hwe_embedded.dll'), bundle: path.join(sessionDirectory, 'bundle.js'),
      input: path.join(sessionDirectory, 'input.json'), requests: path.join(sessionDirectory, 'requests.jsonl')};
    assert.equal(hashFile(fixture.library), libraryProof.librarySha256); assert.equal(hashFile(fixture.bundle), sessionProof.bundleSha256);
    assert.equal(hashFile(fixture.input), sessionProof.inputSha256);
    assert.equal(hashFile(fixture.requests), sessionProof.raw['requests.jsonl']);
    data = workload(plan, read(fixture.input), lines(fixture.requests));
    const dataFile = path.join(directory, 'workload.json'); fs.writeFileSync(dataFile, JSON.stringify(data) + '\n', {flag: 'wx'});
    const env = nativeEnvironment(directory), buildLog = fs.openSync(path.join(directory, 'build.txt'), 'wx');
    const memory = path.join(directory, 'process-memory.exe'), managed = path.join(directory, 'managed');
    const sdk = execFileSync('dotnet', ['--list-sdks'], {cwd: directory, encoding: 'utf8', windowsHide: true}).split(/\r?\n/)
      .map(line => line.split(' ')[0]).filter(version => /^8\.\d+\.\d+$/.test(version)).sort((a, b) => Number(a.split('.')[2]) - Number(b.split('.')[2])).at(-1);
    assert(sdk); writeJSON(path.join(directory, 'global.json'), {sdk: {version: sdk, rollForward: 'disable'}});
    try {
      execFileSync('cl.exe', ['/nologo', '/W4', '/WX', '/O2', '/std:c11', '/MT', path.join(sourceDirectory, 'process-memory.c'),
        '/Fo:' + path.join(directory, 'process-memory.obj'), '/Fe:' + memory], {cwd: directory, env, windowsHide: true, stdio: ['ignore', buildLog, buildLog]});
      const intermediate = path.join(directory, 'managed-obj') + path.sep;
      execFileSync('dotnet', ['build', path.join(sourceDirectory, 'Worker.csproj'), '-c', 'Release', '-o', managed,
        '-p:BaseIntermediateOutputPath=' + intermediate, '-p:MSBuildProjectExtensionsPath=' + intermediate, '-p:NuGetAudit=false',
        '-p:UseSharedCompilation=false', '--disable-build-servers', '--configfile', path.join(root, 'experiments/embedded-js/native/dotnet/NuGet.Config')],
        {cwd: directory, env: {...managedEnv, DOTNET_CLI_HOME: path.join(directory, 'dotnet-home')}, windowsHide: true,
          stdio: ['ignore', buildLog, buildLog], timeout: 120000});
    } finally {fs.closeSync(buildLog);}
    built = {directory, memory, managed: path.join(managed, 'Worker.dll'), dataFile, dotnetSdk: sdk};
    pins = Object.fromEntries([...Object.values(fixture), memory, dataFile,
      ...Object.keys({...libraryProof.sourceHashes, ...sessionProof.sourceHashes}).map(file => path.join(root, file)),
      ...listFiles(managed).map(file => path.join(managed, file)), path.join(libraryDirectory, 'verification.json'),
      path.join(sessionDirectory, 'verification.json')].map(file => [file, hashFile(file)]));
    Object.assign(report, {fixture, built, pins});
  } else {
    assert.equal(args.length, 3); assert.equal(args[1], '--verification');
    const verifiedFile = path.join(fs.realpathSync(args[2]), 'verification.json'), verified = read(verifiedFile);
    assert(verified.passed && verified.verifyOnly && verified.inputsUnchanged);
    assert.deepEqual(verified.sources, sources); assert.deepEqual(verified.plan, plan); assert.equal(verified.runtimeMapSha256, report.runtimeMapSha256);
    ({fixture, built, pins} = verified); pins = {...pins, [verifiedFile]: hashFile(verifiedFile)}; data = read(built.dataFile);
    Object.assign(report, {fixture, built, pins, verifiedFile}); checkPins();
    writeJSON(path.join(directory, 'before-timing.json'), {createdAt: new Date().toISOString(), sources, pins, plan, runtimeMapSha256: report.runtimeMapSha256});
  }
  writeJSON(receipt, report); checkPins();
  const variants = [...data.cases.map(test => ({mode: 'throughput', test})), {mode: 'checkpoint'}];
  for (const order of verifyOnly ? ['verification'] : plan.orders) {
    if (!verifyOnly) {
      (report.ambientCpu ??= []).push(await observeAmbientCpu(order));
      writeJSON(receipt, report);
    }
    const orderedVariants = order === 'reverse' ? variants.slice().reverse() : variants;
    for (const variant of orderedVariants) for (const host of order === 'reverse' ? plan.hosts.slice().reverse() : plan.hosts)
      await runCase(host, variant.mode, variant.test, order, 0);
  }
  for (let repeat = 0; repeat < (verifyOnly ? 1 : plan.memoryRepeatsPerHost); repeat++)
    for (const host of repeat % 2 ? plan.hosts.slice().reverse() : plan.hosts) await runCase(host, 'memory', undefined, 'memory', repeat);
  if (!verifyOnly) report.summaries = report.cases.filter(value => value.samples.length).map(value => {
    const times = value.samples.filter(sample => !sample.warmup).map(sample => sample.elapsedNs).sort((a, b) => a - b);
    assert.equal(times.length, plan.samples);
    return {label: value.label, medianNs: times[Math.floor(times.length / 2)], p95Ns: times[Math.ceil(times.length * .95) - 1], minNs: times[0], maxNs: times.at(-1)};
  });
  report.passed = true; report.status = 'completed';
} catch (error) {report.status = 'failed'; throw error;}
finally {checkPins(); report.inputsUnchanged = true; writeJSON(receipt, report); console.log({directory, passed: report.passed, verifyOnly, cases: report.cases.length});}
