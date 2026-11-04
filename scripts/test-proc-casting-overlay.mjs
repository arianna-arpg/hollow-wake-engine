import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root, writeJSON} from './reference-utils.mjs';
import {procDeliveryTree} from '../adapters/hollow-wake/proc-delivery-tree.mjs';
import {renderProcCasting, integrateProcCasting} from '../adapters/hollow-wake/integrate-proc-casting.mjs';

fs.mkdirSync(path.join(root, '.artifacts'), {recursive: true});
const directory = fs.mkdtempSync(path.join(root, '.artifacts/proc-casting-overlay-'));
const source = fs.readFileSync(path.join(root, '.reference/src/engine/world.ts'), 'utf8').replaceAll('\r\n', '\n');
const tree = procDeliveryTree(source), normal = renderProcCasting(source), faults = [];
assert.equal(renderProcCasting(source, true), source);
assert.equal(renderProcCasting(source.replaceAll('\n', '\r\n')).replaceAll('\r\n', '\n'), normal);
assert.equal(procDeliveryTree(normal).methods.executeProc.getText(procDeliveryTree(normal).ast), tree.methods.executeProc.getText(tree.ast));
for (const name of ['castProcPayload', 'heldSkillInst']) {
  const node = tree.methods[name];
  const changed = source.slice(0, node.body.getStart(tree.ast) + 1) + '\nvoid 1;' + source.slice(node.body.getStart(tree.ast) + 1);
  for (const preflight of [false, true]) assert.throws(() => renderProcCasting(changed, preflight), /Unreviewed proc casting/);
  faults.push(name);
}
for (const symbol of ['engineProcCasting', 'bindProcCasting']) {
  assert.throws(() => renderProcCasting(source + '\n// ' + symbol), /binding collision/); faults.push(symbol);
}
assert.throws(() => renderProcCasting(normal), /binding collision/);
const game = path.join(directory, 'game'); fs.mkdirSync(path.join(game, 'src/engine'), {recursive: true});
const world = path.join(game, 'src/engine/world.ts'), binding = path.join(game, 'src/engine/procCasting.ts');
fs.writeFileSync(world, source); integrateProcCasting(game, false);
assert.equal(fs.readFileSync(world, 'utf8'), source); assert(!fs.existsSync(binding));
integrateProcCasting(game); assert.equal(fs.readFileSync(world, 'utf8'), normal);
assert(fs.readFileSync(binding).equals(fs.readFileSync(path.join(root, 'adapters/hollow-wake/procCasting.ts'))));
assert.throws(() => integrateProcCasting(game), /already exists/);
assert.equal(fs.readFileSync(path.join(root, '.reference/src/engine/world.ts'), 'utf8').replaceAll('\r\n', '\n'), source);
const report = {passed: true, directory, faults, dispatcherUnchanged: true, dryRunWrites: false, repeatedInstallRefused: true};
writeJSON(path.join(directory, 'verification.json'), report); console.log(report);
