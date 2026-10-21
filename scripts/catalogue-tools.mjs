import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { root, sha256, writeJSON } from './reference-utils.mjs';

export function readCatalogue() {
  const data = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'baseline/milestone-three/catalogue.json.gz'))));
  if (data.schemaVersion !== 1 || data.kind !== 'authored-catalogue') throw new Error('Unsupported catalogue schema');
  for (const [name, rows] of Object.entries(data.tables)) {
    if (!/^[a-zA-Z]+$/.test(name)) throw new Error('Invalid table name');
    const ids = new Set();
    for (const { id } of rows) {
      if (typeof id !== 'string' || !id.length || ids.has(id)) throw new Error(`Duplicate/invalid identity: ${name}/${id}`);
      ids.add(id);
    }
    const order = data.registryOrder?.[name];
    if (!Array.isArray(order) || order.length !== rows.length || new Set(order).size !== ids.size || order.some(id => !ids.has(id))) {
      throw new Error(`Invalid source registry order: ${name}`);
    }
  }
  return data;
}
export function childCollections(table, row) {
  if (table === 'skills') return { nodes: row.value.tree?.nodes ?? [], effects: row.value.effects ?? [] };
  if (table === 'vocations') return { nodes: row.value.tree ?? [] };
  if (table === 'affixes') return { tiers: row.value.tiers ?? [] };
  return {};
}
export function buildCatalogue(directory) {
  const catalogue = readCatalogue(), manifest = { schemaVersion: 1, kind: 'authored-catalogue',
    executable: false, source: catalogue.source, tables: {}, sourceRules: catalogue.sourceRules.map(r => r.path) };
  fs.mkdirSync(path.join(directory, 'tables'), { recursive: true });
  for (const [name, rows] of Object.entries(catalogue.tables)) {
    const bytes = JSON.stringify(rows) + '\n';
    const file = `tables/${name}.json`;
    fs.writeFileSync(path.join(directory, file), bytes);
    manifest.tables[name] = { file, rows: rows.length, bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) };
  }
  writeJSON(path.join(directory, 'manifest.json'), manifest);
  writeJSON(path.join(directory, 'source-rules.json'), catalogue.sourceRules);
  writeJSON(path.join(directory, 'registry-order.json'), catalogue.registryOrder);
  writeJSON(path.join(directory, 'omissions.json'), catalogue.omissions);
  writeJSON(path.join(directory, 'package.json'), { name: '@hollow-wake/catalogue', version: '0.1.0', type: 'module',
    license: 'PolyForm-Noncommercial-1.0.0', files: ['tables', 'manifest.json', 'source-rules.json', 'registry-order.json', 'omissions.json', 'LICENSE.md', 'README.md'],
    exports: { './manifest.json': './manifest.json', './tables/*.json': './tables/*.json', './source-rules.json': './source-rules.json', './registry-order.json': './registry-order.json' } });
  fs.copyFileSync(path.join(root, 'LICENSE.md'), path.join(directory, 'LICENSE.md'));
  fs.writeFileSync(path.join(directory, 'README.md'), '# Hollow Wake authored catalogue\n\nFrozen source definitions for authoring, inspection and capability-specific compilation. These are not executable SDK capability packs. Load only the tables you need. Stable table/id pairs identify rows; nested array order is preserved. Lookup rows are sorted; registry-order.json preserves the original registry insertion order for weighted rolls and modifier folds. `$sourceRule` marks captured executable rules, recorded as text for provenance. Separate capability compilers may translate verified rules into explicit data; this raw catalogue never executes them. No eval is provided.\n');
  return manifest;
}
export async function buildDatabase(destination, catalogue = readCatalogue()) {
  // Tooling only: SQLite never becomes a dependency of the game runtime.
  const { DatabaseSync } = await import('node:sqlite');
  if (fs.existsSync(destination)) throw new Error('Refusing to overwrite a content database');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const db = new DatabaseSync(destination);
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE records (table_name TEXT NOT NULL, id TEXT NOT NULL, ordinal INTEGER NOT NULL, payload TEXT NOT NULL,
        PRIMARY KEY(table_name,id), UNIQUE(table_name,ordinal)) WITHOUT ROWID;
      CREATE TABLE children (table_name TEXT NOT NULL, owner_id TEXT NOT NULL, collection TEXT NOT NULL, ordinal INTEGER NOT NULL,
        id TEXT, payload TEXT NOT NULL, PRIMARY KEY(table_name,owner_id,collection,ordinal),
        FOREIGN KEY(table_name,owner_id) REFERENCES records(table_name,id)) WITHOUT ROWID;
      CREATE INDEX child_identity ON children(table_name,collection,id);
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID; BEGIN;`);
    const insert = db.prepare('INSERT INTO records VALUES (?,?,?,?)'), child = db.prepare('INSERT INTO children VALUES (?,?,?,?,?,?)');
    for (const [table, rows] of Object.entries(catalogue.tables)) for (const [ordinal, row] of rows.entries()) {
      insert.run(table, row.id, ordinal, JSON.stringify(row.value));
      for (const [collection, values] of Object.entries(childCollections(table, row))) for (const [i, value] of values.entries()) {
        child.run(table, row.id, collection, i, value.id ?? null, JSON.stringify(value));
      }
    }
    const meta = db.prepare('INSERT INTO metadata VALUES (?,?)');
    for (const [key, value] of Object.entries(catalogue)) if (key !== 'tables') meta.run(key, JSON.stringify(value));
    db.exec('COMMIT;');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Invalid catalogue relation');
  } finally { db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = path.join(root, '.artifacts/catalogue-package');
  const manifest = buildCatalogue(target);
  console.log(JSON.stringify({ directory: target, rows: Object.values(manifest.tables).reduce((n, t) => n + t.rows, 0),
    bytes: Object.values(manifest.tables).reduce((n, t) => n + t.bytes, 0), sourceRules: manifest.sourceRules }));
}
