import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {gzipSync, gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {root, verifyReference, sha256} from './reference-utils.mjs';

const args = process.argv.slice(2), capture = args[0] === '--initial-capture', diagnostic = args[0] === '--diagnostic';
assert(args.length === 0 || (capture && args.length === 1) || (diagnostic && args.length === 2 && /^[1-9]\d*$/.test(args[1])));
const ref = path.join(root, '.reference'), directory = path.join(root, 'baseline/equipment-catalogue');
const observedPath = path.join(directory, 'observations.json.gz'), manifestPath = path.join(directory, 'acceptance.json');
if (capture) assert(!fs.existsSync(directory), 'Initial capture refuses an existing evidence directory');
const sourcePath = 'reference/export-equipment-catalogue.ts', source = fs.readFileSync(path.join(root, sourcePath));
const lockBytes = fs.readFileSync(path.join(root, 'baseline/source-lock.json')), lock = JSON.parse(lockBytes);
verifyReference(ref, lock);
fs.mkdirSync(path.join(root, '.artifacts'), {recursive: true});
const work = fs.mkdtempSync(path.join(root, '.artifacts/equipment-catalogue-owned-'));
const script = path.join(ref, 'balance', `hwe-equipment-catalogue-${randomUUID()}.ts`);
const receipt = {passed: false, capture, diagnostic, sourceSha256: sha256(source), sourceLockSha256: sha256(lockBytes)};
let created = false;
try {
  fs.writeFileSync(script, source, {flag: 'wx'}); created = true;
  function run(index) {
    const output = path.join(work, `${index}.json`);
    execFileSync(process.execPath, ['--import', 'tsx', script, output, ...diagnostic ? [args[1]] : []],
      {cwd: ref, stdio: 'inherit', windowsHide: true, timeout: 1800000});
    return fs.readFileSync(output);
  }
  const first = run('first'), data = JSON.parse(first);
  if (!diagnostic) {
    assert(data.complete, 'Partial exporter output cannot be accepted');
    assert.deepEqual(run('second'), first, 'Fresh original processes disagree');
  }
  const bytes = gzipSync(first, {level: 9});
  if (capture) {
    const manifest = {schemaVersion: 1, scope: data.scope, source: sourcePath, sourceSha256: sha256(source),
      sourceLockSha256: sha256(lockBytes), sha256: sha256(first), gzipSha256: sha256(bytes),
      cases: data.rows.length, sourceCounts: data.sourceCounts, excluded: data.excluded,
      familyCounts: Object.fromEntries([...new Set(data.rows.map(row => row.spec.family))].map(family =>
        [family, data.rows.filter(row => row.spec.family === family).length])), freshProcesses: 2};
    fs.mkdirSync(directory);
    fs.writeFileSync(observedPath, bytes, {flag: 'wx'});
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
  } else if (!diagnostic) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath)), accepted = fs.readFileSync(observedPath);
    assert.equal(sha256(source), manifest.sourceSha256); assert.equal(sha256(lockBytes), manifest.sourceLockSha256);
    assert.equal(sha256(accepted), manifest.gzipSha256);
    assert.equal(sha256(gunzipSync(accepted)), manifest.sha256);
    assert.deepEqual(first, gunzipSync(accepted), 'Original equipment derivation changed');
  } else {
    fs.writeFileSync(path.join(root, '.artifacts', `equipment-catalogue-diagnostic-${randomUUID()}.json.gz`), bytes, {flag: 'wx'});
  }
  Object.assign(receipt, {passed: true, cases: data.rows.length, complete: data.complete, sha256: sha256(first), compressedBytes: bytes.length});
  console.log(receipt);
} catch (error) {
  receipt.error = String(error.stack ?? error); throw error;
} finally {
  try {
    verifyReference(ref, lock);
    assert.equal(sha256(fs.readFileSync(path.join(root, sourcePath))), sha256(source));
    receipt.inputsUnchanged = true;
  } finally {
    if (created) fs.unlinkSync(script);
    const actual = fs.realpathSync(work), artifacts = fs.realpathSync(path.join(root, '.artifacts'));
    assert.equal(path.dirname(actual), artifacts); assert(path.basename(actual).startsWith('equipment-catalogue-owned-'));
    fs.rmSync(actual, {recursive: true}); receipt.cleaned = !fs.existsSync(actual) && !fs.existsSync(script);
    fs.writeFileSync(path.join(root, '.artifacts', `equipment-catalogue-run-${randomUUID()}.json`), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
  }
}
