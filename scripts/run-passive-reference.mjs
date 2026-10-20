import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { root, verifyReference } from './reference-utils.mjs';
const reference = path.join(root, '.reference'), lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
const output = path.join(root, '.artifacts/passive-reference'), accepted = path.join(root, 'baseline/milestone-eight/passives.json.gz');
verifyReference(reference, lock);
const script = path.join(reference, 'balance/export-engine-passives.ts');
fs.copyFileSync(path.join(root, 'reference/export-passives.ts'), script);
execFileSync(process.execPath, ['--import', 'tsx', script, output], { cwd: reference, stdio: 'inherit' });
const bytes = fs.readFileSync(path.join(output, 'passives.json'));
if (process.argv.includes('--initial-capture')) {
  if (fs.existsSync(accepted)) throw new Error('Accepted passive fixture exists; refusing overwrite');
  fs.mkdirSync(path.dirname(accepted), { recursive: true }); fs.writeFileSync(accepted, gzipSync(bytes, { level: 9 }), { flag: 'wx' });
} else if (!process.argv.includes('--export-only')) assert.deepEqual(JSON.parse(bytes), JSON.parse(gunzipSync(fs.readFileSync(accepted))));
verifyReference(reference, lock);
console.log('Passive observations exported from the hash-verified original; accepted fixtures are never rewritten.');
