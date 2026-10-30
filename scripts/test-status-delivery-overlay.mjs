import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {statusDeliveryTree} from '../adapters/hollow-wake/status-delivery-tree.mjs';
import {statusDeliveryFaults, applyStatusDeliveryFault} from './status-delivery-observer-faults.mjs';
import {renderStatusDelivery, integrateStatusDelivery} from '../adapters/hollow-wake/integrate-status-delivery.mjs';
const source = fs.readFileSync(path.join(root, '.reference/src/engine/world.ts'), 'utf8').replaceAll('\r\n', '\n');
const directory = fs.mkdtempSync(path.join(root, '.artifacts/status-delivery-overlay-'));
const tree = statusDeliveryTree(source), faults = [];
assert.equal(renderStatusDelivery(source, true), source);
const normal = renderStatusDelivery(source);
assert.equal(renderStatusDelivery(source.replaceAll('\n', '\r\n')).replaceAll('\r\n', '\n'), normal);
assert(!normal.includes('instanceTreeOver'), 'The extracted branches owned its last use');
const retainedImport = renderStatusDelivery(source + '\nvoid instanceTreeOver;\n');
assert.equal(retainedImport.split('instanceTreeOver').length - 1, 2, 'Keep the import when unrelated code uses it');
assert.throws(() => renderStatusDelivery(normal));
for (const fault of statusDeliveryFaults) {
  for (const preflight of [true, false]) assert.throws(() => renderStatusDelivery(applyStatusDeliveryFault(tree, fault), preflight), e => e.code === 'ERR_ASSERTION', fault[0]);
  faults.push(fault[0]);
}
for (const symbol of ['engineStatusDelivery', 'bindStatusDelivery']) {
  assert.throws(() => renderStatusDelivery(source + '\n// ' + symbol), /binding collision/); faults.push(symbol);
}
const fieldText = tree.field.getText(tree.ast), changedField = source.slice(0, tree.field.getStart(tree.ast)) + fieldText.replace('private', 'public') + source.slice(tree.field.end);
assert.throws(() => renderStatusDelivery(changedField), /Unreviewed recall identity owner/); faults.push('identity-owner');
const game = path.join(directory, 'game'); fs.mkdirSync(path.join(game, 'src/engine'), {recursive: true});
const world = path.join(game, 'src/engine/world.ts'), binding = path.join(game, 'src/engine/statusDelivery.ts');
fs.writeFileSync(world, source, {flag: 'wx'}); integrateStatusDelivery(game, false); assert.equal(fs.readFileSync(world, 'utf8'), source); assert(!fs.existsSync(binding));
integrateStatusDelivery(game); assert.equal(fs.readFileSync(world, 'utf8'), normal); assert(fs.readFileSync(binding).equals(fs.readFileSync(path.join(root, 'adapters/hollow-wake/statusDelivery.ts'))));
assert.throws(() => integrateStatusDelivery(game), /already exists/);
assert.equal(sha256(fs.readFileSync(path.join(root, '.reference/src/engine/world.ts'), 'utf8').replaceAll('\r\n', '\n')), sha256(source));
const report = {passed: true, directory, faults: faults.length, names: faults, sourceUnchanged: true, dryRunWrites: false, repeatedInstallRefused: true};
writeJSON(path.join(directory, 'verification.json'), report); writeJSON('.artifacts/status-delivery-overlay-verification.json', report); console.log(report);
