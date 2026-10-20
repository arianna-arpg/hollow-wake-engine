import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { root } from './reference-utils.mjs';

const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const artifacts = path.join(root, '.artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const [packed] = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', artifacts, '--cache', path.join(artifacts, 'npm-cache')],
  { cwd: root, encoding: 'utf8' }));
assert.ok(packed.files.every(file => !/^(baseline|reference|scripts|test|src|\.reference|node_modules)\//.test(file.path)), 'Development or original-game files leaked into package');
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'hollow-wake-consumer-'));
fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
execFileSync(process.execPath, [npmCli, 'install', path.join(artifacts, packed.filename),
  '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--cache', path.join(consumer, 'cache')],
{ cwd: consumer, stdio: 'pipe' });
fs.writeFileSync(path.join(consumer, 'run.mjs'), `
import fs from 'node:fs';
import assert from 'node:assert/strict';
Math.random = () => { throw new Error('ambient RNG called'); };
globalThis.fetch = () => { throw new Error('network called'); };
for (const key of ['window', 'document', 'localStorage']) Object.defineProperty(globalThis, key, { get() { throw new Error(key + ' accessed'); } });
const { Engine, CastRuntime, TimedDamage, Inventory } = await import('@hollow-wake/engine');
const bridge = await import('@hollow-wake/engine/hollow-wake');
assert.equal(bridge.HOLLOW_WAKE_ADAPTER_VERSION, 1);
assert.equal(bridge.castDuration(.1), .2);
const content = JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/engine/content/milestone-one.json')), 'utf8'));
const engine = new Engine(content, 42);
const hero = engine.character({ classId: 'magician', passivePoints: 1 });
hero.equip('lapis-reference', 'ring1');
hero.allocate('cross_int_pursuit');
const skill = engine.skill({ id: 'ruin', level: 5, sockets: 2, treePoints: 1,
  supports: [{ id: 'corrosion', level: 2 }, { id: 'measured_blows', level: 1 }], nodes: ['ruin_studies'] });
const result = engine.resolveHit(hero, skill, engine.target({ life: 500 }));
assert.ok(result.damage > 0 && result.life < 500);
assert.equal(engine.planBuilds, 1);
const casting = new CastRuntime({ mana: 100, life: 100 });
assert.equal(casting.press(engine.castProfile(hero, skill)).kind, 'started');
assert.equal(casting.advance(10).kind, 'completed');
const burning = new TimedDamage({ id: 'burn', damageType: 'fire', duration: 4, reapply: 'strongest', clock: 'hollow-wake-frame/v1' });
burning.apply(10);
assert.equal(burning.advance(.5), 5);
assert.equal(TimedDamage.restore(burning.snapshot()).remaining, 3.5);
const bag = new Inventory({ w: 3, h: 3, rows: ['###', '#.#', '###'] });
assert.equal(bag.insert({ id: 'ring', w: 1, h: 1, data: { affixes: ['retained'] } }), true);
assert.equal(bag.move('ring', 1, 1), 'blocked');
assert.equal(Inventory.restore(JSON.parse(JSON.stringify(bag.snapshot()))).at(0, 0), 'ring');
console.log(JSON.stringify({ installedConsumer: true, damage: result.damage, randomDraws: result.randomDraws }));
`);
const result = execFileSync(process.execPath, ['run.mjs'], {
  cwd: consumer, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' },
});
const jsBytes = packed.files.filter(file => file.path.endsWith('.js')).reduce((sum, file) => sum + file.size, 0);
const contentBytes = packed.files.filter(file => file.path.startsWith('content/') && file.path.endsWith('.json')).reduce((sum, file) => sum + file.size, 0);
assert.ok(jsBytes <= 96 * 1024, 'First-slice runtime exceeded the 96 KiB unminified JS budget');
assert.ok(contentBytes <= 64 * 1024, 'First-slice content exceeded the 64 KiB JSON budget');
fs.writeFileSync(path.join(artifacts, 'package-verification.json'), JSON.stringify({
  runtimeJsBytes: jsBytes, contentBytes, packageBytes: packed.size, unpackedBytes: packed.unpackedSize,
  isolatedConsumer: JSON.parse(result), node: process.version,
}, null, 2) + '\n');
console.log(result.trim());
console.log(`Packaged runtime ${jsBytes} bytes JS; selected content ${contentBytes} bytes; archive ${packed.size} bytes.`);
