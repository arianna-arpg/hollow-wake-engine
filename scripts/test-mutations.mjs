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
    fs.cpSync(path.join(root, 'baseline/milestone-eight'), path.join(temp, 'baseline/milestone-eight'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-nine'), path.join(temp, 'baseline/milestone-nine'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-thirteen'), path.join(temp, 'baseline/milestone-thirteen'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-fourteen'), path.join(temp, 'baseline/milestone-fourteen'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-fifteen'), path.join(temp, 'baseline/milestone-fifteen'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-sixteen'), path.join(temp, 'baseline/milestone-sixteen'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-eleven'), path.join(temp, 'baseline/milestone-eleven'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-twelve'), path.join(temp, 'baseline/milestone-twelve'), { recursive: true });
    fs.copyFileSync(path.join(root,'baseline/stat-catalogue.json'),path.join(temp,'baseline/stat-catalogue.json'));
  } else fs.cpSync(path.join(root, folder), path.join(temp, folder), { recursive: true });
}
fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}\n');
fs.mkdirSync(path.join(temp, 'scripts'));
for (const file of ['compile-item-content.mjs', 'catalogue-tools.mjs', 'reference-utils.mjs']) fs.copyFileSync(path.join(root, 'scripts', file), path.join(temp, 'scripts', file));
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
  ['passive-policy', 'refund-borrows-other-realm', 'this.#domains[next] === this.#domains[current]', 'true', 'test/passive-policy.test.mjs'],
  ['passive-policy', 'refund-loses-choice-points', 'picks * p.pack.pickCost', '1', 'test/passive-policy.test.mjs'],
  ['passive-grants', 'doubled-passive-attribute-percent', 'this.#values[i] * (1 + this.#pct[i])', 'this.#values[i] * (1 + 2 * this.#pct[i])', 'test/passive-grants.test.mjs'],
  ['passive-grants', 'reversed-passive-grant-order', 'this.#mods.push(...g.mods);', 'this.#mods.unshift(...g.mods);', 'test/passive-grants.test.mjs'],
  ['passive-policy', 'host-allocation-disconnected', 'return this.#state.allocated;', 'return new Set(this.#state.allocated);', 'test/passive-policy-host.test.mjs'],
  ['passive-policy', 'retired-node-refusal-lost', "if (!other)\n                return no('An allocated node is no longer available.');", 'if (!other) continue;', 'test/passive-policy-host.test.mjs'],
  ['inventory-host', 'stale-live-occupancy', 'occupied.fill(0, 0, cells);', '/* deliberately retain stale occupancy */', 'test/inventory-host.test.mjs'],
  ['inventory-host', 'live-swap-overlap', 'return overlap(x, y, s.w, s.h, item.x, item.y, bs.w, bs.h) ? null : blocker;', 'return blocker;', 'test/inventory-host.test.mjs'],
  ['stash-policy', 'storage-overflow-deposit', 'if (!existing && entries.some(e => !cellAt(next, e.key)))', 'if (false)', 'test/stash-policy.test.mjs'],
  ['stash-policy', 'storage-swap-overlap', 'if (!this.#grid.canPlace(this.#page([...rest, entry], next, from.page), this.#body(other.item), from.x, from.y, def.board))', 'if (false)', 'test/stash-policy.test.mjs'],
  ['container-layout', 'container-first-unlock-bypassed', 'if (!features?.has(this.#rungs[0].feature))', 'if (false)', 'test/container-layout.test.mjs'],
  ['seat-rules', 'neighbour-power-doubled', 'factor += powers.get(other)[0];', 'factor += 2 * powers.get(other)[0];', 'test/seat-rules.test.mjs'],
  ['relic-custody', 'released-relic-resurrected', 'if (state.released.includes(key))', 'if (false)', 'test/relic-custody.test.mjs'],
  ['relic-custody', 'relic-pour-debit-omitted', 'purse.credits -= spent;', '/* deliberately omit debit */', 'test/relic-custody.test.mjs'],
  ['relic-actions', 'foreign-account-actions-enabled', 'return access.ownHosted && !access.fallen && access.oracleReach();', 'return !access.fallen && access.oracleReach();', 'test/relic-actions.test.mjs'],
  ['relic-actions', 'withdrawal-loses-bag-owner', 'carry.items.push(item);', '/* deliberately omit destination owner */', 'test/relic-actions.test.mjs'],
  ['equipment-actions', 'equipment-level-bypassed', "if (finite(ctx.level, 'Character level') < required)", 'if (false)', 'test/equipment-actions.test.mjs'],
  ['equipment-actions', 'displaced-equipment-lost', 'drop(previous);', 'void previous; /* deliberately omit ground ownership */', 'test/equipment-actions.test.mjs'],
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
