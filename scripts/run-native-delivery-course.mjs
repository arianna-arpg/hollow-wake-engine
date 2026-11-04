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
import {compareDeliveryReplay, projectDeliveryReplay} from './native-delivery-comparison.mjs';

export async function runNativeDeliveryCourse({id, entry, check, detectFault, faults, timeoutMs = 180000, compareCrossRuntime = compareDeliveryReplay}) {
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
  const acceptanceFile = 'baseline/' + id + '/acceptance.json';
  const accepted = JSON.parse(fs.readFileSync(path.join(root, acceptanceFile)));
  const responseCount = accepted.courses + 1, requestCount = responseCount + 1;
  const project = values => projectDeliveryReplay(values, accepted.courses);
  const expectedBytes = gunzipSync(fs.readFileSync(path.join(root, accepted.observations)));
  assert.equal(sha256(expectedBytes), accepted.observationsSha256);
  const expected = JSON.parse(expectedBytes), helper = fs.readFileSync(path.join(root, accepted.helper), 'utf8');
  assert.equal(sha256(helper), accepted.helperSha256);
  assert.equal(sha256(fs.readFileSync(path.join(root, accepted.positiveAssertions))), accepted.positiveAssertionsSha256);
  check(expected);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'experiments/embedded-js/host-source-lock.json')));
  for (const [file, hash] of Object.entries(lock.files)) assert.equal(sha256(fs.readFileSync(path.join(upstream, file))), hash);
  const owned = ['scripts/test-native-' + id + '.mjs', 'scripts/native-' + id + '-entry.mjs', 'scripts/native-' + id + '-checks.mjs',
    'scripts/run-native-delivery-course.mjs', 'scripts/native-delivery-comparison.mjs',
    'scripts/embedded-native-tools.mjs', 'scripts/native-tools.mjs', 'scripts/reference-utils.mjs',
    'experiments/embedded-js/host-source-lock.json', 'experiments/embedded-js/course-services.mjs',
    'experiments/embedded-js/session-host.c', 'experiments/embedded-js/host-support.h', 'experiments/embedded-js/tracked-allocator.h',
    acceptanceFile, accepted.helper, accepted.positiveAssertions, accepted.observations];
  owned.push(...listFiles(path.join(root, 'experiments/embedded-js/native')).map(file => 'experiments/embedded-js/native/' + file));
  const hashes = Object.fromEntries(owned.map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]));
  const directory = fs.mkdtempSync(path.join(root, '.artifacts/native-' + id + '-'));
  writeJSON(path.join(root, '.artifacts/native-' + id + '-latest.json'), {directory});
  const report = {schemaVersion: 1, passed: false, directory, commit: git(root, ['rev-parse', 'HEAD']).trim(),
    node: process.version, bundlerVersion, platform: process.platform, arch: process.arch, sourceHashes: hashes,
    originalSourceMapSha256: sha256(JSON.stringify(sources[0])), gameSourceMapSha256: sha256(JSON.stringify(sources[1])),
    installedPackageMapSha256: sha256(JSON.stringify(pkg)), runtimeMapSha256: sha256(JSON.stringify(runtime)),
    referenceSha256: accepted.observationsSha256, runtimeVersion: lock.version,
    scope: 'All ' + accepted.courses + ' original and installed ' + id + ' courses through C, C++ and .NET. Includes the original World, content, headless services and retained observations.', runs: []};

  function execute(command, args, cwd, env, log, output) {
    const errors = fs.openSync(log, 'wx'), stdout = output ? fs.openSync(output, 'wx') : errors;
    let result;
    try { result = spawnSync(command, args, {cwd, env, windowsHide: true, stdio: ['ignore', stdout, errors], timeout: timeoutMs}); }
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
    fs.writeFileSync(requests, [...Array(responseCount).fill({op: 'next'}), {op: 'services'}].map(v => JSON.stringify(v)).join('\n') + '\n', {flag: 'wx'});
    const controls = [];
    for (const [label, sourceRoot, before, after] of [
      ['original', original], ['installed', game],
      ...faults.map(([name, before, after]) => [name, game, before, after]),
    ]) {
      const out = path.join(directory, label); fs.mkdirSync(out);
      const source = path.join(out, 'entry.ts'), bundle = path.join(out, 'bundle.js');
      fs.writeFileSync(source, entry(helper, sourceRoot), {flag: 'wx'});
      let mutations = 0;
      const plugins = before ? [{name: id + '-fault', setup(api) {
        api.onLoad({filter: /[\\/]dist[\\/](?:proc-delivery|status-delivery)\.js$/}, input => {
          if (path.basename(input.path) !== id + '.js') return;
          assert.equal(fs.realpathSync(input.path), path.join(installed, 'dist/' + id + '.js'));
          const text = fs.readFileSync(input.path, 'utf8'); assert.equal(text.split(before).length, 2); mutations++;
          return {contents: text.replace(before, after), loader: 'js'};
        });
      }}] : [];
      const compiled = await build({entryPoints: [source], bundle: true, platform: 'neutral', format: 'iife', globalName: 'HollowWakeSession',
        target: 'es2022', keepNames: true, metafile: true, outfile: bundle, plugins, banner: {js: `(${installCourseServices.toString()})();`}});
      assert.equal(mutations, before ? 1 : 0);
      assert(Object.values(compiled.metafile.outputs).every(output => output.imports.length === 0));
      const inputs = Object.keys(compiled.metafile.inputs).map(file => path.resolve(root, file));
      if (sourceRoot === game) assert(inputs.includes(path.join(installed, 'dist/' + id + '.js')));
      else assert(!inputs.some(file => file.includes('@hollow-wake')));
      writeJSON(path.join(out, 'metafile.json'), compiled.metafile);
      const run = {label, passed: false, bundleSha256: sha256(fs.readFileSync(bundle)), bundleBytes: fs.statSync(bundle).size, consumers: []};
      report.runs.push(run); writeJSON(path.join(directory, 'progress.json'), report);
      let cloneChecks = 0;
      const context = vm.createContext({courseCloneOracle(a, b) {assert.deepEqual(structuredClone(a), structuredClone(b)); cloneChecks++;}});
      vm.runInContext(fs.readFileSync(bundle, 'utf8'), context);
      vm.runInContext('const controller=HollowWakeSession.create({});', context);
      const node = [];
      for (let i = 0; i < responseCount; i++) node.push(JSON.parse(vm.runInContext("JSON.stringify(HollowWakeSession.dispatch(controller,{op:'next'}))", context)));
      const projected = project(node);
      if (before) detectFault(label, projected, expected);
      else {
        const bytes = Buffer.from(JSON.stringify(projected, null, 2) + '\n');
        if (!bytes.equals(expectedBytes)) {compareDeliveryReplay(projected, expected); throw Error('Node reconstruction changed serialization');}
        check(projected);
      }
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
        assert.equal(metrics[host === 'c' ? 'completedRequests' : 'requests'], requestCount);
        assert.equal(metrics[host === 'c' ? 'liveRequestedBytesAfterDispose' : 'liveBytesAfterDispose'], 0);
        assert.equal(metrics.liveBlocksAfterDispose, 0);
        if (host === 'c') assert.equal(metrics.code, 0); else assert(metrics.passed);
        const values = readLines(output); assert.equal(values.length, requestCount);
        const comparison = compareCrossRuntime(values.slice(0, responseCount), node);
        assert.equal(values[responseCount].clones, cloneChecks); assert.deepEqual(values[responseCount].logs, services.logs);
        if (before) detectFault(label, project(values.slice(0, responseCount)), expected);
        else check(project(values.slice(0, responseCount)));
        if (host === 'c') driverValues = values.slice(0, responseCount);
        else compareDeliveryReplay(values.slice(0, responseCount), driverValues);
        run.consumers.push({host, passed: true, metrics, comparison, faultDetected: !!before, outputSha256: sha256(fs.readFileSync(output)), logSha256: sha256(fs.readFileSync(log))});
        writeJSON(path.join(directory, 'progress.json'), report);
        console.log(label + ': ' + host + ' completed all ' + requestCount + ' requests');
      }
      if (!before) controls.push(driverValues);
      run.passed = true; writeJSON(path.join(out, 'verification.json'), run);
    }
    report.originalAndInstalledNative = compareDeliveryReplay(controls[1], controls[0]);
    assert.deepEqual(report.runs.map(run => run.label), ['original', 'installed', ...faults.map(([name]) => name)]);
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
}
