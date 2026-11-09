import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {root, verifyReference, sha256} from './reference-utils.mjs';

const reference = path.join(root, '.reference');
const lockBytes = fs.readFileSync(path.join(root, 'baseline/source-lock.json')), lock = JSON.parse(lockBytes);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'baseline/equipment-catalogue/acceptance.json')));
const packed = fs.readFileSync(path.join(root, 'baseline/equipment-catalogue/observations.json.gz'));
assert.equal(sha256(packed), manifest.gzipSha256); assert.equal(sha256(lockBytes), manifest.sourceLockSha256);
const fixture = JSON.parse(gunzipSync(packed)), source = fs.readFileSync(path.join(root, manifest.source), 'utf8');
assert.equal(sha256(source), manifest.sourceSha256);
const find = predicate => { const index = fixture.rows.findIndex(predicate); assert(index >= 0); return index; };
const faults = [
  {name: 'omit-gear-source', index: 0, phase: 'sheet',
    body: "const setSource = a.sheet.setSource.bind(a.sheet); a.sheet.setSource = (name, mods) => setSource(name, name.startsWith('gear:') ? [] : mods);",
    field: row => row.equipped.stats.armor},
  {name: 'omit-current-resource-clamp', index: find(r => r.equipped.life < r.before.life), phase: 'recalc',
    body: 'const life = a.life, mana = a.mana; original(seat); a.life = life; a.mana = mana;',
    field: row => row.equipped.life},
  {name: 'omit-worn-supports', index: find(r => r.equipped.learned.grafts.length), phase: 'recalc',
    body: 'original(seat); for (const inst of seat.meta.knownSkills.values()) inst.grafts = undefined;',
    field: row => row.equipped.learned.grafts},
  {name: 'omit-class-skill-bonus', index: find(r => r.equipped.learned.bonusLevels > 0), phase: 'recalc',
    body: 'original(seat); for (const inst of seat.meta.knownSkills.values()) inst.bonusLevels = 0;',
    field: row => row.equipped.learned.bonusLevels},
  {name: 'omit-granted-skill-owner', index: find(r => r.equipped.granted.length), phase: 'recalc',
    body: 'original(seat); seat.grantedInsts = undefined;',
    field: row => row.equipped.granted},
  {name: 'replace-active-cast', index: 0, phase: 'recalc',
    body: 'original(seat); if (Object.keys(seat.meta.equipped).length && a.casting) a.casting = {...a.casting};',
    assertion: 'Rebuild replaced cast:'}
];
function replaceOnce(value, before, after) {
  assert.equal(value.split(before).length, 2, 'Observer source anchor changed'); return value.replace(before, after);
}
verifyReference(reference, lock);
const work = fs.mkdtempSync(path.join(root, '.artifacts/equipment-catalogue-observer-owned-'));
const scripts = [], results = [];
const report = {passed: false, fixtureSha256: manifest.gzipSha256, observerSha256: manifest.sourceSha256,
  scope: 'Six deliberate omissions at real original-game derivation ports; not complete source mutation or effect-execution coverage', results};
try {
  function run(fault, broken) {
    let code = replaceOnce(source, 'cases.slice(0, limit).entries()', `[[${fault.index}, cases[${fault.index}]]]`);
    if (broken) {
      const hook = fault.phase === 'sheet' ? fault.body : `const original = w.recalcSeat.bind(w); w.recalcSeat = seat => { ${fault.body} };`;
      code = replaceOnce(code, 'w.walk = null;', 'w.walk = null;\n    ' + hook);
    }
    const label = fault.name + (broken ? '-fault' : '-control');
    const script = path.join(reference, 'balance', `hwe-equipment-observer-${randomUUID()}.ts`);
    const output = path.join(work, label + '.json');
    fs.writeFileSync(script, code, {flag: 'wx'}); scripts.push(script);
    const child = spawnSync(process.execPath, ['--import', 'tsx', script, output],
      {cwd: reference, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 2 * 1024 * 1024});
    if (child.error) throw child.error;
    if (broken && fault.assertion) {
      assert.notEqual(child.status, 0); assert(child.stderr.includes(fault.assertion), child.stderr);
      return {assertion: fault.assertion};
    }
    assert.equal(child.status, 0, child.stderr);
    const data = JSON.parse(fs.readFileSync(output)); assert.equal(data.rows.length, 1);
    assert.deepEqual(data.rows[0].spec, fixture.rows[fault.index].spec);
    assert.deepEqual(data.rows[0].item, fixture.rows[fault.index].item);
    if (!broken) assert.deepEqual(data.rows[0], fixture.rows[fault.index], 'Selected unchanged control differs from complete baseline');
    else assert.notDeepEqual(fault.field(data.rows[0]), fault.field(fixture.rows[fault.index]), 'Fault did not reach its intended observation');
    return {observationSha256: sha256(JSON.stringify(data.rows[0]))};
  }
  for (const fault of faults) {
    const control = run(fault, false), broken = run(fault, true);
    results.push({name: fault.name, index: fault.index, originalCase: fixture.rows[fault.index].spec.id, control, detected: true, broken});
    console.log({name: fault.name, passed: true});
  }
  report.passed = true;
} finally {
  try { verifyReference(reference, lock); assert.equal(sha256(fs.readFileSync(path.join(root, manifest.source))), manifest.sourceSha256); report.inputsUnchanged = true; }
  finally {
    for (const script of scripts) fs.unlinkSync(script);
    const actual = fs.realpathSync(work), artifacts = fs.realpathSync(path.join(root, '.artifacts'));
    assert.equal(path.dirname(actual), artifacts); assert(path.basename(actual).startsWith('equipment-catalogue-observer-owned-'));
    fs.rmSync(actual, {recursive: true}); report.cleaned = !fs.existsSync(actual) && scripts.every(file => !fs.existsSync(file));
    fs.writeFileSync(path.join(root, '.artifacts/equipment-catalogue-observer.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
