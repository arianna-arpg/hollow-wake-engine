import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { root, writeJSON } from './reference-utils.mjs';
import { buildPassiveContent } from './compile-passive-content.mjs';
const artifacts = path.join(root, '.artifacts'), content = path.join(artifacts, 'passive-package');
const pack = buildPassiveContent(content);
const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const archives = [root, content].map(cwd => JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', artifacts,
  '--cache', path.join(artifacts, 'npm-cache')], { cwd, encoding: 'utf8' }))[0]);
assert.ok(archives[1].unpackedSize < 1024 * 1024, 'Policy content package exceeded its 1 MiB bound');
assert.deepEqual(archives[1].files.map(f => f.path).sort(), ['LICENSE.md','README.md','manifest.json','package.json','passives.json']);
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'hollow-wake-passives-'));
writeJSON(path.join(consumer, 'package.json'), { private: true, type: 'module' });
execFileSync(process.execPath, [npmCli, 'install', ...archives.map(a => path.join(artifacts, a.filename)), '--offline','--ignore-scripts','--no-audit','--no-fund',
  '--cache',path.join(consumer,'cache')], { cwd: consumer, stdio: 'pipe' });
fs.writeFileSync(path.join(consumer, 'run.mjs'), `
import fs from 'node:fs';
import assert from 'node:assert/strict';
Math.random = () => { throw new Error('Ambient RNG'); };
globalThis.fetch = () => { throw new Error('Network'); };
for (const key of ['window','document','localStorage']) Object.defineProperty(globalThis, key, { get() { throw new Error(key); } });
const { PassivePolicy } = await import('@hollow-wake/engine/passives');
const pack = JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/passives/passives.json'))));
const policy = new PassivePolicy(pack);
let checked = 0;
for (const c of pack.classes) {
  const build = policy.create({ classId: c.id, allocated: [c.startNode], choices: {}, grafts: {}, vocations: [], passivePoints: 10, vocationPoints: 0, realmPoints: {} });
  for (const id of pack.adjacency[c.startNode]) {
    const node = policy.node(id), group = policy.group(node);
    const result = build.allocate(id, { ledger: {} }, group?.options[0].id);
    if (!result.accepted) continue;
    assert.equal(build.refund(id).refusal, null);
    assert.equal(build.snapshot().passivePoints, 10);
    assert.deepEqual(policy.restore(JSON.parse(JSON.stringify(build.snapshot()))).snapshot(), build.snapshot());
    checked++;
  }
}
assert.ok(checked > 100);
console.log(JSON.stringify({ installedConsumer: true, nodes: pack.nodes.length, classes: pack.classes.length, checked, contentId: pack.contentId }));
`);
const result = JSON.parse(execFileSync(process.execPath, ['run.mjs'], { cwd: consumer, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } }));
assert.equal(result.contentId, pack.contentId);
writeJSON(path.join(artifacts, 'passive-package-verification.json'), { ...result, node: process.version, archiveBytes: archives[1].size, unpackedBytes: archives[1].unpackedSize });
console.log(result);
