import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {root, listFiles, sha256, writeJSON} from './reference-utils.mjs';

const snapshot = dir => Object.fromEntries(listFiles(dir).map(file => [file, sha256(fs.readFileSync(path.join(dir, file)))]));

/** Both proc entries use the same pre-extraction game oracle. Check that
 * the requested capability was installed from the actual packed archive. */
export function verifyInstalledProcReplay(label, decisionKey, decision) {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--location'));
  const location = JSON.parse(fs.readFileSync(path.resolve(root, args[1] ?? '.artifacts/adapter-location.json')));
  assert.equal(location[decisionKey], decision);
  const installed = fs.realpathSync(path.join(location.game, 'node_modules/@hollow-wake/engine'));
  const archive = fs.readFileSync(location.archive);
  assert.equal('sha512-' + createHash('sha512').update(archive).digest('base64'), location.integrity);
  const consumer = path.dirname(path.dirname(path.dirname(installed)));
  const lock = JSON.parse(fs.readFileSync(path.join(consumer, 'package-lock.json')));
  assert.equal(lock.packages['node_modules/@hollow-wake/engine'].integrity, location.integrity);
  assert.deepEqual(snapshot(path.join(installed, 'dist')), snapshot(path.join(root, 'dist')));
  const source = path.join(location.game, 'src'), before = snapshot(source), pkg = snapshot(installed);
  const directory = fs.mkdtempSync(path.join(root, '.artifacts/game-' + label + '-'));
  const fd = fs.openSync(path.join(directory, 'reference.txt'), 'wx');
  let reference;
  try {
    execFileSync(process.execPath, ['scripts/run-proc-delivery-reference.mjs', '--game', location.game],
      {cwd: root, stdio: ['ignore', fd, fd], timeout: 360000, windowsHide: true});
    reference = JSON.parse(fs.readFileSync(path.join(root, '.artifacts/proc-delivery-reference-verification.json')));
    assert(reference.passed);
    assert.equal(reference.game, fs.realpathSync(location.game));
  } finally {
    fs.closeSync(fd);
    assert.deepEqual(snapshot(source), before);
    assert.deepEqual(snapshot(installed), pkg);
  }
  const report = {passed: true, directory, game: location.game, reference, archiveSha256: sha256(archive),
    sourceMapSha256: sha256(JSON.stringify(before)), packageMapSha256: sha256(JSON.stringify(pkg)), sourceAndPackageUnchanged: true};
  writeJSON(path.join(directory, 'verification.json'), report);
  writeJSON(path.join(root, '.artifacts/game-' + label + '-verification.json'), report);
  console.log({passed: true, directory, courses: reference.courses});
}
