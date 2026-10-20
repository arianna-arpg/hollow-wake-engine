import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { root, verifyReference } from './reference-utils.mjs';
const reference = path.join(root, '.reference');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
const output = path.join(root, '.artifacts/inventory-reference');
const accepted = path.join(root, 'baseline/milestone-three');
verifyReference(reference, lock);
for (const name of ['inventory', 'catalogue']) {
  const script = path.join(reference, `balance/export-engine-${name}.ts`);
  fs.copyFileSync(path.join(root, `reference/export-${name}.ts`), script);
  execFileSync(process.execPath, ['--import', 'tsx', script, output], { cwd: reference, stdio: 'inherit' });
}
if (process.argv.includes('--initial-capture')) {
  if (fs.existsSync(accepted)) throw new Error('Accepted fixtures already exist; refusing overwrite');
  fs.mkdirSync(accepted);
  fs.copyFileSync(path.join(output, 'inventory.json'), path.join(accepted, 'inventory.json'));
  fs.writeFileSync(path.join(accepted, 'catalogue.json.gz'), gzipSync(fs.readFileSync(path.join(output, 'catalogue.json')), { level: 9 }));
} else for (const name of ['inventory', 'catalogue']) assert.deepEqual(
  JSON.parse(fs.readFileSync(path.join(output, `${name}.json`))), name === 'catalogue'
    ? JSON.parse(gunzipSync(fs.readFileSync(path.join(accepted, 'catalogue.json.gz'))))
    : JSON.parse(fs.readFileSync(path.join(accepted, `${name}.json`))), name);
verifyReference(reference, lock);
console.log('Inventory and full registry observations match the immutable reference.');
