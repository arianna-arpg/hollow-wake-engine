import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { buildCatalogue } from './catalogue-tools.mjs';
import { root, writeJSON } from './reference-utils.mjs';
const artifacts = path.join(root, '.artifacts'), directory = path.join(artifacts, 'catalogue-package');
buildCatalogue(directory);
const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const npm = (args, cwd) => execFileSync(process.execPath, [npmCli, ...args, '--cache', path.join(artifacts, 'npm-cache')], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const [packed] = JSON.parse(npm(['pack', '--json', '--pack-destination', artifacts], directory));
assert.ok(packed.files.every(f => !/\.(?:js|ts|sqlite|gz)$/.test(f.path)), 'Authoring catalogue must not contain executable code or development artifacts');
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'hollow-catalogue-'));
writeJSON(path.join(consumer, 'package.json'), { private: true, type: 'module' });
npm(['install', path.join(artifacts, packed.filename), '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
fs.writeFileSync(path.join(consumer, 'read.mjs'), `
import fs from 'node:fs'; import assert from 'node:assert/strict'; import crypto from 'node:crypto';
const read = name => fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/catalogue/' + name)));
const manifest = JSON.parse(read('manifest.json')); let count = 0;
assert.equal(manifest.executable, false);
for (const table of Object.values(manifest.tables)) {
  const bytes = read(table.file);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), table.sha256);
  assert.equal(JSON.parse(bytes).length, table.rows); count += table.rows;
}
assert.equal(count, 14434); console.log(JSON.stringify({ definitions: count, executable: false }));
`);
const result = JSON.parse(execFileSync(process.execPath, ['read.mjs'], { cwd: consumer, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } }));
writeJSON(path.join(artifacts, 'catalogue-package-verification.json'), { ...result, archiveBytes: packed.size, unpackedBytes: packed.unpackedSize, integrity: packed.integrity });
console.log(JSON.stringify({ ...result, archiveBytes: packed.size, unpackedBytes: packed.unpackedSize }));
