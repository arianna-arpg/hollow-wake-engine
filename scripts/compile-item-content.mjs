import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { root, sha256, writeJSON } from './reference-utils.mjs';
import { readCatalogue } from './catalogue-tools.mjs';
import { EquipmentSlots } from '../dist/equipment-actions.js';
export function equipmentPack(){
  const catalogue=readCatalogue(),rows=new Map(catalogue.tables.equipSlots.map(row=>[row.id,row.value]));
  const body={schemaVersion:1,capability:'equipment-slots/v1',slots:catalogue.registryOrder.equipSlots.map(id=>rows.get(id))};
  const pack={...body,contentId:'hollow-wake-equipment:sha256:'+sha256(JSON.stringify(body))};new EquipmentSlots(pack);return pack;
}
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
  const equipment=equipmentPack(),equipmentBytes=JSON.stringify(equipment)+'\n';fs.writeFileSync(path.join(destination,'equipment.json'),equipmentBytes);
  writeJSON(path.join(destination, 'package.json'), { name: '@hollow-wake/items', version: '0.2.0', type: 'module',
    license: 'PolyForm-Noncommercial-1.0.0', files: ['items.json', 'equipment.json', 'manifest.json', 'LICENSE.md', 'README.md'], exports: { './items.json': './items.json', './equipment.json':'./equipment.json', './manifest.json': './manifest.json' } });
  writeJSON(path.join(destination, 'manifest.json'), { schemaVersion: 1, contentId: pack.id, sha256: sha256(bytes), bytes: Buffer.byteLength(bytes), capability: pack.capability,equipmentContentId:equipment.contentId,equipmentSha256:sha256(equipmentBytes),equipmentBytes:Buffer.byteLength(equipmentBytes),equipmentCapability:equipment.capability });
  fs.copyFileSync(path.join(root, 'LICENSE.md'), path.join(destination, 'LICENSE.md'));
  fs.writeFileSync(path.join(destination, 'README.md'), '# Hollow Wake item content\n\nExplicit content for ItemContent / ItemRules, plus separately loaded ordered equipment.json for EquipmentSlots and EquipmentActions. Includes rolling, forging and modifier derivation definitions. The host binds category exceptions and tier requirements from item config, and owns actor recalculation and displaced-ground delivery. Grants and proc-valued modifiers still require gameplay systems to interpret them. Trade and crafting transactions remain separate. Load once and share immutable content.\n');
  return pack;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ItemContent } = await import('../dist/item-rules.js');
  const pack = buildItemContent(path.join(root, '.artifacts/item-package')); new ItemContent(pack);
  console.log(JSON.stringify({ id: pack.id, bases: Object.keys(pack.bases).length, affixes: Object.keys(pack.affixes).length }));
}
