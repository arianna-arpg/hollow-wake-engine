import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root, listFiles, verifyReference, sha256, writeJSON} from './reference-utils.mjs';
import {renderBuffActor} from '../adapters/hollow-wake/integrate-buffs.mjs';

const argument = name => {
  const at = process.argv.indexOf(name);
  assert(at < 0 || process.argv[at + 1], 'Missing ' + name);
  return at < 0 ? undefined : path.resolve(process.argv[at + 1]);
};
const artifacts = path.join(root, '.artifacts');
const location = JSON.parse(fs.readFileSync(argument('--location') ?? path.join(artifacts, 'adapter-location.json')));
const previous = argument('--previous-adapter'), comparison = argument('--comparison-adapter'), current = location.game;
const validationOnly = process.argv.includes('--validate-only');
assert(previous, 'Pass the retained v0.35 game as --previous-adapter');
assert.equal(location.buffAdapterDecision, 'buff-lifecycle-adapter/v1');
assert.equal(location.buffConsumptionRepair, 'independent-buff-consumption/v1');
const names = ['previous', 'current', ...(comparison ? ['comparison'] : [])];
const orderAt = process.argv.indexOf('--order'), order = orderAt < 0 ? undefined : process.argv[orderAt + 1];
assert(orderAt < 0 || order, 'Missing --order');
const graphOrder = order ? order.split(',') : names;
assert.deepEqual([...graphOrder].sort(), [...names].sort());
const hashFiles = dir => Object.fromEntries(listFiles(dir).map(f => [f, sha256(fs.readFileSync(path.join(dir, f)))]));
const snapshot = game => ({source: hashFiles(path.join(game, 'src')), package: hashFiles(path.join(game, 'node_modules/@hollow-wake/engine')), runtime: hashFiles(path.join(game, 'node_modules/@hollow-wake/engine/dist'))});
const before = {previous: snapshot(previous), current: snapshot(current), ...(comparison ? {comparison: snapshot(comparison)} : {})};
const identity = p => {const real = fs.realpathSync(p); return process.platform === 'win32' ? real.toLowerCase() : real;};
const packagePath = game => path.join(game, 'node_modules/@hollow-wake/engine');
const games = {previous, current, ...(comparison ? {comparison} : {})};
assert.equal(new Set(Object.values(games).map(g => identity(path.join(g, 'src')))).size, names.length);
assert.equal(new Set(Object.values(games).map(g => identity(packagePath(g)))).size, names.length);
assert.equal(identity(packagePath(current)), identity(path.join(location.tooling, 'node_modules/@hollow-wake/engine')));
const version = game => JSON.parse(fs.readFileSync(path.join(packagePath(game), 'package.json'))).version;
assert.equal(version(previous), '0.35.0');
assert(['0.35.0', '0.36.0'].includes(version(current)), 'Expected the initial or final M41 package');
for (const [file, hash] of Object.entries(before.previous.runtime)) assert.equal(before.current.runtime[file], hash, 'Prior runtime changed: ' + file);
assert.deepEqual(Object.keys(before.current.runtime).filter(f => !Object.hasOwn(before.previous.runtime, f)), ['buff-content.d.ts', 'buff-content.js', 'buff-content.js.map', 'buffs.d.ts', 'buffs.js', 'buffs.js.map']);
assert.deepEqual(Object.keys(before.current.source).filter(f => f !== 'engine/buffAdapter.ts'), Object.keys(before.previous.source));
for (const [file, hash] of Object.entries(before.previous.source)) if (file !== 'engine/actor.ts') assert.equal(before.current.source[file], hash, 'Unrelated host change: ' + file);
const source = game => fs.readFileSync(path.join(game, 'src/engine/actor.ts'), 'utf8').replaceAll('\r\n', '\n');
assert.equal(source(current), renderBuffActor(source(previous)));
assert(fs.readFileSync(path.join(current, 'src/engine/buffAdapter.ts')).equals(fs.readFileSync(path.join(root, 'adapters/hollow-wake/buffAdapter.ts'))));
if (comparison) {
  assert.equal(version(comparison), '0.35.0');
  assert.deepEqual(before.comparison.source, before.current.source, 'Initial host differs');
  assert.deepEqual(Object.keys(before.comparison.runtime), Object.keys(before.current.runtime));
  for (const [file, hash] of Object.entries(before.comparison.runtime)) if (!['buffs.js', 'buffs.js.map'].includes(file)) assert.equal(before.current.runtime[file], hash, 'Optimization changed another module: ' + file);
}
const archiveBytes = location.archive ? fs.readFileSync(location.archive) : undefined;
if (archiveBytes) assert.equal('sha512-' + createHash('sha512').update(archiveBytes).digest('base64'), location.integrity);
const reference = path.join(root, '.reference'), lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
const planFile = path.join(root, 'baseline/milestone-forty-one/performance-plan.json'), planBytes = fs.readFileSync(planFile), plan = JSON.parse(planBytes);
assert.equal(plan.decision, 'buff-lifecycle-performance/v1');
assert.equal(plan.status, 'accepted-before-timing');
const helperSource = fs.readFileSync(path.join(root, 'reference/benchmark-buffs.ts'), 'utf8');
assert.equal(sha256(helperSource), plan.helperSha256, 'Benchmark helper changed after plan acceptance');
const verify = () => {
  verifyReference(reference, lock);
  assert.deepEqual(hashFiles(path.join(root, 'dist')), before.current.runtime);
  for (const [key, game] of Object.entries(games)) assert.deepEqual(snapshot(game), before[key], 'Comparison graph changed: ' + key);
  if (archiveBytes) assert(fs.readFileSync(location.archive).equals(archiveBytes));
  assert(fs.readFileSync(planFile).equals(planBytes));
  assert.equal(fs.readFileSync(path.join(root, 'reference/benchmark-buffs.ts'), 'utf8'), helperSource);
};
verify();
const directory = fs.mkdtempSync(path.join(artifacts, 'buff-benchmark-')), imports = /(['"])\.\.\/src\/([^'"]+)\1/g;
const helper = path.join(directory, 'helper.ts'), typed = path.join(directory, 'helper.typed.ts');
fs.writeFileSync(helper, helperSource.replace(imports, (_all, _quote, p) => JSON.stringify(pathToFileURL(path.join(reference, 'src', p + '.ts')).href)));
fs.writeFileSync(typed, helperSource.replace(imports, (_all, _quote, p) => JSON.stringify(path.relative(directory, path.join(reference, 'src', p)).replaceAll('\\', '/'))));
const config = path.join(directory, 'types.json');
writeJSON(config, {extends: path.join(reference, 'tsconfig.sim.json'), compilerOptions: {typeRoots: [path.join(reference, 'node_modules/@types')]}, include: [path.join(reference, 'src'), typed], exclude: []});
const fd = fs.openSync(path.join(directory, 'types.txt'), 'wx');
try {execFileSync(process.execPath, [path.join(reference, 'node_modules/typescript/bin/tsc'), '-p', config], {cwd: directory, windowsHide: true, stdio: ['ignore', fd, fd]});}
finally {fs.closeSync(fd); verify();}
const output = path.join(directory, validationOnly ? 'validation.json' : 'measurements.json');
try {
  execFileSync(process.execPath, ['--expose-gc', '--import', 'tsx', helper, previous, current, output, planFile,
    ...(comparison ? ['--comparison-adapter', comparison] : []), ...(order ? ['--order', order] : []), ...(validationOnly ? ['--validate-only'] : [])], {cwd: reference, windowsHide: true, stdio: 'inherit'});
} finally {verify();}
const result = JSON.parse(fs.readFileSync(output));
assert.equal(result.validationOnly, validationOnly); assert.equal(result.planSha256, sha256(planBytes)); assert.deepEqual(result.graphOrder, graphOrder);
assert.deepEqual(result.results.map(r => r.name), plan.workloads.map(c => c.name));
assert.deepEqual(result.memory.map(r => [r.mode, r.count]), plan.memory.states.flatMap(mode => plan.memory.actorCounts.map(count => [mode, count])));
writeJSON(path.join(directory, 'inputs.json'), {location, games, before, archiveSha256: archiveBytes ? sha256(archiveBytes) : null});
const summary = {output, sha256: sha256(fs.readFileSync(output)), helperSha256: sha256(helperSource), planSha256: sha256(planBytes), validationOnly, graphOrder,
  helperTypesPassed: true, workloads: plan.workloads.length, memoryCases: result.memory.length, previousVersion: version(previous), currentVersion: version(current),
  installedRuntimeFilesMatchBuild: Object.keys(before.current.runtime).length, unchangedPreviousRuntimeFiles: Object.keys(before.previous.runtime).length,
  unrelatedHostFilesUnchanged: Object.keys(before.previous.source).length - 1, sourceCapsuleUnchanged: true, controlsUnchanged: true,
  scope: 'Native buff Actor/World comparison with call-through observers and retained Actor-graph heap measurements. All input graphs remain unchanged. See the frozen plan for instrumentation, repeat-run requirements, stress limits and repair scope. No physical-device or general speed claim.'};
writeJSON(path.join(directory, 'summary.json'), summary);
writeJSON(path.join(artifacts, 'buff-benchmark' + (validationOnly ? '-validation' : '') + '-location.json'), {output: path.join(directory, 'summary.json')});
console.log('Buff comparison saved: ' + directory);
