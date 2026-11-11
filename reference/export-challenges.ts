import {writeFileSync} from 'node:fs';
// Diagnostic observer for the pinned game's complete existing Goad course.
// Reads explicit controller state; it does not supply a replacement controller.
const challengeObservations: unknown[] = [];
let observedChallengeWorld: World | undefined;
const challengeSkills = new Map<SkillInstance, number>();
const challengeCasts = new Set<SkillInstance>();
function challengeSkillId(skill: SkillInstance | undefined | null): number | null {
  if (!skill) return null;
  if (!challengeSkills.has(skill)) challengeSkills.set(skill, challengeSkills.size + 1);
  return challengeSkills.get(skill)!;
}
function observeChallengeWorld(world: World): void {
  observedChallengeWorld = world;
  challengeSkills.clear(); challengeCasts.clear();
  const prepare = world.challenges.prepare.bind(world.challenges);
  world.challenges.prepare = (...args) => {
    const skill = prepare(...args);
    challengeSkillId(args[1]); challengeSkillId(skill); challengeCasts.add(skill);
    return skill;
  };
}
function observeChallengeCheckpoint(name: string, passed: boolean): void {
  const world = observedChallengeWorld;
  if (!world) {challengeObservations.push({name, passed}); return;}
  const controller = world.challenges as any;
  const stateIds = new Map<object, number>();
  const stateId = (state: object) => {
    if (!stateIds.has(state)) stateIds.set(state, stateIds.size + 1);
    return stateIds.get(state)!;
  };
  const castRow = (cast: any): unknown => cast ? ({state: stateId(cast.state),
    inst: challengeSkillId(cast.inst), primed: cast.primed,
    generation: cast.generation, orbitTargets: [...cast.orbitTargets]}) : null;
  const carrier = (row: any) => ({caster: row.caster.id, inst: challengeSkillId(row.inst),
    at: row.at, pos: row.pos, remaining: row.remaining, due: row.due,
    orbitAnchorId: row.orbitAnchorId, anchor: row.anchor,
    hits: row.hits instanceof Map ? [...row.hits] : row.hits});
  const actors = world.actors.map(a => ({id: a.id, owner: a.owner?.id, dead: a.dead,
    sourceSkillId: a.sourceSkillId, team: a.team, tier: a.tier, pos: {...a.pos},
    life: a.life, mana: a.mana, radius: a.radius, lifespan: a.lifespan,
    maxLife: a.maxLife(), thorns: a.sheet.get('thorns'),
    construct: a.construct ? {range: a.construct.range, timer: a.construct.timer} : undefined,
    skills: a.skills.map(challengeSkillId), cooldowns: [...a.cooldowns], cooldownTotals: [...a.cooldownTotals],
    buffs: [...a.buffs].map(([id, b]) => ({id, remaining: b.remaining})),
    statuses: a.statuses.map(s => ({id: s.id, sourceName: s.sourceName, casterId: s.casterId,
      dps: s.dps, stacks: s.stacks, remaining: s.remaining, total: s.total,
      challengeField: s.challengeField, rupture: s.rupture, ruptureType: s.ruptureType}))}));
  const carriers = {projectiles: world.projectiles.map(carrier), repeats: world.pendingRepeats.map(carrier),
    fuses: world.pendingFuses.map(carrier), zones: world.zones.map(carrier)};
  const states = [...controller.states].map(([key, state]: [string, any]) => ({key, identity: stateId(state),
    owner: state.owner.id, host: challengeSkillId(state.host), spec: state.spec,
    policy: state.policy, primed: state.primed, guaranteedAt: state.guaranteedAt, retired: state.retired}));
  const landings = controller.landings.map((l: any) => ({cast: castRow(l.cast), from: l.from, at: l.at,
    delivery: l.d, remaining: l.remaining, duration: l.duration, power: l.power}));
  const effigies = controller.effigies.map((e: any) => ({body: e.body.id, cast: castRow(e.cast),
    creeper: e.creeper?.id, radius: e.radius, average: e.average,
    center: e.center, trailAt: e.trailAt, strikeAt: e.strikeAt}));
  const shocks = controller.shocks.map((s: any) => ({effigy: controller.effigies.indexOf(s.effigy),
    at: s.at, due: s.due, greater: s.greater, echoes: s.echoes}));
  const casts = [...new Set([...challengeCasts, ...challengeSkills.keys()])].map(skill => ({
    key: challengeSkillId(skill), value: castRow(controller.casts.get(skill))}));
  const skills = [...challengeSkills].map(([s, identity]) => ({identity, id: s.def.id, name: s.def.name,
    keys: Object.keys(s), host: challengeSkillId(s.challengeHost), level: s.level,
    tree: s.treeNodes, sockets: s.sockets.map(row => row ? [row.def.id, row.level] : null),
    grafts: s.grafts?.map(row => [row.def.id, row.level]), delivery: s.def.delivery}));
  // Capture now: references to mutable position/spec objects must not allow a
  // later update to rewrite an earlier observation. Encode infinities explicitly.
  challengeObservations.push(JSON.parse(JSON.stringify({name, passed, time: world.time,
    actors, carriers, states, landings, effigies, shocks, casts, skills},
    (_key, value) => typeof value === 'number' && !Number.isFinite(value) ? {$number: String(value)} : value)));
}

import { makeSimWorld } from '../src/sim/arena';
import { seedGlobalRandom } from '../src/sim/rng';
import { makeSkillInstance, instanceDelivery, instanceEffects, type SkillInstance } from '../src/engine/skills';
import { mod } from '../src/engine/stats';
import { skillDamageBands } from '../src/engine/damage';
import { updateAI } from '../src/engine/ai';
import { SKILLS } from '../src/data/skills';
import { CLASSES } from '../src/data/classes';
import { BEAST_FAMILY_BY_ID, beastFamilyOf } from '../src/data/beastFamilies';
import { serializeCharacter, applySavedCharacter, rebuildSkill } from '../src/meta/character';
import { challengeOf } from '../src/engine/challengeSpec';
import type { Actor } from '../src/engine/actor';
import type { World } from '../src/engine/world';
import { NullInput } from '../src/net/intent';
let passed = 0, failed = 0;
const check = (name: string, value: unknown) => { observeChallengeCheckpoint(name, Boolean(value)); console.log(`${value ? 'PASS' : 'FAIL'} ${name}`); value ? passed++ : failed++; };
const near = (a: number, b: number) => Math.abs(a - b) < 0.001;
function setup(nodes: string[] = []) {
  const w = makeSimWorld('tamer', 81933), p = w.player;
  for (const key of Object.keys(w.meta.baseAttrs) as (keyof typeof w.meta.baseAttrs)[]) w.meta.baseAttrs[key] = 100;
  const inst = makeSkillInstance(SKILLS.goad, 20, 3); w.meta.knownSkills.set('goad', inst); p.skills.fill(null); p.skills[0] = inst;
  for (const id of nodes) w.pickTreeNode('goad', id);
  w.recalcPlayer(); p.sheet.setSource('rig', [mod('accuracy', 'flat', 100000), mod('critChance', 'override', 0), mod('mana', 'flat', 10000), mod('life', 'flat', 10000), mod('lifeRegen', 'override', 0)]); p.fillResources();
  observeChallengeWorld(w);
  return { w, p, inst };
}
function target(w: World, x = 90, y = 0) {
  const a = w.createMonster('plains_wolf', 1, 'enemy'); a.skills = [];
  a.pos = { x: w.player.pos.x + x, y: w.player.pos.y + y }; a.tier = w.player.tier;
  a.sheet.setSource('rig', [mod('life', 'flat', 100000), mod('lifeRegen', 'override', 0), mod('evasion', 'override', 0), mod('blockChance', 'override', 0), mod('moveSpeed', 'override', 0)]);
  a.fillResources(); w.actors.push(a); return a;
}
function tick(w: World, time: number) { for (let i = 0; i < Math.ceil(time * 60); i++) w.update(1 / 60); }
function fire(s: ReturnType<typeof setup>, aim: Actor) { s.w.executeSkill(s.p, s.inst, aim.pos); tick(s.w, 0.4); }
const devices = (w: World) => w.actors.filter(a => !a.dead && a.construct && a.sourceSkillId === 'goad');
function reset(s: ReturnType<typeof setup>) { s.w.fonts.push({ pos: { ...s.p.pos } }); s.w.meta.abilityEssences.ability4 = 999; s.w.fontResetTree('goad'); }
function hit(w: World, actor: Actor, victim: Actor) {
  const skill = makeSkillInstance({ ...SKILLS.claw, effects: [{ type: 'damage' }], baseDamage: { physical: [100, 100] } }, 1);
  const before = victim.life;
  (w as unknown as { resolveHit(a: Actor, i: SkillInstance, t: Actor, m: number, d: number): void }).resolveHit(actor, skill, victim, 1, 0);
  return before - victim.life;
}
const restore = seedGlobalRandom(81933);
try {
  {
    const s = setup(), cls = CLASSES.find(c => c.id === 'tamer')!;
    s.w.actors = []; s.w.createPlayer(cls);
    const pets = s.w.actors.filter(a => a.companion), pet = pets[0], tame = s.w.player.skills.find(i => i?.def.id === 'tame_beast')!;
    check('Fresh Tamer starts with exactly one ordinary bonded hound', pets.length === 1 && pet.defId === 'shepherds_hound' && pet.owner === s.w.player);
    check('Starting hound counts toward capacity and exposes Whistle', s.w.slotFaceOf(s.w.player, tame).id === 'companion_whistle');
    s.w.grantStartingCompanions(); check('Starting gift is idempotent', s.w.actors.filter(a => a.companion).length === 1);
    s.w.kill(pet); s.w.executeSkill(s.w.player, makeSkillInstance(SKILLS.companion_whistle, 1), pet.pos);
    check('Starting hound uses the standard downing and revival lifecycle', !pet.dead && !pet.downed && near(pet.life, pet.maxLife()));
    const save = serializeCharacter(s.w); check('Starting hound is saved as an ordinary companion', save.companions?.length === 1);
    applySavedCharacter(s.w, save); check('Loading a saved Tamer cannot duplicate its starting hound', s.w.actors.filter(a => a.companion).length === 1);
    applySavedCharacter(s.w, { ...save, companions: [] }); check('Loading an empty saved roster does not grant a replacement hound', !s.w.actors.some(a => a.companion));
    const guest = s.w.addSeat('goad_guest', cls, new NullInput());
    check('Fresh co-op Tamer receives its own starting hound', s.w.actors.filter(a => a.companion && a.owner === guest.actor).length === 1);
    const shell = s.w.addSeat('goad_saved_guest', cls, new NullInput(), { startingCompanions: false });
    check('Saved guest shells do not receive a fresh-character gift', !s.w.actors.some(a => a.companion && a.owner === shell.actor));
  }
  {
    check('Unlisted beast ids always resolve a fallback family', beastFamilyOf('future_bear').skillId === 'beast_fallback_art');
    check('Known beasts retain their specific family', beastFamilyOf('plains_wolf').skillId === 'beast_hound_art');
    const s = setup(), inst = makeSkillInstance(SKILLS.tame_beast, 20, 3); s.p.skills[1] = inst;
    inst.treeNodes = ['gentle_claim', 'focused_claim', 'returning_claim'];
    const row = BEAST_FAMILY_BY_ID.get('plains_wolf')!; BEAST_FAMILY_BY_ID.delete('plains_wolf');
    try {
      const pet = target(s.w, 40); s.w.tameCompanion(s.p, pet, 'tame_beast');
      // The hunt under test is the AGGRESSIVE conduct (engine/companionStances.ts):
      // the default stance is defensive, and this inert victim never wounds the
      // keeper — pin the conduct so the art fires on the beast's own initiative.
      s.w.setCompanionStance(s.w.localSeat, 'tame_beast', 'aggressive');
      const art = pet.skills.find(i => i?.def.id === 'beast_fallback_art')!, enemy = target(s.w, 85);
      check('An unclassified tamed beast receives a real fallback art', art);
      pet.skills = [art]; for (let i = 0; i < 90; i++) { updateAI(pet, s.w, 1 / 60); s.w.update(1 / 60); }
      check('Fallback art is usable by beast AI and slows its victim', pet.cooldowns.has('beast_fallback_art') && enemy.statuses.some(st => st.id === 'winded'));
    } finally { BEAST_FAMILY_BY_ID.set('plains_wolf', row); }
  }
  {
    const plain = setup(), s = setup(['barbed_challenge']), a = target(s.w);
    check('Barbed Challenge retains the unpenalized damage band', JSON.stringify(skillDamageBands(plain.p, plain.inst)) === JSON.stringify(skillDamageBands(s.p, s.inst)));
    fire(s, a); check('A barbed stone deals damage and applies bleed plus native taunt', a.life < a.maxLife() && ['bleed', 'taunted'].every(id => a.statuses.some(st => st.id === id)));
  }
  {
    const s = setup(['barbed_challenge', 'ready_challenge', 'cheap_challenge', 'swift_challenge']), a = target(s.w);
    const random = Math.random; Math.random = () => 0.999;
    s.w.executeSkill(s.p, s.inst, a.pos);
    check('Measured Reopening guarantees the first ready reset even on a failed random roll', !s.p.cooldowns.has('goad') && [...s.p.buffs.keys()].some(id => id.startsWith('goad_reopening:')));
    Math.random = () => 0.5; tick(s.w, 0.3);
    const wound = a.statuses.find(st => st.id === 'bleed'); if (wound) { wound.dps = 100; wound.remaining = 4; wound.stacks = 1; }
    const before = a.life; s.w.executeSkill(s.p, s.inst, a.pos); tick(s.w, 0.3); Math.random = random;
    check('Primed follow-up bursts old bleed and applies fresh bleed and Hemorrhage', before - a.life > 150 && ['bleed', 'hemorrhage'].every(id => a.statuses.some(st => st.id === id)));
    check('Guaranteed reset cannot recur before its ten-second interval', (s.p.cooldowns.get('goad') ?? 0) > 0);
    check('Driven Barb lodges an empowered impale against bleeding prey', (a.statuses.find(st => st.id === 'impaled')?.rupture ?? 0) > 0);
    tick(s.w, 10); Math.random = () => 0.999; s.w.executeSkill(s.p, s.inst, a.pos); Math.random = random;
    check('Guaranteed reset becomes ready again after its interval', !s.p.cooldowns.has('goad'));
    reset(s); check('Respec clears prepared reset state', ![...s.p.buffs.keys()].some(id => id.startsWith('goad_reopening:')));
  }
  {
    const s = setup(['barbed_challenge', 'deep_barb', 'patient_barb', 'feeding_barb']), a = target(s.w), b = target(s.w, 165, 38), c = target(s.w, 165, -38);
    s.p.life *= 0.5; fire(s, a);
    check('Main impact produces orbiting ballast anchored to its victim', s.w.projectiles.some(p => p.orbitAnchorId === a.id));
    tick(s.w, 0.3);
    check('Forward splinters hit secondary enemies and inherit bleed and taunt', [b, c].some(v => ['bleed', 'taunted'].every(id => v.statuses.some(st => st.id === id))));
    check('Splinter impacts also become orbiting ballast', s.w.projectiles.some(p => p.orbitAnchorId === b.id || p.orbitAnchorId === c.id));
    const own = s.p.life; tick(s.w, 0.5); check('Feeding Barb restores life through actual bleed ticks', s.p.life > own);
    const count = s.w.projectiles.length; tick(s.w, 1);
    check('Orbiting impacts cannot recursively multiply rocks or splinters', s.w.projectiles.length <= count && s.w.projectiles.filter(p => p.orbitAnchorId !== undefined).length <= 12);
    const rock = s.w.projectiles.find(p => p.orbitAnchorId === a.id); a.pos.x += 40; tick(s.w, 0.05);
    check('Orbit anchor follows the struck target rather than the player', rock && near(rock.anchor.x, a.pos.x));
    reset(s); check('Respec retires all owned splinters and orbiting rocks', !s.w.projectiles.some(p => p.inst.challengeHost === s.inst));
  }
  {
    const s = setup(['pack_challenge']), a = target(s.w);
    const before = a.life; s.w.executeSkill(s.p, s.inst, a.pos);
    check('Device root resolves to ground placement with no direct hit effects', instanceDelivery(s.inst).type === 'construct' && instanceEffects(s.inst).length === 0);
    check('Effigy waits for the thrown stone to land', devices(s.w).length === 0);
    tick(s.w, 0.4); const device = devices(s.w)[0];
    check('Landed stone creates a destructible effigy and taunts nearby enemies toward it', device && !device.invulnerable && a.statuses.some(st => st.id === 'taunted' && st.casterId === device.id));
    check('Placement deals no direct damage and has an eight-second base cooldown', near(a.life, before) && (s.p.cooldowns.get('goad') ?? 0) > 7);
    const attack = makeSkillInstance({ ...SKILLS.claw, effects: [{ type: 'damage' }] }, 1);
    a.sheet.setSource('sure_hit', [mod('accuracy', 'flat', 100000)]);
    device.sheet.setSource('no_dodge', [mod('evasion', 'override', 0), mod('blockChance', 'override', 0)]);
    const hp = a.life; s.w.challengeHit(a, attack, device, 1);
    check('Effigy retaliates with real thorns when attacked', a.life < hp && device.sheet.get('thorns') > 0);
  }
  {
    const s = setup(['pack_challenge', 'certain_challenge', 'paid_challenge', 'lasting_challenge']);
    const a = target(s.w), b = target(s.w, 125); a.applyStatus('bleed', 2, 1, 'independent wound'); fire(s, a);
    const device = devices(s.w)[0], ownWound = a.statuses.find(st => st.sourceName === 'independent wound');
    check('Field wound coexists with ordinary bleed and carries only a momentary bank', a.statuses.some(st => st.challengeField === device.id && st.id === 'bleed' && st.remaining < 0.2) && ownWound);
    const outside = target(s.w, 400), field = a.statuses.find(st => st.challengeField === device.id)!;
    (s.w as unknown as { transplantStatus(a: Actor, st: typeof field, name: string, opts: { duration: 'refresh' }): void }).transplantStatus(outside, field, 'Spread rig', { duration: 'refresh' });
    check('Status spreading cannot turn field exposure into a lasting bleed outside the aura', !outside.statuses.some(st => st.id === 'bleed'));
    const before = a.life; tick(s.w, 0.5); check('Living field actually deals physical bleed damage over time', a.life < before);
    const dealt = hit(s.w, s.p, a); const first = b.statuses.find(st => st.id === 'impaled')?.rupture ?? 0;
    check('A hit inside the field lodges an impale in neighboring enemies', near(first, dealt * 0.2));
    hit(s.w, s.p, a); check('Repeated propagation accumulates the neighbor’s impale bank', (b.statuses.find(st => st.id === 'impaled')?.rupture ?? 0) > first);
    a.pos.x += 400; tick(s.w, 0.02);
    check('Leaving removes only the aura bleed immediately', !a.statuses.some(st => st.challengeField !== undefined) && a.statuses.includes(ownWound!));
    const d = instanceDelivery(s.inst); check('Standing Provocation raises capacity to five', d.type === 'construct' && d.maxActive === 5);
    check('Duration investment lengthens the actual effigy lifespan', device.lifespan! > 6);
    for (let k = 0; k < 6; k++) { s.w.executeSkill(s.p, s.inst, b.pos); tick(s.w, 0.2); }
    check('Sixth simultaneous device evicts the oldest and honors the five-device cap', devices(s.w).length === 5 && device.dead);
    reset(s); check('Respec removes all effigies and every field-owned wound', !devices(s.w).length && !s.w.actors.some(a => a.statuses.some(st => st.challengeField !== undefined)));
  }
  {
    const s = setup(['pack_challenge', 'seeking_challenge', 'large_challenge', 'piercing_challenge']), a = target(s.w), b = target(s.w, 115, 20);
    const shocks: number[] = [], execute = s.w.executeSkill.bind(s.w);
    s.w.executeSkill = (...args: Parameters<World['executeSkill']>) => {
      const d = args[1].def.delivery;
      if (args[1].def.name === 'Aftershock' && d.type === 'ground') shocks.push(d.radius);
      return execute(...args);
    };
    const random = Math.random; Math.random = () => 0;
    fire(s, a); const device = devices(s.w)[0], creeper = s.w.actors.find(a => a.sourceSkillId?.startsWith('__goad_creeper:'));
    check('Burrowing Pursuer creates an underground body tethered to its effigy', creeper && creeper.untargetable && creeper.invulnerable);
    const x = creeper!.pos.x, y = creeper!.pos.y, life = a.life;
    tick(s.w, 0.8); check('Pursuer moves in both axes and pelts its prey', creeper!.pos.x !== x && creeper!.pos.y !== y && a.life < life);
    check('Pursuer leaves damaging ground in its wake', s.w.zones.some(z => z.inst.def.name === 'Burrow Wake'));
    tick(s.w, 0.3);
    check('Taunted targets produce greater aftershocks and finite standard echoes', shocks.includes(110) && shocks.includes(65) && shocks.length < 32);
    check('Aftershocks and wake damage nearby incidental targets', b.life < b.maxLife());
    Math.random = random;
    s.w.kill(device, true); tick(s.w, 0.05); check('Destroying the effigy retires its pursuer', creeper!.dead);
    reset(s); check('Reset retires outstanding wake and aftershock payloads', !s.w.zones.some(z => z.inst.challengeHost === s.inst));
  }
  {
    const s = setup(['pack_challenge']);
    s.p.sheet.setSource('wide_aura', [mod('aoeRadius', 'more', 1)]);
    s.p.sheet.setSource('device_duration', [mod('effectDuration', 'more', 1, ['minion'])]);
    const a = target(s.w), b = target(s.w, 350); fire(s, a);
    check('Area investment expands both the device field and its actual taunt pulse', b.statuses.some(st => st.id === 'taunted'));
    check('Duration investment scoped to the new minion tag reaches the actual device', devices(s.w)[0].lifespan! > 11);
  }
  {
    const s = setup(['pack_challenge', 'certain_challenge', 'lasting_challenge']);
    const rebuilt = rebuildSkill(serializeCharacter(s.w).knownSkills.find(k => k.skillId === 'goad')!)!;
    check('Save rebuild preserves the new device identity and mechanics', JSON.stringify(challengeOf(rebuilt)) === JSON.stringify(challengeOf(s.inst)) && instanceDelivery(rebuilt).type === 'construct');
    const a = target(s.w); s.w.executeSkill(s.p, s.inst, a.pos); reset(s); tick(s.w, 1);
    check('Reset during the toss cancels the pending device', !devices(s.w).length);
  }
  {
    const s = setup(['pack_challenge']), a = target(s.w);
    s.w.executeSkill(s.p, s.inst, a.pos); s.w.loadZone(s.w.zone.id); tick(s.w, 1);
    check('Zone travel cancels a stone still in flight', !devices(s.w).length);
    const b = target(s.w); fire(s, b); s.p.skills.fill(null); tick(s.w, 0.05);
    check('Unseating Goad retires its device', !devices(s.w).length);
  }
} finally { restore(); }
console.log(`Goad: ${passed} passed, ${failed} failed.`); process.exitCode = failed ? 1 : 0;

const restoreSupplement = seedGlobalRandom(81934);
try {
// Supplemental identity course: preparing a captured cast is idempotent,
// including after its host is retired. Replaying acquisition is not copying.
{
  const s = setup(['barbed_challenge', 'deep_barb']);
  const cast = s.w.challenges.prepare(s.p, s.inst, false);
  check('Captured challenge cast retains identity on repeated preparation', s.w.challenges.prepare(s.p, cast, false) === cast);
  s.w.challenges.clear(s.p, s.inst);
  check('Retired challenge cast remains recognized through a retained handle', s.w.challenges.prepare(s.p, cast, false) === cast);
}

// Isolate controller retirement from World's separate cleanup machinery.
{
  const s = setup(['barbed_challenge', 'deep_barb']);
  const cast = s.w.challenges.prepare(s.p, s.inst, false);
  const foreign = target(s.w, 160);
  s.w.spawnProjectile(s.p, cast, s.p.pos, 0);
  s.w.spawnProjectile(foreign, cast, foreign.pos, 0);
  const own = s.w.projectiles.filter(p => p.caster === s.p && p.inst.challengeHost === s.inst);
  const other = s.w.projectiles.filter(p => p.caster === foreign && p.inst.challengeHost === s.inst);
  check('Direct retirement course holds owned and foreign-caster challenge projectiles', own.length > 0 && other.length > 0);
  s.w.challenges.clear(s.p, s.inst);
  check('Direct retirement removes owned projectiles and preserves foreign-caster identities', own.every(p => !s.w.projectiles.includes(p)) && other.every(p => s.w.projectiles.includes(p)));
  const retained = [...s.w.projectiles];
  s.w.challenges.clear(s.p, s.inst);
  check('Repeated retirement preserves the remaining carrier order', s.w.projectiles.length === retained.length && retained.every((p, i) => s.w.projectiles[i] === p));
}

} finally {restoreSupplement();}
process.exitCode = failed ? 1 : 0;
writeFileSync(process.argv[2], JSON.stringify({scope:'original-challenge-boundary/v1',observations:challengeObservations},null,2)+'\n',{flag:'wx'});
