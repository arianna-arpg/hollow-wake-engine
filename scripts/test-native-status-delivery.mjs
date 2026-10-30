import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {build, version as bundlerVersion} from '../.reference/node_modules/esbuild/lib/main.js';
import {root, git, sha256, listFiles, verifyReference, writeJSON} from './reference-utils.mjs';
import {buildEmbeddedExecutable, buildEmbeddedLibrary, buildEmbeddedManagedConsumer} from './embedded-native-tools.mjs';
import {installCourseServices} from '../experiments/embedded-js/course-services.mjs';
import {nativeStatusDeliveryEntry} from './native-status-delivery-entry.mjs';
import {projectStatusDeliveryReplay, compareStatusDeliveryReplay, assertStatusDeliveryReplayFault} from './native-status-delivery-checks.mjs';
import {assertStatusDeliveryObservations} from './status-delivery-observation-checks.mjs';

const args = process.argv.slice(2);
assert.equal(args.length, 4); assert.equal(args[0], '--location'); assert.equal(args[2], '--amalgam-dir');
const location = JSON.parse(fs.readFileSync(path.resolve(root, args[1]))), upstream = fs.realpathSync(args[3]);
const original = path.join(root, '.reference'), game = fs.realpathSync(location.game);
const installed = fs.realpathSync(path.join(game, 'node_modules/@hollow-wake/engine'));
assert.notEqual(game, original);
verifyReference(original, JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'))));
const snapshot = dir => Object.fromEntries(listFiles(dir).map(file => [file, sha256(fs.readFileSync(path.join(dir, file)))]));
const sources = [original, game].map(dir => snapshot(path.join(dir, 'src'))), pkg = snapshot(installed), runtime = snapshot(path.join(root, 'dist'));
assert.deepEqual(snapshot(path.join(installed, 'dist')), runtime);
const accepted = JSON.parse(fs.readFileSync(path.join(root, 'baseline/status-delivery/acceptance.json')));
const expectedBytes = gunzipSync(fs.readFileSync(path.join(root, accepted.observations)));
assert.equal(sha256(expectedBytes), accepted.observationsSha256);
const expected = JSON.parse(expectedBytes), helper = fs.readFileSync(path.join(root, accepted.helper), 'utf8');
assert.equal(sha256(helper), accepted.helperSha256);
assert.equal(sha256(fs.readFileSync(path.join(root, accepted.positiveAssertions))), accepted.positiveAssertionsSha256);
assertStatusDeliveryObservations(expected);
const lock = JSON.parse(fs.readFileSync(path.join(root, 'experiments/embedded-js/host-source-lock.json')));
for (const [file, hash] of Object.entries(lock.files)) assert.equal(sha256(fs.readFileSync(path.join(upstream, file))), hash);
const owned = ['scripts/test-native-status-delivery.mjs', 'scripts/native-status-delivery-entry.mjs', 'scripts/native-status-delivery-checks.mjs',
  'scripts/embedded-native-tools.mjs', 'scripts/native-tools.mjs', 'scripts/reference-utils.mjs',
  'experiments/embedded-js/host-source-lock.json', 'experiments/embedded-js/course-services.mjs',
  'experiments/embedded-js/session-host.c', 'experiments/embedded-js/host-support.h', 'experiments/embedded-js/tracked-allocator.h',
  'baseline/status-delivery/acceptance.json', accepted.helper, accepted.positiveAssertions, accepted.observations];
owned.push(...listFiles(path.join(root, 'experiments/embedded-js/native')).map(file => 'experiments/embedded-js/native/' + file));
const hashes = Object.fromEntries(owned.map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]));
const directory = fs.mkdtempSync(path.join(root, '.artifacts/native-status-delivery-'));
writeJSON(path.join(root, '.artifacts/native-status-delivery-latest.json'), {directory});
const report = {schemaVersion: 1, passed: false, directory, commit: git(root, ['rev-parse', 'HEAD']).trim(),
  node: process.version, bundlerVersion, platform: process.platform, arch: process.arch, sourceHashes: hashes,
  originalSourceMapSha256: sha256(JSON.stringify(sources[0])), gameSourceMapSha256: sha256(JSON.stringify(sources[1])),
  installedPackageMapSha256: sha256(JSON.stringify(pkg)), runtimeMapSha256: sha256(JSON.stringify(runtime)),
  referenceSha256: accepted.observationsSha256, runtimeVersion: lock.version,
  scope: 'All 88 original/installed status-delivery courses in the experimental C, C++ and .NET hosts. Includes original World, content, headless services and retained test observations. No stable engine package, performance or device acceptance.', runs: []};

function execute(command, args, cwd, env, log, output) {
  const errors = fs.openSync(log, 'wx'), stdout = output ? fs.openSync(output, 'wx') : errors;
  let result;
  try { result = spawnSync(command, args, {cwd, env, windowsHide: true, stdio: ['ignore', stdout, errors], timeout: 180000}); }
  finally { if (output) fs.closeSync(stdout); fs.closeSync(errors); }
  assert(!result.error, result.error?.message); assert.equal(result.signal, null);
  assert.equal(result.status, 0, 'Replay failed; inspect ' + log);
  return JSON.parse(fs.readFileSync(log, 'utf8').trim().split(/\r?\n/).at(-1));
}
const readLines = file => fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
try {
  const nativeDir = path.join(directory, 'native'); fs.mkdirSync(nativeDir);
  const built = buildEmbeddedExecutable(nativeDir, upstream, path.join(root, 'experiments/embedded-js/session-host.c'), 'course-host');
  report.driver = {compilerBanner: built.compilerBanner, buildCommands: built.commands, binarySha256: sha256(fs.readFileSync(built.binary))};
  const libraryDir = path.join(directory, 'library'); fs.mkdirSync(libraryDir);
  const library = buildEmbeddedLibrary(libraryDir, upstream);
  report.library = {compilerBanner: library.compilerBanner, buildCommands: library.commands, librarySha256: sha256(fs.readFileSync(library.library)), consumerSha256: sha256(fs.readFileSync(library.native))};
  const managed = buildEmbeddedManagedConsumer(directory);
  report.managed = {sdk: managed.sdk, dllSha256: sha256(fs.readFileSync(managed.dll)), buildArgs: managed.args, buildLogSha256: sha256(fs.readFileSync(managed.log))};
  const content = path.join(directory, 'input.json'), requests = path.join(directory, 'requests.jsonl');
  fs.writeFileSync(content, '{}', {flag: 'wx'});
  fs.writeFileSync(requests, [...Array(89).fill({op: 'next'}), {op: 'services'}].map(v => JSON.stringify(v)).join('\n') + '\n', {flag: 'wx'});
  const controls = [];
  for (const [label, sourceRoot, before, after] of [
    ['original', original], ['installed', game],
    ['zero-share-fault', game, 'effect.spearShare ?? 0.5', 'effect.spearShare || 0.5'],
    ['source-identity-fault', game, 'recallSources.set(spear, inst)', 'recallSources.set(spear, spear)'],
  ]) {
    const out = path.join(directory, label); fs.mkdirSync(out);
    const source = path.join(out, 'entry.ts'), bundle = path.join(out, 'bundle.js');
    fs.writeFileSync(source, nativeStatusDeliveryEntry(helper, sourceRoot), {flag: 'wx'});
    let mutations = 0;
    const plugins = before ? [{name: 'status-delivery-fault', setup(api) {
      api.onLoad({filter: /[\\/]dist[\\/]status-delivery\.js$/}, input => {
        assert.equal(fs.realpathSync(input.path), path.join(installed, 'dist/status-delivery.js'));
        const text = fs.readFileSync(input.path, 'utf8'); assert.equal(text.split(before).length, 2); mutations++;
        return {contents: text.replace(before, after), loader: 'js'};
      });
    }}] : [];
    const compiled = await build({entryPoints: [source], bundle: true, platform: 'neutral', format: 'iife', globalName: 'HollowWakeSession',
      target: 'es2022', keepNames: true, metafile: true, outfile: bundle, plugins, banner: {js: `(${installCourseServices.toString()})();`}});
    assert.equal(mutations, before ? 1 : 0);
    assert(Object.values(compiled.metafile.outputs).every(output => output.imports.length === 0));
    const inputs = Object.keys(compiled.metafile.inputs).map(file => path.resolve(root, file));
    if (sourceRoot === game) assert(inputs.includes(path.join(installed, 'dist/status-delivery.js')));
    else assert(!inputs.some(file => file.includes('@hollow-wake')));
    writeJSON(path.join(out, 'metafile.json'), compiled.metafile);
    const run = {label, passed: false, bundleSha256: sha256(fs.readFileSync(bundle)), bundleBytes: fs.statSync(bundle).size, consumers: []};
    report.runs.push(run); writeJSON(path.join(directory, 'progress.json'), report);
    let cloneChecks = 0;
    const context = vm.createContext({courseCloneOracle(a, b) {assert.deepEqual(structuredClone(a), structuredClone(b)); cloneChecks++;}});
    vm.runInContext(fs.readFileSync(bundle, 'utf8'), context);
    vm.runInContext('const controller=HollowWakeSession.create({});', context);
    const node = [];
    for (let i = 0; i < 89; i++) node.push(JSON.parse(vm.runInContext("JSON.stringify(HollowWakeSession.dispatch(controller,{op:'next'}))", context)));
    const projected = projectStatusDeliveryReplay(node);
    if (before) assertStatusDeliveryReplayFault(label, projected, expected);
    else { assert.equal(JSON.stringify(projected, null, 2) + '\n', expectedBytes.toString()); assertStatusDeliveryObservations(projected); }
    const services = JSON.parse(vm.runInContext('JSON.stringify(globalThis.courseServiceReport())', context));
    assert.equal(services.clones, cloneChecks); assert(cloneChecks > 0);
    run.cloneChecks = cloneChecks; run.nodeMatchesFrozen = !before; run.nodeFaultDetected = !!before;
    fs.writeFileSync(path.join(out, 'node.jsonl'), node.map(v => JSON.stringify(v)).join('\n') + '\n', {flag: 'wx'});
    writeJSON(path.join(out, 'node-services.json'), services);
    console.log(label + ': Node replay verified');
    let driverValues;
    for (const host of ['c', 'cpp', 'dotnet']) {
      const output = path.join(out, host + '.jsonl'), log = path.join(out, host + '.txt');
      const metrics = host === 'c' ? execute(built.binary, [bundle, content, requests], out, built.env, log, output)
        : host === 'cpp' ? execute(library.native, [library.library, bundle, content, requests, output], out, library.env, log)
        : execute('dotnet', [managed.dll, library.library, bundle, content, requests, output], directory, managed.env, log);
      assert.equal(metrics[host === 'c' ? 'completedRequests' : 'requests'], 90);
      assert.equal(metrics[host === 'c' ? 'liveRequestedBytesAfterDispose' : 'liveBytesAfterDispose'], 0);
      assert.equal(metrics.liveBlocksAfterDispose, 0);
      if (host === 'c') assert.equal(metrics.code, 0); else assert(metrics.passed);
      const values = readLines(output); assert.equal(values.length, 90);
      const comparison = compareStatusDeliveryReplay(values.slice(0, 89), node);
      assert.equal(values[89].clones, cloneChecks); assert.deepEqual(values[89].logs, services.logs);
      if (before) assertStatusDeliveryReplayFault(label, projectStatusDeliveryReplay(values.slice(0, 89)), expected);
      else assertStatusDeliveryObservations(projectStatusDeliveryReplay(values.slice(0, 89)));
      if (host === 'c') driverValues = values.slice(0, 89);
      else compareStatusDeliveryReplay(values.slice(0, 89), driverValues);
      run.consumers.push({host, passed: true, metrics, comparison, faultDetected: !!before, outputSha256: sha256(fs.readFileSync(output)), logSha256: sha256(fs.readFileSync(log))});
      writeJSON(path.join(directory, 'progress.json'), report);
      console.log(label + ': ' + host + ' completed all 90 requests');
    }
    if (!before) controls.push(driverValues);
    run.passed = true; writeJSON(path.join(out, 'verification.json'), run);
  }
  report.originalAndInstalledNative = compareStatusDeliveryReplay(controls[1], controls[0]);
  assert.deepEqual(report.runs.map(run => run.label), ['original', 'installed', 'zero-share-fault', 'source-identity-fault']);
  assert(report.runs.every(run => run.passed && run.consumers.length === 3 && run.consumers.every(host => host.passed)));
  report.passed = true;
} catch (error) { report.error = {message: error.message, stack: error.stack}; throw error; }
finally {
  assert.deepEqual(snapshot(path.join(original, 'src')), sources[0]); assert.deepEqual(snapshot(path.join(game, 'src')), sources[1]);
  assert.deepEqual(snapshot(installed), pkg); assert.deepEqual(snapshot(path.join(root, 'dist')), runtime);
  for (const [file, hash] of Object.entries(hashes)) assert.equal(sha256(fs.readFileSync(path.join(root, file))), hash);
  for (const [file, hash] of Object.entries(lock.files)) assert.equal(sha256(fs.readFileSync(path.join(upstream, file))), hash);
  report.inputsUnchanged = true; writeJSON(path.join(directory, 'verification.json'), report);
  console.log({directory, passed: report.passed, error: report.error?.message});
}
