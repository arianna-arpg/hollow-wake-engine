// Runs in the frozen original game. Never imports the extracted implementation.
import fs from 'node:fs';
import path from 'node:path';
import { makeSimWorld } from '../src/sim/arena';
import { seedGlobalRandom } from '../src/sim/rng';
import { Actor } from '../src/engine/actor';
import { mod } from '../src/engine/stats';
import { SKILLS } from '../src/data/skills';
import { STATUS_DEFS } from '../src/engine/status';
import { makeSkillInstance, skillCooldownSeconds, type SkillDef } from '../src/engine/skills';
import { applyDot } from '../src/engine/damage';

const output = process.argv[2];
if (!output) throw new Error('Output directory required');
fs.mkdirSync(output, { recursive: true });
const write = (file: string, value: unknown) => fs.writeFileSync(path.join(output, file), JSON.stringify(value, null, 2) + '\n');
type Command = { type: string; [key: string]: any };
const cases: { name: string; variant?: Partial<SkillDef>; commands: Command[] }[] = [
  { name: 'ordinary-completion-and-recast', variant: { cooldown: 2 }, commands: [
    { type: 'press' }, { type: 'press' }, { type: 'tick', dt: .25 }, { type: 'release' },
    { type: 'tick', dt: .5 }, { type: 'press' }, { type: 'tick', dt: .2 }, { type: 'press' },
    { type: 'rate', value: 2 }, { type: 'tick', dt: 1 }, { type: 'press' }, { type: 'tick', dt: .75 }] },
  { name: 'instant', variant: { useTime: 0, cooldown: 1 }, commands: [
    { type: 'press' }, { type: 'tick', dt: .2 }, { type: 'tick', dt: 1 }, { type: 'press' }] },
  { name: 'minimum-bar-and-snapshotted-speed', variant: { useTime: .1 }, commands: [
    { type: 'press' }, { type: 'speed', value: 10 }, { type: 'tick', dt: .1 }, { type: 'tick', dt: .1 }] },
  { name: 'stun-keeps-payment', variant: { cooldown: 2 }, commands: [
    { type: 'press' }, { type: 'tick', dt: .1 }, { type: 'stun' }, { type: 'tick', dt: .01 }, { type: 'tick', dt: 2 }] },
  { name: 'host-cancel-keeps-press-clock', variant: { cooldown: 2, cooldownAt: 'press' }, commands: [
    { type: 'press' }, { type: 'tick', dt: .1 }, { type: 'cancel' }, { type: 'tick', dt: .3 }] },
  { name: 'completion-reprices-cooldown', variant: { cooldown: 2 }, commands: [
    { type: 'press' }, { type: 'addedCooldown', value: 3 }, { type: 'tick', dt: .75 }] },
  { name: 'insufficient-resources-are-atomic', variant: { manaCost: 6, lifeCost: 5 }, commands: [
    { type: 'resources', mana: 5, life: 100 }, { type: 'press' },
    { type: 'resources', mana: 6, life: 5 }, { type: 'press' },
    { type: 'resources', mana: 6, life: 6 }, { type: 'press' }, { type: 'tick', dt: .75 }] },
];
const casting = cases.map(({ name, variant, commands }) => {
  seedGlobalRandom(12345);
  const w = makeSimWorld('magician', 12345), a = w.player;
  w.devIgnoreSkillAttributes = true;
  a.pos = { x: 500, y: 500 }; w.actors = [a];
  a.sheet.setSource('lifecycle-rig', ['life', 'mana'].map(id => mod(id, 'override', 100))
    .concat(['energyShield', 'lifeRegen', 'manaRegen', 'poise'].map(id => mod(id, 'override', 0)))
    .concat(['castSpeed', 'cooldownRecovery', 'manaCost', 'manaUseCost'].map(id => mod(id, 'override', 1))));
  a.fillResources(); a.useLock = 0; a.cooldowns.clear();
  const def = { ...SKILLS.firebolt, ...variant };
  const inst = makeSkillInstance(def, 1, 0); a.skills = [inst];
  let executed = 0;
  const original = w.executeSkill.bind(w);
  w.executeSkill = (...args: Parameters<typeof w.executeSkill>) => { executed++; return original(...args); };
  const snapshot = () => ({ mana: a.mana, life: a.life, recovery: a.useLock,
    active: a.casting ? { elapsed: a.casting.elapsed, total: a.casting.total } : null,
    cooldowns: [...a.cooldowns], executed, projectiles: w.projectiles.length });
  const initial = snapshot();
  const steps = commands.map(command => {
    let accepted: boolean | undefined, profile: unknown;
    if (command.type === 'press') {
      profile = { skillId: def.id, useTime: a.skillUseTime(inst), cost: a.skillCost(inst),
        cooldown: skillCooldownSeconds(a, inst), cooldownAt: def.cooldownAt === 'press' ? 'press' : 'completion' };
      accepted = w.useSkill(a, inst, { x: 900, y: 500 });
    } else if (command.type === 'tick') {
      w.time += command.dt;
      a.updateTimers(command.dt);
      (w as any).updateCasting(a, command.dt);
    } else if (command.type === 'rate') a.sheet.setSource('rate', [mod('cooldownRecovery', 'override', command.value)]);
    else if (command.type === 'speed') a.sheet.setSource('speed', [mod('castSpeed', 'override', command.value)]);
    else if (command.type === 'addedCooldown') a.sheet.setSource('added', [mod('addedCooldown', 'flat', command.value)]);
    else if (command.type === 'resources') { a.mana = command.mana; a.life = command.life; }
    else if (command.type === 'cancel') a.casting = null;
    else if (command.type === 'release' && a.casting) a.casting.held = false;
    else if (command.type === 'stun') a.applyStatus('stun', 0, 1, 'reference');
    return { command, profile, accepted, completionCooldown: skillCooldownSeconds(a, inst), stunned: a.isStunned(), expected: snapshot() };
  });
  return { name, variant, initial, steps };
});

const dotCommands: Command[] = [
  { type: 'apply', dps: 10, sourceId: 'first' }, { type: 'tick', dt: .75 },
  { type: 'apply', dps: 5, scale: 2, sourceId: 'weaker' }, { type: 'tick', dt: .5 },
  { type: 'apply', dps: 10, scale: 2, sourceId: 'equal' },
  { type: 'apply', dps: 15, scale: .5, sourceId: 'stronger' }, { type: 'tick', dt: 0 },
  { type: 'tick', dt: 1.9 }, { type: 'tick', dt: .25 }, { type: 'tick', dt: 1 },
  { type: 'expiry', value: 2 }, { type: 'apply', dps: 20, sourceId: 'second' },
  { type: 'tick', dt: 3 }, { type: 'apply', dps: 0, scale: 0 }, { type: 'tick', dt: 0 },
];
const dots = [1, .7].map(taken => {
  const a = new Actor('burn-bearer', 'enemy', { x: 0, y: 0 });
  a.sheet.setBase('life', 1000); a.life = 1000;
  a.sheet.setBase('lifeRegen', 0);
  a.sheet.setBase('fireRes', .75); a.sheet.setBase('armor', 10000);
  a.sheet.setBase('damageTaken', taken);
  const steps = dotCommands.map(command => {
    let raw = 0, damage = 0;
    if (command.type === 'apply') a.applyStatus('burn', command.dps, command.scale ?? 1, 'reference', { casterId: command.sourceId });
    else if (command.type === 'expiry') a.sheet.setBase('afflictionExpiry', command.value);
    else { raw = a.updateTimers(command.dt)?.fire ?? 0; damage = raw ? applyDot(a, raw, 'fire') : 0; }
    const s = a.statuses.find(s => s.id === 'burn');
    return { command, expected: { raw, damage, life: a.life, active: s ? { remaining: s.remaining, dps: s.dps, sourceId: s.casterId ?? null } : null } };
  });
  return { taken, steps };
});
write('lifecycle.json', { casting, dots });
write('burning.json', { id: 'burn', damageType: STATUS_DEFS.burn.dotType, duration: STATUS_DEFS.burn.duration, reapply: 'strongest', clock: 'hollow-wake-frame/v1' });
write('firebolt.json', { id: SKILLS.firebolt.id, name: SKILLS.firebolt.name, tags: SKILLS.firebolt.tags,
  castTag: 'cast:timed', manaCost: SKILLS.firebolt.manaCost, cooldown: SKILLS.firebolt.cooldown,
  useTime: SKILLS.firebolt.useTime, baseDamage: SKILLS.firebolt.baseDamage,
  requirements: SKILLS.firebolt.requirements, perLevel: SKILLS.firebolt.leveling!.perLevel,
  nodes: {} });
write('authored.json', { firebolt: SKILLS.firebolt, burn: STATUS_DEFS.burn,
  timedDamage: { id: 'burn', damageType: STATUS_DEFS.burn.dotType, duration: STATUS_DEFS.burn.duration, reapply: 'strongest', clock: 'hollow-wake-frame/v1' } });
console.log(`Recorded ${casting.length} real-world casting paths and ${dots.length} Burning paths.`);
