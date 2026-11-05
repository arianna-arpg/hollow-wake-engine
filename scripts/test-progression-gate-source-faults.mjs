import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { root, sha256, writeJSON, verifyReference } from './reference-utils.mjs';
import { prepareVocationObserver, captureVocationObserver } from './vocation-reference.mjs';
const read = file => JSON.parse(fs.readFileSync(file)), accepted = read('baseline/progression-gates/acceptance.json'), baseline = accepted.fixtures.gates, reference = path.join(root, '.reference'), lock = read('baseline/source-lock.json');
assert(baseline.capturedBeforeImplementation);
verifyReference(reference, lock);
const directory = fs.mkdtempSync(path.join(root, '.artifacts/progression-gate-source-faults-')), game = path.join(directory, 'game');
fs.cpSync(path.join(reference, 'src'), path.join(game, 'src'), { recursive: true });
fs.copyFileSync(path.join(reference, 'package.json'), path.join(game, 'package.json'));
fs.symlinkSync(path.join(reference, 'node_modules'), path.join(game, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const helper = baseline.helper;
assert.equal(sha256(fs.readFileSync(helper)), baseline.helperSha256);
const entry = prepareVocationObserver('gates', game, directory, { gates: { helper, helperSha256: baseline.helperSha256 } });
const target = path.join(game, 'src/meta/gates.ts'), bytes = fs.readFileSync(target), source = bytes.toString().replaceAll('\r\n', '\n'), ast = ts.createSourceFile('gates.ts', source, ts.ScriptTarget.Latest, true);
const faults = [
    ['prefix-match', 'ledgerPrefixHeld', 'k.startsWith(prefix)', 'k.endsWith(prefix)'],
    ['prefix-threshold', 'ledgerPrefixHeld', '>= n', '> n'],
    ['zero-threshold', 'gateRowMet', 'row.n ?? 1', 'row.n || 1'],
    ['ledger-threshold', 'gateRowMet', '(a.ledger[row.ledger] ?? 0) >= n', '(a.ledger[row.ledger] ?? 0) > n'],
    ['ownership-callback', 'gateRowMet', 'return ownedUnlock(row.unlock);', 'return false;'],
    ['feature-membership', 'gateRowMet', 'return a.features.has(row.feature);', 'return false;'],
    ['level-presence', 'gateRowMet', '(a.ledger[reachedLevelKey(row.level)] ?? 0) >= 1', '(a.ledger[reachedLevelKey(row.level)] ?? 0) >= 2'],
    ['class-level-namespace', 'gateRowMet', 'classLevelLedgerKey(row.classLevel.classId, row.classLevel.level)', 'reachedLevelKey(row.classLevel.level)'],
    ['vocation-namespace', 'gateRowMet', 'ledgerPrefixHeld(a, LEDGER_VOCATION_PREFIX)', 'ledgerPrefixHeld(a, LEDGER_QUEST_DONE_PREFIX)'],
    ['legacy-quest-counter', 'gateRowMet', '|| (a.ledger[LEDGER_QUESTS_COMPLETED] ?? 0) >= 1', '|| false'],
    ['quest-identity', 'gateRowMet', 'questDoneKey(row.quest)', "questDoneKey('other')"],
    ['empty-row', 'gateRowMet', 'return true; // an empty row gates nothing', 'return false; // deliberate fault'],
    ['precedence', 'gateRowMet', 'const n = row.n ?? 1;', 'const n = row.n ?? 1; if (row.level !== undefined) return (a.ledger[reachedLevelKey(row.level)] ?? 0) >= 1;'],
    ['label-override', 'gateRowLabel', 'if (row.label) return row.label;', ''],
    ['retired-class-label', 'gateRowLabel', 'cls?.name ?? row.classLevel.classId', "cls?.name ?? ''"],
    ['single-count-label', 'gateRowLabel', 'n > 1', 'n >= 1'],
    ['empty-gate', 'gateMet', 'if (!rows || rows.length === 0) return true;', 'if (!rows || rows.length === 0) return false;'],
    ['any-composition', 'gateMet', 'rows.some', 'rows.every'],
    ['all-composition', 'gateMet', 'rows.every', 'rows.some'],
    ['zero-level-derivation', 'gateLevelNeeds', "typeof n === 'number'", "typeof n === 'number' && n > 0"],
    ['class-level-alias', 'gateClassLevelNeeds', '.map(r => r.classLevel)', '.map(r => r.classLevel ? {...r.classLevel} : undefined)'],
    ['stamp-presence', 'highestStampedLevel', '(a.ledger[k] ?? 0) < 1', '(a.ledger[k] ?? 0) <= 1'],
    ['stamp-upper-bound', 'highestStampedLevel', 'n <= level', 'true'],
    ['fractional-stamp', 'highestStampedLevel', 'Number.isInteger(n)', 'Number.isFinite(n)'],
    ['stamp-parser', 'highestStampedLevel', 'Number(k.slice(prefix.length))', 'parseInt(k.slice(prefix.length),10)'],
    ['held-progress', 'gateRowProgress', 'if (gateRowMet(a, row, ownedUnlock)) return 1;', 'if (gateRowMet(a, row, ownedUnlock)) return 0;'],
    ['progress-denominator', 'gateRowProgress', 'Math.max(1, row.n ?? 1)', 'Math.max(2, row.n ?? 1)'],
    ['prefix-progress', 'gateRowProgress', 'best = Math.max(best, (a.ledger[k] ?? 0) / n)', 'best += (a.ledger[k] ?? 0) / n'],
    ['negative-progress', 'gateRowProgress', 'Math.max(0, Math.min(1, v))', 'Math.min(1, v)'],
    ['binary-progress', 'gateRowProgress', 'return 0; // unlock / feature / vocation / quest', 'return .5; // deliberate fault'],
    ['class-progress-namespace', 'gateRowProgress', 'classLevelLedgerKey(row.classLevel.classId, 0)', "classLevelLedgerKey('__retired', 0)"]
];
assert.deepEqual(faults.map(row => row[0]), baseline.faults.map(row => row.name));
const expectedFaults = new Map(baseline.faults.map(row => [row.name, row.sha256]));
const results = [];
let passed = false;
const capture = label => captureVocationObserver(entry, directory, label);
try {
    assert.equal(capture('positive').sha256, baseline.sha256);
    for (const [name, method, needle, replacement] of faults) {
        const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === method);
        assert(node, method);
        const text = node.getText(ast);
        assert.equal(sha256(text), baseline.methods['meta/gates.ts#' + method]);
        assert.equal(text.split(needle).length, 2, name);
        fs.writeFileSync(target, source.slice(0, node.getStart(ast)) + text.replace(needle, replacement) + source.slice(node.end));
        try {
            const result = capture(name);
            assert.notEqual(result.sha256, baseline.sha256, name + ' survived');
            assert.equal(result.sha256, expectedFaults.get(name), name);
            results.push({ name, method, sha256: result.sha256 });
        }
        finally {
            fs.writeFileSync(target, bytes);
        }
        writeJSON(path.join(directory, 'progress.json'), { results });
    }
    assert.equal(capture('restored').sha256, baseline.sha256);
    passed = true;
}
finally {
    assert(fs.readFileSync(target).equals(bytes));
    verifyReference(reference, lock);
    const report = { passed, directory, baselineSha256: baseline.sha256, helperSha256: baseline.helperSha256, results };
    writeJSON(path.join(directory, 'verification.json'), report);
    writeJSON('.artifacts/progression-gate-faults-latest.json', report);
    console.log({ passed, directory, faults: results.length });
}
