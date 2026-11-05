import fs from 'node:fs';
import assert from 'node:assert/strict';
import { makeAccount, reachedLevelKey, classLevelLedgerKey, vocationUnlockKey, questDoneKey } from '../src/meta/account';
import { UNLOCK_CATALOG } from '../src/meta/unlocks';
import { gateMet, gateRowProgress, gateRowLabel } from '../src/meta/gates';

const definitions = UNLOCK_CATALOG.filter(row => row.reqAnyOf);
const observations: { name: string; calls: number; nanoseconds: number; state: number[] }[] = [];
for (const mode of ['empty', 'progress', 'large-ledger', 'complete'] as const) {
  const account = makeAccount();
  const owned = new Set<string>(), isOwned = (id: string) => owned.has(id);
  if (mode !== 'empty') {
    for (const definition of definitions) for (const row of definition.reqAnyOf!) {
      const complete = mode === 'complete';
      if (row.ledger !== undefined) account.ledger[row.ledger] = complete ? row.n ?? 1 : (row.n ?? 1) / 2;
      if (row.ledgerPrefix !== undefined) account.ledger[row.ledgerPrefix + 'sample'] = complete ? row.n ?? 1 : (row.n ?? 1) / 2;
      if (row.level !== undefined) account.ledger[reachedLevelKey(complete ? row.level : Math.floor(row.level / 2))] = 1;
      if (row.classLevel !== undefined) {
        const target = row.classLevel;
        account.ledger[classLevelLedgerKey(target.classId, complete ? target.level : Math.floor(target.level / 2))] = 1;
      }
      if (complete && row.feature !== undefined) account.features.add(row.feature);
      if (complete && row.unlock !== undefined) owned.add(row.unlock);
      if (complete && row.vocation !== undefined) account.ledger[vocationUnlockKey(row.vocation === true ? 'sample' : row.vocation)] = 1;
      if (complete && row.quest !== undefined) account.ledger[questDoneKey(row.quest === true ? 'sample' : row.quest)] = 1;
    }
  }
  if (mode === 'large-ledger') for (let i = 0; i < 512; i++) account.ledger['unrelated:' + i] = i;
  const query = (index: number): number => {
    const rows = definitions[index].reqAnyOf!;
    let value = Number(gateMet(account, rows, 'any', isOwned));
    for (const row of rows) {
      value += Math.round(1000 * gateRowProgress(account, row, isOwned));
      value += gateRowLabel(row).length;
    }
    return value;
  };
  const expected = definitions.map((_, index) => query(index));
  for (let i = 0; i < 10000; i++) query(i % definitions.length);
  const passes = 512, start = process.hrtime.bigint();
  let checksum = 0;
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < definitions.length; i++) checksum += query(i);
  }
  const nanoseconds = Number(process.hrtime.bigint() - start);
  assert.equal(checksum, passes * expected.reduce((sum, value) => sum + value, 0));
  observations.push({ name: mode + '-gate-view', calls: passes * definitions.length, nanoseconds, state: expected });
}
fs.writeFileSync(process.argv[2], JSON.stringify(observations) + '\n', { flag: 'wx' });
