import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

// Component and public composition evidence. Normal verification never
// recaptures accepted observations or changes a coverage declaration.
const root = fileURLToPath(new URL('../', import.meta.url));
const reference = process.argv.includes('--reference');
if (process.argv.slice(2).some(arg => arg !== '--reference')) throw new Error('Unknown argument');
const courses = [
  'actor-timers', 'area-deliveries', 'carried-effects', 'cast-buffs', 'cast-resource-effects',
  'combat-actors', 'combat-birth', 'combat-death', 'combat-targeting', 'combat-timeflow', 'companion-claims', 'construct-birth',
  'corpse-effects', 'death-bursts', 'echo-riders', 'field-aftermath', 'field-deliveries',
  'field-simulation', 'grab', 'guard-surge', 'mimic', 'minion-orders',
  'movement-deliveries', 'pending-resolutions', 'possession', 'projectile-combat',
  'projectile-delivery', 'projectiles', 'skill-recovery', 'summon-contracts',
  'tethers', 'throng-orders', 'party-recovery', 'combat-frames', 'combat-families', 'combat-lifecycles', 'combat-proc-families', 'combat-interactions', 'combat-locomotion', 'combat-locomotion-airborne',
];
const mechanical = [
  'area-deliveries', 'carried-effects', 'cast-aftermath', 'cast-preparation', 'combat-geometry', 'combat-hit-bindings', 'combat-timeflow',
  'combat-policies', 'combat-command-controllers', 'combat-casting-bindings', 'combat-port-contracts', 'combat-actor-phases',
  'construct-lifecycle', 'field-aftermath', 'field-deliveries', 'field-simulation',
  'grab', 'possession', 'projectiles',
];
const checks = reference
  ? [...courses, 'combat-authored-registry', 'combat-throng-registry', 'combat-proc-registry'].map(name => [name, 'scripts/reference-combat-course.mjs', name])
  : [
    ...mechanical.map(name => [`extract:${name}`, `scripts/extract-${name}.mjs`, '--check']),
    ...courses.map(name => name === 'projectile-combat'
      ? [name, 'scripts/test-projectiles-original.mjs', '--combat']
      : name === 'combat-families' ? [name, 'scripts/test-combat-frames-original.mjs', '--families']
      : name === 'combat-proc-families' ? [name, 'scripts/test-combat-lifecycles-original.mjs', '--procs']
      : name === 'combat-interactions' ? [name, 'scripts/test-combat-lifecycles-original.mjs', '--interactions']
      : name === 'combat-locomotion-airborne' ? [name, 'scripts/test-combat-locomotion-original.mjs', '--airborne']
      : [name, `scripts/test-${name}-original.mjs`]),
    ['bindings', 'scripts/check-combat-bindings.mjs'],
    ['shared-services', 'scripts/test-combat-shared-services.mjs'],
    ['casting-services', 'scripts/test-combat-casting-services.mjs'],
    ['body-services', 'scripts/test-combat-body-services.mjs'],
    ['control-services', 'scripts/test-combat-control-services.mjs'],
    ['owner', 'scripts/test-combat-owner.mjs'],
    ['character', 'scripts/test-combat-character.mjs'],
    ['authored-census', 'scripts/test-combat-owner-census.mjs'],
    ['installed-composition', 'scripts/test-combat-session-package.mjs'],
  ];
const receipt = {
  mode: reference ? 'reference' : 'runtime', started: new Date().toISOString(),
  passed: false, requiredFamiliesQualified: false, exhaustiveBuildCombinations: false, checks: [],
};
try {
  for (const [name, script, ...args] of checks) {
    process.stdout.write(`Checking ${name}\n`);
    const scriptSha256 = createHash('sha256').update(readFileSync(path.join(root, script))).digest('hex');
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: root, windowsHide: true, encoding: 'utf8', timeout: 900_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const passed = result.status === 0 && !result.error;
    receipt.checks.push({ name, script, args, scriptSha256, passed });
    if (!passed) {
      process.stderr.write(result.stdout ?? '');
      process.stderr.write(result.stderr ?? '');
      throw result.error ?? new Error(`${name} failed (${result.status})`);
    }
  }
  const scope=JSON.parse(readFileSync(path.join(root,'docs/combat-inventory-capabilities.json')));
  let families=0;
  for(const group of ['effects','deliveries'])for(const [id,row]of Object.entries(scope.contentFamilies[group])){
    assert(['composed-public-course','explicit-host-request-and-unavailable-refusal'].includes(row.acceptance),'Unqualified required family: '+id);
    assert(row.cases?.length&&row.evidence?.includes('scripts/test-combat-session-package.mjs'),'Missing public evidence: '+id);families++;
  }
  assert.equal(families,70,'Required family census changed');
  receipt.requiredFamiliesQualified=!reference;
  receipt.requiredFamilies=families;
  receipt.passed = true;
  process.stdout.write(`${checks.length} combat component and composition checks passed.\n`);
} finally {
  receipt.finished = new Date().toISOString();
  mkdirSync(path.join(root, '.artifacts'), { recursive: true });
  writeFileSync(path.join(root, `.artifacts/combat-coverage-${receipt.mode}.json`), JSON.stringify(receipt, null, 2) + '\n');
}
