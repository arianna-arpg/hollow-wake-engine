import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import ts from 'typescript';
import {build} from 'esbuild';
import {root, sha256} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {challengeContinuationContracts} from '../test/challenge-continuation-contracts.mjs';
import {challengeContinuationFaults} from '../test/challenge-continuation-faults.mjs';

assert.equal(process.argv.length, 2);
fs.mkdirSync(path.join(root, '.artifacts'), {recursive: true});
const owned = fs.realpathSync(path.join(root, '.artifacts'));
const read = f => fs.readFileSync(path.join(root, f));
const sources = {}, tracked = f => {const bytes = read(f); sources[f] = sha256(bytes); return bytes;};
const modules = ['challenges', 'challenge-continuation', 'challenge-owned', 'challenge-types'];
for (const file of ['package.json', 'package-lock.json', 'tsconfig.json',
  ...modules.map(name => 'src/' + name + '.ts'), 'test/challenge-continuation.test.mjs',
  'test/challenge-continuation-contracts.mjs', 'test/challenge-continuation-consumer.ts',
  'test/challenge-continuation-faults.mjs', 'scripts/test-challenge-continuation-package.mjs']) tracked(file);
const report = {passed: false, sources, faults: []}, logs = {};
const work = fs.mkdtempSync(path.join(owned, 'challenge-continuation-package-owned-'));
const consumer = path.join(work, 'consumer');
const run = (label, args, cwd = consumer) => {
  const child = spawnSync(process.execPath, args, {cwd, windowsHide: true, encoding: 'utf8',
    timeout: 180000, maxBuffer: 4 * 1024 * 1024, env: {...process.env, TEMP: work, TMP: work,
      TMPDIR: work, NODE_PATH: '', NPM_CONFIG_CACHE: path.join(work, 'npm-cache'), NODE_COMPILE_CACHE: path.join(work, 'compile-cache')}});
  logs[label] = {stdout: child.stdout ?? '', stderr: child.stderr ?? ''};
  assert(!child.error && !child.signal, label + ': ' + child.error); return child;
};
const success = (label, args, cwd) => {
  const child = run(label, args, cwd); assert.equal(child.status, 0, label + ': ' + JSON.stringify(logs[label]).slice(-7000)); return child;
};
try {
  fs.mkdirSync(consumer); fs.writeFileSync(path.join(consumer, 'package.json'), '{"private":true,"type":"module"}');
  const [packed] = JSON.parse(success('pack', [npmCli(), 'pack', '--json', '--ignore-scripts', '--pack-destination', work], root).stdout);
  const archive = path.join(work, packed.filename); report.archiveSha256 = sha256(fs.readFileSync(archive));
  success('install', [npmCli(), 'install', archive, '--offline', '--ignore-scripts', '--no-audit', '--no-fund']);
  const entry = '@hollow-wake/engine/combat/challenges', copyEntry = '@hollow-wake/engine/combat/challenge-continuation';
  const dist = path.join(consumer, 'node_modules/@hollow-wake/engine/dist');
  report.modules = {};
  for (const name of modules) {
    const bytes = fs.readFileSync(path.join(dist, name + '.js')), types = fs.readFileSync(path.join(dist, name + '.d.ts'));
    assert(bytes.equals(tracked('dist/' + name + '.js'))); assert(types.equals(tracked('dist/' + name + '.d.ts')));
    report.modules[name] = {bytes: bytes.length, sha256: sha256(bytes), typesSha256: sha256(types)};
  }
  report.moduleBytes = Object.values(report.modules).reduce((n, r) => n + r.bytes, 0);
  assert(report.moduleBytes <= 30 * 1024, 'Controller plus optional continuation exceeds 30 KiB');
  fs.writeFileSync(path.join(consumer, 'contracts.mjs'), tracked('test/challenge-continuation-contracts.mjs'));
  fs.writeFileSync(path.join(consumer, 'consumer.mjs'), `import {Challenges} from '${entry}';
import {copyChallengeState} from '${copyEntry}';
import {challengeContinuationContracts} from './contracts.mjs';
console.log(JSON.stringify(challengeContinuationContracts({Challenges,copyChallengeState})));
`);
  const expected = JSON.parse(success('installed', ['consumer.mjs']).stdout);
  assert.equal(expected, 31); report.contracts = expected;
  fs.writeFileSync(path.join(consumer, 'entry.mjs'), `export {Challenges} from '${entry}';export {copyChallengeState} from '${copyEntry}';`);
  const browser = await build({entryPoints: [path.join(consumer, 'entry.mjs')], bundle: true,
    platform: 'browser', format: 'iife', globalName: 'ChallengeApi', target: 'es2022',
    minify: true, metafile: true, write: false, logLevel: 'silent'});
  assert.equal(browser.outputFiles.length, 1); assert(Object.values(browser.metafile.outputs).every(o => !o.imports.length));
  report.browserBytes = browser.outputFiles[0].contents.length; assert(report.browserBytes <= 18 * 1024);
  const context = vm.createContext({});
  new vm.Script("for(const name of ['window','document','process','require','fetch','setTimeout','setInterval'])Object.defineProperty(globalThis,name,{get(){throw Error('Forbidden host global: '+name)}});Math.random=()=>{throw Error('Forbidden ambient RNG')};Date.now=()=>{throw Error('Forbidden ambient clock')};").runInContext(context);
  new vm.Script(browser.outputFiles[0].text).runInContext(context);
  assert.equal(challengeContinuationContracts(context.ChallengeApi), expected); report.hostileBrowser = true;
  const consumerTypes = tracked('test/challenge-continuation-consumer.ts');
  report.negativeTypeCases = (consumerTypes.toString().match(/@ts-expect-error/g) ?? []).length;
  assert.equal(report.negativeTypeCases, 8); fs.writeFileSync(path.join(consumer, 'consumer.ts'), consumerTypes);
  fs.writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify({compilerOptions: {
    strict: true, noUncheckedIndexedAccess: true, noEmit: true, target: 'ES2022', module: 'NodeNext',
    moduleResolution: 'NodeNext', types: [], lib: ['ES2022']}, files: ['consumer.ts']}));
  success('types', [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json']); report.types = true;
  assert.equal(challengeContinuationFaults.length, 12);
  for (const fault of challengeContinuationFaults) {
    const source = tracked('src/' + fault.module + '.ts').toString();
    assert.equal(source.split(fault.from).length, 2, fault.name + ' selector');
    const file = path.join(dist, fault.module + '.js'), original = fs.readFileSync(file);
    const altered = ts.transpileModule(source.replace(fault.from, fault.to), {compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}, fileName: fault.module + '.ts'}).outputText;
    try {
      fs.writeFileSync(file, altered);
      const child = run(fault.name, ['consumer.mjs']); assert.equal(child.status, 1, fault.name + ' escaped');
      assert.match(logs[fault.name].stderr, /ERR_ASSERTION/); report.faults.push({name: fault.name, detected: true});
    } finally {fs.writeFileSync(file, original);}
  }
  assert.equal(JSON.parse(success('restored', ['consumer.mjs']).stdout), expected); report.restored = true;
  report.passed = true;
} catch (error) {report.failure = String(error); process.exitCode = 1;}
finally {
  try {report.inputsUnchanged = Object.entries(sources).every(([f, h]) => sha256(read(f)) === h); report.passed = report.passed && report.inputsUnchanged;}
  catch (error) {report.passed = false; report.failure = String(error); process.exitCode = 1;}
  assert.equal(path.dirname(fs.realpathSync(work)), owned); assert(!fs.existsSync(path.join(work, '.git')));
  fs.rmSync(work, {recursive: true, maxRetries: 3}); report.cleaned = true;
  const bytes = gzipSync(JSON.stringify(logs), {level: 9}); report.logsSha256 = sha256(bytes);
  fs.writeFileSync(path.join(owned, 'challenge-continuation-package.logs.json.gz'), bytes);
  fs.writeFileSync(path.join(owned, 'challenge-continuation-package.json'), JSON.stringify(report, null, 2) + '\n');
}
assert(report.passed, report.failure ?? 'Verified inputs changed');
console.log({passed: true, contracts: report.contracts, faults: report.faults.length, negativeTypeCases: report.negativeTypeCases,
  moduleBytes: report.moduleBytes, browserBytes: report.browserBytes, hostileBrowser: true, cleaned: true});
