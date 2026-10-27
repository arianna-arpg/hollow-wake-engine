import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root, listFiles, sha256, verifyReference, writeJSON} from './reference-utils.mjs';
import {readBuffExpectations} from './check-buff-contract.mjs';

const artifacts = path.join(root, '.artifacts');
const runnerSha256 = sha256(fs.readFileSync(new URL(import.meta.url)));
const arg = process.argv.indexOf('--location');
assert(arg < 0 || process.argv[arg + 1], 'Missing adapter location');
const location = JSON.parse(fs.readFileSync(arg < 0 ? path.join(artifacts, 'adapter-location.json') : path.resolve(process.argv[arg + 1])));
const contract = JSON.parse(fs.readFileSync(path.join(root, 'baseline/milestone-forty-one/adapter-contract.json')));
assert.equal(location.buffAdapterDecision, contract.decision, 'Requires the guarded buff adapter');
const {acceptance, expected, decision, proof} = readBuffExpectations();
assert.equal(location.buffConsumptionRepair, decision.id);
const game = location.game, installed = path.join(location.tooling, 'node_modules/@hollow-wake/engine/dist');
const reference = path.join(root, '.reference'), lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
verifyReference(reference, lock);
const inject = process.argv.includes('--faults'), canonical = p => fs.realpathSync(p).toLowerCase();
assert(!(inject && process.argv.includes('--read-only')), 'Choose either --faults or --read-only');
const targets = {runtime: path.join(installed, 'buffs.js'), binding: path.join(game, 'src/engine/buffAdapter.ts'), actor: path.join(game, 'src/engine/actor.ts')};
if (inject) {
  const within = (base, p) => {
    const relative = path.relative(canonical(base), canonical(p));
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Faults require isolated disposable artifact files');
  };
  for (const p of [game, location.tooling, path.join(game, 'src'), installed]) within(artifacts, p);
  for (const name of [
    'm36-condition-control/retained.json', 'm37-initial-candidate/retained.json', 'm37-proc-control/retained.json',
    'm38-prepared-adapter-location.json', 'm38-proc-initial/retained.json', 'm38-observation-control/retained.json',
    'm38-native-array-initial-control/retained.json', 'm38-effect-control/retained.json', 'm39-ward-initial-control/retained.json',
    'm39-delayed-control/retained.json', 'm40-delayed-initial-control/retained.json', 'm40-buff-control/retained.json',
    'm40-measured-control/retained.json', 'm41-buff-initial-control/retained.json', 'm41-buff-control/retained.json', 'm41-measured-control/retained.json', 'm41-timer-control/retained.json',
  ]) {
    const file = path.join(artifacts, name);
    if (!fs.existsSync(file)) continue;
    const retained = JSON.parse(fs.readFileSync(file)), control = retained.location ?? retained;
    assert.notEqual(canonical(game), canonical(control.game), 'Refusing to mutate a retained game');
    assert.notEqual(canonical(location.tooling), canonical(control.tooling), 'Refusing to mutate retained tooling');
    assert.notEqual(canonical(path.join(game, 'src')), canonical(path.join(control.game, 'src')), 'Retained source junction');
    assert.notEqual(canonical(installed), canonical(path.join(control.tooling, 'node_modules/@hollow-wake/engine/dist')), 'Retained package junction');
  }
  for (const [key, file] of Object.entries(targets)) {
    within(key === 'runtime' ? installed : path.join(game, 'src'), file);
    const stat = fs.lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, 'Refusing linked mutation target: ' + key);
  }
}
const snapshot = dir => Object.fromEntries(listFiles(dir).map(f => [f, sha256(fs.readFileSync(path.join(dir, f)))]));
const hostBefore = snapshot(path.join(game, 'src')), runtimeBefore = snapshot(installed);
const output = fs.mkdtempSync(path.join(artifacts, 'game-buffs-'));
const unchanged = () => {
  assert.deepEqual(snapshot(path.join(game, 'src')), hostBefore, 'Host source changed');
  assert.deepEqual(snapshot(installed), runtimeBefore, 'Installed runtime changed');
  verifyReference(reference, lock);
};
const helpers = new Map(), typed = [], adaptations = [];
function adapt(source, file) {
  const edits = [];
  const rules = file === decision.helper ? decision.helperAssertions : [];
  for (const rule of rules) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    assert.equal(ast.parseDiagnostics.length, 0);
    assert.equal(rule.course, decision.course);
    const matches = ast.statements.filter(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression)
      && n.expression.expression.getText(ast) === 'course' && ts.isStringLiteral(n.expression.arguments[0])
      && n.expression.arguments[0].text === rule.course);
    assert.equal(matches.length, 1, 'Ambiguous named diagnostic: ' + rule.course);
    const start = matches[0].getStart(ast), area = source.slice(start, matches[0].end);
    assert.equal(area.split(rule.before).length, 2, 'Changed diagnostic assertion: ' + file);
    // Only these complete assertion calls may change. Setup, callbacks and
    // recorded observations remain the pinned original helper's code.
    for (const text of [rule.before, rule.after]) {
      const parsed = ts.createSourceFile('assertions.ts', text, ts.ScriptTarget.Latest, true);
      assert.equal(parsed.parseDiagnostics.length, 0);
      assert(parsed.statements.length > 0 && parsed.statements.every(n => ts.isExpressionStatement(n)
        && ts.isCallExpression(n.expression) && ts.isPropertyAccessExpression(n.expression.expression)
        && n.expression.expression.expression.getText(parsed) === 'assert'), 'Only assertion changes are allowed');
    }
    const at = start + area.indexOf(rule.before);
    edits.push({start: at, end: at + rule.before.length, text: rule.after});
    adaptations.push({helper: file, course: rule.course, before: rule.before, after: rule.after});
  }
  edits.sort((a, b) => b.start - a.start);
  for (let i = 1; i < edits.length; i++) assert(edits[i].end <= edits[i - 1].start);
  let result = source;
  for (const e of edits) result = result.slice(0, e.start) + e.text + result.slice(e.end);
  return result;
}
function copyHelper(source, name) {
  const runtimeFile = path.join(output, name + '.ts'), typeFile = path.join(output, name + '.typed.ts');
  const imports = /(['"])\.\.\/src\/([^'"]+)\1/g;
  fs.writeFileSync(runtimeFile, source.replace(imports, (_all, _q, p) => JSON.stringify(pathToFileURL(path.join(game, 'src', p + '.ts')).href)), {flag: 'wx'});
  fs.writeFileSync(typeFile, source.replace(imports, (_all, _q, p) => JSON.stringify(path.relative(output, path.join(game, 'src', p)).replaceAll('\\', '/'))), {flag: 'wx'});
  typed.push(typeFile);
  return runtimeFile;
}
for (const row of acceptance.helpers) {
  const original = fs.readFileSync(path.join(root, row.file), 'utf8');
  assert.equal(sha256(original), row.sha256, 'Changed original helper');
  const source = adapt(original, row.file);
  helpers.set(row.file, {runtimeFile: copyHelper(source, path.basename(row.file, '.ts')), originalSha256: row.sha256, adaptedSha256: sha256(source)});
}
assert.equal(adaptations.length, 2);
const hostSource = fs.readFileSync(path.join(root, 'reference/check-buff-host.ts'), 'utf8');
const hostRuntime = copyHelper(hostSource, 'host'), config = path.join(output, 'tsconfig.json');
writeJSON(config, {extends: path.join(game, 'tsconfig.sim.json'), compilerOptions: {typeRoots: [path.join(game, 'node_modules/@types')]}, include: [path.join(game, 'src'), ...typed], exclude: []});
function run(name, args, check = true) {
  const log = path.join(output, name + '.txt'), fd = fs.openSync(log, 'wx');
  try { execFileSync(process.execPath, args, {cwd: game, stdio: ['ignore', fd, fd], timeout: 120_000}); }
  catch (error) { if (check) console.error('Failed buff comparison; retained log: ' + log); throw error; }
  finally { fs.closeSync(fd); if (check) unchanged(); }
}
const args = (helper, destination) => ['--import', pathToFileURL(path.join(game, 'node_modules/tsx/dist/loader.mjs')).href, helper, destination];
run('types', [path.join(game, 'node_modules/typescript/bin/tsc'), '-p', config]);
const hostResult = path.join(output, 'host.json');
run('host', args(hostRuntime, hostResult));
assert.equal(JSON.parse(fs.readFileSync(hostResult)).courses, 8);
const results = [];
for (const row of acceptance.fixtures) {
  const destination = path.join(output, row.name + '.json'), helper = helpers.get(row.helper);
  assert(helper);
  run(row.name, args(helper.runtimeFile, destination));
  const bytes = fs.readFileSync(destination), intended = Buffer.from(JSON.stringify(expected.get(row.name), null, 2) + '\n');
  assert(bytes.equals(intended), 'Installed buff observation differs: ' + row.name);
  assert.equal(JSON.parse(bytes).courses, row.courses);
  results.push({name: row.name, courses: row.courses, sha256: sha256(bytes), byteEqualToExplicitExpectations: true, helper});
  console.log('PASS installed ' + row.name);
}
assert.equal(results.reduce((n, r) => n + r.courses, 0), 40);
const faults = [];
if (inject) for (const [name, target, before, after, fixture] of [
  ['duration-scale-ignored', 'runtime', 'def.duration * durationScale', 'def.duration', 'buff-lifecycle'],
  ['initial-grant-clipped', 'runtime', 'def.stacksOnApply ?? 1', '1', 'buff-lifecycle'],
  ['gain-cap-reduced', 'runtime', 'gainEvents: 64', 'gainEvents: 63', 'buff-lifecycle'],
  ['gain-queue-omitted', 'runtime', 'owner.gainEvents.length < BUFF_LIMITS.gainEvents', 'false', 'buff-edges'],
  ['independent-definition-replaced', 'runtime', 'const buff = existing ?? { def, remaining: 0, stacks: 0, expiries: [] };', 'const buff = existing ?? { def, remaining: 0, stacks: 0, expiries: [] }; buff.def = def;', 'buff-lifecycle'],
  ['consumed-clocks-retained', 'runtime', 'if (buff.expiries && count > 0)', 'if (false)', 'buff-lifecycle'],
  ['newest-clocks-spent', 'runtime', 'for (let i = spent; i < clocks.length; i++)\n                    clocks[i - spent] = clocks[i];', 'void spent;', 'host'],
  ['clock-delta-ignored', 'runtime', 'const remaining = clocks[read] - delta;', 'const remaining = clocks[read];', 'buff-lifecycle'],
  ['stack-magnitude-ignored', 'runtime', 'mod.value * buff.stacks', 'mod.value', 'buff-lifecycle'],
  ['spend-uses-live-map', 'runtime', 'for (const [id, buff] of [...owner.buffs])', 'for (const [id, buff] of owner.buffs)', 'buff-edges'],
  ['expiry-uses-snapshot', 'runtime', 'for (const [id, buff] of owner.buffs)', 'for (const [id, buff] of [...owner.buffs])', 'buff-edges'],
  ['release-port-omitted', 'runtime', 'this.ports.release(owner, buff.def, id, Math.min(count, buff.stacks));', 'void id;', 'buff-callbacks'],
  ['same-actor-reentry-admitted', 'runtime', 'if (active.owner !== undefined && (active.owner === owner || active.parents?.includes(owner)))', 'if (false)', 'host'],
  ['native-publication-zeroed', 'binding', 'actor.sheet.setSource(source, mods)', 'actor.sheet.setSource(source, mods.map(m => ({...m, value: 0})))', 'buff-lifecycle'],
  ['release-phase-changed', 'binding', "'release', id, count", "'gain', id, count", 'buff-callbacks'],
  ['release-count-ignored', 'binding', "'release', id, count", "'release', id, 1", 'host'],
  ['native-consume-dispatch-bypassed', 'binding', 'actor.consumeBuffStacks(id, count)', "actor['sdkBuffRuntime']!.consume(actor, id, count)", 'host'],
  ['native-spend-count-ignored', 'actor', 'this.sdkBuffs().consume(this, id, n)', 'this.sdkBuffs().consume(this, id, 1)', 'buff-lifecycle'],
  ['timer-delta-ignored', 'actor', 'this.sdkBuffs().advance(this, dt)', 'this.sdkBuffs().advance(this, 0)', 'buff-lifecycle'],
  ['restored-map-ignored', 'actor', 'if (this.sdkBuffRuntime || this.buffs.size) this.sdkBuffs().advance(this, dt);', 'if (this.sdkBuffRuntime) this.sdkBuffs().advance(this, dt);', 'host'],
  ['empty-spend-allocates-runtime', 'actor', 'if (this.buffs.size) this.sdkBuffs().spend(this, on, tags, skillId);', 'this.sdkBuffs().spend(this, on, tags, skillId);', 'host'],
  ['recovery-synchronization-omitted', 'actor', 'this.sdkBuffs().synchronize(this, id);', 'void id;', 'buff-edges'],
]) {
  const file = targets[target], source = fs.readFileSync(file, 'utf8');
  assert.equal(source.split(before).length, 2, 'Ambiguous fault anchor: ' + name);
  const row = acceptance.fixtures.find(r => r.name === fixture);
  const helper = row ? helpers.get(row.helper).runtimeFile : hostRuntime, destination = path.join(output, 'fault-' + name + '.json');
  let detected = false;
  try {
    fs.writeFileSync(file, source.replace(before, after));
    try { run('fault-' + name, args(helper, destination), false); }
    catch {
      const log = fs.readFileSync(path.join(output, 'fault-' + name + '.txt'), 'utf8');
      assert(/AssertionError/.test(log) && !/SyntaxError|ERR_MODULE_NOT_FOUND/.test(log), 'Fault failed for unrelated reason: ' + name);
      detected = true;
    }
    if (!detected) {
      const intended = row ? Buffer.from(JSON.stringify(expected.get(fixture), null, 2) + '\n') : fs.readFileSync(hostResult);
      detected = !fs.readFileSync(destination).equals(intended);
    }
    assert(detected, 'Installed buff fault escaped: ' + name);
  } finally { fs.writeFileSync(file, source); unchanged(); }
  faults.push({name, target, fixture, detected: true});
  console.log('Rejected installed buff fault: ' + name);
}
unchanged();
assert.equal(sha256(fs.readFileSync(new URL(import.meta.url))), runnerSha256, 'Runner changed during verification');
const receipt = {output, runnerSha256, game, tooling: location.tooling, packageIntegrity: location.integrity, readOnly: !inject, typesPassed: true,
  sourceMapSha256: sha256(JSON.stringify(hostBefore)), runtimeMapSha256: sha256(JSON.stringify(runtimeBefore)),
  courses: 40, repair: proof, results, adaptations, hostCases: 8, hostProbeSha256: sha256(hostSource), hostOutputSha256: sha256(fs.readFileSync(hostResult)),
  installedFaults: faults, allSourceAndRuntimeFilesUnchanged: true,
  scope: 'Forty installed original comparisons with only four declared repair fields changed, plus eight independent host cases. Renderer and performance acceptance remain required.'};
writeJSON(path.join(output, 'verification.json'), receipt);
writeJSON(path.join(artifacts, 'game-buff-verification.json'), receipt);
