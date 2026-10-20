import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { root, verifyReference } from './reference-utils.mjs';
const reference = path.join(root, '.reference');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'), 'utf8'));
verifyReference(reference, lock);
const script = path.join(reference, 'balance/export-engine-lifecycle.ts');
fs.copyFileSync(path.join(root, 'reference/export-lifecycle.ts'), script);
const output = path.join(root, '.artifacts/lifecycle-reference');
execFileSync(process.execPath, ['--import', 'tsx', script, output], { cwd: reference, stdio: 'inherit' });
const accepted = path.join(root, 'baseline/milestone-two');
if (process.argv.includes('--initial-capture')) {
  if (fs.existsSync(accepted)) throw new Error('Accepted fixtures already exist; refusing overwrite');
  fs.mkdirSync(accepted);
  for (const name of ['lifecycle.json', 'authored.json']) fs.copyFileSync(path.join(output, name), path.join(accepted, name));
} else for (const name of ['lifecycle.json', 'authored.json']) {
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, name), 'utf8')), JSON.parse(fs.readFileSync(path.join(accepted, name), 'utf8')), name);
}
verifyReference(reference, lock);
console.log('Lifecycle reference and immutable source verified.');
for (const name of ['firebolt.json', 'burning.json']) assert.deepEqual(
  JSON.parse(fs.readFileSync(path.join(output, name), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'content', name), 'utf8')), `Packaged lifecycle content: ${name}`);
