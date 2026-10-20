import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { root, sha256, writeJSON } from './reference-utils.mjs';
export function passivePack() {
  const { authored } = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'baseline/milestone-eight/passives.json.gz'))));
  const { contentId: _sourceLabel, ...data } = authored;
  return { ...data, contentId: `hollow-wake-passives:sha256:${sha256(JSON.stringify(data))}` };
}
export function buildPassiveContent(destination) {
  fs.mkdirSync(destination, { recursive: true });
  const pack = passivePack(), bytes = JSON.stringify(pack) + '\n';
  fs.writeFileSync(path.join(destination, 'passives.json'), bytes);
  writeJSON(path.join(destination, 'package.json'), { name: '@hollow-wake/passives', version: '0.1.0', type: 'module',
    license: 'PolyForm-Noncommercial-1.0.0', files: ['passives.json','manifest.json','LICENSE.md','README.md'],
    exports: { './passives.json': './passives.json', './manifest.json': './manifest.json' } });
  writeJSON(path.join(destination, 'manifest.json'), { schemaVersion: 1, contentId: pack.contentId, sha256: sha256(bytes), bytes: Buffer.byteLength(bytes), capability: pack.capability });
  fs.copyFileSync(path.join(root, 'LICENSE.md'), path.join(destination, 'LICENSE.md'));
  fs.writeFileSync(path.join(destination, 'README.md'), '# Hollow Wake passive policy content\n\nExplicit graph, choice, realm and vocation policy for PassivePolicy from @hollow-wake/engine/passives. Load once and share the immutable policy across owned builds. This projection does not include or execute stat grants, conduits, support payloads, quest earning, legacy migrations or UI. The full authored payload remains in the separate authored catalogue.\n');
  return pack;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { PassivePolicy } = await import('../dist/passive-policy.js');
  const pack = buildPassiveContent(path.join(root, '.artifacts/passive-package')); new PassivePolicy(pack);
  console.log(JSON.stringify({ contentId: pack.contentId, nodes: pack.nodes.length, classes: pack.classes.length, vocations: pack.vocations.length }));
}
