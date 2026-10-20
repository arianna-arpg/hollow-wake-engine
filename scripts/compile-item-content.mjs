import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { root, sha256, writeJSON } from './reference-utils.mjs';
export function itemPack() {
  const raw = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'baseline/milestone-four/item-rules.json.gz'))));
  const catalogue = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'baseline/milestone-three/catalogue.json.gz'))));
  const categories = new Set();
  for (const { value } of catalogue.tables.equipSlots) if (value.enabled) value.accepts.forEach(id => categories.add(id));
  for (const { value } of catalogue.tables.containers) value.accepts.categories?.forEach(id => categories.add(id));
  // Raw item registries retain insertion order; do not sort before generating a runtime pack.
  const pack = { ...raw, capability: 'item-rules/v1', carriableCategories: [...categories] };
  return { ...pack, id: `hollow-wake-items:sha256:${sha256(JSON.stringify(pack))}` };
}
export function buildItemContent(destination) {
  fs.mkdirSync(destination, { recursive: true });
  const pack = itemPack(), bytes = JSON.stringify(pack) + '\n';
  fs.writeFileSync(path.join(destination, 'items.json'), bytes);
  writeJSON(path.join(destination, 'package.json'), { name: '@hollow-wake/items', version: '0.1.0', type: 'module',
    license: 'PolyForm-Noncommercial-1.0.0', files: ['items.json', 'manifest.json', 'LICENSE.md', 'README.md'], exports: { './items.json': './items.json', './manifest.json': './manifest.json' } });
  writeJSON(path.join(destination, 'manifest.json'), { schemaVersion: 1, contentId: pack.id, sha256: sha256(bytes), bytes: Buffer.byteLength(bytes), capability: pack.capability });
  fs.copyFileSync(path.join(root, 'LICENSE.md'), path.join(destination, 'LICENSE.md'));
  fs.writeFileSync(path.join(destination, 'README.md'), '# Hollow Wake item content\n\nExplicit content for ItemContent / ItemRules. Includes rolling, forging and modifier derivation definitions. Grants and proc-valued modifiers still require the host gameplay systems to interpret them. Not a complete item ownership, trade or crafting policy package. Load once and share ItemContent across generators.\n');
  return pack;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ItemContent } = await import('../dist/item-rules.js');
  const pack = buildItemContent(path.join(root, '.artifacts/item-package')); new ItemContent(pack);
  console.log(JSON.stringify({ id: pack.id, bases: Object.keys(pack.bases).length, affixes: Object.keys(pack.affixes).length }));
}
