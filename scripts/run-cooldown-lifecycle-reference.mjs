import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {root, sha256, listFiles, verifyReference, writeJSON} from './reference-utils.mjs';

const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === '--game'));
const game = fs.realpathSync(path.resolve(root, args[1] ?? '.reference'));
const acceptanceFile = path.join(root, 'baseline/cooldown-lifecycle/acceptance.json');
const acceptedBytes = fs.readFileSync(acceptanceFile), accepted = JSON.parse(acceptedBytes);
assert.equal(accepted.capability, 'cooldown-lifecycle-baseline');
assert.equal(accepted.schemaVersion, 1); assert.equal(accepted.courses, 44);
const inputs = new Map([[acceptanceFile, sha256(acceptedBytes)]]);
for (const [file, hash] of [[accepted.helper, accepted.helperSha256], [accepted.sourceLock, accepted.sourceLockSha256],
  [accepted.sourceBoundary.file, accepted.sourceBoundary.sha256], [accepted.fixture.file, accepted.fixture.sha256]]) {
  const absolute = path.join(root, file); assert.equal(sha256(fs.readFileSync(absolute)), hash, file); inputs.set(absolute, hash);
}
const expected = gunzipSync(fs.readFileSync(path.join(root, accepted.fixture.file)));
assert.equal(expected.length, accepted.fixture.bytes); assert.equal(sha256(expected), accepted.fixture.uncompressedSha256);
const values = JSON.parse(expected); assert.equal(values.courses, 44); assert.equal(values.rows.length, 44);
assert.equal(values.rows.filter(row => row.error).length, accepted.expectedFailures);
const boundary = JSON.parse(fs.readFileSync(path.join(root, accepted.sourceBoundary.file)));
for (const graph of [boundary.original, boundary.predecessor])
  for (const row of Object.values(graph.blocks)) assert.equal(sha256(row.text), row.sha256);
if (!args.length) verifyReference(game, JSON.parse(fs.readFileSync(path.join(root, accepted.sourceLock))));
const source = () => Object.fromEntries(listFiles(path.join(game, 'src')).map(file => [file, sha256(fs.readFileSync(path.join(game, 'src', file)))]));
const before = source(), output = fs.mkdtempSync(path.join(root, '.artifacts/reference-clock-lifecycle-'));
const helper = fs.readFileSync(path.join(root, accepted.helper), 'utf8'), imports = /(['"])\.\.\/src\/([^'"]+)\1/g;
const runtime = path.join(output, 'capture.ts'), typed = path.join(output, 'capture.typed.ts'), observation = path.join(output, 'observations.json');
fs.writeFileSync(runtime, helper.replace(imports, (_a, _q, file) => JSON.stringify(pathToFileURL(path.join(game, 'src', file + '.ts')).href)), {flag:'wx'});
fs.writeFileSync(typed, helper.replace(imports, (_a, _q, file) => JSON.stringify(path.relative(output, path.join(game, 'src', file)).replaceAll('\\','/'))), {flag:'wx'});
writeJSON(path.join(output, 'tsconfig.json'), {extends:path.join(game,'tsconfig.sim.json'),
  compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]}, include:[typed], exclude:[]});
const report = {passed:false, game, output, courses:44, acceptanceSha256:sha256(acceptedBytes),
  sourceMapSha256:sha256(JSON.stringify(before)), expectedFilesRewritten:false,
  scope:'Frozen lifecycle observations; a supplied game comparison does not establish renderer, native-host, performance or device acceptance.'};
try {
  for (const [name, command] of [
    ['types',[path.join(game,'node_modules/typescript/bin/tsc'),'-p',path.join(output,'tsconfig.json')]],
    ['capture',['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,runtime,observation]]
  ]) {
    const log = fs.openSync(path.join(output,name+'.txt'),'wx');
    try {execFileSync(process.execPath,command,{cwd:game,windowsHide:true,stdio:['ignore',log,log],timeout:180000});}
    finally {fs.closeSync(log);}
  }
  assert(fs.readFileSync(observation).equals(expected),'Cooldown lifecycle differs from accepted original observations');
  report.passed = true;
} finally {
  assert.deepEqual(source(),before);
  for (const [file,hash] of inputs) assert.equal(sha256(fs.readFileSync(file)),hash,file);
  writeJSON(path.join(output,'verification.json'),report);
  writeJSON(path.join(root,'.artifacts/cooldown-lifecycle-reference-verification.json'),report);
  console.log(report);
}
