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
import {challengeContracts} from '../test/challenge-contracts.mjs';
import {challengePackageFaults} from '../test/challenge-faults.mjs';
import {challengeTargetingContracts, challengeTargetingFaults} from '../test/challenge-targeting-contracts.mjs';

assert.equal(process.argv.length, 2);
fs.mkdirSync(path.join(root, '.artifacts'), {recursive: true});
const owned = fs.realpathSync(path.join(root, '.artifacts'));
const read = f => fs.readFileSync(path.join(root, f));
const sources = {}, tracked = f => {const bytes = read(f); sources[f] = sha256(bytes); return bytes;};
for (const file of ['package.json', 'package-lock.json', 'tsconfig.json',
  'src/challenges.ts', 'src/challenge-types.ts', 'src/challenge-content.ts', 'src/challenge-owned.ts',
  'test/challenges.test.mjs', 'test/challenge-contracts.mjs', 'test/challenge-consumer.ts',
  'test/challenge-faults.mjs', 'test/challenge-targeting-contracts.mjs',
  'test/challenge-targeting.test.mjs', 'scripts/test-challenge-package.mjs']) tracked(file);
const report = {passed: false, sources, faults: [], targetingFaults: []}, logs = {};
const work = fs.mkdtempSync(path.join(owned, 'challenges-package-owned-'));
const consumer = path.join(work, 'consumer');
const run = (label, args, cwd = consumer) => {
  const result = spawnSync(process.execPath, args, {cwd, windowsHide: true, encoding: 'utf8',
    timeout: 180000, maxBuffer: 4 * 1024 * 1024, env: {...process.env, TEMP: work, TMP: work,
      TMPDIR: work, NODE_PATH: '', NPM_CONFIG_CACHE: path.join(work, 'npm-cache'), NODE_COMPILE_CACHE: path.join(work, 'compile-cache')}});
  logs[label] = {stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
  assert(!result.error && !result.signal, label + ': ' + result.error); return result;
};
const success = (label, args, cwd) => {
  const result = run(label, args, cwd);
  assert.equal(result.status, 0, label + ': ' + JSON.stringify(logs[label]).slice(-7000)); return result;
};
try {
  fs.mkdirSync(consumer); fs.writeFileSync(path.join(consumer, 'package.json'), '{"private":true,"type":"module"}');
  const [packed] = JSON.parse(success('pack', [npmCli(), 'pack', '--json', '--ignore-scripts', '--pack-destination', work], root).stdout);
  const archive = path.join(work, packed.filename); report.archiveSha256 = sha256(fs.readFileSync(archive));
  success('install', [npmCli(), 'install', archive, '--offline', '--ignore-scripts', '--no-audit', '--no-fund']);
  const entry = '@hollow-wake/engine/combat/challenges', contentEntry = '@hollow-wake/engine/combat/challenge-content';
  const dist = path.join(consumer, 'node_modules/@hollow-wake/engine/dist');
  report.modules = {};
  for (const name of ['challenges', 'challenge-content', 'challenge-types', 'challenge-owned']) {
    const bytes = fs.readFileSync(path.join(dist, name + '.js')), types = fs.readFileSync(path.join(dist, name + '.d.ts'));
    assert(bytes.equals(tracked('dist/' + name + '.js'))); assert(types.equals(tracked('dist/' + name + '.d.ts')));
    report.modules[name] = {bytes: bytes.length, sha256: sha256(bytes), typesSha256: sha256(types)};
  }
  report.moduleBytes = Object.values(report.modules).reduce((n, r) => n + r.bytes, 0);
  assert(report.moduleBytes <= 20 * 1024, 'Challenge runtime/content exceeds its separate 20 KiB bound');
  fs.writeFileSync(path.join(consumer, 'contracts.mjs'), tracked('test/challenge-contracts.mjs'));
  fs.writeFileSync(path.join(consumer, 'targeting.mjs'), tracked('test/challenge-targeting-contracts.mjs'));
  fs.writeFileSync(path.join(consumer, 'consumer.mjs'), `import {Challenges} from '${entry}';
import {ChallengeContent} from '${contentEntry}';
import {challengeContracts} from './contracts.mjs';
import {challengeTargetingContracts} from './targeting.mjs';
console.log(JSON.stringify({...challengeContracts({Challenges,ChallengeContent}), targeting:challengeTargetingContracts({Challenges})}));
`);
  const expected = JSON.parse(success('installed', ['consumer.mjs']).stdout);
  assert.equal(expected.contracts, 20); report.contracts = expected.contracts;
  assert.equal(expected.targeting.contracts, 18); report.targetingContracts = expected.targeting.contracts;
  fs.writeFileSync(path.join(consumer, 'entry.mjs'), `export {Challenges} from '${entry}';export {ChallengeContent} from '${contentEntry}';`);
  const browser = await build({entryPoints: [path.join(consumer, 'entry.mjs')], bundle: true,
    platform: 'browser', format: 'iife', globalName: 'ChallengeApi', target: 'es2022',
    minify: true, metafile: true, write: false, logLevel: 'silent'});
  assert.equal(browser.outputFiles.length, 1); assert(Object.values(browser.metafile.outputs).every(o => !o.imports.length));
  assert(Object.keys(browser.metafile.inputs).every(file => !file.endsWith('/challenge-continuation.js')),
    'Ordinary challenge loading includes the optional copy service');
  report.browserBytes = browser.outputFiles[0].contents.length; assert(report.browserBytes <= 12 * 1024);
  const context = vm.createContext({});
  new vm.Script("for(const name of ['window','document','process','require','fetch','setTimeout','setInterval'])Object.defineProperty(globalThis,name,{get(){throw Error('Forbidden host global: '+name)}});Math.random=()=>{throw Error('Forbidden ambient RNG')};Date.now=()=>{throw Error('Forbidden ambient clock')};").runInContext(context);
  new vm.Script(browser.outputFiles[0].text).runInContext(context);
  assert.deepEqual({...challengeContracts(context.ChallengeApi), targeting: challengeTargetingContracts(context.ChallengeApi)}, expected);
  report.hostileBrowser = true;
  const consumerTypes = tracked('test/challenge-consumer.ts');
  report.negativeTypeCases = (consumerTypes.toString().match(/@ts-expect-error/g) ?? []).length;
  assert.equal(report.negativeTypeCases, 8); fs.writeFileSync(path.join(consumer, 'consumer.ts'), consumerTypes);
  fs.writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify({compilerOptions: {
    strict: true, noUncheckedIndexedAccess: true, noEmit: true, target: 'ES2022', module: 'NodeNext',
    moduleResolution: 'NodeNext', types: [], lib: ['ES2022']}, files: ['consumer.ts']}));
  success('types', [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json']); report.types = true;
  assert.equal(challengePackageFaults.length, 16);
  assert.equal(challengeTargetingFaults.length, 5);
  for (const fault of [...challengePackageFaults, ...challengeTargetingFaults]) {
    const source = tracked('src/' + fault.module + '.ts').toString();
    assert.equal(source.split(fault.from).length, 2, fault.name + ' selector');
    const file = path.join(dist, fault.module + '.js'), original = fs.readFileSync(file);
    const altered = ts.transpileModule(source.replace(fault.from, fault.to), {compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}, fileName: fault.module + '.ts'}).outputText;
    try {
      fs.writeFileSync(file, altered);
      const result = run(fault.name, ['consumer.mjs']); assert.equal(result.status, 1, fault.name + ' escaped');
      assert.match(logs[fault.name].stderr, /ERR_ASSERTION/);
      (challengeTargetingFaults.includes(fault) ? report.targetingFaults : report.faults).push({name: fault.name, detected: true});
    } finally {fs.writeFileSync(file, original);}
  }
  assert.deepEqual(JSON.parse(success('restored', ['consumer.mjs']).stdout), expected); report.restored = true;
  report.passed = true;
} catch (error) {report.failure = String(error); process.exitCode = 1;}
finally {
  try {
    report.inputsUnchanged = Object.entries(sources).every(([f, h]) => sha256(read(f)) === h);
    report.passed = report.passed && report.inputsUnchanged;
  } catch (error) {
    report.passed = false; report.inputsUnchanged = false;
    report.failure = [report.failure, String(error)].filter(Boolean).join('\n'); process.exitCode = 1;
  }
  assert.equal(path.dirname(fs.realpathSync(work)), owned); assert(!fs.existsSync(path.join(work, '.git')));
  fs.rmSync(work, {recursive: true, maxRetries: 3}); report.cleaned = true;
  const bytes = gzipSync(JSON.stringify(logs), {level: 9}); report.logsSha256 = sha256(bytes);
  fs.writeFileSync(path.join(owned, 'challenges-package.logs.json.gz'), bytes);
  fs.writeFileSync(path.join(owned, 'challenges-package.json'), JSON.stringify(report, null, 2) + '\n');
}
assert(report.passed, report.failure ?? 'Verified inputs changed');
console.log({passed: true, contracts: report.contracts, faults: report.faults.length, negativeTypeCases: report.negativeTypeCases,
  targetingContracts: report.targetingContracts, targetingFaults: report.targetingFaults.length,
  moduleBytes: report.moduleBytes, browserBytes: report.browserBytes, hostileBrowser: report.hostileBrowser, cleaned: true});
