import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {root, sha256, writeJSON} from './reference-utils.mjs';
fs.mkdirSync(path.join(root, '.artifacts'), {recursive: true});
const directory = fs.mkdtempSync(path.join(root, '.artifacts/proc-casting-mutations-'));
const file = path.join(root, 'dist/proc-casting.js'), source = fs.readFileSync(file, 'utf8');
const faults = [
  ['zero-seat', 'seat == null', '!seat'],
  ['zero-held', 'held != null', '!!held'],
  ['zero-trigger', 'instance != null', '!!instance'],
  ['zero-aim', 'aim !== undefined', '!!aim', 2],
  ['bar-priority', 'return instance;', 'return null;'],
  ['grant-priority', 'ports.granted(seat, skillId) ?? ports.learned(seat, skillId)', 'ports.learned(seat, skillId) ?? ports.granted(seat, skillId)'],
  ['held-selection', 'spec.own ? ports.heldInstance(caster, spec.skillId) : null', 'null'],
  ['unowned-selection', 'spec.own ? ports.heldInstance(caster, spec.skillId) : null', 'ports.heldInstance(caster, spec.skillId)'],
  ['trigger-level', 'instance != null ? ports.effectiveLevel(instance)', 'instance != null ? 1'],
  ['fallback-level', 'Math.round(caster.level / 2)', 'Math.floor(caster.level / 2)'],
  ['minimum-level', 'Math.max(1,', 'Math.max(2,'],
  ['zero-multiplier', 'spec.mult ?? 1', 'spec.mult || 1'],
  ['ring-phase', 'phase + (i / count)', '0 + (i / count)'],
  ['ring-spacing', '(i / count) * Math.PI * 2', '(i / count) * Math.PI'],
  ['fan-units', '* fan * Math.PI / 180', '* fan / 180'],
  ['fan-singleton', 'count === 1 ? 0', 'count === 1 ? 1'],
  ['default-fan', 'anchored ? undefined : 0', 'undefined'],
  ['phase-consumption', 'ports.random(0, Math.PI * 2)', '.5'],
  ['self-origin', "spec.at !== 'self' && target", 'target'],
  ['bearing-target', 'target && target !== caster', 'false'],
  ['bearing-aim', 'aim !== undefined ? ports.direction(caster.pos, aim)', 'aim !== undefined ? ports.facing(caster)'],
  ['launch-from-hand', 'anchored ? origin : ports.copyPosition(caster.pos)', 'origin'],
  ['shared-launch', 'payload, from, direction,', 'payload, ports.copyPosition(from), direction,'],
  ['lock-anchor', 'if (anchored)', 'if (false)'],
  ['projectile-depth', '{ depth, mult }', '{ depth: 0, mult }'],
  ['synthetic-depth', 'ports.makeInstance(skill, level, depth)', 'ports.makeInstance(skill, level, 0)', 2],
  ['opaque-instance', 'ports.makeInstance(skill, level, depth)', '{...ports.makeInstance(skill, level, depth)}', 2],
  ['centered-position-copy', 'targetInfo: { pos: ports.copyPosition(origin) }', 'targetInfo: { pos: origin }'],
  ['centered-payment', 'noCooldown: true', 'noCooldown: false'],
  ['centered-repeat', 'noRepeat: true', 'noRepeat: false'],
  ['centered-followup', 'noFollowUp: true', 'noFollowUp: false'],
  ['centered-facing', 'keepFacing: true', 'keepFacing: false'],
];
function run(name, body) {
  const module = path.join(directory, name + '.mjs'); fs.writeFileSync(module, body);
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'test/proc-casting.test.mjs'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: {...process.env, HWE_PROC_CASTING_MODULE: pathToFileURL(module).href},
  });
  fs.writeFileSync(path.join(directory, name + '.txt'), r.stdout + r.stderr);
  assert(!r.error && !r.signal, name + ': runner failed'); return r;
}
assert.equal(run('control', source).status, 0);
for (const [name, before, after, count = 1] of faults) {
  assert.equal(source.split(before).length - 1, count, name + ': ambiguous replacement');
  const r = run(name, source.replaceAll(before, after));
  assert.equal(r.status, 1, name + ': fault survived');
  assert.match(r.stdout, /ERR_ASSERTION/, name + ': no behavioral assertion');
  assert(!/SyntaxError|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND/.test(r.stdout + r.stderr), name + ': unrelated exception');
}
assert.equal(fs.readFileSync(file, 'utf8'), source);
const report = {passed: true, directory, sourceSha256: sha256(source), faults: faults.map(f => f[0]), runtimeUnchanged: true};
writeJSON(path.join(directory, 'verification.json'), report); writeJSON('.artifacts/proc-casting-mutation-verification.json', report); console.log({passed: true, directory, faults: faults.length});
