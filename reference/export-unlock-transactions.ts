import fs from 'node:fs';
import assert from 'node:assert/strict';
import { makeAccount, serializeAccount, FEATURE, classLevelLedgerKey, type Account } from '../src/meta/account';
import { CLASSES } from '../src/data/classes';
import { SKILLS } from '../src/data/skills';
import { SUPPORTS } from '../src/data/supports';
import { RELIQUARY_CFG } from '../src/data/reliquary';
import { MEMORY_UNLOCK_CFG } from '../src/data/memoryUnlocks';
import { odysseyMilestoneKey, POWER_PROGRESSION } from '../src/data/powerProgression';
import {
  UNLOCK_CATALOG, allUnlockables, reliquaryUnlockables, applyUnlock, investUnlock,
  isUnlockOwned, isUnlockVisible, unlockCompleted, investedToward, remainingCost,
  reconcileClassBundleGems, type Unlockable,
} from '../src/meta/unlocks';

const encode = (_key: string, value: unknown): unknown =>
  typeof value === 'number' && !Number.isFinite(value) ? { number: String(value) } : value;
const snapshot = (account: Account): unknown => JSON.parse(JSON.stringify(serializeAccount(account), encode));
const seed = makeAccount();
const skill = Object.keys(SKILLS).find(id => !seed.unlockedSkills.has(id));
const support = Object.keys(SUPPORTS).find(id => !seed.unlockedSupports.has(id));
assert(skill && support);
const card = { label: 'Transaction probe', description: 'Explicit synthetic unlock definition', cost: 17 };
const ordinary: Unlockable[] = [
  { ...card, id: 'probe_slot', kind: 'slot', payload: { slotCount: 4 } },
  { ...card, id: 'probe_class', kind: 'class', payload: { classId: 'berserker', skillIds: [skill], supportIds: [support] } },
  { ...card, id: 'probe_classtier', kind: 'classtier', payload: { classId: 'warrior', tierId: 'novice', skillIds: [skill] } },
  { ...card, id: 'probe_skill', kind: 'skill', payload: { skillIds: [skill] } },
  { ...card, id: 'probe_support', kind: 'support', payload: { supportIds: [support] } },
  { ...card, id: 'probe_feature', kind: 'feature', payload: { flag: 'probe_feature' } },
  { ...card, id: 'probe_graft', kind: 'graft', payload: {} },
];
function base(): Account {
  const account = makeAccount();
  account.credits = 1000;
  account.features.add(FEATURE.RELIQUARY);
  account.ledger[RELIQUARY_CFG.attunement] = 1;
  account.ledger[odysseyMilestoneKey(POWER_PROGRESSION.awakening.odysseyStage)] = 1;
  account.ledger.crowned_killed = 1;
  account.roster.push({
    charId: 'fallen', modeId: 'immortal', slot: 100, classId: 'warrior',
    name: 'Fallen', level: 20, stage: 1, savedAt: 123,
    fallen: { fee: 17, at: 122, level: 20 },
  });
  return account;
}
interface Course {
  name: string;
  definition(account: Account): Unlockable;
  legacy?: boolean;
}
const courses: Course[] = ordinary.map(definition => ({
  name: definition.kind, definition: () => structuredClone(definition),
  legacy: definition.kind === 'skill' || definition.kind === 'support',
}));
for (const id of ['__proto__', 'constructor', 'toString']) {
  courses.push({ name: 'feature-key-' + id, definition: () => ({
    ...card, id, kind: 'feature', payload: { flag: 'probe_' + id },
  }) });
}
for (const kind of ['power', 'storage'] as const) {
  courses.push({ name: kind, definition: account => {
    const row = reliquaryUnlockables(account).find(row => row.kind === kind && row.cost > 0);
    assert(row);
    return row;
  } });
}
for (const id of ['memory_discovery', 'memory_secondary', 'pkg_warbands', 'resurrect_fallen']) {
  courses.push({ name: id, definition: account => {
    const row = allUnlockables(account).find(row => row.id === id);
    assert(row);
    return row;
  } });
}
courses.push({ name: 'memory-offer-alias', definition: account => {
  const row = allUnlockables(account).find(row => row.id === 'memory_discovery');
  assert(row);
  return { ...row, id: 'aliased_memory_offer' };
} });
const oldRandom = Math.random, oldLegacy = MEMORY_UNLOCK_CFG.legacyGemBundles;
let draws = 0, roll = .375;
Math.random = () => { draws++; return roll; };
const receiptSequence = (account: Account, row: Unlockable): number =>
  row.kind === 'memory' ? account.memoryReceipts[row.payload.memoryUnlockId]?.sequence ?? 0 : 0;
function read(account: Account, row: Unlockable, sequence: number) {
  return {
    state: snapshot(account), owned: isUnlockOwned(account, row),
    visible: isUnlockVisible(account, row), completed: unlockCompleted(account, row, sequence),
    investment: investedToward(account, row), remaining: remainingCost(account, row), draws,
  };
}
function action(account: Account, row: Unlockable, name: string, invoke: () => number | boolean) {
  const sequence = receiptSequence(account, row), before = read(account, row, sequence);
  let result: number | boolean | undefined, error: { name: string; message: string } | undefined;
  try { result = invoke(); }
  catch (cause) {
    error = cause instanceof Error ? { name: cause.name, message: cause.message } : { name: 'Thrown value', message: String(cause) };
  }
  return { name, before, result, error, after: read(account, row, sequence) };
}
function setInvestment(account: Account, row: Unlockable, value: number): void {
  if (row.kind === 'power') account.reliquary.invested = value;
  else if (row.kind === 'storage') account.reliquary.stash.invested = value;
  else account.invested[row.id] = value;
}
const traces: unknown[] = [];
const amounts = [-7, 0, .25, 1, 7.9, 17, 29, 30, 90, 10000, Infinity, NaN];
const credits = [-1, 0, .5, 5, 17, 30, 10000, NaN, Infinity];
interface Variant {
  label: string;
  amount: number;
  credits: number;
  invested?: number;
  overpaid?: number;
  roll: number;
}
try {
  for (const course of courses) {
    MEMORY_UNLOCK_CFG.legacyGemBundles = course.legacy ?? oldLegacy;
    const cases: Variant[] = [
      ...amounts.map(amount => ({ label: 'amount-' + amount, amount, credits: 1000, roll: .375 })),
      ...credits.map(credits => ({ label: 'credits-' + credits, amount: 10000, credits, roll: .375 })),
      ...[-4, 0, .75, 7.9, NaN, Infinity].map(invested => ({ label: 'investment-' + invested, amount: 10000, credits: 1000, invested, roll: .375 })),
      ...[0, 5].map(overpaid => ({ label: 'retuned-' + overpaid, amount: 0, credits: 1000, invested: 0, overpaid, roll: .375 })),
      ...(course.name.startsWith('memory') ? [0, .999999, -1, 1, NaN].map(roll => ({ label: 'random-' + roll, amount: 10000, credits: 1000, invested: 0, roll })) : []),
    ];
    for (const variant of cases) {
      const account = base(), definition = course.definition(account);
      draws = 0; roll = variant.roll;
      account.credits = variant.credits;
      if (variant.overpaid !== undefined) setInvestment(account, definition, definition.cost + variant.overpaid);
      else if (variant.invested !== undefined) setInvestment(account, definition, variant.invested);
      traces.push({
        name: course.name + '/' + variant.label, definition,
        legacy: MEMORY_UNLOCK_CFG.legacyGemBundles, requestedAmount: variant.amount, randomValue: roll,
        steps: [
          action(account, definition, 'invest', () => investUnlock(account, definition, variant.amount)),
          action(account, definition, 'apply', () => applyUnlock(account, definition)),
          action(account, definition, 'repeat-invest', () => investUnlock(account, definition, variant.amount)),
        ],
      });
    }
  }
  MEMORY_UNLOCK_CFG.legacyGemBundles = oldLegacy;
  draws = 0;
  roll = .375;
  const mastery = base();
  mastery.credits = 1000000;
  for (const definition of CLASSES) mastery.unlockedClasses.add(definition.id);
  reconcileClassBundleGems(mastery);
  const rungs = UNLOCK_CATALOG.filter(row => row.kind === 'classtier');
  for (const rung of rungs) for (const gate of rung.reqAnyOf ?? []) {
    if (gate.classLevel) mastery.ledger[classLevelLedgerKey(gate.classLevel.classId, gate.classLevel.level)] = 1;
  }
  const masterySteps = rungs.map(row => ({
    definition: row,
    partial: action(mastery, row, 'partial', () => investUnlock(mastery, row, Math.max(0, row.cost - 1))),
    finish: action(mastery, row, 'finish', () => applyUnlock(mastery, row)),
    repeat: action(mastery, row, 'repeat', () => applyUnlock(mastery, row)),
  }));
  const earned = UNLOCK_CATALOG.find(row => row.kind === 'class' && row.earned);
  assert(earned);
  const rejected = base();
  const earnedSteps = [
    action(rejected, earned, 'earned-invest', () => investUnlock(rejected, earned, 1000)),
    action(rejected, earned, 'earned-apply', () => applyUnlock(rejected, earned)),
  ];
  const output = { courses: courses.map(row => row.name), traces, masterySteps, earnedSteps };
  fs.writeFileSync(process.argv[2], JSON.stringify(output, encode) + '\n', { flag: 'wx' });
} finally {
  Math.random = oldRandom;
  MEMORY_UNLOCK_CFG.legacyGemBundles = oldLegacy;
}
