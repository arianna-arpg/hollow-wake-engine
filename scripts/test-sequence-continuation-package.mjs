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
import {packageFaults} from '../test/sequence-continuation-faults.mjs';

assert.equal(process.argv.length, 2);
fs.mkdirSync(path.join(root, '.artifacts'), {recursive: true});
const owned = fs.realpathSync(path.join(root, '.artifacts'));
const stem = 'sequence-continuation-package', logs = {};
const report = {passed: false, sources: {}, faults: []};
const tracked = f => {const b = fs.readFileSync(path.join(root, f)); report.sources[f] = sha256(b); return b;};
for (const f of ['scripts/test-sequence-continuation-package.mjs', 'test/sequence-continuation-faults.mjs',
  'package.json', 'package-lock.json', 'tsconfig.json']) tracked(f);
const contracts = tracked('test/sequence-continuation-contracts.mjs').toString();
const consumerTypes = tracked('test/sequence-continuation-consumer.ts');
const service = tracked('src/attack-sequence-continuation.ts').toString();
const modules = ['attack-sequences', 'attack-sequence-continuation', 'attack-sequence-owned', 'attack-sequence-content', 'attack-sequence-types'];
for (const name of modules) tracked('src/' + name + '.ts');
const work = fs.mkdtempSync(path.join(owned, 'sequence-continuation-package-owned-'));
const consumer = path.join(work, 'consumer');
const run = (label, args, cwd = consumer) => {
  const child = spawnSync(process.execPath, args, {cwd, windowsHide: true, encoding: 'utf8',
    timeout: 180000, maxBuffer: 4 * 1024 * 1024, env: {...process.env, TEMP: work, TMP: work,
      TMPDIR: work, NODE_PATH: '', NODE_COMPILE_CACHE: path.join(work, 'compile-cache'), NPM_CONFIG_CACHE: path.join(work, 'npm-cache')}});
  logs[label] = {stdout: child.stdout ?? '', stderr: child.stderr ?? ''};
  assert(!child.error && !child.signal, label + ': ' + child.error); return child;
};
const success = (label, args, cwd) => {const c = run(label, args, cwd); assert.equal(c.status, 0, label + ': ' + JSON.stringify(logs[label]).slice(-7000)); return c;};
try {
  fs.mkdirSync(consumer);
  const packed = JSON.parse(success('pack', [npmCli(), 'pack', '--json', '--ignore-scripts', '--pack-destination', work], root).stdout);
  assert.equal(packed.length, 1);
  const archive = path.join(work, packed[0].filename); report.archiveSha256 = sha256(fs.readFileSync(archive));
  fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({private: true, type: 'module'}));
  success('install', [npmCli(), 'install', archive, '--offline', '--ignore-scripts', '--no-audit', '--no-fund']);
  const packageRoot = path.join(consumer, 'node_modules/@hollow-wake/engine'), dist = path.join(packageRoot, 'dist');
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json')));
  assert.deepEqual(manifest.exports['./combat/attack-sequence-continuation'], {types: './dist/attack-sequence-continuation.d.ts', import: './dist/attack-sequence-continuation.js'});
  assert(!Object.keys(manifest.exports).some(k => k.includes('attack-sequence-owned')));
  report.modules = {};
  for (const name of modules) {
    const bytes = fs.readFileSync(path.join(dist, name + '.js')), types = fs.readFileSync(path.join(dist, name + '.d.ts'));
    assert(bytes.equals(tracked('dist/' + name + '.js'))); assert(types.equals(tracked('dist/' + name + '.d.ts')));
    report.modules[name] = {bytes: bytes.length, sha256: sha256(bytes), typesSha256: sha256(types)};
  }
  report.ordinaryGroupBytes = modules.filter(n => n !== 'attack-sequence-continuation').reduce((n, name) => n + report.modules[name].bytes, 0);
  assert(report.ordinaryGroupBytes <= 32 * 1024); assert(report.modules['attack-sequence-continuation'].bytes <= 8 * 1024);
  const coreEntry = '@hollow-wake/engine/combat/attack-sequences', copyEntry = '@hollow-wake/engine/combat/attack-sequence-continuation';
  fs.writeFileSync(path.join(consumer, 'contracts.mjs'), contracts);
  fs.writeFileSync(path.join(consumer, 'consumer.mjs'), `import {AttackSequences} from '${coreEntry}';import {copyAttackSequenceState} from '${copyEntry}';import {sequenceContinuationContracts} from './contracts.mjs';console.log(JSON.stringify({contracts:sequenceContinuationContracts({AttackSequences,copyAttackSequenceState})}));\n`);
  assert.equal(JSON.parse(success('installed', ['consumer.mjs']).stdout).contracts, 26); report.contracts = 26;
  for (const optional of [false, true]) {
    const entry = path.join(consumer, 'entry.mjs');
    fs.writeFileSync(entry, `export {AttackSequences} from '${coreEntry}';` + (optional ? `export {copyAttackSequenceState} from '${copyEntry}';` : ''));
    const bundle = await build({entryPoints: [entry], bundle: true, platform: 'browser', format: 'iife',
      globalName: 'SequenceApi', target: 'es2022', minify: true, write: false, metafile: true, logLevel: 'silent'});
    assert.equal(bundle.outputFiles.length, 1); assert(Object.values(bundle.metafile.outputs).every(o => !o.imports.length));
    assert.equal(Object.keys(bundle.metafile.inputs).some(f => f.includes('attack-sequence-continuation.js')), optional);
    if (!optional) {report.ordinaryBrowserBytes = bundle.outputFiles[0].contents.length; report.optionalServiceExcluded = true; continue;}
    report.optionalBrowserBytes = bundle.outputFiles[0].contents.length;
    const context = vm.createContext({__assert: assert, structuredClone});
    new vm.Script("for(const name of ['window','document','process','require','fetch','setTimeout','setInterval'])Object.defineProperty(globalThis,name,{get(){throw Error('Forbidden host global: '+name)}});Math.random=()=>{throw Error('Forbidden ambient RNG')};Date.now=()=>{throw Error('Forbidden ambient clock')};").runInContext(context);
    new vm.Script(bundle.outputFiles[0].text).runInContext(context);
    const fixture = contracts.replace("import assert from 'node:assert/strict';", 'const assert=globalThis.__assert;').replace('export function sequenceContinuationContracts', 'function sequenceContinuationContracts');
    new vm.Script(fixture + '\nglobalThis.contractCount=sequenceContinuationContracts(SequenceApi);').runInContext(context);
    assert.equal(context.contractCount, 26); report.hostileBrowser = true;
  }
  fs.writeFileSync(path.join(consumer, 'consumer.ts'), consumerTypes);
  report.negativeTypeCases = (consumerTypes.toString().match(/@ts-expect-error/g) ?? []).length; assert.equal(report.negativeTypeCases, 9);
  fs.writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify({compilerOptions: {strict: true, noUncheckedIndexedAccess: true,
    noEmit: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022'], types: []}, files: ['consumer.ts']}));
  success('types', [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json']); report.types = true;
  const module = path.join(dist, 'attack-sequence-continuation.js'), bytes = fs.readFileSync(module);
  assert.equal(packageFaults.length, 10);
  for (const {name, from, to} of packageFaults) {
    assert.equal(service.split(from).length, 2, name + ' selector');
    fs.writeFileSync(module, ts.transpileModule(service.replace(from, to), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}, fileName: 'attack-sequence-continuation.ts'}).outputText);
    try {assert.equal(run(name, ['consumer.mjs']).status, 1, name + ' escaped'); assert.match(logs[name].stderr, /ERR_ASSERTION/); report.faults.push({name, detected: true});}
    finally {fs.writeFileSync(module, bytes);}
  }
  assert.equal(JSON.parse(success('restored', ['consumer.mjs']).stdout).contracts, 26);
  assert(fs.readFileSync(module).equals(bytes)); report.restored = true; report.passed = true;
} catch (error) {report.failure = String(error); process.exitCode = 1;}
finally {
  report.inputsUnchanged = Object.entries(report.sources).every(([f, h]) => sha256(fs.readFileSync(path.join(root, f))) === h);
  report.passed = report.passed && report.inputsUnchanged;
  assert.equal(path.dirname(fs.realpathSync(work)), owned); assert(!fs.existsSync(path.join(work, '.git')));
  fs.rmSync(work, {recursive: true, maxRetries: 3}); report.cleaned = true;
  const bytes = gzipSync(JSON.stringify(logs), {level: 9}); report.logsSha256 = sha256(bytes);
  fs.writeFileSync(path.join(owned, stem + '.logs.json.gz'), bytes); fs.writeFileSync(path.join(owned, stem + '.json'), JSON.stringify(report, null, 2) + '\n');
}
assert(report.passed, report.failure ?? 'Inputs changed');
console.log({passed: true, contracts: report.contracts, faults: report.faults.length, types: true,
  ordinaryGroupBytes: report.ordinaryGroupBytes, ordinaryBrowserBytes: report.ordinaryBrowserBytes,
  optionalBrowserBytes: report.optionalBrowserBytes, cleaned: true});
