import fs from 'node:fs';
import assert from 'node:assert/strict';
import { makeAccount, serializeAccount, FEATURE, gemDropKey, type Account } from '../src/meta/account';
import { SKILLS } from '../src/data/skills';
import { SUPPORTS } from '../src/data/supports';
import { POWER_PROGRESSION, odysseyMilestoneKey } from '../src/data/powerProgression';
import { MEMORY_UNLOCK_CFG, MEMORY_UNLOCKS, type MemoryKind, type MemoryUnlockDef } from '../src/data/memoryUnlocks';
import {
  memoryCatalog, memoryKey, memoryUnlockDef, memoryDiscovered, memorySecondaryOwned,
  memoryProgressionOpen, memorySecondaryOpen, memoryCommissionReady, memoryUnlockCandidates,
  grantMemoryUnlock, awakenMemoryFromDrop, memoryAccessView,
} from '../src/meta/memoryUnlocks';

const encode = (_key: string, value: unknown): unknown =>
  typeof value === 'number' && !Number.isFinite(value) ? { number: String(value) } : value;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value, encode));
const snapshot = (account: Account) => copy(serializeAccount(account));
const originalConfig = structuredClone(MEMORY_UNLOCK_CFG);
const catalog = [
  ...Object.values(SKILLS).filter(row => !row.noDrop && (row.dropWeight ?? 100) > 0)
    .map(row => ({ kind: 'skill' as const, id: row.id, name: row.name, weight: row.dropWeight ?? 100 })),
  ...Object.values(SUPPORTS).filter(row => row.weight > 0)
    .map(row => ({ kind: 'support' as const, id: row.id, name: row.name, weight: row.weight })),
];
const firstSkill = catalog.find(row => row.kind === 'skill')!;
const firstSupport = catalog.find(row => row.kind === 'support')!;
const noDrop = Object.values(SKILLS).find(row => row.noDrop)!;
assert(firstSkill && firstSupport && noDrop);
const mechanics = ['tree', 'commission', 'prestige'] as const;
const ids: [MemoryKind, string][] = [
  ...Object.keys(SKILLS).map(id => ['skill', id] as [MemoryKind, string]),
  ...Object.keys(SUPPORTS).map(id => ['support', id] as [MemoryKind, string]),
  ['skill', 'retired:skill'], ['support', 'retired:support'], ['skill', '__proto__'],
  ['skill', 'constructor'], ['skill', 'toString'],
];
function accountFor(profile: string): Account {
  const account = makeAccount();
  if (profile !== 'fresh') {
    account.unlockedSkills.add(firstSkill.id);
    account.unlockedSupports.add(firstSupport.id);
    account.ledger[gemDropKey(firstSkill.id)] = 3;
    account.ledger[gemDropKey(firstSupport.id)] = 3;
  }
  if (profile === 'stage-one') account.ledger[odysseyMilestoneKey(1)] = 1;
  if (profile === 'stage-two' || profile === 'debug-stage-two' || profile === 'discovered' || profile === 'awakened' || profile === 'legacy') {
    account.ledger[odysseyMilestoneKey(POWER_PROGRESSION.awakening.odysseyStage)] = 1;
  }
  if (profile === 'debug' || profile === 'debug-stage-two') account.features.add(FEATURE.UNLOCK_ALL_GEMS);
  if (profile === 'dormant' || profile === 'awakened') {
    account.memorySecondary.add(memoryKey('skill', firstSkill.id));
    account.memorySecondary.add(memoryKey('support', firstSupport.id));
  }
  if (profile === 'discovered' || profile === 'awakened') {
    for (const row of catalog) (row.kind === 'skill' ? account.unlockedSkills : account.unlockedSupports).add(row.id);
  }
  if (profile === 'awakened') for (const row of catalog) account.memorySecondary.add(memoryKey(row.kind, row.id));
  if (profile === 'legacy') {
    for (const key of ['skill:retired:skill', 'support:retired:support', 'skill:', 'retired:skill:fake']) account.memorySecondary.add(key);
  }
  return account;
}
const profiles = ['fresh', 'stage-one', 'dormant', 'stage-two', 'debug', 'debug-stage-two', 'discovered', 'awakened', 'legacy'];
const configurations = [
  { name: 'default', change: () => {} },
  { name: 'drop-weighted', change: () => { MEMORY_UNLOCK_CFG.weighting = 'drop'; } },
  { name: 'excluded', change: () => { MEMORY_UNLOCK_CFG.excluded = [memoryKey('skill', firstSkill.id), memoryKey('support', firstSupport.id)]; } },
  { name: 'weight-overrides', change: () => {
    MEMORY_UNLOCK_CFG.weightOverrides = Object.fromEntries(catalog.slice(0, 8).map((row, index) =>
      [memoryKey(row.kind, row.id), [-1, 0, .125, 2, NaN, Infinity, 1e-200, 1e200][index]]));
  } },
  { name: 'debug-bypass-disabled', change: () => { MEMORY_UNLOCK_CFG.debugCodexBypassesSecondary = false; } },
  { name: 'vault-disabled', change: () => { MEMORY_UNLOCK_CFG.secondary.vault = false; } },
  { name: 'legendary-disabled', change: () => { MEMORY_UNLOCK_CFG.secondary.legendaryFinds = false; } },
  { name: 'both-secondary-kinds', change: () => { MEMORY_UNLOCK_CFG.secondary.kinds = ['skill', 'support']; } },
  { name: 'support-secondary-only', change: () => { MEMORY_UNLOCK_CFG.secondary.kinds = ['support']; } },
  { name: 'no-secondary-kinds', change: () => { MEMORY_UNLOCK_CFG.secondary.kinds = []; } },
  { name: 'commission-ungated', change: () => { MEMORY_UNLOCK_CFG.secondary.mechanics.commission = false; } },
  { name: 'all-mechanics-ungated', change: () => {
    MEMORY_UNLOCK_CFG.secondary.mechanics = { tree: false, commission: false, prestige: false };
  } },
];
const observations: unknown[] = [];
const draws: unknown[] = [];
const drops: unknown[] = [];
const catalogBoundaries: unknown[] = [];
const callbackDraws: unknown[] = [];
function draw(name: string, account: Account, definition: MemoryUnlockDef, roll: number) {
  const before = snapshot(account);
  let randomDraws = 0;
  const receipt = grantMemoryUnlock(account, definition, () => { randomDraws++; return roll; });
  draws.push({ name, definition, roll, before, receipt, randomDraws, after: snapshot(account),
    storedIdentity: receipt ? account.memoryReceipts[definition.id] === receipt : null,
    ownReceipt: Object.hasOwn(account.memoryReceipts, definition.id),
    receiptPrototype: Object.getPrototypeOf(account.memoryReceipts) === Object.prototype ? 'Object.prototype' : copy(Object.getPrototypeOf(account.memoryReceipts)),
  });
}
try {
  for (const configuration of configurations) {
    Object.assign(MEMORY_UNLOCK_CFG, structuredClone(originalConfig));
    configuration.change();
    for (const profile of profiles) {
      const account = accountFor(profile), before = snapshot(account);
      observations.push({
        name: configuration.name + '/' + profile, config: copy(MEMORY_UNLOCK_CFG), before,
        catalog: memoryCatalog(), progression: memoryProgressionOpen(account), access: memoryAccessView(account),
        candidates: MEMORY_UNLOCKS.map(definition => ({ id: definition.id, pool: memoryUnlockCandidates(account, definition) })),
        entries: ids.map(([kind, id]) => ({
          kind, id, key: memoryKey(kind, id), discovered: memoryDiscovered(account, kind, id),
          secondaryOwned: memorySecondaryOwned(account, kind, id),
          access: mechanics.map(mechanic => memorySecondaryOpen(account, kind, id, mechanic)),
          commission: [0, 3, 4, NaN].map(need => memoryCommissionReady(account, kind, id, need)),
        })),
      });
      assert.deepEqual(snapshot(account), before, 'Query mutated ' + configuration.name + '/' + profile);
      for (const definition of MEMORY_UNLOCKS) {
        for (const roll of [0, .375, 1 - Number.EPSILON, -1, 1, NaN, Infinity]) {
          draw(configuration.name + '/' + profile + '/' + definition.id + '/' + roll, accountFor(profile), definition, roll);
        }
      }
    }
    for (const id of [firstSkill.id, noDrop.id, 'retired:skill', '__proto__', 'constructor', 'toString']) {
      for (const rarity of [undefined, 'rare', 'legendary']) {
        const account = accountFor('fresh'), before = snapshot(account);
        const first = awakenMemoryFromDrop(account, id, rarity), after = snapshot(account);
        const repeat = awakenMemoryFromDrop(account, id, rarity);
        drops.push({ name: configuration.name + '/' + id + '/' + rarity, before, first, after, repeat,
          afterRepeat: snapshot(account), access: memoryAccessView(account) });
      }
    }
  }
  Object.assign(MEMORY_UNLOCK_CFG, structuredClone(originalConfig));
  for (const definition of MEMORY_UNLOCKS) {
    const account = accountFor('stage-two'), pool = memoryUnlockCandidates(account, definition);
    const total = pool.reduce((sum, row) => sum + row.weight, 0);
    let sum = 0;
    for (let index = 0; index < pool.length; index++) {
      const middle = (sum + pool[index].weight / 2) / total;
      draw('each-candidate/' + definition.id + '/' + index, accountFor('stage-two'), definition, middle);
      sum += pool[index].weight;
      if (index < 3 || index === pool.length - 2) {
        for (const roll of [Math.max(0, sum / total - Number.EPSILON), sum / total, Math.min(1 - Number.EPSILON, sum / total + Number.EPSILON)]) {
          draw('weight-boundary/' + definition.id + '/' + index + '/' + roll, accountFor('stage-two'), definition, roll);
        }
      }
    }
  }
  for (const id of ['custom-discovery', '__proto__', 'constructor', 'toString']) {
    for (const sequence of [undefined, 0, 7, Number.MAX_SAFE_INTEGER, NaN]) {
      const account = accountFor('stage-two');
      if (sequence !== undefined) Object.defineProperty(account.memoryReceipts, id, {
        value: { sequence, kind: 'skill', id: firstSkill.id, tier: 'discovery' },
        writable: true, enumerable: true, configurable: true,
      });
      const definition: MemoryUnlockDef = { ...MEMORY_UNLOCKS[0], id };
      draw('receipt-id/' + id + '/' + sequence, account, definition, .375);
      draw('receipt-id-retry/' + id + '/' + sequence, account, definition, .375);
    }
  }
  for (const weights of [
    { skill: 0, support: 0 }, { skill: -1, support: 2 }, { skill: NaN, support: 1 },
    { skill: Infinity, support: 1 }, { skill: 1e308, support: 1e308 },
  ]) {
    const definition: MemoryUnlockDef = { ...MEMORY_UNLOCKS[0], weights };
    for (const roll of [0, .5, 1 - Number.EPSILON]) draw('custom-weights/' + JSON.stringify(weights, encode) + '/' + roll, accountFor('fresh'), definition, roll);
  }
  const skillId = 'observer_memory_skill', supportId = 'observer_memory_support';
  assert(!Object.hasOwn(SKILLS, skillId) && !Object.hasOwn(SUPPORTS, supportId));
  try {
    for (const weight of [-1, 0, 1, NaN, Infinity]) {
      SKILLS[skillId] = { ...SKILLS[firstSkill.id], id: skillId, name: 'Observer skill', dropWeight: weight, noDrop: false };
      SUPPORTS[supportId] = { ...SUPPORTS[firstSupport.id], id: supportId, name: 'Observer support', weight };
      catalogBoundaries.push({ weight, catalog: memoryCatalog(),
        candidates: MEMORY_UNLOCKS.map(definition => memoryUnlockCandidates(accountFor('stage-two'), definition)) });
    }
  } finally {
    delete SKILLS[skillId];
    delete SUPPORTS[supportId];
  }
  for (const mode of ['throw', 'change-account', 'change-policy', 'nested-grant']) {
    const account = accountFor('stage-two'), before = snapshot(account), definition = MEMORY_UNLOCKS[0];
    let randomDraws = 0;
    const nested: unknown[] = [];
    let receipt: unknown, error: unknown;
    try {
      receipt = grantMemoryUnlock(account, definition, () => {
        randomDraws++;
        if (mode === 'throw') throw new Error('observer random failure');
        if (mode === 'change-account') for (const row of catalog) (row.kind === 'skill' ? account.unlockedSkills : account.unlockedSupports).add(row.id);
        if (mode === 'change-policy') MEMORY_UNLOCK_CFG.excluded = catalog.map(row => memoryKey(row.kind, row.id));
        if (mode === 'nested-grant') nested.push(grantMemoryUnlock(account, definition, () => .375));
        return .375;
      });
    } catch (caught) {
      error = caught instanceof Error ? { name: caught.name, message: caught.message } : String(caught);
    } finally {
      Object.assign(MEMORY_UNLOCK_CFG, structuredClone(originalConfig));
    }
    callbackDraws.push({ mode, before, receipt, error, randomDraws, nested, after: snapshot(account) });
  }
} finally {
  Object.assign(MEMORY_UNLOCK_CFG, structuredClone(originalConfig));
}
const output = {
  config: originalConfig, definitions: MEMORY_UNLOCKS, power: POWER_PROGRESSION,
  skillRows: Object.values(SKILLS).map(row => ({ id: row.id, name: row.name, noDrop: row.noDrop, dropWeight: row.dropWeight })),
  supportRows: Object.values(SUPPORTS).map(row => ({ id: row.id, name: row.name, weight: row.weight })),
  lookup: MEMORY_UNLOCKS.map(row => ({ id: row.id, borrowed: memoryUnlockDef(row.id) === row })),
  unknownLookup: ['missing', '__proto__', 'constructor'].map(id => ({ id, value: memoryUnlockDef(id) ?? null })),
  observations, draws, drops, catalogBoundaries, callbackDraws,
};
fs.writeFileSync(process.argv[2], JSON.stringify(output, encode) + '\n', { flag: 'wx' });
