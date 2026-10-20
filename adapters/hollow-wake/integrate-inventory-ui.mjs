import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { root, sha256 } from '../../scripts/reference-utils.mjs';

export const inventoryUiFiles = ['src/main.ts', 'balance/inventory-ui.cjs'];
const lf = text => text.replaceAll('\r\n', '\n');
const replaceOnce = (source, before, after) => {
  assert.equal(source.split(before).length, 2, `Inventory repair anchor changed: ${before}`);
  return source.replace(before, after);
};

/** Explicit baseline bug repair; never modifies accepted original fixtures. */
export function renderInventoryUiRepair(file, original) {
  let source = lf(original);
  if (file === inventoryUiFiles[0]) {
    source = replaceOnce(source, '    if (ui.cancelSalvageMode(world.localSeat.id)) return;\n', '');
    return replaceOnce(source, '    if (ui.closeNpcFront()) return;',
      '    // Disarm the local inventory verb before dismissing its NPC station.\n' +
      '    // A later Escape closes that station while preserving the player pages.\n' +
      '    if (ui.cancelSalvageMode(world.localSeat.id)) return;\n' +
      '    if (ui.closeNpcFront()) return;');
  }
  assert.equal(file, inventoryUiFiles[1], 'Unknown Inventory repair target');
  // The newer NPC/player-group contract deliberately keeps Inventory when an NPC closes.
  source = replaceOnce(source,
    "      check('the next Escape resumes normal panel closing', !ui.inventoryOpen && !ui.vendorOpen);",
    "      check('the next Escape closes the NPC station and keeps Inventory', ui.inventoryOpen && !ui.vendorOpen && !ui.escapeMenuOpen);\n" +
    "      escape();\n" +
    "      check('another Escape resumes the player panel policy', !ui.inventoryOpen && !ui.vendorOpen && !ui.escapeMenuOpen);");
  // Exercise the NPC boundary under each configured policy, preserving the original disarm assertion.
  return replaceOnce(source,
    "          && !ui.escapeMenuOpen && !tile(first.uid).hasAttribute('data-salv-uid'));\n      }",
    "          && !ui.escapeMenuOpen && !tile(first.uid).hasAttribute('data-salv-uid'));\n" +
    "        escape();\n" +
    "        check('NPC closes independently under ' + policy, ui.inventoryOpen && !ui.vendorOpen && !ui.escapeMenuOpen);\n      }");
}

export function inventoryUiReference(file, repaired = true) {
  assert.ok(inventoryUiFiles.includes(file));
  const source = fs.readFileSync(path.join(root, '.reference', file), 'utf8');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
  assert.equal(sha256(source), lock.files[file], 'Frozen Inventory repair input changed');
  return repaired ? renderInventoryUiRepair(file, source) : lf(source);
}

function inputs(file) {
  const original = inventoryUiReference(file, false);
  // The managed full-game adapter predates this one captured unfinished content import.
  // Preserve that reviewed variant; this is not permission to ignore other source changes.
  return file === 'src/main.ts' ? [original, replaceOnce(original, "import './data/bountyPassages';\n", '')] : [original];
}

export function inventoryUiControlMain(repairedSource) {
  const original = inputs('src/main.ts').find(source => renderInventoryUiRepair('src/main.ts', source) === lf(repairedSource));
  assert.ok(original, 'Unknown main source for original Escape control');
  return original;
}

export function integrateInventoryUi(game, write = true) {
  // Validate every source before writing either file. Reapplication and unknown work are refused.
  const changes = inventoryUiFiles.map(file => {
    const target = path.join(game, file), bytes = fs.readFileSync(target), original = bytes.toString('utf8');
    assert.ok(inputs(file).includes(lf(original)), `Unreviewed Inventory source; refusing patch: ${file} (${sha256(lf(original))})`);
    const newline = bytes.includes(Buffer.from('\r\n')) ? '\r\n' : '\n';
    return { target, source: renderInventoryUiRepair(file, original).replaceAll('\n', newline) };
  });
  if (write) for (const { target, source } of changes) fs.writeFileSync(target, source);
  return { files: [...inventoryUiFiles], intentionalRepair: 'inventory-cancel-before-npc/v1' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(integrateInventoryUi(path.resolve(process.argv[2])));
