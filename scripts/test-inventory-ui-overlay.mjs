import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, sha256, writeJSON } from './reference-utils.mjs';
import { integrateInventoryUi, inventoryUiReference, inventoryUiFiles, inventoryUiControlMain } from '../adapters/hollow-wake/integrate-inventory-ui.mjs';

fs.mkdirSync(path.join(root, '.artifacts'), { recursive: true });
const directory = fs.mkdtempSync(path.join(root, '.artifacts/inventory-ui-overlay-'));
const receipts = [];
for (const variant of ['captured-overlay', 'managed-before-content-import']) {
  const game = path.join(directory, variant); fs.mkdirSync(game);
  const original = Object.fromEntries(inventoryUiFiles.map(file => [file, inventoryUiReference(file, false)]));
  if (variant === 'managed-before-content-import') original['src/main.ts'] = original['src/main.ts'].replace("import './data/bountyPassages';\n", '');
  for (const [file, source] of Object.entries(original)) { fs.mkdirSync(path.dirname(path.join(game, file)), { recursive: true }); fs.writeFileSync(path.join(game, file), source); }
  const main = path.join(game, 'src/main.ts'), course = path.join(game, 'balance/inventory-ui.cjs');
  fs.appendFileSync(course, '\n// unrelated work\n');
  assert.throws(() => integrateInventoryUi(game), /Unreviewed Inventory source/);
  assert.equal(fs.readFileSync(main, 'utf8'), original['src/main.ts'], 'A later invalid file must not cause an earlier write');
  assert.ok(fs.readFileSync(course, 'utf8').endsWith('// unrelated work\n'), 'Preserve unrelated source');
  fs.writeFileSync(course, original['balance/inventory-ui.cjs']);
  integrateInventoryUi(game, false);
  assert.equal(fs.readFileSync(main, 'utf8'), original['src/main.ts'], 'Preflight cannot edit sources');
  const result = integrateInventoryUi(game);
  const beforeRetry = fs.readFileSync(main, 'utf8');
  assert.equal(inventoryUiControlMain(beforeRetry), original['src/main.ts'], 'Negative control changes only the reviewed Escape repair');
  assert.throws(() => integrateInventoryUi(game), /Unreviewed Inventory source/);
  assert.equal(fs.readFileSync(main, 'utf8'), beforeRetry, 'Reapplication cannot overwrite the repair');
  receipts.push({ variant, ...result, sourceSha256Lf: Object.fromEntries(inventoryUiFiles.map(file => [file, sha256(fs.readFileSync(path.join(game, file)))])),
    rejectsUnreviewedFilesBeforeWrites: true, rejectsReapplication: true });
}
writeJSON(path.join(root, '.artifacts/inventory-ui-overlay-verification.json'), { receipts, scope: 'Source preservation and control construction; renderer behavior requires the separate game UI courses' });
console.log('Both reviewed source variants preserve unrelated work, preflight atomically, and reject reapplication.');
