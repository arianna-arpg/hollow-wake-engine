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
    fs.cpSync(path.join(root, 'baseline/milestone-eighteen'), path.join(temp, 'baseline/milestone-eighteen'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-nineteen'), path.join(temp, 'baseline/milestone-nineteen'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-twenty-two'), path.join(temp, 'baseline/milestone-twenty-two'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-twenty-three'), path.join(temp, 'baseline/milestone-twenty-three'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-twenty-four'), path.join(temp, 'baseline/milestone-twenty-four'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-twenty-five'), path.join(temp, 'baseline/milestone-twenty-five'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-twenty-six'), path.join(temp, 'baseline/milestone-twenty-six'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-twenty-seven'), path.join(temp, 'baseline/milestone-twenty-seven'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-twenty-nine'), path.join(temp, 'baseline/milestone-twenty-nine'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-twenty-eight'), path.join(temp, 'baseline/milestone-twenty-eight'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-eleven'), path.join(temp, 'baseline/milestone-eleven'), { recursive: true });
    fs.cpSync(path.join(root, 'baseline/milestone-twelve'), path.join(temp, 'baseline/milestone-twelve'), { recursive: true });
    fs.copyFileSync(path.join(root,'baseline/stat-catalogue.json'),path.join(temp,'baseline/stat-catalogue.json'));
  } else fs.cpSync(path.join(root, folder), path.join(temp, folder), { recursive: true });
}
fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}\n');
fs.mkdirSync(path.join(temp, 'scripts'));
for (const file of ['compile-item-content.mjs', 'compile-progression-content.mjs', 'compile-skill-progression.mjs', 'compile-resource-content.mjs', 'catalogue-tools.mjs', 'reference-utils.mjs']) fs.copyFileSync(path.join(root, 'scripts', file), path.join(temp, 'scripts', file));
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
  ['resource-payment', 'payment-mana-reservation-omitted', 'actor.reservedMana += booked;', 'actor.reservedMana += 0;', 'test/resource-payment.test.mjs'],
  ['resource-payment', 'payment-life-only-shortfall', "Math.min(cost.life, this.headroom(actor, 'life'))", "Math.min(cost.life - actor.life, this.headroom(actor, 'life'))", 'test/resource-payment.test.mjs'],
  ['resource-payment', 'payment-shield-fraction-spend', 'actor.es -= fromEs;', 'actor.es -= fromEs / p.esToMana(actor);', 'test/resource-payment.test.mjs'],
  ['resource-payment', 'payment-idle-boundary', 'loan.idle <= 0 ? 1', 'loan.idle < 0 ? 1', 'test/resource-payment.test.mjs'],
  ['resource-payment', 'payment-blood-observer-omitted', 'p.lifeSpent(actor, spent);', 'void spent;', 'test/resource-payment.test.mjs'],
  ['resource-payment', 'payment-reservation-not-freed', 'actor.reservedMana - repaid', 'actor.reservedMana', 'test/resource-payment.test.mjs'],
  ['guard-casting', 'guard-unearned-bash', 'if (bashArmed(state) && bashLine(state))', 'if (bashLine(state))', 'test/guard-casting.test.mjs'],
  ['guard-casting', 'guard-pulse-carry-lost', 'state.guardPulseT += interval;', 'state.guardPulseT = interval;', 'test/guard-casting.test.mjs'],
  ['guard-casting', 'guard-native-lower-omitted', 'p.lower(actor, state);', '/* lower omitted */', 'test/guard-casting.test.mjs'],
  ['guard-casting', 'guard-dead-bash', 'if (bash && !p.dead(actor) && state.bashAt !== undefined)', 'if (bash && state.bashAt !== undefined)', 'test/guard-casting.test.mjs'],
  ['guard-casting', 'guard-inclusive-line-lost', "fraction >= finite(state.bashAt, 'Guard bash line')", "fraction > finite(state.bashAt, 'Guard bash line')", 'test/guard-casting.test.mjs'],
  ['guard-casting', 'guard-inversion-omitted', 'inverted ? 1 - floor : floor', 'floor', 'test/guard-casting.test.mjs'],
  ['guard-casting', 'guard-minimum-duration-omitted', 'Math.max(.05,', 'Math.max(0,', 'test/guard-casting.test.mjs'],
  ['guard-casting', 'guard-release-recovery-changed', 'p.end(actor, state, .2);', 'p.end(actor, state, .3);', 'test/guard-casting.test.mjs'],
  ['channel-casting', 'channel-finish-repeated', 'if (state.finishRolled)\n            return;', '/* completion guard omitted */', 'test/channel-casting.test.mjs'],
  ['channel-casting', 'channel-missing-target-spends', 'if (target === null)', 'if (false)', 'test/channel-casting.test.mjs'],
  ['channel-casting', 'channel-pay-omitted', 'p.pay(actor, state, cost);', '/* payment omitted */', 'test/channel-casting.test.mjs'],
  ['channel-casting', 'channel-pulse-overshoot-lost', 'state.pulseTimer + state.total * jitter', 'state.total * jitter', 'test/channel-casting.test.mjs'],
  ['channel-casting', 'channel-persistence-expiry-late', 'remaining <= 0', 'remaining < 0', 'test/channel-casting.test.mjs'],
  ['channel-casting', 'channel-gather-fraction-omitted', 'cost.mana *= fraction;', 'void fraction;', 'test/channel-casting.test.mjs'],
  ['channel-casting', 'channel-brim-spend-omitted', 'bank.fill = 0;', 'bank.fill = bank.fill;', 'test/channel-casting.test.mjs'],
  ['channel-casting', 'channel-jitter-skips-draw', 'p.random()', '0', 'test/channel-casting.test.mjs'],
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
  ['passive-grants', 'duplicate-base-attribute-read', "finite(base[a.id] ?? 0, 'base attribute')", "finite((base[a.id], base[a.id]) ?? 0, 'base attribute')", 'test/passive-grant-vectors.test.mjs'],
  ['passive-policy', 'host-allocation-disconnected', 'return this.#state.allocated;', 'return new Set(this.#state.allocated);', 'test/passive-policy-host.test.mjs'],
  ['passive-policy', 'retired-node-refusal-lost', "if (!other)\n                return no('An allocated node is no longer available.');", 'if (!other) continue;', 'test/passive-policy-host.test.mjs'],
  ['inventory-host', 'stale-live-occupancy', 'occupied.fill(0, 0, cells);', '/* deliberately retain stale occupancy */', 'test/inventory-host.test.mjs'],
  ['inventory-host', 'live-swap-overlap', 'return overlap(x, y, s.w, s.h, item.x, item.y, bs.w, bs.h) ? null : blocker;', 'return blocker;', 'test/inventory-host.test.mjs'],
  ['stash-policy', 'storage-overflow-deposit', 'if (!existing && entries.some(e => !cellAt(next, e.key)))', 'if (false)', 'test/stash-policy.test.mjs'],
  ['stash-policy', 'storage-swap-overlap', 'if (!this.#grid.canPlace(this.#page([...rest, entry], next, from.page), this.#body(other.item), from.x, from.y, def.board))', 'if (false)', 'test/stash-policy.test.mjs'],
  ['container-layout', 'container-first-unlock-bypassed', 'if (!features?.has(this.#rungs[0].feature))', 'if (false)', 'test/container-layout.test.mjs'],
  ['seat-rules', 'neighbour-power-doubled', 'factor += powers.get(other)[0];', 'factor += 2 * powers.get(other)[0];', 'test/seat-rules.test.mjs'],
  ["skill-admission","admission-ammunition-bank-read-omitted","p.requiresUseCharge(inst) && p.useChargeBank(actor, inst).count <= 0","false","test/skill-admission.test.mjs"],
  ["skill-admission","admission-recovery-lock-ignored","if (actor.skillRecoveryLocks.has(inst.def.id))","if (false)","test/skill-admission.test.mjs"],
  ["skill-admission","admission-authored-gate-identity-lost","return gate;","return {...gate};","test/skill-admission.test.mjs"],
  ["skill-admission","admission-prime-admits-one-point-dent","this.maximum(actor, kind) - actor[kind] < 1","this.maximum(actor, kind) - actor[kind] <= 1","test/skill-admission.test.mjs"],
  ["skill-admission","admission-aura-debt-lock-ignored","if (raw.overdrive &&","if (false && raw.overdrive &&","test/skill-admission.test.mjs"],
  ["skill-admission","admission-charge-validator-bypassed","!p.chargeCostReady(actor.charges.get(charge.charge) ?? 0, charge)","false","test/skill-admission.test.mjs"],
  ['relic-custody', 'released-relic-resurrected', 'if (state.released.includes(key))', 'if (false)', 'test/relic-custody.test.mjs'],
  ['relic-custody', 'relic-pour-debit-omitted', 'purse.credits -= spent;', '/* deliberately omit debit */', 'test/relic-custody.test.mjs'],
  ['relic-actions', 'foreign-account-actions-enabled', 'return access.ownHosted && !access.fallen && access.oracleReach();', 'return !access.fallen && access.oracleReach();', 'test/relic-actions.test.mjs'],
  ['relic-actions', 'withdrawal-loses-bag-owner', 'carry.items.push(item);', '/* deliberately omit destination owner */', 'test/relic-actions.test.mjs'],
  ['equipment-actions', 'equipment-level-bypassed', "if (finite(ctx.level, 'Character level') < required)", 'if (false)', 'test/equipment-actions.test.mjs'],
  ['equipment-actions', 'displaced-equipment-lost', 'drop(previous);', 'void previous; /* deliberately omit ground ownership */', 'test/equipment-actions.test.mjs'],
  ['validation', 'nested-copy-omitted', 'entry[1] = copy(entry[1], ancestors);', 'entry[1] = entry[1];', 'test/validation.test.mjs'],
  ['validation', 'copied-properties-use-setters', 'Object.fromEntries(entries)', 'Object.assign({}, Object.fromEntries(entries))', 'test/validation.test.mjs'],
  ['character-progression', 'level-point-credit-omitted', 'state.passivePoints += rules.pack.tuning.passivePointsPerLevel;', 'state.passivePoints += 0;', 'test/character-progression.test.mjs'],
  ['character-progression', 'downed-level-auto-heals', 'if (!hero.downed)', 'if (true)', 'test/character-progression.test.mjs'],
  ['skill-progression', 'empowerment-budget-omitted', 'const points = empowermentRank(state) * pointsPerRank;', 'const points = 0;', 'test/skill-progression.test.mjs'],
  ['skill-tree-grants', 'aura-ranks-ignored', 'for (let rank = 0; rank < ranks; rank++)', 'for (let rank = 0; rank < 1; rank++)', 'test/skill-progression.test.mjs'],
  ['skill-actions', 'paid-skill-level-omitted', 'inst.level++;', 'inst.level += 0;', 'test/skill-actions.test.mjs'],
  ['skill-actions', 'legendary-donor-ranks-lost', 'const rank = empowermentRank(keeper) + e.ranksPerMerge + donorRanks;', 'const rank = empowermentRank(keeper) + e.ranksPerMerge;', 'test/skill-actions.test.mjs'],
  ['support-rules', 'support-empty-observation', 'if (first === sockets.length)', 'if (first === sockets.length && (this.#p.baseTags(inst), true))', 'test/support-rules.test.mjs'],
  ['support-rules', 'support-tag-closure-skipped', 'while (grew) {', 'while (grew && false) {', 'test/support-rules.test.mjs'],
  ['support-rules', 'support-effective-level-capped', 'return level;', 'return Math.min(20, level);', 'test/support-rules.test.mjs'],
  ['support-rules', 'support-override-scaled', "scale === 1 || mod.kind === 'override' ? mod", 'scale === 1 ? mod', 'test/support-rules.test.mjs'],
  ['support-actions', 'support-cleared-before-room', 'if (!p.give(seat, gem))', 'inst.sockets[index] = null; if (!p.give(seat, gem))', 'test/support-actions.test.mjs'],
  ['support-content', 'support-chance-threshold-ignored', 'authored >= tuning.identityThreshold', 'false', 'test/support-content.test.mjs'],
  ['charge-runtime', 'capped-gain-refreshes-idle', 'if (next > cur)', 'if (next >= cur)', 'test/charge-runtime.test.mjs'],
  ['charge-runtime', 'regeneration-debt-drained-in-one-frame', 'if (rst.tick >= 1)', 'while (rst.tick >= 1)', 'test/charge-runtime.test.mjs'],
  ['charge-runtime', 'retired-tree-clock-retained', "if (key.startsWith('treeTap:') && !treeKeys.has(key))", 'if (false)', 'test/charge-runtime.test.mjs'],
  ['charge-runtime', 'charge-payment-overdraws-bank', 'Math.min(have, cost.amount)', 'Math.max(have, cost.amount)', 'test/charge-runtime.test.mjs'],
  ['resource-gauges', 'gauge-regenerates-during-lockout', 'dt = -left;', 'dt = dt;', 'test/resource-gauges.test.mjs'],
  ['resource-content', 'resource-zero-interval-accepted', 'if (finite(v, label) <= 0)', 'if (finite(v, label) < 0)', 'test/resource-content.test.mjs'],
  ["interactive-casting","timing-attempt-not-spent","state.pressUsed = true;","state.pressUsed = false;","test/interactive-casting.test.mjs"],
  ["interactive-casting","timed-excludes-window-edge","<= .08","< .08","test/interactive-casting.test.mjs"],
  ["interactive-casting","multitude-cap-expanded","Math.min(15,","Math.min(16,","test/interactive-casting.test.mjs"],
  ["interactive-casting","focus-drain-fills","state.elapsed - dt *","state.elapsed + dt *","test/interactive-casting.test.mjs"],
  ["interactive-casting","focus-release-adds-frame","const fraction = state.elapsed / state.total;","const fraction = (state.elapsed + dt) / state.total;","test/interactive-casting.test.mjs"],
  ["interactive-casting","focus-release-excludes-minimum","fraction >= nonnegative","fraction > nonnegative","test/interactive-casting.test.mjs"],
  ["interactive-casting","focus-fizzle-ignores-recovery","base / Math.max(.1, nonnegative(skillRecovery, 'Skill cooldown recovery') / globalRecovery)","base","test/interactive-casting.test.mjs"],
  ["interactive-casting","focus-completion-late","state.elapsed >= state.total","state.elapsed > state.total","test/interactive-casting.test.mjs"],
  ["ammunition","ammunition-rest-clock-retained","p.bank(actor, inst).timer = 0;","/* clock retained */","test/ammunition.test.mjs"],
  ["ammunition","ammunition-reload-wipes-rest","bank.count = finite(bank.count + add, 'Restored ammunition');","bank.count = finite(bank.count + add, 'Restored ammunition'); bank.timer = 0;","test/ammunition.test.mjs"],
  ["ammunition","ammunition-optional-fuel-gated","return spec.empower === undefined && !spec.ventAll;","return true;","test/ammunition.test.mjs"],
  ["ammunition","ammunition-negative-fraction-clamped","bank.count = count;","bank.count = Math.max(0, count);","test/ammunition.test.mjs"],
  ["ammunition","ammunition-drip-catches-up","if (bank.timer >= cooldown)","while (bank.timer >= cooldown)","test/ammunition.test.mjs"],
  ["ammunition","ammunition-capacity-bonus-ignored","finite(this.#ports.capacityBonus(inst), 'Ammunition capacity bonus')","0","test/ammunition.test.mjs"],
  ["ammunition","ammunition-final-round-bonus-ignored","finite(p.finalRoundDamage(actor, inst), 'Last-round multiplier')","1","test/ammunition.test.mjs"],
  ["ammunition","ammunition-bleed-limit-expanded","const MAX_BLEED_STEPS = 65_536;","const MAX_BLEED_STEPS = 200_000;","test/ammunition.test.mjs"],
  ['charged-casting', 'charge-progress-exceeds-cap', "Math.min(state.total, finite(state.elapsed + dt, 'Charge progress'))", "finite(state.elapsed + dt, 'Charge progress')", 'test/charged-casting.test.mjs'],
  ['charged-casting', 'charge-death-silently-suppressed', 'p.execute(actor, state, release);', 'if (!p.dead(actor)) p.execute(actor, state, release);', 'test/charged-casting.test.mjs'],
  ['charged-casting', 'stage-carries-frame-overshoot', 'state.elapsed = 0;', 'state.elapsed -= state.total;', 'test/charged-casting.test.mjs'],
  ['charged-casting', 'stage-payment-skipped', 'p.pay(actor, state, cost);', 'void cost;', 'test/charged-casting.test.mjs'],
  ['charged-casting', 'stage-marker-draw-skipped', 'overchargeMarker(p.random())', 'overchargeMarker(0)', 'test/charged-casting.test.mjs'],
  ['charged-casting', 'spark-excludes-window-edge', '(state.sinceStage ?? 999) <= sparkWindow', '(state.sinceStage ?? 999) < sparkWindow', 'test/charged-casting.test.mjs'],
  ['charged-casting', 'perfect-excludes-window-edge', 'fraction >= .72', 'fraction > .72', 'test/charged-casting.test.mjs'],
  ["resource-events","inclusive-event-chance","return roll < probability;","return roll <= probability;","test/resource-events.test.mjs"],
  ["resource-events","event-zero-chance-skips-draw","if (probability === undefined)","if (probability === 0) return false; if (probability === undefined)","test/resource-events.test.mjs"],
  ["resource-events","event-strict-radius-edge","if (distance > nonnegative","if (distance >= nonnegative","test/resource-events.test.mjs"],
  ["resource-events","event-toggle-filter-ignored","if (spec.whileToggled && !p.toggled(actor, inst))","if (false && spec.whileToggled && !p.toggled(actor, inst))","test/resource-events.test.mjs"],
  ["resource-events","event-banks-after-shave","continue;\n                    }\n                    gaugeAdd","/* lost continue */\n                    }\n                    gaugeAdd","test/resource-events.test.mjs"],
  ["resource-events","event-reversed-slot-order","for (const inst of p.skills(actor))","for (const inst of [...p.skills(actor)].reverse())","test/resource-events.test.mjs"],
  ["cast-seals","intent-hard-seal-ignored","this.matches(spec.shut, context)","false","test/skill-intent.test.mjs"],
  ["cast-seals","intent-validation-reads-replaced-row","for (const [row, match] of rows) {","for (const [row, captured] of rows) { const match = spec[row];","test/skill-intent.test.mjs"],
  ["skill-intent","intent-conversion-face-cached-before-rule","? instances.definition(conversion.skillId) : inst.def","? definition : inst.def","test/skill-intent.test.mjs"],
  ["skill-intent","intent-trigger-hud-enabled","if (p.trigger(inst))","if (false)","test/skill-intent.test.mjs"],
  ["skill-intent","intent-corpse-query-side-effects","targeting.target !== 'corpse'","true","test/skill-intent.test.mjs"],
  ["skill-intent","intent-combo-endpoint-excluded","> chain['window']",">= chain['window']","test/skill-intent.test.mjs"],
  ["skill-intent","intent-gift-attribute-exemption-removed","inst.devGift ||","false ||","test/skill-intent.test.mjs"],
  ["skill-instances","intent-nonconstruct-cursor-detached","!actor.construct ||","false ||","test/skill-intent.test.mjs"],
  ["skill-instances","intent-relocation-host-identity-lost","relocation && this.#relocations.get(inst) !== host","false","test/skill-intent.test.mjs"],
  ["skill-instances","intent-combo-double-counts-socket-levels","inst.level + Math.floor(inst.bonusLevels ?? 0)","this.#ports.effectiveLevel(inst)","test/skill-intent.test.mjs"],
  ["skill-instances","intent-combo-copies-sockets","step.sockets = inst.sockets;","step.sockets = [...inst.sockets];","test/skill-intent.test.mjs"],
  ['skill-request', 'request-seal-bypassed', 'if (seal) {', 'if (false) {', 'test/skill-request.test.mjs'],
  ['skill-request', 'request-forget-omitted', 'p.forgetReplenishment(actor, inst);', '/* omitted */', 'test/skill-request.test.mjs'],
  ['skill-request', 'request-struggle-omitted', 'hold.struggle += p.mashPress();', 'hold.struggle += 0;', 'test/skill-request.test.mjs'],
  ['skill-request', 'request-life-lock-endpoint', 'actor.life > delivery.lockAboveLife', 'actor.life >= delivery.lockAboveLife', 'test/skill-request.test.mjs'],
  ['skill-request', 'request-trigger-possession-seat', 'p.triggerSeat(actor)', 'p.seatOf(actor)', 'test/skill-request.test.mjs'],
  ['skill-request', 'request-stale-depth-retained', 'inst.state.trigDepth = 0;', 'inst.state.trigDepth = 1;', 'test/skill-request.test.mjs'],
  ['skill-request', 'request-conversion-socket-copy', 'minted.sockets = inst.sockets;', 'minted.sockets = [...inst.sockets];', 'test/skill-request.test.mjs'],
  ['skill-request', 'request-prerequisite-empty-note', "unmet.note ?? 'not ready'", "unmet.note || 'not ready'", 'test/skill-request.test.mjs'],
  ['skill-request', 'request-relocation-bypassed', '!p.relocationTarget(actor, inst, effect.radius)', 'false', 'test/skill-request.test.mjs'],
  ['skill-request', 'request-admission-bypassed', '!p.canUse(actor, inst)', 'false', 'test/skill-request.test.mjs'],
  ['skill-request', 'request-continuation-treated-as-handled', "return 'continue';", 'return true;', 'test/skill-request.test.mjs'],
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
