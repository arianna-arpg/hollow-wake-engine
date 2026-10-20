import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
// Exact reviewed replacements. All source guards run before any writes. Never overwrite an installed bridge.
export function integrate(game) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'), 'utf8'));
  const replace = (source, before, after) => {
    assert.equal(source.split(before).length, 2, `Adapter anchor missing or ambiguous: ${before.slice(0, 100)}`);
    return source.replace(before, after);
  };
  const originals = Object.fromEntries(['actor', 'world'].map(name => {
    const file = `src/engine/${name}.ts`, bytes = fs.readFileSync(path.join(game, file));
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    // The isolated game checkout excludes the owner's uncommitted bounty-board overlay.
    // Reviewed diff: five bounty-board changes only, no combat changes. Keep both exact guards.
    const committedWorld = '5033d7d9abf77bffa3b5b76cb87daa7bc9ee418eb0355a814efd1f9181be1bba';
    assert.ok(hash === lock.files[file] || (name === 'world' && hash === committedWorld), `Unreviewed ${file}; refusing to patch it`);
    return [name, bytes.toString('utf8')];
  }));
  const bridge = path.join(game, 'src/engine/engineAdapter.ts');
  assert.ok(!fs.existsSync(bridge), 'Adapter already exists; refusing overwrite');
  const newline = originals.actor.includes('\r\n') ? '\r\n' : '\n';
  let actor = originals.actor.replace(/\r\n/g, '\n'), world = originals.world.replace(/\r\n/g, '\n');
  actor = "import { canPayCast, payCast, advanceCooldown, replaceStrongerDot, advanceDotFrame } from './engineAdapter';\n" + actor;
  actor = replace(actor, '    const esMana = this.es *', '    if (this.mana >= cost.mana && this.life > cost.life) return canPayCast(this, cost);\n    const esMana = this.es *');
  actor = replace(actor, '    let due = cost.mana;', `    // Ordinary payments delegate to the package; shield/debt routes remain native.
    if (this.mana >= cost.mana && this.life > cost.life) {
      payCast(this, cost);
      if (cost.life > 0) this.onLifeSpent?.(cost.life);
      return;
    }
    let due = cost.mana;`);
  actor = replace(actor, 'const left = t - dt * rate;', 'const left = advanceCooldown(t, dt, rate);');
  actor = replace(actor, '      if (dps > existing.dps) {\n        existing.dps = dps;\n        existing.remaining = duration;\n      }', `      if (id === 'burn') replaceStrongerDot(existing, dps, duration);
      else if (dps > existing.dps) {
        existing.dps = dps;
        existing.remaining = duration;
      }`);
  actor = replace(actor, '      s.remaining -= STATUS_DEFS[s.id]?.timeScale !== undefined ? chronoDt : dt;', `      const burnTick = s.id === 'burn' ? advanceDotFrame(s, dt) : undefined;
      if (burnTick === undefined) s.remaining -= STATUS_DEFS[s.id]?.timeScale !== undefined ? chronoDt : dt;`);
  actor = replace(actor, 'const tick = s.dps * s.stacks * curve * dt;', 'const tick = burnTick ?? s.dps * s.stacks * curve * dt;');
  world = "import { castDuration, advanceCastProgress } from './engineAdapter';\n" + world;
  world = replace(world, '    const castTime = caster.skillUseTime(inst);', '    const castTime = caster.skillUseTime(inst);\n    const ordinaryDuration = effMode === \'cast\' ? castDuration(castTime) : undefined;');
  world = replace(world, "if (effMode === 'cast' && castTime <= 0.001)", 'if (ordinaryDuration === 0)');
  world = replace(world, 'total: Math.max(0.2, castTime)', 'total: ordinaryDuration ?? Math.max(0.2, castTime)');
  world = replace(world, 'default: { // cast / perfect / timed / multitude: a bar, then resolution\n        cs.elapsed += dt;\n        if (cs.elapsed >= cs.total) {', 'default: { // cast / perfect / timed / multitude: a bar, then resolution\n        if (advanceCastProgress(cs, dt)) {');
  for (const [name, source] of Object.entries({ actor, world })) fs.writeFileSync(path.join(game, `src/engine/${name}.ts`), source.replace(/\n/g, newline));
  fs.copyFileSync(path.join(here, 'engineAdapter.ts'), bridge);
  return { files: ['src/engine/actor.ts', 'src/engine/world.ts', 'src/engine/engineAdapter.ts'] };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(integrate(path.resolve(process.argv[2])));
