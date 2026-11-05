import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  makeAccount, serializeAccount, FEATURE, STARTER_CLASSES, reachedLevelKey,
  classLevelLedgerKey, vocationUnlockKey, questDoneKey, type Account,
} from '../src/meta/account';
import { CLASSES } from '../src/data/classes';
import { SKILLS } from '../src/data/skills';
import { SUPPORTS } from '../src/data/supports';
import { BRANDT_CFG } from '../src/data/brandt';
import { CLASS_WEB_CFG } from '../src/data/classTiers';
import { MEMORY_UNLOCK_CFG } from '../src/data/memoryUnlocks';
import {
  UNLOCK_CATALOG, allUnlockables, availableUnlocks, sealedUnlocks, sealedGateLines,
  isUnlockOwned, isUnlockVisible, unlockCompleted, investedToward, remainingCost,
  classUnlockProgress, classRumorRead, shroudedClassUnlocks, pendingClassUnlocks,
  classObjectiveNeeds, classObjectiveKeys, catalogLevelMilestones, catalogClassLevelMilestones,
  lockedPackages, vaultShelfCensus, vaultStripVisible, vaultSeatOf, vaultKindOrder,
  classUnlockFor, type Unlockable,
} from '../src/meta/unlocks';

const encode = (_key: string, value: unknown): unknown =>
  typeof value === 'number' && !Number.isFinite(value) ? { number: String(value) } : value;
const snapshot = (account: Account): unknown => JSON.parse(JSON.stringify(serializeAccount(account), encode));
const classes = CLASSES.map(row => row.id);
const skills = Object.keys(SKILLS), supports = Object.keys(SUPPORTS);
const definitions = allUnlockables();
const flags = [...new Set([
  ...Object.values(FEATURE), BRANDT_CFG.rareWares.flag,
  ...UNLOCK_CATALOG.flatMap(row => row.kind === 'feature' ? [row.payload.flag] : []),
])];

function progressAccount(fraction: number): Account {
  const account = makeAccount();
  account.credits = 10000;
  account.level = Math.floor(100 * fraction);
  const counter = (key: string, value: number): void => {
    account.ledger[key] = Math.max(account.ledger[key] ?? 0, value);
  };
  for (const row of UNLOCK_CATALOG) {
    for (const key of row.reqLedger ? Array.isArray(row.reqLedger) ? row.reqLedger : [row.reqLedger] : []) {
      counter(key, fraction);
    }
    for (const [key, need] of Object.entries(row.reqLedgerCounts ?? {})) counter(key, need * fraction);
    for (const gate of row.reqAnyOf ?? []) {
      if (gate.ledger !== undefined) counter(gate.ledger, (gate.n ?? 1) * fraction);
      if (gate.ledgerPrefix !== undefined) counter(gate.ledgerPrefix + 'observed', (gate.n ?? 1) * fraction);
      if (gate.level !== undefined) counter(reachedLevelKey(Math.floor(gate.level * fraction)), 1);
      if (gate.classLevel !== undefined) {
        counter(classLevelLedgerKey(gate.classLevel.classId, Math.floor(gate.classLevel.level * fraction)), 1);
      }
      if (gate.quest !== undefined) counter(questDoneKey(gate.quest === true ? 'observed' : gate.quest), fraction);
      if (gate.vocation !== undefined) counter(vocationUnlockKey(gate.vocation === true ? 'observed' : gate.vocation), fraction);
    }
  }
  for (const id of classes.slice(0, Math.floor(classes.length * fraction))) account.unlockedClasses.add(id);
  if (fraction >= 1) {
    for (const id of flags) account.features.add(id);
    for (const row of UNLOCK_CATALOG) {
      if (row.kind === 'classtier') account.unlockedClassTiers.add(row.id);
      if (row.kind === 'slot') account.unlockedSlots.add(row.payload.slotCount);
    }
    for (const row of definitions) if (row.kind === 'package') {
      account.packageUnlocks.add(row.payload.packageId);
      if (row.payload.tierId) account.packageUnlocks.add(row.payload.tierId);
    }
  }
  return account;
}

const profiles: { name: string; account: Account; view?: Readonly<Record<string, number>>;
  legacyGemBundles?: boolean; showDebugCodex?: boolean; proseRevealFrac?: number }[] = [
  { name: 'fresh', account: makeAccount() },
];
for (const fraction of [0, .249, .25, .499, .5, .999, 1, 1.5]) {
  profiles.push({ name: 'progress-' + fraction, account: progressAccount(fraction) });
}
for (const level of [-1, 4, 5, 9, 10, 39, 40, 99, 100, NaN]) {
  const account = makeAccount();
  account.level = level;
  profiles.push({ name: 'account-level-' + level, account });
}
const pending = progressAccount(1);
pending.pendingClassUnlocks = new Set(classes.filter(id => !STARTER_CLASSES.includes(id)));
profiles.push({ name: 'pending-discoveries', account: pending });
const complete = progressAccount(1);
for (const id of skills) complete.unlockedSkills.add(id);
for (const id of supports) complete.unlockedSupports.add(id);
for (const id of skills) complete.memorySecondary.add('skill:' + id);
for (const id of supports) complete.memorySecondary.add('support:' + id);
complete.skillGraft = true;
profiles.push({ name: 'owned-gems-and-armed-graft', account: complete });
const fallen = progressAccount(1);
fallen.roster = [
  { charId: 'fallen', modeId: 'immortal', slot: 100, classId: 'warrior', name: 'Fallen', level: 20, stage: 1, savedAt: 123, fallen: { fee: 125, at: 122, level: 20 } },
  { charId: 'living', modeId: 'immortal', slot: 101, classId: 'rogue', name: 'Living', level: 10, stage: 0, savedAt: 124 },
];
profiles.push({ name: 'fallen-and-living-roster', account: fallen });
const invested = progressAccount(.5);
for (const row of UNLOCK_CATALOG) invested.invested[row.id] = row.cost / 2 + .75;
invested.reliquary.rank = 2;
invested.reliquary.invested = 8;
invested.reliquary.stash.pages = 2;
invested.reliquary.stash.invested = 5;
profiles.push({ name: 'partial-investments-and-ladders', account: invested });
profiles.push({ name: 'merged-live-view', account: makeAccount(), view: progressAccount(1).ledger });
const split = makeAccount();
const splitObjective = UNLOCK_CATALOG.find(row => row.kind === 'class' && row.payload.classId === 'necromancer')!.reqAnyOf![0];
assert(splitObjective.ledger);
split.ledger[splitObjective.ledger] = Math.ceil((splitObjective.n ?? 1) * CLASS_WEB_CFG.revealFrac);
profiles.push({ name: 'one-revealed-objective', account: split });
const mixedGems = progressAccount(1);
mixedGems.unlockedSkills.clear();
mixedGems.unlockedSupports.clear();
for (const row of UNLOCK_CATALOG) {
  if (row.kind === 'skill' && row.payload.skillIds.length) mixedGems.unlockedSkills.add(row.payload.skillIds[0]);
  if (row.kind === 'support' && row.payload.supportIds.length) mixedGems.unlockedSupports.add(row.payload.supportIds[0]);
}
profiles.push({ name: 'partly-owned-gem-bundles', account: mixedGems, legacyGemBundles: true });
profiles.push({ name: 'hidden-debug-codex', account: progressAccount(1), showDebugCodex: false });
profiles.push({ name: 'immediate-prose-reveal', account: makeAccount(), proseRevealFrac: 0 });
for (const need of new Set(UNLOCK_CATALOG.flatMap(row => row.reqClasses === undefined ? [] : [row.reqClasses]))) {
  const account = progressAccount(1);
  account.unlockedClasses = new Set(classes.slice(0, need));
  profiles.push({ name: 'active-class-count-' + need, account });
  const pendingAccount = progressAccount(1);
  pendingAccount.unlockedClasses = new Set(classes.slice(0, need));
  pendingAccount.pendingClassUnlocks.add(classes[need - 1]);
  profiles.push({ name: 'pending-class-count-' + need, account: pendingAccount });
}

function entry(account: Account, row: Unlockable, view?: Readonly<Record<string, number>>) {
  return {
    id: row.id, kind: row.kind, cost: row.cost,
    owned: isUnlockOwned(account, row), visible: isUnlockVisible(account, row),
    completed: unlockCompleted(account, row), invested: investedToward(account, row),
    remaining: remainingCost(account, row), lines: sealedGateLines(account, row),
    progress: classUnlockProgress(account, row, view),
    rumor: row.kind === 'class' ? classRumorRead(account, row) : undefined,
  };
}
const observations = profiles.map(({ name, account, view, legacyGemBundles, showDebugCodex, proseRevealFrac }) => {
  const previous = { legacyGemBundles: MEMORY_UNLOCK_CFG.legacyGemBundles,
    showDebugCodex: MEMORY_UNLOCK_CFG.showDebugCodex, proseRevealFrac: CLASS_WEB_CFG.proseRevealFrac };
  if (legacyGemBundles !== undefined) MEMORY_UNLOCK_CFG.legacyGemBundles = legacyGemBundles;
  if (showDebugCodex !== undefined) MEMORY_UNLOCK_CFG.showDebugCodex = showDebugCodex;
  if (proseRevealFrac !== undefined) CLASS_WEB_CFG.proseRevealFrac = proseRevealFrac;
  try {
  const before = snapshot(account);
  const staticRows = UNLOCK_CATALOG.map(row => entry(account, row, view));
  const dynamicRows = allUnlockables(account).filter(row => !UNLOCK_CATALOG.includes(row)).map(row => entry(account, row, view));
  const output = {
    name, before, view, legacyGemBundles, showDebugCodex, proseRevealFrac, staticRows, dynamicRows,
    available: availableUnlocks(account).map(row => row.id),
    sealed: sealedUnlocks(account).map(({ u, lines }) => ({ id: u.id, lines })),
    shrouded: shroudedClassUnlocks(account).map(row => row.id),
    pending: pendingClassUnlocks(account).map(row => row.id),
    packages: lockedPackages(account),
    shelves: vaultShelfCensus(account),
    strip: vaultStripVisible(account),
  };
  assert.deepEqual(snapshot(account), before, name + ' query mutated account');
  return output;
  } finally {
    MEMORY_UNLOCK_CFG.legacyGemBundles = previous.legacyGemBundles;
    MEMORY_UNLOCK_CFG.showDebugCodex = previous.showDebugCodex;
    CLASS_WEB_CFG.proseRevealFrac = previous.proseRevealFrac;
  }
});
const milestones = classes.concat(['retired', '__proto__', 'a.b']).map(id => {
  const first = catalogClassLevelMilestones(id);
  return { id, levels: first, reused: first === catalogClassLevelMilestones(id) };
});
const firstLevels = catalogLevelMilestones();
const kinds: Unlockable['kind'][] = ['power', 'storage', 'slot', 'class', 'classtier', 'skill', 'support', 'memory', 'feature', 'package', 'graft', 'resurrect'];
const output = {
  definitions: UNLOCK_CATALOG, packageRows: definitions.filter(row => row.kind === 'package'), flags,
  reveal: { ...CLASS_WEB_CFG }, observations,
  objectives: classObjectiveNeeds(), objectiveKeys: classObjectiveKeys(),
  milestones, levels: firstLevels, reusedLevels: firstLevels === catalogLevelMilestones(),
  kindOrder: vaultKindOrder(), seats: kinds.map(kind => ({ kind, seat: vaultSeatOf(kind) })),
  classLookup: classes.concat(['retired', '__proto__']).map(id => {
    const row = classUnlockFor(id);
    return { id, unlock: row?.id ?? null, borrowed: row ? UNLOCK_CATALOG.includes(row) : null };
  }),
};
fs.writeFileSync(process.argv[2], JSON.stringify(output, encode) + '\n', { flag: 'wx' });
