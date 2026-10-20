import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { root } from './reference-utils.mjs';

const artifacts = path.join(root, '.artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const temp = fs.mkdtempSync(path.join(artifacts, 'mutation-'));
for (const folder of ['dist', 'test', 'baseline', 'content']) {
  if (folder === 'baseline') {
    fs.mkdirSync(path.join(temp, folder));
    for (const file of ['first-path.json', 'stat-transitions.json', 'arithmetic-contacts.json']) {
      fs.copyFileSync(path.join(root, folder, file), path.join(temp, folder, file));
    }
    fs.cpSync(path.join(root, 'baseline/milestone-two'), path.join(temp, 'baseline/milestone-two'), { recursive: true });
    fs.mkdirSync(path.join(temp, 'baseline/milestone-three'));
    fs.copyFileSync(path.join(root, 'baseline/milestone-three/inventory.json'), path.join(temp, 'baseline/milestone-three/inventory.json'));
    fs.copyFileSync(path.join(root, 'baseline/milestone-three/catalogue.json.gz'), path.join(temp, 'baseline/milestone-three/catalogue.json.gz'));
    fs.cpSync(path.join(root, 'baseline/milestone-four'), path.join(temp, 'baseline/milestone-four'), { recursive: true });
  } else fs.cpSync(path.join(root, folder), path.join(temp, folder), { recursive: true });
}
fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}\n');
fs.mkdirSync(path.join(temp, 'scripts'));
for (const file of ['compile-item-content.mjs', 'reference-utils.mjs']) fs.copyFileSync(path.join(root, 'scripts', file), path.join(temp, 'scripts', file));
const file = path.join(temp, 'dist/stats.js');
const original = fs.readFileSync(file, 'utf8');
const mutants = [
  ['incorrect-increase', '(1 + increased)', '(1 + increased * 1.1)'],
  ['stale-stat-cache', 'this.cache.clear();', '/* deliberately omit cache invalidation */'],
];
for (const [name, before, after] of mutants) {
  assert.ok(original.includes(before), `Mutation target moved: ${name}`);
  fs.writeFileSync(file, original.replace(before, after));
  const result = spawnSync(process.execPath, ['--test', 'test/reference.test.mjs', 'test/contracts.test.mjs'], {
    cwd: temp, encoding: 'utf8',
  });
  const output = result.stdout + result.stderr;
  assert.ok(result.status !== 0 && /AssertionError/.test(output), `Tests failed to reject ${name}, or failed for an unrelated reason`);
  assert.ok(!/ERR_MODULE_NOT_FOUND|SyntaxError/.test(output), 'Mutation did not reach the behavior checks');
  fs.writeFileSync(path.join(artifacts, `${name}.txt`), output);
  console.log(`Rejected deliberate fault: ${name}`);
}

fs.writeFileSync(file, original);
for (const [module, name, before, after, tests] of [
  ['casting', 'missing-cast-completion', 'return elapsed >= cast.total;', 'return false;', 'test/lifecycle.test.mjs'],
  ['timed-effect', 'changed-expiry-damage', 'state.dps * state.stacks * dt', 'state.dps * state.stacks * Math.min(dt, state.remaining)', 'test/timed-effect.test.mjs'],
  ['inventory', 'closed-cell-open', "if (board.rows[y][x] === '.')", "if (false)", 'test/inventory.test.mjs'],
  ['inventory', 'overlapping-swap', 'if (item.x < x + item.w', 'if (false && item.x < x + item.w', 'test/inventory.test.mjs'],
  ['item-core', 'wrong-local-item-increase', '(1 + (inc.get(stat) ?? 0))', '(1 + 2 * (inc.get(stat) ?? 0))', 'test/item-rules.test.mjs'],
  ['item-core', 'reversed-item-affix-order', 'Object.values(ITEM_AFFIXES)', 'Object.values(ITEM_AFFIXES).reverse()', 'test/item-rules.test.mjs'],
]) {
  const target = path.join(temp, `dist/${module}.js`), source = fs.readFileSync(target, 'utf8');
  assert.ok(source.includes(before));
  fs.writeFileSync(target, source.replace(before, after));
  const result = spawnSync(process.execPath, ['--test', tests], { cwd: temp, encoding: 'utf8' });
  const output = result.stdout + result.stderr;
  assert.ok(result.status !== 0 && /AssertionError/.test(output) && !/ERR_MODULE_NOT_FOUND|SyntaxError/.test(output), `Negative control did not detect ${name}`);
  fs.writeFileSync(target, source);
  fs.writeFileSync(path.join(artifacts, `${name}.txt`), output);
  console.log(`Rejected deliberate fault: ${name}`);
}
