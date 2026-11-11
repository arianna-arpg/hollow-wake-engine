import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import ts from 'typescript';
import {build} from 'esbuild';
import {root, sha256, verifyReference} from './reference-utils.mjs';
import {challengeReference} from './challenge-reference.mjs';

assert.equal(process.argv.length, 2, 'Normal verification cannot regenerate accepted observations');
fs.mkdirSync(path.join(root, '.artifacts'), {recursive: true});
const owned = fs.realpathSync(path.join(root, '.artifacts')), ref = path.join(root, '.reference');
const sources = {}, read = f => fs.readFileSync(path.join(root, f));
const tracked = f => {const bytes = read(f); sources[f] = sha256(bytes); return bytes;};
const original = challengeReference(tracked), lock = JSON.parse(tracked('baseline/source-lock.json'));
for (const f of ['scripts/reference-challenges.mjs', 'scripts/challenge-reference.mjs']) tracked(f);
const work = fs.mkdtempSync(path.join(owned, 'challenges-reference-owned-'));
const logs = {}, report = {passed: false, originalOnly: true, sources};
try {
  verifyReference(ref, lock);
  const file = path.join(ref, 'balance/hwe-challenges.ts');
  const config = ts.getParsedCommandLineOfConfigFile(path.join(ref, 'tsconfig.sim.json'), {},
    {...ts.sys, onUnRecoverableConfigFileDiagnostic: d => {throw Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));}});
  assert(config);
  const host = ts.createCompilerHost(config.options), oldRead = host.readFile.bind(host), oldExists = host.fileExists.bind(host);
  host.readFile = f => path.resolve(f) === file ? original.source : oldRead(f);
  host.fileExists = f => path.resolve(f) === file || oldExists(f);
  const errors = ts.getPreEmitDiagnostics(ts.createProgram([...config.fileNames, file], config.options, host));
  assert.equal(errors.length, 0, ts.formatDiagnostics(errors, {getCurrentDirectory: () => ref, getCanonicalFileName: f => f, getNewLine: () => '\n'}));
  report.types = true;
  const entry = path.join(work, 'original.cjs');
  await build({stdin: {contents: original.source, loader: 'ts', resolveDir: path.join(ref, 'balance')},
    bundle: true, platform: 'node', format: 'cjs', outfile: entry, logLevel: 'silent'});
  for (let i = 1; i <= 2; i++) {
    const output = path.join(work, 'original-' + i + '.json');
    const child = spawnSync(process.execPath, [entry, output], {cwd: ref, encoding: 'utf8', windowsHide: true,
      timeout: 180000, maxBuffer: 4 * 1024 * 1024, env: {...process.env, TEMP: work, TMP: work, TMPDIR: work, NODE_COMPILE_CACHE: path.join(work, 'compile-cache')}});
    logs['original-' + i] = {stdout: child.stdout ?? '', stderr: child.stderr ?? ''};
    assert(!child.error && !child.signal); assert.equal(child.status, 0, JSON.stringify(logs['original-' + i]).slice(-6000));
    assert.deepEqual(logs['original-' + i], original.log); assert(fs.readFileSync(output).equals(original.expected));
  }
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
  fs.writeFileSync(path.join(owned, 'challenges-reference.logs.json.gz'), bytes);
  fs.writeFileSync(path.join(owned, 'challenges-reference.json'), JSON.stringify(report, null, 2) + '\n');
}
assert(report.passed, report.failure ?? 'Verified inputs changed');
console.log({passed: true, originalOnly: true, observations: report.observations, types: report.types, freshProcesses: 2, cleaned: true});
