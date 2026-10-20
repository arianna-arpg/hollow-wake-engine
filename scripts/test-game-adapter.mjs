import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { root, listFiles } from './reference-utils.mjs';
const location = JSON.parse(fs.readFileSync(path.join(root, '.artifacts/adapter-location.json'), 'utf8'));
const game = location.game;
const installed = path.join(location.tooling, 'node_modules/@hollow-wake/engine/dist');
for (const file of listFiles(path.join(root, 'dist'))) assert.deepEqual(
  fs.readFileSync(path.join(installed, file)), fs.readFileSync(path.join(root, 'dist', file)), `Installed SDK is stale: ${file}`);
const output = path.join(root, '.artifacts/adapter-traces');
execFileSync(process.execPath, ['--import', 'tsx', 'balance/export-engine-lifecycle.ts', output], { cwd: game, stdio: 'inherit' });
for (const name of ['lifecycle.json', 'authored.json']) assert.deepEqual(
  JSON.parse(fs.readFileSync(path.join(output, name), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'baseline/milestone-two', name), 'utf8')), `Adapted game differs: ${name}`);
// The real game must be using the installed package. Break its cast transition and require a trace mismatch.
const kernel = path.join(location.tooling, 'node_modules/@hollow-wake/engine/dist/casting.js');
const original = fs.readFileSync(kernel, 'utf8');
assert.ok(original.includes('return elapsed >= cast.total;'));
let rejected = false;
try {
  fs.writeFileSync(kernel, original.replace('return elapsed >= cast.total;', 'return false; // deliberate adapter wiring fault'));
  const negativeOutput = path.join(root, '.artifacts/adapter-negative-traces');
  execFileSync(process.execPath, ['--import', 'tsx', 'balance/export-engine-lifecycle.ts', negativeOutput], { cwd: game, stdio: 'pipe' });
  const expected = JSON.parse(fs.readFileSync(path.join(output, 'lifecycle.json'), 'utf8'));
  const actual = JSON.parse(fs.readFileSync(path.join(negativeOutput, 'lifecycle.json'), 'utf8'));
  rejected = JSON.stringify(actual) !== JSON.stringify(expected);
} finally { fs.writeFileSync(kernel, original); }
assert.ok(rejected, 'Adapter bypassed the installed SDK');
fs.writeFileSync(path.join(root, '.artifacts/adapter-verification.json'), JSON.stringify({
  packageIntegrity: location.integrity, originalTracesMatch: true, installedPackageMutationRejected: true,
  castingPaths: 7, burningPaths: 2, node: process.version,
}, null, 2) + '\n');
console.log('Actual game matches original traces; breaking the installed SDK breaks the game trace.');
