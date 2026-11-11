import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import ts from 'typescript';
import {build} from 'esbuild';
import {root, sha256, verifyReference} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {challengeContinuationReference} from './challenge-continuation-reference.mjs';
import {challengeFiles, renderChallengeFile} from '../adapters/hollow-wake/integrate-challenges.mjs';

assert.equal(process.argv.length, 2);
fs.mkdirSync(path.join(root, '.artifacts'), {recursive: true});
const owned = fs.realpathSync(path.join(root, '.artifacts')), ref = path.join(root, '.reference');
const sources = {}, read = f => fs.readFileSync(path.join(root, f));
const tracked = f => {const bytes = read(f); sources[f] = sha256(bytes); return bytes;};
const original = challengeContinuationReference(tracked), lock = JSON.parse(tracked('baseline/source-lock.json'));
const privateSource = tracked('test/challenge-continuation-game.ts').toString();
const modules = ['challenges', 'challenge-content', 'challenge-continuation', 'challenge-owned', 'challenge-types'];
for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'scripts/test-game-challenge-continuation.mjs',
  'scripts/challenge-continuation-reference.mjs', 'adapters/hollow-wake/challenge-boundary.json',
  'adapters/hollow-wake/integrate-challenges.mjs', 'adapters/hollow-wake/challenges.ts',
  'adapters/hollow-wake/challengeSpec.ts', ...modules.map(n => 'src/' + n + '.ts')]) tracked(file);
const work = fs.mkdtempSync(path.join(owned, 'challenge-continuation-game-owned-')), consumer = path.join(work, 'consumer');
const report = {passed: false, installed: true, composed: false, sources, faults: []}, logs = {};
const run = (label, args, cwd = consumer) => {
  const child = spawnSync(process.execPath, args, {cwd, encoding: 'utf8', windowsHide: true, timeout: 180000,
    maxBuffer: 8 * 1024 * 1024, env: {...process.env, TEMP: work, TMP: work, TMPDIR: work,
      NPM_CONFIG_CACHE: path.join(work, 'npm-cache'), NODE_COMPILE_CACHE: path.join(work, 'compile-cache')}});
  logs[label] = {stdout: child.stdout ?? '', stderr: child.stderr ?? ''}; assert(!child.error && !child.signal); return child;
};
const success = (label, args, cwd) => {const c = run(label, args, cwd); assert.equal(c.status, 0, label + ': ' + JSON.stringify(logs[label]).slice(-7000)); return c;};
try {
  verifyReference(ref, lock);
  fs.mkdirSync(consumer); fs.writeFileSync(path.join(consumer, 'package.json'), '{"private":true,"type":"module"}');
  const [packed] = JSON.parse(success('pack', [npmCli(), 'pack', '--json', '--ignore-scripts', '--pack-destination', work], root).stdout);
  const archive = path.join(work, packed.filename); report.archiveSha256 = sha256(fs.readFileSync(archive));
  success('install', [npmCli(), 'install', archive, '--offline', '--ignore-scripts', '--no-audit', '--no-fund']);
  const dist = path.join(consumer, 'node_modules/@hollow-wake/engine/dist');
  const entries = Object.fromEntries(['challenges', 'challenge-content', 'challenge-continuation']
    .map(n => ['@hollow-wake/engine/combat/' + n, path.join(dist, n + '.js')]));
  for (const name of modules) for (const suffix of ['.js', '.d.ts'])
    assert(fs.readFileSync(path.join(dist, name + suffix)).equals(tracked('dist/' + name + suffix)));
  const virtuals = new Map(challengeFiles.map(f => [path.join(ref, f), renderChallengeFile(f, read('.reference/' + f).toString())]));
  const observerFile = path.join(ref, 'balance/hwe-challenge-continuation.ts');
  const privateFile = path.join(ref, 'balance/hwe-challenge-continuation-private.ts');
  virtuals.set(observerFile, original.source); virtuals.set(privateFile, privateSource);
  const config = ts.getParsedCommandLineOfConfigFile(path.join(ref, 'tsconfig.sim.json'), {},
    {...ts.sys, onUnRecoverableConfigFileDiagnostic: d => {throw Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));}});
  assert(config);
  const options = {...config.options, baseUrl: root, paths: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, [v.replace(/\.js$/, '.d.ts')]])), typeRoots: [path.join(ref, 'node_modules/@types')]};
  const host = ts.createCompilerHost(options), oldRead = host.readFile.bind(host), oldExists = host.fileExists.bind(host);
  host.readFile = f => virtuals.get(path.resolve(f)) ?? oldRead(f); host.fileExists = f => virtuals.has(path.resolve(f)) || oldExists(f);
  const errors = ts.getPreEmitDiagnostics(ts.createProgram([...config.fileNames, observerFile, privateFile], options, host));
  assert.equal(errors.length, 0, ts.formatDiagnostics(errors, {getCurrentDirectory: () => ref, getCanonicalFileName: f => f, getNewLine: () => '\n'})); report.types = true;
  const plugin = {name: 'installed-challenge-continuation', setup(b) {
    b.onResolve({filter: /^@hollow-wake\/engine\//}, args => {assert(entries[args.path], args.path); return {path: entries[args.path]};});
    b.onLoad({filter: /\.ts$/}, args => {const contents = virtuals.get(path.resolve(args.path)); if (contents !== undefined) return {contents, loader: 'ts'};});
  }};
  const module = path.join(dist, 'challenge-continuation.js'), moduleBytes = fs.readFileSync(module);
  const source = tracked('src/challenge-continuation.ts').toString();
  const privateLog = {stdout: 'Challenge private continuation: 5 courses, 30 stages passed\n', stderr: original.log.stderr};
  async function replay(label, privateCourse, fault) {
    if (fault) {
      assert.equal(source.split(fault.from).length, 2, fault.name + ' selector');
      fs.writeFileSync(module, ts.transpileModule(source.replace(fault.from, fault.to), {compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}, fileName: 'challenge-continuation.ts'}).outputText);
    }
    try {
      const entry = path.join(work, label + '.cjs'), output = path.join(work, label + '.json');
      const built = await build({stdin: {contents: privateCourse ? privateSource : original.source, loader: 'ts', resolveDir: path.join(ref, 'balance')},
        bundle: true, platform: 'node', format: 'cjs', outfile: entry, metafile: true, plugins: [plugin], logLevel: 'silent'});
      const required = privateCourse ? Object.values(entries) : [entries['@hollow-wake/engine/combat/challenges'], entries['@hollow-wake/engine/combat/challenge-content']];
      for (const file of required) assert(Object.keys(built.metafile.inputs).some(f => path.resolve(f) === file));
      const child = run(label, [entry, output], ref);
      if (fault) {
        assert.equal(child.status, 1, label + ' escaped'); assert.match(logs[label].stderr, /ERR_ASSERTION/);
        report.faults.push({name: fault.name, detected: true, exitCode: child.status});
      } else {
        assert.equal(child.status, 0, label + ': ' + JSON.stringify(logs[label]).slice(-7000));
        assert.deepEqual(logs[label], privateCourse ? privateLog : original.log);
        if (!privateCourse) assert(fs.readFileSync(output).equals(original.expected), 'Original continuation observations changed');
      }
    } finally {fs.writeFileSync(module, moduleBytes);}
  }
  for (let i = 1; i <= 2; i++) {await replay('original-' + i, false); await replay('private-' + i, true);}
  for (const fault of [
    {name: 'lost-deadline', from: 'guaranteedAt: original.guaranteedAt', to: 'guaranteedAt: 0'},
    {name: 'lost-retirement', from: 'retired: original.retired', to: 'retired: false'},
    {name: 'lost-target-ledger', from: 'orbitTargets: new Set(original.orbitTargets)', to: 'orbitTargets: new Set()'},
    {name: 'lost-flight-progress', from: 'from: point(value.from), at: point(value.at), d: delivery(value.d)', to: 'from: point(value.from), at: point(value.at), d: delivery(value.d), remaining: 0'},
    {name: 'lost-device-center', from: 'center: point(original.center)', to: 'center: {x: 0, y: 0}'},
    {name: 'lost-echoes', from: 'shocks, used: true', to: 'shocks: [], used: true'},
  ]) await replay(fault.name, true, fault);
  await replay('restored', true); report.restored = true;
  report.observations = 13; report.privateCourses = 5; report.privateStages = 30; report.freshProcesses = 2; report.passed = true;
} catch (error) {report.failure = String(error); process.exitCode = 1;}
finally {
  try {verifyReference(ref, lock); report.inputsUnchanged = Object.entries(sources).every(([f, h]) => sha256(read(f)) === h); report.passed = report.passed && report.inputsUnchanged;}
  catch (error) {report.passed = false; report.failure = String(error); process.exitCode = 1;}
  assert.equal(path.dirname(fs.realpathSync(work)), owned); assert(!fs.existsSync(path.join(work, '.git')));
  fs.rmSync(work, {recursive: true, maxRetries: 3}); report.cleaned = true;
  const bytes = gzipSync(JSON.stringify(logs), {level: 9}); report.logsSha256 = sha256(bytes);
  fs.writeFileSync(path.join(owned, 'challenge-continuation-game.logs.json.gz'), bytes);
  fs.writeFileSync(path.join(owned, 'challenge-continuation-game.json'), JSON.stringify(report, null, 2) + '\n');
}
assert(report.passed, report.failure ?? 'Verified inputs changed');
console.log({passed: true, observations: 13, privateCourses: 5, privateStages: 30, faults: report.faults.length, cleaned: true});
