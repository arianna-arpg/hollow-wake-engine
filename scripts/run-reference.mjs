import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { root, verifyReference } from './reference-utils.mjs';

const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'), 'utf8'));
const reference = path.join(root, '.reference');
verifyReference(reference, lock);
const script = path.join(reference, 'balance', 'export-engine-fixtures.ts');
fs.copyFileSync(path.join(root, 'reference/export-fixtures.ts'), script);
const generated = path.join(root, '.artifacts/reference');
execFileSync(process.execPath, ['--import', 'tsx', script, generated], { cwd: reference, stdio: 'inherit' });
if (process.argv.includes('--export-only')) {
  console.log('Unaccepted reference output written under .artifacts/reference.');
} else if (process.argv.includes('--initial-capture')) {
  const accepted = path.join(root, 'baseline/first-path.json');
  if (fs.existsSync(accepted)) throw new Error('Accepted fixtures already exist; normal verification must never overwrite them.');
  for (const name of ['authored-selection.json', 'stat-catalogue.json', 'first-path.json', 'stat-transitions.json', 'arithmetic-contacts.json']) {
    fs.copyFileSync(path.join(generated, name), path.join(root, 'baseline', name));
  }
  fs.mkdirSync(path.join(root, 'content'), { recursive: true });
  fs.copyFileSync(path.join(generated, 'milestone-one.json'), path.join(root, 'content/milestone-one.json'));
} else {
  for (const name of ['authored-selection.json', 'stat-catalogue.json', 'first-path.json', 'stat-transitions.json', 'arithmetic-contacts.json', 'milestone-one.json']) {
    const expected = path.join(root, name === 'milestone-one.json' ? 'content' : 'baseline', name);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(generated, name), 'utf8')),
      JSON.parse(fs.readFileSync(expected, 'utf8')), `Reference mismatch: ${name}`);
  }
}
verifyReference(reference, lock);
console.log('Reference output and immutable source verified.');
