import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, sha256, writeJSON } from './reference-utils.mjs';
import { run, buildNative } from './native-tools.mjs';
import { canPayCast, payCast, castDuration, advanceCastProgress, advanceCooldown, replaceStrongerDot, advanceDotFrame } from '../dist/hollow-wake.js';

const directory = path.join(root, '.artifacts'); fs.mkdirSync(directory, { recursive: true });
const output = fs.mkdtempSync(path.join(directory, 'native-lifecycle-'));
const built = buildNative(output);
const vectors = [];
let seed = 0x468acc11;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0x100000000; };
function vector(op, input, expected) { vectors.push({ op, ...input, expected }); }
const edge = [0, Number.MIN_VALUE, 1e-300, .0009999999999999998, .001, .0010000000000000002, .19999999999999998, .2, .20000000000000004, 1, 1e100, Number.MAX_VALUE];
for (const useTime of edge) vector('duration', { useTime }, castDuration(useTime));
for (let i = 0; i < 1000; i++) {
  const mana = random() * 100, life = random() * 100 - 1, manaCost = random() * 100, lifeCost = random() * 100;
  const resources = { mana, life }, cost = { mana: manaCost, life: lifeCost }, can = canPayCast(resources, cost);
  if (can) payCast(resources, cost);
  vector('payment', { mana, life, manaCost, lifeCost }, { can, paid: can, ...resources });
  const useTime = random() * 1.5;
  vector('duration', { useTime }, castDuration(useTime));
  const dt = i % 7 === 0 ? 0 : random() * .5;
  const states = Array.from({ length: i % 9 }, () => ({ elapsed: random(), total: random() }));
  const next = structuredClone(states), completed = next.map(s => advanceCastProgress(s, dt));
  vector('cast', { states, dt }, { states: next, completed });
  const remaining = Array.from({ length: i % 11 }, () => random() * 10 - 1), rates = remaining.map(() => random() * 3);
  vector('cooldown', { remaining, rates, dt }, remaining.map((v, j) => advanceCooldown(v, dt, rates[j])));
  const dots = Array.from({ length: i % 13 }, () => ({ remaining: random() * 4 - .2, dps: random() * 1e6, stacks: Math.floor(random() * 10) }));
  const advanced = structuredClone(dots), damage = advanced.map(d => advanceDotFrame(d, dt));
  vector('dot', { states: dots, dt }, { states: advanced, damage });
  const state = { remaining: random() * 4, dps: random() * 100, stacks: 1 }, dps = i % 5 === 0 ? state.dps : random() * 100, duration = random() * 4;
  const replacedState = { ...state }, replaced = replaceStrongerDot(replacedState, dps, duration);
  vector('replace', { state, dps, duration }, { state: replacedState, replaced });
}
// Binary64 extremities and cancellation, independent of the ordinary random range.
for (const value of [Number.MIN_VALUE, 1e-300, 1e100, Number.MAX_VALUE / 4]) {
  const states = [{ remaining: value, dps: value, stacks: 1 }], next = structuredClone(states);
  vector('dot', { states, dt: 1 }, { states: next, damage: next.map(d => advanceDotFrame(d, 1)) });
  vector('cooldown', { remaining: [value], rates: [value], dt: 1 }, [advanceCooldown(value, 1, value)]);
}
const vectorsFile = path.join(output, 'vectors.json'); writeJSON(vectorsFile, vectors);
const sdk = run('dotnet', ['--list-sdks'], output).split(/\r?\n/).map(line => line.split(' ')[0]).filter(v => /^8\.\d+\.\d+$/.test(v)).sort((a, b) => Number(a.split('.')[2]) - Number(b.split('.')[2])).at(-1);
if (!sdk) throw new Error('A .NET 8 SDK is required for the foreign caller proof');
writeJSON(path.join(output, 'global.json'), { sdk: { version: sdk, rollForward: 'disable' } });
const env = { ...process.env, DOTNET_CLI_HOME: path.join(output, 'dotnet-home'), DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1' };
const project = path.join(root, 'native/test/interop/Interop.csproj');
const obj = path.join(output, 'managed-obj') + path.sep, bin = path.join(output, 'managed');
const props = [`-p:BaseIntermediateOutputPath=${obj}`, `-p:MSBuildProjectExtensionsPath=${obj}`];
const logs = [built.log];
logs.push(run('dotnet', ['restore', project, '--configfile', path.join(root, 'native/test/interop/NuGet.Config'), ...props], output, env));
logs.push(run('dotnet', ['build', project, '--no-restore', '-c', 'Release', '-o', bin, ...props], output, env));
const fixture = path.join(root, 'baseline/milestone-two/lifecycle.json');
const stdout = run('dotnet', [path.join(bin, 'Interop.dll'), built.library, fixture, vectorsFile], output, env);
const receipt = JSON.parse(stdout.trim());
assert.equal(receipt.comparisons, vectors.length + JSON.parse(fs.readFileSync(fixture)).casting.concat(JSON.parse(fs.readFileSync(fixture)).dots).reduce((n, s) => n + s.steps.length, 0));
logs.push(stdout);
const source = fs.readFileSync(path.join(root, 'native/src/hwe_lifecycle.c'), 'utf8');
const faults = [
  ['minimum-cast-bar', '? 0.2 : use_time', '? 0.3 : use_time', 'Numeric mismatch: minimum-bar-and-snapshotted-speed'],
  ['expiry-frame-clipping', 'damage[i] = states[i].dps * states[i].stacks * dt;',
    'damage[i] = states[i].dps * states[i].stacks * fmin(dt, states[i].remaining);', 'Numeric mismatch: Original Burning/'],
];
const mutants = [];
for (const [name, from, to, expectedFailure] of faults) {
  assert.equal(source.split(from).length, 2, `Unique native mutation site: ${name}`);
  const dir = path.join(output, `fault-${name}`); fs.mkdirSync(dir);
  const modified = path.join(dir, 'hwe_lifecycle.c'); fs.writeFileSync(modified, source.replace(from, to));
  const faulty = buildNative(dir, modified, false);
  let failure;
  try { run('dotnet', [path.join(bin, 'Interop.dll'), faulty.library, fixture, vectorsFile], output, env); }
  catch (error) { failure = error.message; }
  assert.ok(failure?.includes(expectedFailure), `Original-game trace must detect ${name}; got ${failure}`);
  mutants.push({ name, detectedBy: expectedFailure });
}
const sources = ['native/include/hwe_lifecycle.h', 'native/src/hwe_lifecycle.c', 'native/bindings/dotnet/Lifecycle.cs', 'native/test/contracts.c', 'native/test/header.cpp', 'native/test/interop/Program.cs'];
const report = { ...receipt, vectors: vectors.length, platform: process.platform, arch: process.arch, node: process.version,
  compiler: built.compilerVersion, dotnetSdk: sdk, libraryBytes: fs.statSync(built.library).size, librarySha256: sha256(fs.readFileSync(built.library)),
  originalFixtureSha256: sha256(fs.readFileSync(fixture)), vectorSha256: sha256(fs.readFileSync(vectorsFile)), mutants,
  sources: Object.fromEntries(sources.map(file => [file, sha256(fs.readFileSync(path.join(root, file)))])),
  limitations: ['x64 leaf ABI experiment, not a native full SDK', 'No Unity/Godot/Unreal engine import or device benchmark', 'Managed allocations exclude startup, test orchestration, errors and native/OS allocation'] };
writeJSON(path.join(output, 'verification.json'), report);
fs.writeFileSync(path.join(output, 'verification.txt'), logs.join('\n'));
writeJSON(path.join(directory, 'native-latest.json'), { directory: output, report });
console.log(JSON.stringify({ directory: output, ...report }, null, 2));
