import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readCatalogue, buildCatalogue, buildDatabase, childCollections } from '../scripts/catalogue-tools.mjs';
import { root, sha256 } from '../scripts/reference-utils.mjs';
fs.mkdirSync(path.join(root, '.artifacts'), { recursive: true });

test('all registry shards preserve source data and identify every executable source rule', () => {
  const source = readCatalogue(), dir = fs.mkdtempSync(path.join(root, '.artifacts/catalogue-test-'));
  const manifest = buildCatalogue(dir);
  let count = 0, marked = [];
  function visit(value) {
    if (value && typeof value === 'object') {
      if (value.$sourceRule) marked.push(value.$sourceRule);
      Object.values(value).forEach(visit);
    }
  }
  for (const [name, table] of Object.entries(manifest.tables)) {
    const bytes = fs.readFileSync(path.join(dir, table.file));
    assert.equal(sha256(bytes), table.sha256);
    assert.equal(bytes.length, table.bytes);
    assert.deepEqual(JSON.parse(bytes), source.tables[name]);
    count += table.rows; visit(source.tables[name]);
  }
  assert.equal(count, 14434);
  assert.deepEqual(marked.sort(), manifest.sourceRules.sort());
  assert.equal(manifest.executable, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'registry-order.json'))), source.registryOrder);
  assert.deepEqual(source.registryOrder.defenseKinds, ['armor', 'evasion', 'energyShield', 'poise', 'endurance', 'insight']);
});
test('SQLite catalogue roundtrips all rows, order, child records and migration evidence', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const source = readCatalogue(), directory = fs.mkdtempSync(path.join(root, '.artifacts/sqlite-test-'));
  const destination = path.join(directory, 'content.sqlite');
  await buildDatabase(destination, source);
  const db = new DatabaseSync(destination, { readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    for (const [table, rows] of Object.entries(source.tables)) {
      const actual = db.prepare('SELECT id,payload FROM records WHERE table_name=? ORDER BY ordinal').all(table);
      assert.deepEqual(actual.map(r => ({ id: r.id, value: JSON.parse(r.payload) })), rows);
      for (const row of rows) for (const [collection, children] of Object.entries(childCollections(table, row))) {
        assert.deepEqual(db.prepare('SELECT payload FROM children WHERE table_name=? AND owner_id=? AND collection=? ORDER BY ordinal')
          .all(table, row.id, collection).map(r => JSON.parse(r.payload)), children);
      }
    }
    for (const [key, value] of Object.entries(source)) if (key !== 'tables') {
      assert.deepEqual(JSON.parse(db.prepare('SELECT value FROM metadata WHERE key=?').get(key).value), value);
    }
  } finally { db.close(); }
  await assert.rejects(buildDatabase(destination), /overwrite/);
});
