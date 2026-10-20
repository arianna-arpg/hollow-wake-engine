import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { root, verifyReference } from './reference-utils.mjs';
const reference = path.join(root, '.reference'), accepted = path.join(root, 'baseline/milestone-four');
const output = path.join(root, '.artifacts/item-reference');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
verifyReference(reference, lock);
const script = path.join(reference, 'balance/export-engine-items.ts');
fs.copyFileSync(path.join(root, 'reference/export-items.ts'), script);
execFileSync(process.execPath, ['--import', 'tsx', script, output], { cwd: reference, stdio: 'inherit' });
const mintScript = path.join(reference, 'balance/export-engine-item-mint.ts');
fs.copyFileSync(path.join(root, 'reference/export-item-mint.ts'), mintScript);
execFileSync(process.execPath, ['--import', 'tsx', mintScript, output], { cwd: reference, stdio: 'inherit' });
const equipmentScript = path.join(reference, 'balance/export-engine-item-equipment.ts');
fs.copyFileSync(path.join(root, 'reference/export-item-equipment.ts'), equipmentScript);
execFileSync(process.execPath, ['--import', 'tsx', equipmentScript, output], { cwd: reference, stdio: 'inherit' });
if (process.argv.includes('--capture-equipment-expansion')) {
  const destination = path.join(accepted, 'item-equipment.json.gz');
  if (fs.existsSync(destination)) throw new Error('Equipment observations already exist; refusing overwrite');
  fs.writeFileSync(destination, gzipSync(fs.readFileSync(path.join(output, 'item-equipment.json')), { level: 9 }));
}
if (process.argv.includes('--capture-mint-expansion')) {
  const destination = path.join(accepted, 'mint-options.json.gz');
  if (fs.existsSync(destination)) throw new Error('Mint observations already exist; refusing overwrite');
  fs.writeFileSync(destination, gzipSync(fs.readFileSync(path.join(output, 'mint-options.json')), { level: 9 }));
}
if (process.argv.includes('--capture-stream-expansion')) {
  const destination = path.join(accepted, 'item-stream.json.gz');
  if (fs.existsSync(destination)) throw new Error('Stream observations already exist; refusing overwrite');
  fs.writeFileSync(destination, gzipSync(fs.readFileSync(path.join(output, 'item-stream.json')), { level: 9 }));
}
if (process.argv.includes('--initial-capture')) {
  if (fs.existsSync(accepted)) throw new Error('Accepted item observations already exist; refusing overwrite');
  fs.mkdirSync(accepted);
  for (const name of ['items', 'item-rules', 'mint-options', 'item-stream', 'item-equipment']) fs.writeFileSync(path.join(accepted, `${name}.json.gz`),
    gzipSync(fs.readFileSync(path.join(output, `${name}.json`)), { level: 9 }));
} else for (const name of ['items', 'item-rules', 'mint-options', 'item-stream', 'item-equipment']) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, `${name}.json`))),
  JSON.parse(gunzipSync(fs.readFileSync(path.join(accepted, `${name}.json.gz`)))), name);
verifyReference(reference, lock);
console.log('Item observations match the immutable original. This does not assert SDK item implementation coverage.');
