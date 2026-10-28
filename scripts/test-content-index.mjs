import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root, sha256, listFiles, writeJSON} from './reference-utils.mjs';
import {contentIndexedSource} from '../experiments/item-index/content-variant.mjs';

const args = process.argv.slice(2);
let implementation = 'set';
if (args.length === 6) {
  assert.equal(args[4], '--index'); implementation = args[5]; args.splice(4);
}
assert(['set', 'bitmap'].includes(implementation));
assert.equal(args.length, 4); assert.equal(args[0], '--library-proof'); assert.equal(args[2], '--session-proof');
const library = fs.realpathSync(args[1]), session = fs.realpathSync(args[3]);
const read = file => JSON.parse(fs.readFileSync(file));
assert(read(path.join(library, 'verification.json')).passed && read(path.join(session, 'verification.json')).passed);
const snapshot = directory => Object.fromEntries(listFiles(directory).map(file => [file, sha256(fs.readFileSync(path.join(directory, file)))]));
const directory = fs.mkdtempSync(path.join(root, '.artifacts/content-index-candidate-'));
const candidate = path.join(directory, 'candidate'), baseline = path.join(directory, 'baseline');
const runtime = snapshot(path.join(root, 'dist')), sourcesBefore = snapshot(path.join(root, 'src'));
const sources = Object.fromEntries(['scripts/test-content-index.mjs',
  ...listFiles(path.join(root, 'experiments/item-index')).map(file => 'experiments/item-index/' + file)]
  .map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]));
const receipt = path.join(directory, 'verification.json');
writeJSON(path.join(root, '.artifacts/content-index-candidate-latest.json'), {directory, receipt});
const result = {passed: false, status: 'started', implementation, directory, sources, baselineRuntime: runtime};
writeJSON(receipt, result);
try {
  fs.mkdirSync(candidate); fs.mkdirSync(baseline);
  fs.cpSync(path.join(root, 'src'), path.join(candidate, 'src'), {recursive: true, errorOnExist: true});
  fs.cpSync(path.join(root, 'dist'), path.join(baseline, 'dist'), {recursive: true, errorOnExist: true});
  fs.copyFileSync(path.join(root, 'tsconfig.json'), path.join(candidate, 'tsconfig.json'));
  writeJSON(path.join(candidate, 'package.json'), {type: 'module'});
  for (const file of ['item-core.ts', 'item-rules.ts', 'item-host.ts']) fs.writeFileSync(path.join(candidate, 'src', file),
    contentIndexedSource(file, fs.readFileSync(path.join(root, 'src', file))));
  fs.copyFileSync(path.join(root, 'experiments/item-index', implementation === 'bitmap' ? 'bitmap-index.ts' : 'content-index.ts'),
    path.join(candidate, 'src/item-affix-index.ts'));
  const log = path.join(directory, 'build.txt'), fd = fs.openSync(log, 'wx');
  try {execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(candidate, 'tsconfig.json')],
    {cwd: root, windowsHide: true, stdio: ['ignore', fd, fd]});} finally {fs.closeSync(fd);}
  const candidateRuntime = snapshot(path.join(candidate, 'dist'));
  const added = Object.keys(candidateRuntime).filter(file => !(file in runtime));
  const changed = Object.keys(runtime).filter(file => runtime[file] !== candidateRuntime[file]);
  assert.deepEqual(added, ['item-affix-index.d.ts', 'item-affix-index.js', 'item-affix-index.js.map']);
  assert(changed.every(file => /^item-(core|rules|host)\.(js|js.map|d.ts)$/.test(file)));
  const build = {passed: true, implementation, directory, candidate, baseline, productionRuntimeUnchanged: true, productionSourcesUnchanged: true,
    baselineRuntime: runtime, candidateRuntime, added, changed, sources, logSha256: sha256(fs.readFileSync(log))};
  assert.deepEqual(snapshot(path.join(root, 'dist')), runtime); assert.deepEqual(snapshot(path.join(root, 'src')), sourcesBefore);
  writeJSON(path.join(directory, 'build-verification.json'), build);
  for (const name of ['unit', 'pools', ...(implementation === 'bitmap' ? ['bitmap-boundaries'] : []), 'owners', 'native']) {
    const output = fs.openSync(path.join(directory, name + '-driver.txt'), 'wx');
    try {execFileSync(process.execPath, [path.join(root, 'experiments/item-index/verify-' + name + '.mjs'), directory,
      ...(name === 'native' ? [library, session] : [path.join(session, 'input.json')])],
    {cwd: root, windowsHide: true, stdio: ['ignore', output, output], timeout: 180000});} finally {fs.closeSync(output);}
    console.log({verification: name, passed: true});
  }
  result.passed = true; result.status = 'completed'; result.candidateRuntime = candidateRuntime;
} catch (error) {result.status = 'failed'; result.error = error.stack; throw error;}
finally {
  assert.deepEqual(snapshot(path.join(root, 'dist')), runtime); assert.deepEqual(snapshot(path.join(root, 'src')), sourcesBefore);
  for (const [file, expected] of Object.entries(sources)) assert.equal(sha256(fs.readFileSync(path.join(root, file))), expected, file);
  result.productionRuntimeUnchanged = true; result.productionSourcesUnchanged = true;
  writeJSON(receipt, result); console.log({directory, passed: result.passed});
}
