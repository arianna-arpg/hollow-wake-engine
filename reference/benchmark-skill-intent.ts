import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import * as arena from '../src/sim/arena';
import * as skills from '../src/engine/skills';
import { SKILLS } from '../src/data/skills';
import { SUPPORTS } from '../src/data/supports';
import { seedGlobalRandom } from '../src/sim/rng';

const [previous, current, output] = process.argv.slice(2);
const load = async (game: string) => {
  const get = (file: string) => import(pathToFileURL(path.join(game, file)).href);
  return { arena: await get('src/sim/arena.ts'), skills: await get('src/engine/skills.ts'),
    ...await get('src/data/skills.ts'), ...await get('src/data/supports.ts'), ...await get('src/sim/rng.ts') };
};
const apis: any = { original: { arena, skills, SKILLS, SUPPORTS, seedGlobalRandom }, previous: await load(previous), current: await load(current) };
const keys = Object.keys(apis), configs: any = {}, results: any[] = [];
for (const key of keys) {
  const api = apis[key]; api.arena.bootSimEngine();
  const restore = api.seedGlobalRandom(311500); let world: any;
  try { world = api.arena.makeSimWorld('warrior', 311500); } finally { restore(); }
  for (const id of Object.keys(world.meta.baseAttrs)) world.meta.baseAttrs[id] = 50;
  world.recalcPlayer(); world.walk = null; world.actors = [world.player];
  const p = world.player;
  for (const [id, value] of Object.entries({ life: 1000, mana: 10000, energyShield: 0, castSpeed: 1, attackSpeed: 1 })) p.sheet.setBase(id, value);
  p.fillResources();
  const queries = ['ruin', 'scattergun', 'trisect', 'one_two', 'mimicry', 'firebolt'].map(id => api.skills.makeSkillInstance(api.SKILLS[id], 1, 3));
  queries[2].state = { comboIdx: 1, comboAt: world.time };
  queries[3].state = { comboIdx: 2, comboAt: world.time };
  queries[5].sockets[0] = { def: api.SUPPORTS.cast_on_crit, level: 1 };
  p.mimicBank = [{ sid: 'ruin', src: 'zombie', at: world.time }];
  const native = ['ruin', 'firebolt', 'scattergun', 'trisect'].map(id => api.skills.makeSkillInstance(api.SKILLS[id], 1, 0));
  p.skills = queries;
  for (const inst of queries) world.meta.knownSkills.set(inst.def.id, inst);
  configs[key] = { world, queries, native };
}
function run(key: string, native: boolean) {
  const { world: w, queries, native: definitions } = configs[key], a = w.player;
  let hud = 0, press = 0, admitted = 0, refused = 0, faces = 0;
  if (!native) {
    a.casting = null; a.useLock = 0; a.reflexLock = 0; a.cooldowns.clear(); a.mana = 10000;
    for (let frame = 0; frame < 512; frame++) {
      // Include exact combo endpoints, expiry, empty/funded guns and empty/selected mimic.
      w.time = frame % 4; a.skillChargeBank(queries[1]).count = frame % 2 ? 0 : 3;
      a.mimicBank = frame % 2 ? [] : [{ sid: 'ruin', src: 'zombie', at: w.time }];
      for (const inst of queries) {
        if (w.skillUsable(a, inst)) hud++;
        if (w.pressUsable(a, inst)) press++;
        faces += w.slotFaceOf(a, inst).id.length;
      }
    }
  } else {
    w.time = 0; const aim = { x: a.pos.x + 120, y: a.pos.y };
    for (let index = 0; index < 1024; index++) {
      const inst = definitions[index % definitions.length];
      a.casting = null; a.useLock = 0; a.reflexLock = 0; a.cooldowns.clear(); a.mana = index % 8 === 0 ? 0 : 10000;
      if (inst.def.id === 'scattergun') a.skillChargeBank(inst).count = 3;
      if (inst.def.id === 'trisect') inst.state = { comboIdx: index % 3, comboAt: w.time };
      if (w.skillUsable(a, inst)) hud++;
      if (w.pressUsable(a, inst)) press++;
      if (w.useSkill(a, inst, aim, true)) admitted++; else refused++;
    }
  }
  return { hud, press, faces, admitted, refused, mana: a.mana, life: a.life,
    banks: [...a.skillChargeState], meta: [...a.metaInsts].map(([id, i]: any) => [id, i.def.id, i.level, i.hostSkillId, i.chainOf]),
    cast: a.casting ? { id: a.casting.inst.def.id, mode: a.casting.mode } : null };
}
for (const [name, native] of [['mixed-hud-press-face', false], ['native-hud-press-and-cast-start', true]] as const) {
  const samples: Record<string, number[]> = Object.fromEntries(keys.map(k => [k, []])); let expected = '';
  // Prime caches across all three before comparing retained-state receipts.
  for (const key of keys) run(key, native);
  for (let trial = -5; trial < 25; trial++) for (let offset = 0; offset < keys.length; offset++) {
    const key = keys[((trial + keys.length * 2) % keys.length + offset) % keys.length];
    const start = performance.now(), result = run(key, native), elapsed = performance.now() - start, actual = JSON.stringify(result);
    if (!expected) expected = actual; else assert.equal(actual, expected, name + '/' + key);
    if (trial >= 0) samples[key].push(elapsed);
  }
  const timing = Object.fromEntries(keys.map(k => {
    const sorted = [...samples[k]].sort((a, b) => a - b);
    return [k, { samplesMs: samples[k], medianMs: sorted[12], p95Ms: sorted[23] }];
  }));
  const receipt = JSON.parse(expected); assert(receipt.hud > 0 && receipt.press > 0);
  if (native) assert(receipt.admitted > 0 && receipt.refused > 0);
  results.push({ name, operations: native ? 1024 : 9216, derivedSha256: createHash('sha256').update(expected).digest('hex'), receipt, ...timing });
  console.log(name + ': ' + keys.map(k => k + '=' + timing[k].medianMs.toFixed(4) + 'ms').join(', '));
}
fs.writeFileSync(output, JSON.stringify({
  scope: 'Rotating original/v0.26/candidate, five warmups and 25 samples. 9216 HUD/press/face queries include combo endpoints/expiry, empty/funded ammunition, empty/selected mimic and trigger-equipped skills. Native workload includes 1024 real cast-start requests; no completed effect simulation. Setup/reset and result construction are inside timing. All derived receipts equal. Desktop Node timings only; not allocation, renderer frame or device acceptance.',
  node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, results,
}, null, 2) + '\n', { flag: 'wx' });
