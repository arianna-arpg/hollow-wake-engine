import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import ts from 'typescript';
import {build} from 'esbuild';
import {root, sha256, verifyReference} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {challengeReference} from './challenge-reference.mjs';
import {challengeFiles, renderChallengeFile, integrateChallenges} from '../adapters/hollow-wake/integrate-challenges.mjs';

assert.equal(process.argv.length, 2);
fs.mkdirSync(path.join(root, '.artifacts'), {recursive: true});
const owned = fs.realpathSync(path.join(root, '.artifacts')), ref = path.join(root, '.reference');
const sources = {}, read = f => fs.readFileSync(path.join(root, f));
const tracked = f => {const bytes = read(f); sources[f] = sha256(bytes); return bytes;};
const original = challengeReference(tracked), lock = JSON.parse(tracked('baseline/source-lock.json'));
for (const f of ['package.json', 'package-lock.json', 'tsconfig.json', 'scripts/test-game-challenges.mjs',
  'scripts/challenge-reference.mjs', 'adapters/hollow-wake/challenge-boundary.json',
  'adapters/hollow-wake/integrate-challenges.mjs', 'adapters/hollow-wake/challenges.ts',
  'adapters/hollow-wake/challengeSpec.ts', 'src/challenges.ts', 'src/challenge-content.ts', 'src/challenge-types.ts']) tracked(f);
const work = fs.mkdtempSync(path.join(owned, 'challenges-game-owned-')), consumer = path.join(work, 'consumer');
const report = {passed: false, installed: true, composed: false, sources, faults: []}, logs = {};
const run = (label, args, cwd = consumer) => {
  const child = spawnSync(process.execPath, args, {cwd, encoding: 'utf8', windowsHide: true, timeout: 180000,
    maxBuffer: 4 * 1024 * 1024, env: {...process.env, TEMP: work, TMP: work, TMPDIR: work,
      NPM_CONFIG_CACHE: path.join(work, 'npm-cache'), NODE_COMPILE_CACHE: path.join(work, 'compile-cache')}});
  logs[label] = {stdout: child.stdout ?? '', stderr: child.stderr ?? ''}; assert(!child.error && !child.signal);
  return child;
};
const success = (label, args, cwd) => {const c = run(label, args, cwd); assert.equal(c.status, 0, label + ': ' + JSON.stringify(logs[label]).slice(-6000)); return c;};
try {
  verifyReference(ref, lock);
  fs.mkdirSync(consumer); fs.writeFileSync(path.join(consumer, 'package.json'), '{"private":true,"type":"module"}');
  const [packed] = JSON.parse(success('pack', [npmCli(), 'pack', '--json', '--ignore-scripts', '--pack-destination', work], root).stdout);
  const archive = path.join(work, packed.filename); report.archiveSha256 = sha256(fs.readFileSync(archive));
  success('install', [npmCli(), 'install', archive, '--offline', '--ignore-scripts', '--no-audit', '--no-fund']);
  const dist = path.join(consumer, 'node_modules/@hollow-wake/engine/dist');
  const entries = Object.fromEntries(['challenges', 'challenge-content'].map(n => ['@hollow-wake/engine/combat/' + n, path.join(dist, n + '.js')]));
  for (const n of ['challenges', 'challenge-content', 'challenge-types']) for (const suffix of ['.js', '.d.ts']) {
    assert(fs.readFileSync(path.join(dist, n + suffix)).equals(tracked('dist/' + n + suffix)));
  }
  const virtuals = new Map(challengeFiles.map(f => [path.join(ref, f), renderChallengeFile(f, read('.reference/' + f).toString())]));
  assert.throws(() => renderChallengeFile('unknown.ts', ''), /Unknown challenge boundary/);
  for (const f of challengeFiles) {
    assert.throws(() => renderChallengeFile(f, read('.reference/' + f).toString() + '\n'), /Unreviewed challenge source/);
    assert.throws(() => renderChallengeFile(f, virtuals.get(path.join(ref, f))), /Unreviewed challenge source/);
  }
  // Both original inputs must be admitted before the first on-disk replacement.
  const guard = path.join(work, 'guard'); fs.mkdirSync(path.join(guard, 'src/engine'), {recursive: true});
  for (const f of challengeFiles) fs.writeFileSync(path.join(guard, f), read('.reference/' + f));
  fs.appendFileSync(path.join(guard, challengeFiles[1]), '\n');
  assert.throws(() => integrateChallenges(guard), /Unreviewed challenge source/);
  assert(fs.readFileSync(path.join(guard, challengeFiles[0])).equals(read('.reference/' + challengeFiles[0])));
  report.adapterGuards = 6;
  const observerFile = path.join(ref, 'balance/hwe-challenges.ts'); virtuals.set(observerFile, original.source);
  const config = ts.getParsedCommandLineOfConfigFile(path.join(ref, 'tsconfig.sim.json'), {},
    {...ts.sys, onUnRecoverableConfigFileDiagnostic: d => {throw Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));}});
  assert(config);
  const options = {...config.options, baseUrl: root, paths: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, [v.replace(/\.js$/, '.d.ts')]])), typeRoots: [path.join(ref, 'node_modules/@types')]};
  const host = ts.createCompilerHost(options), oldRead = host.readFile.bind(host), oldExists = host.fileExists.bind(host);
  host.readFile = f => virtuals.get(path.resolve(f)) ?? oldRead(f); host.fileExists = f => virtuals.has(path.resolve(f)) || oldExists(f);
  const errors = ts.getPreEmitDiagnostics(ts.createProgram([...config.fileNames, observerFile], options, host));
  assert.equal(errors.length, 0, ts.formatDiagnostics(errors, {getCurrentDirectory: () => ref, getCanonicalFileName: f => f, getNewLine: () => '\n'})); report.types = true;
  const plugin = {name: 'installed-challenges', setup(b) {
    b.onResolve({filter: /^@hollow-wake\/engine\//}, args => {assert(entries[args.path], args.path); return {path: entries[args.path]};});
    b.onLoad({filter: /\.ts$/}, args => {const contents = virtuals.get(path.resolve(args.path)); if (contents !== undefined) return {contents, loader: 'ts'};});
  }};
  const module = path.join(dist, 'challenges.js'), moduleBytes = fs.readFileSync(module);
  const source = tracked('src/challenges.ts').toString(), adapterFile = path.join(ref, 'src/engine/challenges.ts'), adapter = virtuals.get(adapterFile);
  async function replay(label, fault) {
    if (fault) {
      const text = fault.adapter ? adapter : source; assert.equal(text.split(fault.from).length, 2, fault.name + ' selector');
      const changed = text.replace(fault.from, fault.to);
      if (fault.adapter) virtuals.set(adapterFile, changed);
      else fs.writeFileSync(module, ts.transpileModule(changed, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}, fileName: 'challenges.ts'}).outputText);
    }
    try {
      const entry = path.join(work, label + '.cjs'), output = path.join(work, label + '.json');
      const built = await build({stdin: {contents: original.source, loader: 'ts', resolveDir: path.join(ref, 'balance')}, bundle: true,
        platform: 'node', format: 'cjs', outfile: entry, metafile: true, plugins: [plugin], logLevel: 'silent'});
      for (const file of Object.values(entries)) assert(Object.keys(built.metafile.inputs).some(f => path.resolve(f) === file));
      const child = run(label, [entry, output], ref), bytes = fs.existsSync(output) ? fs.readFileSync(output) : null;
      if (fault) {
        assert(child.status !== 0 || !bytes?.equals(original.expected), label + ' escaped');
        report.faults.push({name: fault.name, detected: true, exitCode: child.status});
      } else {
        assert.equal(child.status, 0, JSON.stringify(logs[label]).slice(-6000));
        assert(bytes?.equals(original.expected), 'Installed challenge observations changed'); assert.deepEqual(logs[label], original.log);
      }
    } finally {virtuals.set(adapterFile, adapter); fs.writeFileSync(module, moduleBytes);}
  }
  await replay('installed-1'); await replay('installed-2');
  for (const fault of [
    {name: 'lost-guaranteed-reset', from: 'const guaranteed = !!s.guaranteedResetEvery && this.ports.time >= state.guaranteedAt;', to: 'const guaranteed = false;'},
    {name: 'skip-field-retirement', from: 'for (const actor of this.ports.actors) actor.statuses = actor.statuses.filter(st => st.challengeField !== e.body.id);', to: '// Deliberate field cleanup omission.'},
    {name: 'lost-cast-identity', from: 'if (this.casts.has(inst)) return inst;', to: '// Deliberate cast identity omission.'},
    {name: 'stale-host-clock', adapter: true, from: 'get time(){return w.time;},', to: 'time:w.time,'},
    {name: 'lost-carrier-replacement', adapter: true, from: 'set projectiles(v){w.projectiles=v;}', to: 'set projectiles(_v){}'},
    {name: 'ignored-host-randomness', adapter: true, from: 'random:()=>Math.random()', to: 'random:()=>1'},
  ]) await replay(fault.name, fault);
  await replay('restored'); assert(fs.readFileSync(module).equals(moduleBytes)); report.restored = true;
  report.observations = original.manifest.observations; report.freshProcesses = 2; report.passed = true;
} catch (error) {report.failure = String(error); process.exitCode = 1;}
finally {
  try {
    verifyReference(ref, lock);
    report.inputsUnchanged = Object.entries(sources).every(([f, h]) => sha256(read(f)) === h);
    report.passed = report.passed && report.inputsUnchanged;
  } catch (error) {
    report.passed = false; report.inputsUnchanged = false;
    report.failure = [report.failure, String(error)].filter(Boolean).join('\n'); process.exitCode = 1;
  }
  assert.equal(path.dirname(fs.realpathSync(work)), owned); assert(!fs.existsSync(path.join(work, '.git')));
  fs.rmSync(work, {recursive: true, maxRetries: 3}); report.cleaned = true;
  const bytes = gzipSync(JSON.stringify(logs), {level: 9}); report.logsSha256 = sha256(bytes);
  fs.writeFileSync(path.join(owned, 'challenges-game.logs.json.gz'), bytes);
  fs.writeFileSync(path.join(owned, 'challenges-game.json'), JSON.stringify(report, null, 2) + '\n');
}
assert(report.passed, report.failure ?? 'Verified inputs changed');
console.log({passed: true, installed: true, observations: report.observations, faults: report.faults.length,
  types: report.types, adapterGuards: report.adapterGuards, cleaned: true});
