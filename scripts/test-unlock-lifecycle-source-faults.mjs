import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { root, sha256, verifyReference, writeJSON } from './reference-utils.mjs';
import { prepareVocationObserver, captureVocationObserver } from './vocation-reference.mjs';

const accepted = JSON.parse(fs.readFileSync('baseline/unlock-lifecycle/acceptance.json'));
const reference = path.join(root, '.reference');
const lockBytes = fs.readFileSync('baseline/source-lock.json');
assert.equal(sha256(lockBytes), accepted.sourceLockSha256);
const lock = JSON.parse(lockBytes);
verifyReference(reference, lock);
const directory = fs.mkdtempSync(path.join(root, '.artifacts/unlock-lifecycle-source-faults-'));
const game = path.join(directory, 'game');
fs.cpSync(path.join(reference, 'src'), path.join(game, 'src'), { recursive: true });
fs.copyFileSync(path.join(reference, 'package.json'), path.join(game, 'package.json'));
fs.symlinkSync(path.join(reference, 'node_modules'), path.join(game, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');

const unlockFaults = [
 ['class-lookup','policy','classUnlockFor','CATALOG_BY_ID.get(classBundleId(classId))',"CATALOG_BY_ID.get('__missing')"],
 ['shroud-ownership','policy','shroudedClassUnlocks','!isUnlockOwned(a, u)','isUnlockOwned(a, u)'],
 ['merged-view','policy','classUnlockProgress','view ? { ...a, ledger: view } : a','a'],
 ['reveal-boundary','policy','classUnlockProgress','frac >= CLASS_WEB_CFG.revealFrac','frac > CLASS_WEB_CFG.revealFrac'],
 ['best-avenue','policy','classUnlockProgress','Math.max(m, r.frac)','Math.min(m, r.frac)'],
 ['hidden-label','policy','classRumorRead','r.revealed ? r.label : encipher(r.label)','r.label'],
 ['hint-all-objectives','policy','classRumorRead','read.rows.every(r => r.revealed)','read.rows.some(r => r.revealed)'],
 ['objective-maximum','policy','classObjectiveNeeds','Math.max(needs[r.ledger] ?? 0, r.n ?? 1)','Math.min(needs[r.ledger] ?? 0, r.n ?? 1)'],
 ['milestone-order','policy','catalogClassLevelMilestones','sort((x, y) => x - y)','sort((x, y) => y - x)'],
 ['power-ownership','policy','isUnlockOwned','a.reliquary.rank >= u.payload.rank','a.reliquary.rank > u.payload.rank'],
 ['pending-discovery-owned','policy','isUnlockOwned','a.unlockedClasses.has(u.payload.classId)','a.unlockedClasses.has(u.payload.classId) && !a.pendingClassUnlocks.has(u.payload.classId)'],
 ['skill-bundle-all','policy','isUnlockOwned','u.payload.skillIds.every','u.payload.skillIds.some'],
 ['support-bundle-all','policy','isUnlockOwned','u.payload.supportIds.every','u.payload.supportIds.some'],
 ['legacy-hidden','policy','isUnlockVisible',"if (!MEMORY_UNLOCK_CFG.legacyGemBundles && (u.kind === 'skill' || u.kind === 'support')) return false;",''],
 ['debug-hidden','policy','isUnlockVisible',"if (u.id === 'feat_unlock_all_gems' && !MEMORY_UNLOCK_CFG.showDebugCodex) return false;",''],
 ['empty-memory-pool','policy','isUnlockVisible','memoryUnlockCandidates(a, def).length > 0','memoryUnlockCandidates(a, def).length >= 0'],
 ['armed-graft','policy','isUnlockVisible',"if (u.kind === 'graft' && a.skillGraft) return false;","if (u.kind === 'graft' && a.skillGraft) return true;"],
 ['stale-resurrection','transactions','isUnlockVisible','return !!a.roster.find(r => r.charId === u.payload.charId)?.fallen;','return true;'],
 ['account-level-boundary','policy','staticGateMet','(u.reqLevel ?? 0) > a.level','(u.reqLevel ?? 0) >= a.level'],
 ['ledger-presence-boundary','policy','staticGateMet','(a.ledger[k] ?? 0) < 1','(a.ledger[k] ?? 0) <= 1'],
 ['ledger-count-boundary','policy','staticGateMet','(a.ledger[k] ?? 0) < n','(a.ledger[k] ?? 0) <= n'],
 ['active-class-pool','policy','staticGateMet','unlockedClassCount(a) < u.reqClasses','unlockedClassCount(a) <= u.reqClasses'],
 ['static-parent-ownership','policy','staticGateMet','!isUnlockOwned(a, dep)','isUnlockOwned(a, dep)'],
 ['structural-parent-ownership','policy','structuralPrereqsMet','!isUnlockOwned(a, dep)','isUnlockOwned(a, dep)'],
 ['sealed-includes-owned','policy','sealedUnlocks','!isUnlockOwned(a, u) && ',''],
 ['earned-is-stock','policy','availableUnlocks','!u.earned && ',''],
 ['memory-sequence','transactions','unlockCompleted','> memorySequence','>= memorySequence'],
 ['graft-completion','transactions','unlockCompleted',"if (u.kind === 'graft') return a.skillGraft;","if (u.kind === 'graft') return false;"],
 ['resurrection-completion','transactions','unlockCompleted','return !a.roster.find(r => r.charId === u.payload.charId)?.fallen;','return !!a.roster.find(r => r.charId === u.payload.charId)?.fallen;'],
 ['investment-remainder','transactions','remainingCost','u.cost - investedToward(a, u)','u.cost'],
 ['memory-finite-amount','transactions','investUnlock','!def || !Number.isFinite(amount)','!def'],
 ['ordinary-fractional-amount','transactions','investUnlock','Math.floor(amount)','amount',2],
];
const memoryFaults = [
 ['catalog-no-drop','memoryCatalog','!s.noDrop && ',''],
 ['catalog-support-weight','memoryCatalog','s.weight > 0','s.weight >= 0'],
 ['catalog-exclusion','memoryCatalog','!MEMORY_UNLOCK_CFG.excluded.includes','MEMORY_UNLOCK_CFG.excluded.includes'],
 ['skill-discovery','memoryDiscovered','isSkillUnlockedForDrop(a, id)','false'],
 ['support-discovery','memoryDiscovered','isSupportUnlockedForDrop(a, id)','false'],
 ['dormant-secondary','memorySecondaryOwned','memoryProgressionOpen(a) && ',''],
 ['secondary-debug-bypass','memorySecondaryOwned','MEMORY_UNLOCK_CFG.debugCodexBypassesSecondary && ',''],
 ['progression-milestone','memoryProgressionOpen',"'awakening'","'vocations'"],
 ['progression-debug-bypass','memoryProgressionOpen','MEMORY_UNLOCK_CFG.debugCodexBypassesSecondary && ',''],
 ['secondary-progression','memorySecondaryOpen','if (MEMORY_UNLOCK_CFG.secondary.mechanics[mechanic] && !memoryProgressionOpen(a)) return false;',''],
 ['secondary-kinds','memorySecondaryOpen','!MEMORY_UNLOCK_CFG.secondary.kinds.includes(kind)','MEMORY_UNLOCK_CFG.secondary.kinds.includes(kind)'],
 ['secondary-mechanic','memorySecondaryOpen','return !MEMORY_UNLOCK_CFG.secondary.mechanics[mechanic]','return MEMORY_UNLOCK_CFG.secondary.mechanics[mechanic]'],
 ['commission-discovery','memoryCommissionReady',' || !memoryDiscovered(a, kind, id)',''],
 ['commission-progression','memoryCommissionReady','!memoryProgressionOpen(a) || ',''],
 ['commission-count','memoryCommissionReady','>= need','> need'],
 ['commission-mechanic','memoryCommissionReady','MEMORY_UNLOCK_CFG.secondary.mechanics.commission && ',''],
 ['secondary-vault','memoryUnlockCandidates','!MEMORY_UNLOCK_CFG.secondary.vault || ',''],
 ['secondary-eligibility','memoryUnlockCandidates',' && !memorySecondaryOwned(a, c.kind, c.id)',''],
 ['pool-drop-weighting','memoryUnlockCandidates',"MEMORY_UNLOCK_CFG.weighting === 'drop'","MEMORY_UNLOCK_CFG.weighting !== 'drop'"],
 ['pool-overrides','memoryUnlockCandidates','(MEMORY_UNLOCK_CFG.weightOverrides[memoryKey(c.kind, c.id)] ?? 1)','1'],
 ['pool-positive','memoryUnlockCandidates','c.weight > 0','c.weight >= 0'],
 ['pool-finite','memoryUnlockCandidates','Number.isFinite(c.weight) && ',''],
 ['draw-lower-bound','grantMemoryUnlock','roll < 0','roll < -1'],
 ['draw-upper-bound','grantMemoryUnlock','roll >= 1','roll > 1'],
 ['draw-finite','grantMemoryUnlock','!Number.isFinite(roll) || ',''],
 ['draw-weight-boundary','grantMemoryUnlock','return cursor < 0','return cursor <= 0'],
 ['draw-skill-grant','grantMemoryUnlock',"(picked.kind === 'skill' ? a.unlockedSkills : a.unlockedSupports).add(picked.id);",''],
 ['draw-explicit-skill','grantMemoryUnlock',"if (picked.kind === 'skill') a.explicitSkillUnlocks.add(picked.id);",''],
 ['draw-secondary-grant','grantMemoryUnlock','a.memorySecondary.add(memoryKey(picked.kind, picked.id))','a.memorySecondary.add(picked.id)'],
 ['receipt-sequence','grantMemoryUnlock','?.sequence ?? 0) + 1','?.sequence ?? 0) + 2'],
 ['receipt-storage','grantMemoryUnlock','a.memoryReceipts[def.id] = receipt;',''],
 ['drop-legendary-switch','awakenMemoryFromDrop','!MEMORY_UNLOCK_CFG.secondary.legendaryFinds || ',''],
 ['drop-kind','awakenMemoryFromDrop',"!MEMORY_UNLOCK_CFG.secondary.kinds.includes('skill')",'false'],
 ['drop-rarity','awakenMemoryFromDrop',"rarity !== 'legendary'","rarity === 'legendary'"],
 ['drop-no-drop','awakenMemoryFromDrop',' || SKILLS[id].noDrop',''],
 ['drop-deduplication','awakenMemoryFromDrop','if (a.memorySecondary.has(key)) return false;',''],
 ['drop-discovery','awakenMemoryFromDrop','a.unlockedSkills.add(id);',''],
 ['access-kind','memoryAccessView',"!MEMORY_UNLOCK_CFG.secondary.kinds.includes('skill')","MEMORY_UNLOCK_CFG.secondary.kinds.includes('skill')"],
 ['access-progression','memoryAccessView','? null : memoryProgressionOpen(a)','? null : true'],
 ['access-secondary-kind','memoryAccessView',"k.startsWith('skill:')","k.startsWith('support:')"],
];
const faults = [...unlockFaults, ...memoryFaults.map(([name, method, needle, replacement]) =>
  [name, 'memory', method, needle, replacement])];
const entries = {};
const sources = new Map();
for (const [name, fixture] of Object.entries(accepted.fixtures)) {
  assert(fixture.capturedBeforeImplementation);
  entries[name] = prepareVocationObserver(name, game, directory, accepted.fixtures);
  assert.deepEqual(faults.filter(row => row[1] === name).map(row => row[0]), fixture.faults.map(row => row.name));
}
for (const relative of ['meta/unlocks.ts', 'meta/memoryUnlocks.ts']) {
  const file = path.join(game, 'src', relative), bytes = fs.readFileSync(file);
  const source = bytes.toString().replaceAll('\r\n', '\n');
  sources.set(relative, { file, bytes, source, ast: ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true) });
}
const results = [];
let passed = false;
try {
  for (const [name, entry] of Object.entries(entries)) {
    assert.equal(captureVocationObserver(entry, directory, name + '-control').sha256, accepted.fixtures[name].sha256);
  }
  for (const [name, fixtureName, method, needle, replacement, count = 1] of faults) {
    const fixture = accepted.fixtures[fixtureName];
    const relative = fixtureName === 'memory' ? 'meta/memoryUnlocks.ts' : 'meta/unlocks.ts';
    const { file, bytes, source, ast } = sources.get(relative);
    const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === method);
    assert(node, method);
    const body = node.getText(ast);
    const digest = fixture.methods[relative + '#' + method] ?? accepted.fixtures.policy.methods[relative + '#' + method];
    assert.equal(sha256(body), digest, method);
    assert.equal(body.split(needle).length - 1, count, name + ' selector');
    fs.writeFileSync(file, source.slice(0, node.getStart(ast)) + body.replaceAll(needle, replacement) + source.slice(node.end));
    try {
      const result = captureVocationObserver(entries[fixtureName], directory, name);
      assert.notEqual(result.sha256, fixture.sha256, name + ' survived');
      assert.equal(result.sha256, fixture.faults.find(row => row.name === name).sha256, name);
      results.push({ name, fixture: fixtureName, method, sha256: result.sha256 });
    } finally {
      fs.writeFileSync(file, bytes);
    }
    writeJSON(path.join(directory, 'progress.json'), { results });
  }
  for (const [name, entry] of Object.entries(entries)) {
    assert.equal(captureVocationObserver(entry, directory, name + '-restored').sha256, accepted.fixtures[name].sha256);
  }
  passed = true;
} finally {
  for (const { file, bytes } of sources.values()) assert(fs.readFileSync(file).equals(bytes));
  verifyReference(reference, lock);
  const report = { passed, directory, results, accepted: 'baseline/unlock-lifecycle/acceptance.json' };
  writeJSON(path.join(directory, 'verification.json'), report);
  writeJSON('.artifacts/unlock-lifecycle-source-faults-latest.json', report);
  console.log({ passed, directory, detected: results.length });
}
