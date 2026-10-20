// ---------------------------------------------------------------------------
// ONE-OFF PROBE — THE LAIR FABRIC end to end on the real engine
// (docs/engine/lairs.md): the registry weave (every lair's landmark, mouth
// rule, sidezone, den tileset, natives, hoard and look resolve), THE SEAT
// FOLD's pure law (biome × cave-depth strata × level × chance — "yetis only
// in the first and second caves under the mountains" held by assertion),
// placement through the standing landmark machinery (the mouth stands, the
// spoor dresses the apron, mustReach joins the net, the noDeeper strip
// eats stray doors), den-mint purity (same mouth, same den — byte-equal),
// and the LIVE laws: the Frostmaw round trip (boss ask, larder fauna, the
// Rimefather falls → the objective banks), the yeti's snatch-and-hurl
// through the grab fabric, the cairn giant's visible sleeping ambush, the
// vault's riddle (puzzle ask, dormant latched-once sphinx warden), and THE
// SENTRY LAW on eruption country (RIG R: effectLavaOrb's volley pays awake
// bodies and passes dormant sleepers by — Zone.spareDormant, the kilnhoard's
// ember vents beside the Urnfather's coils; RIG S: the law rides the
// RE-STRIKES — a lingering eruption's tick and armed pulse spare the same
// sleeper the impact spares, while awake bodies keep paying both lanes).
// Run: npx tsx balance/probe_lairs.ts
// ---------------------------------------------------------------------------

import '../src/data/clusters';
import '../src/data/formations';
import '../src/engine/landmarkBuilders';
import '../src/data/landmarks';
import '../src/engine/layoutRecipes';
import '../src/engine/interiorGen';
import '../src/data/massifs';
import '../src/data/compositions';
import '../src/data/lairs';

import { Rng } from '../src/core/rng';
import { vec, type Vec2 } from '../src/core/math';
import { presenceMul, presenceTable } from '../src/engine/presence';
import {
  clusterDefs, compositionDefs, doodadRuleOf, generateLayout, hasCluster,
  hasComposition, hasLandmark, isSidezoneEntranceKind, landmarkDefs, landmarkOf,
  type GenCtx, type GeneratedLayout,
} from '../src/engine/levelgen';
import { storyReachable, tierFloorAt, tilesetStoryReach } from '../src/engine/tiers';
import { STATUS_DEFS } from '../src/engine/status';
import { SYMPATHY_LINKS } from '../src/engine/sympathy';
import { carveMassifs, massKindOf, tenantKindIds, type MassPoolRow, type TenantRow } from '../src/engine/massif';
import { GridWalkField } from '../src/world/gridWalk';
import { LAIR_CFG, lairLandmarkRolls, lairOf, lairRows, registerLair } from '../src/engine/lairs';
import { reserveFrac } from '../src/engine/reserves';
import { BIOMES } from '../src/world/biomes';
import { TILESETS } from '../src/data/tilesets';
import { HUNGER_LEAN, MONSTERS, WILDLIFE } from '../src/data/monsters';
import { SKILLS } from '../src/data/skills';
import { LOOKS } from '../src/data/looks';
import { PART_PAINTERS } from '../src/render/vis/parts';
import { LOOT_TABLES } from '../src/data/loottables';
import { DOODAD_VISUALS } from '../src/data/doodadVisuals';
import { sidezoneOf } from '../src/data/sidezones';
import { DORMANT_TAGS, isDormant, ROUSE_RULES, updateAI } from '../src/engine/ai';
import { CREEPS } from '../src/engine/creep';
import { COMBO_RULES } from '../src/data/combos';
import { trackPose, trackRider, type PlacedTrack } from '../src/engine/tracks';
import { makeSkillInstance, type SkillDef } from '../src/engine/skills';
import { mod } from '../src/engine/stats';
import { skyOf, type ZoneDef } from '../src/data/zones';
import type { Actor } from '../src/engine/actor';
import { bootSimEngine, makeSimWorld } from '../src/sim/arena';
import { seedGlobalRandom } from '../src/sim/rng';

let fails = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fails++;
};

const LAIR_IDS = [
  'frostmaw', 'giants_cairn', 'hag_hovel', 'riddle_vault',
  // Wave two — lairs of many laws.
  'bull_maze', 'wyrm_barrow', 'spinney', 'wellspring',
  // Wave eight — the homed kin (the biomes that had none).
  'scythe_court', 'stamping_ground', 'rimevault', 'hunts_rest', 'tidewomb',
  // Wave nine — the homed kin continue (the archipelago + hell's marches).
  'drumshell', 'chainworks',
  // Wave ten — the freshest ground (the roost is deliberately absent: its
  // door rides the composition lane, no lair row — the wane-arch family).
  'geode_sett', 'rimewick_clutch', 'honeyfold',
  // Wave eleven — the sea's faces + the butteland caves (the vent brood is
  // deliberately absent: composition lane, no lair row — the roost's family).
  'pard_larder',
  // Batch 28 — THE ALOFT LANE's debut: the butte TOPS' claim (siteTier 1),
  // butteland's third axis beside the moot's ground and the larder's caves.
  'baboon_midden',
  // Batch 30 — THE STORIES GATE's first live ask: the pinnacle crown
  // (stories 3 at the fold, siteTier 3 at the dart).
  'sleepless_watch',
  // Batch 31 — the bombardment fabric at lair grain: the in-zone storm_crown
  // on the FOURTH terrace (stories 4 at the fold — the rung above the watch).
  'storm_crown',
];
const MOUTHS = [
  'frostmaw_maw', 'hovel_door', 'sphinx_gate',
  'maze_gate', 'wyrm_barrow_mouth', 'spinney_bole',
  // Wave six — the ring-tenant lane's default den door (same kit contract).
  'scorpion_well',
  // Wave eight — the homed kin's five doors.
  'bower_gate', 'stamping_gap', 'glacier_mouth', 'hunt_gate', 'tide_hollow',
  // Wave nine — the homed kin's two doors.
  'drum_burrow', 'windlass_gate',
  // Wave ten — the homed kin's three doors (the knoll's hollow included:
  // however a registered-sidezone door is planted, it owes the same kit).
  'geode_crack', 'wax_gate', 'roost_hollow',
  // Wave eleven — the nest among the smokers + the larder under the moot.
  'vent_nest', 'larder_crag',
  // Batch 28 — the cleft in the needle's crown (THE ALOFT LANE's door).
  'midden_mouth',
  // Batch 30 — the door on the pinnacle's third terrace.
  'horn_gate',
];
const NATIVES = [
  'yeti', 'yeti_alpha', 'hill_giant', 'mire_hag', 'vault_sphinx',
  'maze_bull', 'emberwyrm', 'spinney_matron', 'spinney_broodling', 'river_naiad',
  // Wave eight — the homed kin's residents (the courser is half the pair).
  'mantis_abbess', 'great_aurochs', 'rimeclad_elder',
  'hollow_huntsman', 'gloam_courser', 'tideheart_matron',
  // Wave nine — the homed kin's residents (the drummer is half the pair).
  'drumclaw_patriarch', 'strand_drummer', 'chainwright',
  // Wave ten — the homed kin's residents (courts and alphas both).
  'prism_brock', 'prismbrock_matriarch', 'rimewick', 'rimewick_matron',
  'gale_swift', 'stream_shrike', 'replete_foldmother',
  // Wave eleven — the brood court, the terraces' grip tutor, both alphas.
  'vent_crab', 'shelf_lurker', 'vent_matron', 'larder_pard',
  // Batch 28 — the midden's sovereign.
  'baboon_king',
  // Batch 30 — the crown's far-seer and his drowsing court.
  'sleepless_warden', 'horn_thegn',
  // Batch 31 — the storm crown's gun, its conductor part, its standing court.
  'stormcrown_caller', 'levin_rod', 'levin_thegn',
];

// --- RIG A: the registry weave --------------------------------------------------
{
  for (const id of LAIR_IDS) {
    const row = lairOf(id);
    check(`A1 lair '${id}' registered with a real landmark`,
      !!row && hasLandmark(row.landmark));
    const badB = row ? row.seat.biomes.filter(b => !BIOMES[b]) : ['<unregistered>'];
    check(`A2 '${id}' seat biomes resolve`, badB.length === 0, badB.join(','));
    check(`A3 '${id}' chance sane`, !!row && row.seat.chance > 0 && row.seat.chance <= 1);
  }
  check('A4 the fold sees every row', lairRows().length >= LAIR_IDS.length);
  for (const m of MOUTHS) {
    check(`A5 mouth '${m}' — sidezone + trigger rule + visual + entrance kind`,
      !!sidezoneOf(m) && doodadRuleOf(m).overlap === 'trigger'
      && !!DOODAD_VISUALS[m] && isSidezoneEntranceKind(m));
  }
  for (const id of NATIVES) {
    const d = MONSTERS[id];
    check(`A6 native '${id}' authored`, !!d);
    const badS = d ? d.skills.filter(s => !SKILLS[s]) : ['<none>'];
    check(`A7 '${id}' kit resolves`, badS.length === 0, badS.join(','));
    const look = d?.look ? LOOKS[d.look] : undefined;
    const badP = look ? [...look.parts, ...(look.live ?? [])].filter(p => !PART_PAINTERS[p.kind]).map(p => p.kind) : ['<no look>'];
    check(`A8 '${id}' look parts paint`, !!look && badP.length === 0, badP.join(','));
  }
  check('A9 the hoard table stands', !!LOOT_TABLES.lair_hoard);
  for (const id of ['yeti_alpha', 'hill_giant', 'mire_hag', 'vault_sphinx']) {
    check(`A10 '${id}' pays the lair hoard`, MONSTERS[id]?.loot === 'lair_hoard');
  }
  check('A11 alphas wear the boss law (rimefather + hag seal arenas)',
    MONSTERS.yeti_alpha?.boss === true && MONSTERS.mire_hag?.boss === true);
  check('A12 the giant is a marquee elite, never a boss classification',
    MONSTERS.hill_giant?.bossBar === true && !MONSTERS.hill_giant?.boss);
  check('A13 the warden tag is dormant + latched-once',
    isDormant({ tag: 'vault_warden' } as Actor)
    && !isDormant({ tag: 'vault_warden', aiAwakened: true } as Actor));
  for (const t of ['frostmaw_hollow', 'hag_hollow', 'riddle_vault']) {
    const ts = TILESETS[t];
    check(`A14 den tileset '${t}' — sealed off the frontier, perf-probed, sheltered`,
      !!ts && ts.frontier === false && ts.perfProbe === true && ts.sky === 'sheltered');
    const badPk = ts ? ts.packs.table.filter(r => !MONSTERS[r.id]).map(r => r.id) : ['<none>'];
    check(`A15 '${t}' pack table resolves`, badPk.length === 0, badPk.join(','));
  }
  check('A16 the vault carries a riddle repertoire (puzzle rows)',
    (TILESETS.riddle_vault?.puzzles?.length ?? 0) >= 2);
}

// --- RIG B: the seat fold's pure law --------------------------------------------
{
  const at = (place: 'cave' | 'surface', biome: string, caveDepth: number | undefined,
    level: number, extra?: { noDeeper?: boolean; port?: boolean }) =>
    lairLandmarkRolls({ place, biome, caveDepth, level, tileset: 'cavern', ...extra });
  const has = (rolls: { landmark: string }[], lm: string) => rolls.some(r => r.landmark === lm);
  const chanceOf = (rolls: { landmark: string; chance: number }[], lm: string) =>
    rolls.find(r => r.landmark === lm)?.chance ?? 0;

  const d1 = at('cave', 'highland', 1, 20);
  const d2 = at('cave', 'highland', 2, 20);
  const d3 = at('cave', 'highland', 3, 20);
  const d4 = at('cave', 'highland', 4, 20);
  check('B1 the frostmaw claims highland caves at depth 1–2 (full weight)',
    has(d1, 'frostmaw_lair_mouth') && has(d2, 'frostmaw_lair_mouth')
    && Math.abs(chanceOf(d1, 'frostmaw_lair_mouth') - chanceOf(d2, 'frostmaw_lair_mouth')) < 1e-9);
  check('B2 depth 3 thins on the fadeOut, depth 4 refuses outright',
    chanceOf(d3, 'frostmaw_lair_mouth') > 0
    && chanceOf(d3, 'frostmaw_lair_mouth') < chanceOf(d1, 'frostmaw_lair_mouth')
    && !has(d4, 'frostmaw_lair_mouth'));
  check('B3 the highland SURFACE holds no maw (place: cave)',
    !has(at('surface', 'highland', undefined, 20), 'frostmaw_lair_mouth'));
  check('B4 a green world refuses the deep hunger (level gate)',
    !has(at('cave', 'highland', 1, 1), 'frostmaw_lair_mouth'));
  check('B5 the giant claims the high surface, never the ladder',
    has(at('surface', 'highland', undefined, 20), 'giants_cairn')
    && has(at('surface', 'downs', undefined, 20), 'giants_cairn')
    && !has(at('cave', 'highland', 1, 20), 'giants_cairn'));
  check('B6 the hag keeps to the true marsh',
    has(at('surface', 'marsh', undefined, 20), 'hag_hovel')
    && !has(at('surface', 'grave', undefined, 20), 'hag_hovel')
    && !has(at('surface', 'downs', undefined, 20), 'hag_hovel'));
  check('B7 the vault stands on the erg AND inside its first caves (place: both)',
    has(at('surface', 'desert', undefined, 20), 'riddle_vault_gate')
    && has(at('cave', 'desert', 1, 20), 'riddle_vault_gate')
    && !has(at('cave', 'desert', 4, 20), 'riddle_vault_gate'));
  // The control biome moved jungle → metropolis in wave eight: jungle joined
  // the claimed map (the Scythe Court), and a city is the one country no
  // wild den will ever claim — the law itself (unclaimed ground burns no
  // rolls) is unchanged.
  check('B8 wrong country, no claim (the metropolis offers nothing)',
    at('cave', 'metropolis', 1, 20).length === 0 && at('surface', 'metropolis', undefined, 20).length === 0);
  check('B9 sealed pockets grow no lairs; harbors keep no monsters\' doors',
    at('cave', 'highland', 1, 20, { noDeeper: true }).length === 0
    && at('surface', 'desert', undefined, 20, { port: true }).length === 0);
  check('B10 the fold is pure (two reads, one truth)',
    JSON.stringify(d1) === JSON.stringify(at('cave', 'highland', 1, 20)));
  // Level 2 sits at the fadeIn's hard zero; level 3 is a third of the way up
  // the ramp (thinner than full); level 2.02 scales to ~0.0023 — under the
  // minChance floor, so the row is DROPPED, never baked as a ghost draw.
  check('B11 the fadeIn thins and scaled ghosts drop below the floor (minChance law)',
    LAIR_CFG.minChance > 0
    && !has(at('cave', 'highland', 1, 2), 'frostmaw_lair_mouth')
    && chanceOf(at('cave', 'highland', 1, 3), 'frostmaw_lair_mouth') > 0
    && chanceOf(at('cave', 'highland', 1, 3), 'frostmaw_lair_mouth')
      < chanceOf(d1, 'frostmaw_lair_mouth')
    && !has(at('cave', 'highland', 1, 2.02), 'frostmaw_lair_mouth'));
}

// --- RIG C: placement through the standing machinery ----------------------------
const ARENA = { w: 1700, h: 1300 };
const gen = (def: ZoneDef, seed: number): GeneratedLayout => {
  const entry = vec(140, ARENA.h / 2);
  const exits: Vec2[] = [vec(ARENA.w - 140, ARENA.h / 2)];
  return generateLayout({ ...def, seed }, ARENA, new Rng(seed), entry, exits);
};
const caveDef = (over: Partial<ZoneDef>): ZoneDef => ({
  id: 'probe_lair_cave', name: 'Probe Cave', level: 12,
  size: { w: ARENA.w, h: ARENA.h },
  theme: { ...TILESETS.cavern.theme },
  layout: [
    { kind: 'rocks', count: [2, 4], radius: [16, 28] },
  ],
  objective: { kind: 'none' },
  packs: TILESETS.cavern.packs,
  exits: [{ to: 'probe_home', side: 's' }],
  map: { x: 0, y: 0 },
  seed: 0,
  caveDepth: 1, anchor: 'highland',
  ...over,
});
{
  const withMaw = caveDef({ landmarks: [{ landmark: 'frostmaw_lair_mouth', chance: 1 }] });
  const out = gen(withMaw, 90210);
  const maws = out.doodads.filter(d => d.kind === 'frostmaw_maw');
  check('C1 the maw stands (one mouth, chance-1 roll through the landmark loop)',
    maws.length === 1, `${maws.length} maws`);
  const spoor = out.doodads.filter(d => (d.kind === 'bone_pile' || d.kind === 'bone' || d.kind === 'rock')
    && maws[0] && Math.hypot(d.pos.x - maws[0].pos.x, d.pos.y - maws[0].pos.y) < 160);
  check('C2 the spoor ring dresses the apron (the den reads before the door)',
    spoor.length >= 3, `${spoor.length} pieces`);
  const again = gen(withMaw, 90210);
  const print = (o: GeneratedLayout) => o.doodads.map(d =>
    `${d.kind}:${Math.round(d.pos.x)},${Math.round(d.pos.y)}`).join('|');
  check('C3 same seed, same den door (placement determinism)', print(out) === print(again));

  const sealed = gen(caveDef({
    landmarks: [{ landmark: 'frostmaw_lair_mouth', chance: 1 }], noDeeper: true,
  }), 90210);
  check('C4 a sealed pocket strips the stray door (the noDeeper chokepoint)',
    sealed.doodads.every(d => d.kind !== 'frostmaw_maw'));

  const cairn = gen(caveDef({
    landmarks: [{ landmark: 'giants_cairn', chance: 1 }], caveDepth: undefined, anchor: undefined,
  }), 41100);
  check('C5 the cairn furnishes its own floor (cookfire in the ring — pit inner rows)',
    cairn.doodads.some(d => d.kind === 'campfire'));
  const giantSpawn = (cairn.landmarkSpawns ?? []).filter(s => s.id === 'hill_giant');
  check('C6 the giant sleeps in the ring, ambush-armed and VISIBLE',
    giantSpawn.length === 1 && giantSpawn[0].ambush?.visible === true
    && (giantSpawn[0].ambush?.pack ?? 0) > 0);
}

// --- RIG D: the live dens (sim world) -------------------------------------------
bootSimEngine();
seedGlobalRandom(0x1a17);
const world = makeSimWorld('warrior', 771001);
/* eslint-disable @typescript-eslint/no-explicit-any */
const w = world as any;
const homeId: string = w.zone.id;
const leaveToHome = (): void => {
  w.loadZone(homeId);
  w.caveReturn = null;
  w.caveStack = [];
};
const step = (secs: number): void => {
  const dt = 1 / 30;
  for (let t = 0; t < secs; t += dt) {
    for (const a of w.actors) updateAI(a, world, dt);
    w.update(dt);
  }
};

// D-I: the Frostmaw round trip.
{
  w.player.pos = vec(400, 400);
  w.enterSidezone({ pos: { x: 400, y: 400 }, seed: 91101, kind: 'frostmaw_maw' });
  check('D1 the maw mints the Frostmaw (id + name + one rung down)',
    w.zone.id === `cave_frostmaw_maw_${homeId}_91101`
    && String(w.zone.name).includes('Frostmaw') && w.zone.caveDepth >= 1,
    `${w.zone.id} · ${w.zone.name}`);
  check('D2 the den is the bottom (noDeeper) and asks for the Rimefather (boss)',
    w.zone.noDeeper === true && w.zone.objective.kind === 'boss'
    && w.zone.objective.id === 'yeti_alpha');
  const alpha = (w.actors as Actor[]).find(a => a.defId === 'yeti_alpha');
  check('D3 the Rimefather holds the bottom of the cold', !!alpha);
  const pack = (w.actors as Actor[]).filter(a => a.defId === 'yeti');
  check('D4 the den fields its pack', pack.length >= 1, `${pack.length} yetis`);
  const hares = (w.actors as Actor[]).filter(a => a.defId === 'snow_hare');
  check('D5 the larder is stocked (snow hares, the mint-authored pantry)',
    hares.length >= 1, `${hares.length} hares`);
  if (alpha) {
    w.kill(alpha, false, w.player);
    step(0.2);
    check('D6 the Rimefather falls → the ask completes (objectiveDone)',
      w.objectiveDone === true);
  }
  leaveToHome();
}

// D-II: the yeti's snatch-and-hurl (the grab fabric worn as identity).
{
  const p = w.player;
  p.pos = w.clampPos(vec(w.arena.w / 2, w.arena.h / 2), p.radius);
  // The rig hangs on ONE swing landing — floor the hero's evasion so the
  // roll can never whiff it (the single-roll time-bomb law).
  p.sheet.setSource('probe', [mod('evasion', 'flat', -1e6)]);
  const yeti = w.createMonster('yeti', 8, 'enemy') as Actor;
  w.actors.push(yeti);
  yeti.pos = vec(p.pos.x + 50, p.pos.y);
  const snatch = yeti.skills.find((s: any) => s?.def.id === 'yeti_snatch');
  const hurl = yeti.skills.find((s: any) => s?.def.id === 'yeti_hurl');
  check('D7 the kit carries the pair', !!snatch && !!hurl);
  check('D8 empty-handed hurl refuses (the holding gate)',
    !w.useSkill(yeti, hurl, vec(p.pos.x, p.pos.y)));
  const seized = w.useSkill(yeti, snatch, vec(p.pos.x, p.pos.y));
  step(0.7);
  check('D9 the snatch closes the hand (heldBy pairs, the seat slaves)',
    seized && p.heldBy === yeti.id, `heldBy ${String(p.heldBy)}`);
  const before = { x: p.pos.x, y: p.pos.y };
  const threw = w.useSkill(yeti, hurl, vec(p.pos.x + 400, p.pos.y));
  step(0.6);
  const flew = Math.hypot(p.pos.x - before.x, p.pos.y - before.y);
  check('D10 the hurl spends the catch (released, at speed)',
    threw && p.heldBy === undefined && flew > 60, `flew ${flew.toFixed(0)}px`);
  p.sheet.setSource('probe', []);
  yeti.dead = true;
  step(0.1);
}

// D-III: the vault of the asking.
{
  w.player.pos = vec(400, 400);
  w.enterSidezone({ pos: { x: 400, y: 400 }, seed: 32032, kind: 'sphinx_gate' });
  check('D11 the gate mints the Vault (puzzle ask, no body count)',
    w.zone.id === `cave_sphinx_gate_${homeId}_32032`
    && w.zone.objective.kind === 'puzzle' && w.zone.noDeeper === true,
    `${w.zone.id} · objective ${w.zone.objective.kind}`);
  check('D12 the riddle stood up (a live puzzle run in the zone)',
    Array.isArray(w.puzzles) && w.puzzles.length >= 1, `${w.puzzles?.length ?? 0} puzzles`);
  const sphinx = (w.actors as Actor[]).find(a => a.defId === 'vault_sphinx');
  check('D13 the warden is home (authored tenancy, chance 1)', !!sphinx);
  if (sphinx) {
    check('D14 she is STATUARY until struck (dormant warden law)',
      isDormant(sphinx) && sphinx.tag === 'vault_warden');
    w.rouseOnWound(sphinx);
    check('D15 violence is a choice with a price (roused, latched-once)',
      sphinx.aiAwakened === true && isDormant(sphinx) === false);
  }
  leaveToHome();
}

// D-IV: the hag's hollow answers its door.
{
  w.player.pos = vec(400, 400);
  w.enterSidezone({ pos: { x: 400, y: 400 }, seed: 55055, kind: 'hovel_door' });
  check('D16 the hovel door minted the Hollow (boss ask: the hag)',
    w.zone.objective.kind === 'boss' && w.zone.objective.id === 'mire_hag'
    && String(w.zone.name).includes('Hollow'));
  const hag = (w.actors as Actor[]).find(a => a.defId === 'mire_hag');
  check('D17 the crone is home', !!hag);
  leaveToHome();
}

// --- RIG E: den-mint purity (same mouth, same den — forever) --------------------
{
  const sz = sidezoneOf('frostmaw_maw')!;
  const ctx = {
    parent: w.zoneMap[homeId] as ZoneDef, seed: 424242, id: 'probe_det_den',
    pos: { x: 100, y: 100 }, playerLevel: 10, pkgActive: () => false,
  };
  const a = sz.mint(ctx);
  const b = sz.mint(ctx);
  check('E1 the mint is pure (byte-equal defs)', JSON.stringify(a) === JSON.stringify(b));
  check('E2 the den carries its own pantry rows (authored fauna)',
    Array.isArray(a.fauna) && a.fauna.some(f => f.id === 'snow_hare'));
}

// --- RIG F: wave two — the laws each lair wears (pure) ---------------------------
{
  // The courses seat axis: the wellspring stands ONLY on the traced rivers,
  // in any of its listed countries — and nowhere off them.
  const at = (biome: string, course?: string) =>
    lairLandmarkRolls({ place: 'surface', biome, level: 20, tileset: 'meadow', course });
  const hasSpring = (rolls: { landmark: string }[]) => rolls.some(r => r.landmark === 'naiad_spring');
  check('F1 the wellspring keeps to the rivers (courses axis)',
    !hasSpring(at('forest')) && hasSpring(at('forest', 'rivers'))
    && hasSpring(at('karst', 'rivers')) && !hasSpring(at('jungle', 'rivers')));
  check('F2 course rows never leak onto courseless lairs (ordinary ground law)',
    at('forest', 'rivers').some(r => r.landmark === 'spinney_bole_site'));
  // The bull is a TRACKER: scent watch + a drawn read (validateWatch's law).
  const bull = MONSTERS.maze_bull;
  check('F3 the bull hunts by SCENT and tells it',
    !!bull.watch?.scent && (bull.watch.scent.range ?? 0) > 0
    && (bull.tells ?? []).some(t => t.source === 'watch'));
  // The wyrm: both fire verbs PRICED from one pool, the gutter staged, the
  // sleep posture worn, the body a true worm.
  const wyrm = MONSTERS.emberwyrm;
  const res = wyrm.reserves?.[0];
  check('F4 the ember prices BOTH fire verbs and stages the gutter',
    !!res && res.costs?.ember_breath === 1 && res.costs?.immolation_rush === 1
    && (res.stages ?? []).some(s => s.status === 'guttered')
    && wyrm.watch?.sleep !== undefined && !!wyrm.worm);
  check('F5 the wyrm READS its fuel (reserve-sourced tells — the honesty law)',
    (wyrm.tells ?? []).some(t => t.source === 'reserve:ember'));
  // The matron: a pooled colony + a styled bond over her court; the
  // broodling is a true lite body (one ply, pooled bite).
  const matron = MONSTERS.spinney_matron;
  check('F6 the matron anchors a colony and ropes her court',
    matron.colony?.monsterId === 'spinney_broodling'
    && matron.bond?.kin === 'orb_weaver' && !!matron.bond?.link);
  const brood = MONSTERS.spinney_broodling;
  check('F7 the broodling is swarm-substrate (lite + 1 ply)',
    !!brood.lite && brood.plies?.count === 1);
  // The naiad: rooted on WATER with a drawn wilt (the ground axis + the
  // thrive/wilt read — the tell layer never implies an unpaid penalty).
  const naiad = MONSTERS.river_naiad;
  check('F8 the naiad claims the water and wilts off it, drawn both ways',
    (naiad.rooted?.ground ?? []).includes('water') && !!naiad.rooted?.off
    && (naiad.tells ?? []).filter(t => t.source === 'rooted').length >= 2);
}

// --- RIG G: wave two live (sim world) --------------------------------------------
// G-I: the Maze — labyrinth-only country, the bull's ask, the scent line.
{
  w.player.pos = vec(400, 400);
  w.enterSidezone({ pos: { x: 400, y: 400 }, seed: 61061, kind: 'maze_gate' });
  check('G1 the gate mints the Maze (labyrinth-only, the bull\'s ask)',
    w.zone.layoutType === 'labyrinth' && w.zone.objective.kind === 'boss'
    && w.zone.objective.id === 'maze_bull' && w.zone.noDeeper === true,
    `${w.zone.layoutType}`);
  const bull = (w.actors as Actor[]).find(a => a.defId === 'maze_bull');
  check('G2 the bull holds the maze', !!bull);
  // The scent law's substrate: a standing scent-watcher makes the player
  // PRINT a trail as they move (probe_watchers owns the full hunt; this
  // pins the lair's half — his presence turns the floor into a record).
  const p = w.player;
  for (let i = 0; i < 20; i++) { p.pos = vec(p.pos.x + 14, p.pos.y); step(0.1); }
  check('G3 the floor remembers you (trail printed under a scent-watcher)',
    Array.isArray(p.trail) && p.trail.length >= 1, `${p.trail?.length ?? 0} prints`);
  leaveToHome();
}
// G-II: the Barrow — the hoard floor, the sleeper, and the ember's arithmetic.
{
  w.player.pos = vec(400, 400);
  w.enterSidezone({ pos: { x: 400, y: 400 }, seed: 72072, kind: 'wyrm_barrow_mouth' });
  const wyrm = (w.actors as Actor[]).find(a => a.defId === 'emberwyrm');
  const caches = (w.actors as Actor[]).filter(a => a.defId === 'gem_cache');
  check('G4 the barrow holds the sleeper and the hoard it sleeps on',
    !!wyrm && caches.length >= 3, `${caches.length} caches`);
  if (wyrm) {
    const st = wyrm.reserves?.get('ember');
    check('G5 the ember banks full at the coil', !!st && reserveFrac(st) === 1);
    // Spend the pool dry through the REAL cast gate: five breaths pay five
    // ember; the sixth REFUSES (costs refuse, they never debt) while the
    // claw — unpriced — still answers. BRAINS FROZEN for the arithmetic
    // (w.update alone): the probe's presses must be the only spender, and
    // an un-aggroed wyrm burns no ambient drain — pure cost math.
    const tickOnly = (secs: number): void => {
      const dt = 1 / 30;
      for (let t = 0; t < secs; t += dt) w.update(dt);
    };
    const breath = wyrm.skills.find((s: any) => s?.def.id === 'ember_breath');
    const clawI = wyrm.skills.find((s: any) => s?.def.id === 'claw');
    wyrm.pos = vec(w.player.pos.x + 80, w.player.pos.y);
    let paid = 0;
    for (let i = 0; i < 7; i++) {
      wyrm.cooldowns.clear(); wyrm.mana = wyrm.maxMana();
      if (w.useSkill(wyrm, breath, vec(w.player.pos.x, w.player.pos.y))) paid++;
      // Let the 0.9s cast AND its recovery tail finish (a busy-body press
      // refuses for the wrong reason) while staying inside the 4s regen
      // delay per spend — 2.0s clears both windows.
      tickOnly(2.0);
    }
    const stAfter = wyrm.reserves?.get('ember');
    // paid === 5 IS the refusal proof (presses 6-7 bounced off canUse).
    // The residue read loosens past 0.05 deliberately: the calm regen's
    // delay expires DURING the refused presses and the furnace begins to
    // re-kindle — which is the recovery law working, not a leak.
    check('G6 five breaths drain the pool; the dry furnace REFUSES the sixth',
      paid === 5 && !!stAfter && reserveFrac(stAfter) < 0.25, `paid ${paid}`);
    wyrm.cooldowns.clear(); wyrm.mana = wyrm.maxMana();
    check('G7 claw is what remains of it (unpriced verbs never gate)',
      w.useSkill(wyrm, clawI, vec(w.player.pos.x, w.player.pos.y)));
  }
  leaveToHome();
}
// G-III: the Spinney — the roped court.
{
  w.player.pos = vec(400, 400);
  w.enterSidezone({ pos: { x: 400, y: 400 }, seed: 83083, kind: 'spinney_bole' });
  const matron = (w.actors as Actor[]).find(a => a.defId === 'spinney_matron');
  const weavers = (w.actors as Actor[]).filter(a => a.defId === 'orb_weaver');
  check('G8 the matron holds the loom with a court to rope', !!matron && weavers.length >= 1,
    `${weavers.length} weavers`);
  if (matron && weavers[0]) {
    // The bond is worn BENEFICIARY-side: the MATRON reads held while a
    // weaver stands in reach, and the drawn rope runs to that weaver —
    // cut the court out from under her is the kill order.
    weavers[0].pos = vec(matron.pos.x + 60, matron.pos.y);
    step(1.2);
    // Live AI can bring a different court member closer during the 1.2s.
    // The link promises the nearest living weaver, not roster position zero.
    const nearestSilkWeaver = weavers.filter(v => !v.dead && v.team === matron.team)
      .sort((a, b) => Math.hypot(a.pos.x - matron.pos.x, a.pos.y - matron.pos.y)
        - Math.hypot(b.pos.x - matron.pos.x, b.pos.y - matron.pos.y))[0];
    check('G9 the silk rope is REAL (the matron hangs on her court)',
      matron.bondHeld === true && (matron.bondFrom as Actor | undefined)?.id === nearestSilkWeaver?.id);
    // Cut the court: the rope falls and so does her favor (edge-triggered).
    for (const v of weavers) v.dead = true;
    step(1.2);
    check('G10a the cut is REAL (bond broken when the court dies)',
      matron.bondHeld === false);
  }
  leaveToHome();
}
// G-IV: the Wellspring — rooted in her water, wilted off it, home again.
{
  const springDef = caveDef({
    id: 'probe_spring_zone',
    landmarks: [{ landmark: 'naiad_spring', chance: 1 }],
    caveDepth: undefined, anchor: undefined,
    exits: [{ to: homeId, side: 's' }],
  });
  w.caveMap[springDef.id] = springDef;
  w.loadZone(springDef.id);
  step(0.5);
  const naiad = (w.actors as Actor[]).find(a => a.defId === 'river_naiad');
  // THE LIQUID SEAT asserted, not just assumed: this check's LABEL always said
  // "IN the pool" while the assertion only demanded she EXIST, so a seat on the
  // dry shore read green here and G11 below carried the whole claim — passing on
  // whichever half of a 30-in/30-out coin flip the layout landed on. Her stand
  // is the precondition; test it where it is named.
  const inPool = (a: Actor): boolean =>
    (w.doodads as { kind: string; pos: Vec2; radius: number }[]).some(d =>
      d.kind === 'water' && Math.hypot(d.pos.x - a.pos.x, d.pos.y - a.pos.y) <= d.radius);
  check('G10 the spring spawns its naiad IN the pool (the liquid seat, not the shore)',
    !!naiad && inPool(naiad),
    naiad ? `ground=${naiad.groundKind ?? 'dry stone'}` : 'no naiad');
  if (naiad) {
    step(0.8);
    check('G11 in her water she is ROOTED (the claim held from frame one)',
      naiad.rootedHeld === true);
    // Haul her onto dry stone: past the grace the claim DROPS...
    naiad.pos = vec(120, 120);
    step(1.2);
    check('G12 torn from the water the wilt is REAL (grace-timed drop)',
      naiad.rootedHeld === false);
    // ...and the spring takes her back the frame she touches it.
    const pool = (w.doodads as { kind: string; pos: { x: number; y: number } }[])
      .find(d => d.kind === 'water');
    if (pool) {
      naiad.pos = vec(pool.pos.x, pool.pos.y);
      step(0.3);
      check('G13 stepping home re-roots without a grace (the one-way debounce)',
        naiad.rootedHeld === true);
    }
  }
  leaveToHome();
}

// --- RIG H: wave three — THE LADDER (interior + climate axes, the roost) ---------
{
  const at = (level: number, biomeDepth?: number, elevation?: number) =>
    lairLandmarkRolls({
      place: 'surface', biome: 'highland', level, tileset: 'snowcrown',
      biomeDepth, ...(elevation !== undefined ? { climate: { elevation } } : {}),
    });
  const has = (rolls: { landmark: string }[], lm: string) => rolls.some(r => r.landmark === lm);
  check('H1 the roost claims ONLY the deep high heart (interior + climate bands)',
    has(at(20, 0.7, 0.8), 'roost_crag_site')
    && !has(at(20, 0.2, 0.8), 'roost_crag_site')     // country's edge refuses
    && !has(at(20, 0.7, 0.3), 'roost_crag_site')     // low ground refuses
    && !has(at(20, undefined, 0.8), 'roost_crag_site')  // unreadable depth refuses
    && !has(at(20, 0.7), 'roost_crag_site'));        // unreadable climate refuses
  check('H2 a green world never meets the dragon (the level rung is hard)',
    !has(at(6, 0.7, 0.8), 'roost_crag_site') && !has(at(11, 0.7, 0.8), 'roost_crag_site'));
  // THE LADDER READS: the same country offers DIFFERENT natives by rung —
  // border level 6 = the cairn alone; deep high 20 = cairn AND roost.
  const low = at(6, 0.2, 0.4), deep = at(20, 0.7, 0.8);
  check('H3 the ladder is real (rungs differ within one biome)',
    has(low, 'giants_cairn') && !has(low, 'roost_crag_site')
    && has(deep, 'giants_cairn') && has(deep, 'roost_crag_site'));
  // Axis-less rows never mind the new axes (ordinary ground law): the cairn
  // seats with or without geo readings.
  check('H4 axis-less lairs ignore the new axes (no retroactive gating)',
    has(lairLandmarkRolls({ place: 'surface', biome: 'highland', level: 20, tileset: 'snowcrown' }), 'giants_cairn'));
  // Registry: the dragon's wings are a REAL part whose break silences
  // exactly the wing verbs (both in the root's own kit).
  const drake = MONSTERS.roost_dragon;
  const wings = drake.parts?.[0];
  check('H5 the wings are a true part and the grounding is authored',
    wings?.monster === 'drake_wingspan' && !!MONSTERS.drake_wingspan
    && (wings.breakDisables ?? []).every(s => drake.skills.includes(s))
    && (wings.breakDisables ?? []).includes('crushing_leap'));
}
// H-live: the roost round trip — open sky, the hoard, the grounding law.
{
  w.player.pos = vec(400, 400);
  w.enterSidezone({ pos: { x: 400, y: 400 }, seed: 94094, kind: 'roost_crag' });
  step(0.5); // parts lazy-attach on the root's first update tick
  const skyRead = skyOf(w.zone);
  check('H6 the roost stands under OPEN SKY (explicit def sky beats caveDepth)',
    skyRead === 'open', String(skyRead));
  const drake = (w.actors as Actor[]).find(a => a.defId === 'roost_dragon');
  const wings = (w.actors as Actor[]).find(a => a.defId === 'drake_wingspan');
  const hoard = (w.actors as Actor[]).filter(a => a.defId === 'gem_cache').length;
  check('H7 Old Scald holds the shelf, wings attached, hoard underfoot',
    !!drake && !!wings && hoard >= 5, `hoard ${hoard}, wings ${String(!!wings)}`);
  if (drake && wings) {
    const tickOnly = (secs: number): void => {
      const dt = 1 / 30;
      for (let t = 0; t < secs; t += dt) w.update(dt);
    };
    const leap = drake.skills.find((s: any) => s?.def.id === 'crushing_leap');
    drake.cooldowns.clear(); drake.mana = drake.maxMana();
    check('H8 with wings, the sky is his (leap fires)',
      w.useSkill(drake, leap, vec(drake.pos.x + 200, drake.pos.y)));
    tickOnly(2.0);
    // BREAK THE WINGS: the part dies, both wing verbs fall silent, the
    // breath — no part's hostage — still answers.
    w.kill(wings, false, w.player);
    tickOnly(0.5);
    // The break-disable REMOVES the silenced instances from the bar — a
    // vanished verb IS the refusal (re-find, and absent = grounded).
    drake.cooldowns.clear(); drake.mana = drake.maxMana();
    const leapNow = drake.skills.find((s: any) => s?.def.id === 'crushing_leap');
    const leapAfter = leapNow ? w.useSkill(drake, leapNow, vec(drake.pos.x + 200, drake.pos.y)) : false;
    const gustNow = drake.skills.find((s: any) => s?.def.id === 'gust_burst');
    drake.cooldowns.clear(); drake.mana = drake.maxMana();
    const gustAfter = gustNow ? w.useSkill(drake, gustNow, vec(drake.pos.x, drake.pos.y)) : false;
    check('H9 GROUNDED: both wing verbs die with the wings', !leapAfter && !gustAfter);
    const breath = drake.skills.find((s: any) => s?.def.id === 'ember_breath');
    drake.cooldowns.clear(); drake.mana = drake.maxMana();
    tickOnly(1.5);
    check('H10 the furnace still answers (breath is no part\'s hostage)',
      w.useSkill(drake, breath, vec(drake.pos.x + 100, drake.pos.y)));
  }
  leaveToHome();
}

// --- RIG I: wave four — the trench (the segment fabric at full reach) ------------
{
  const lev = MONSTERS.trench_leviathan;
  check('I1 the Fathomking is a TRUE worm (hittable, wounded, dressed by class)',
    lev.worm?.hittable === true && !!lev.worm?.wounds
    && !!LOOKS[lev.worm?.looks?.body ?? ''] && !!LOOKS[lev.worm?.looks?.tail ?? '']
    && !!LOOKS[lev.worm?.looks?.every?.look ?? '']);
  check('I2 the trench claims only the deep sea\'s HEART (interior axis)',
    lairLandmarkRolls({ place: 'surface', biome: 'deepsea', level: 20, tileset: 'deepsea', biomeDepth: 0.8 })
      .some(r => r.landmark === 'trench_maw_site')
    && !lairLandmarkRolls({ place: 'surface', biome: 'deepsea', level: 20, tileset: 'deepsea', biomeDepth: 0.3 })
      .some(r => r.landmark === 'trench_maw_site'));
  w.player.pos = vec(400, 400);
  w.enterSidezone({ pos: { x: 400, y: 400 }, seed: 51051, kind: 'trench_maw' });
  step(0.5);
  const levA = (w.actors as Actor[]).find(a => a.defId === 'trench_leviathan');
  check('I3 the coil owns the bottom (leviathan home, boss ask)',
    !!levA && w.zone.objective.kind === 'boss' && w.zone.objective.id === 'trench_leviathan');
  // The coils unspool as the body MOVES (the anatomy rig's idiom) — but a
  // winding trench pins straight marches against walls, so wander the head
  // through clampPos and read the RUNNING max the payout reaches.
  let segMax = 0;
  if (levA) {
    step(2);
    for (let i = 0; i < 240; i++) {
      const dx = (i % 60 < 30 ? 9 : -9), dy = ((i % 120) < 60 ? 5 : -5);
      levA.pos = w.clampPos(vec(levA.pos.x + dx, levA.pos.y + dy), levA.radius);
      w.update(1 / 60);
      segMax = Math.max(segMax, (levA as any).worm?.segments?.length ?? 0);
    }
  }
  check('I4 the coils unspool REAL behind the skull', segMax >= 10, `${segMax} segments at peak`);
  leaveToHome();
}

// --- RIG J: wave four — the barrow (the conditioned door + the jar) --------------
{
  // The night-door law through the REAL dwell loop: plant a barrow_door
  // under the player's feet and stand there. At NOON the dwell never
  // carries (and the refusal floats); after DUSK the same stones open.
  const { dayCycle } = await import('../src/world/daynight');
  const phaseAt = (t: number) => dayCycle(t).phase as string;
  // Scan FORWARD from the live clock only: rewinding w.time would strand
  // every cadence sweep (packNextAt etc.) in the future and stall the rig.
  const t0 = Math.ceil(w.time) + 1;
  let noon = -1, night = -1;
  for (let t = t0; t < t0 + 4000 && (noon < 0 || night < 0); t += 5) {
    const p = phaseAt(t);
    if (noon < 0 && p === 'day') noon = t;
    if (night < 0 && p === 'night') night = t;
  }
  // Test the closed door FIRST whatever the wheel offers next (noon may
  // fall after night in wheel order — the door only cares which is which).
  check('J1 the wheel offers both hours to test against', noon >= 0 && night >= 0);
  const sz = sidezoneOf('barrow_door');
  check('J2 the door carries its schedule (when + refusal authored)',
    !!sz?.when && (sz.when.cond.phases ?? []).includes('night') && !!sz.when.refusal);
  w.player.pos = w.clampPos(vec(w.arena.w / 2, w.arena.h / 2), w.player.radius);
  w.caveEntrances.push({
    pos: vec(w.player.pos.x, w.player.pos.y),
    seed: 60060, kind: 'barrow_door',
  });
  const homeNow = w.zone.id;
  w.time = noon;
  step(2.0);
  check('J3 at noon the barrow does not answer (the dwell never carries)',
    w.zone.id === homeNow);
  check('J4 the refusal READS (the schedule floats, throttled)',
    w.doorRefusalAt > 0);
  w.time = night;
  // Step in SMALL beats and bail the instant the swap lands — then pull the
  // hero straight off the arrival portal (lingering there ping-pongs the
  // zones and double-mints the halls: the rig's bug, not the door's).
  for (let i = 0; i < 40 && w.zone.id === homeNow; i++) step(0.1);
  if (w.zone.id !== homeNow) {
    w.player.pos = w.clampPos(vec(w.arena.w / 2, w.arena.h / 2), w.player.radius);
    step(0.2);
  }
  check('J5 after dark the same stones open (the cond holds, the dwell carries)',
    w.zone.id !== homeNow && String(w.zone.name).includes('Barrow'), w.zone.name);
  // Inside: the king under his hours, held by the jar — the beam is the map.
  const lich = (w.actors as Actor[]).find(a => a.defId === 'barrow_lich');
  const jar = (w.actors as Actor[]).find(a => a.defId === 'kings_phylactery');
  check('J6 the king and his jar both stand', !!lich && !!jar);
  if (lich && jar) {
    step(1.2);
    check('J7 the jar HOLDS him from across the halls (whole-den bond, drawn beam)',
      lich.bondHeld === true && (lich.bondFrom as Actor | undefined)?.id === jar.id);
    check('J8 his hours are HIS (nocturne held at night, honestly unfurled)',
      lich.nocturneHeld === true
      && (MONSTERS.barrow_lich.tells ?? []).some(t => t.source === 'nocturne'));
    // Break EVERY jar standing (the rig owns one; a double-minted hall must
    // not fake a pass or a fail) — the law under test is bond-falls-with-kin.
    for (const j of (w.actors as Actor[]).filter(a => a.defId === 'kings_phylactery' && !a.dead)) {
      w.kill(j, false, w.player);
    }
    step(1.2);
    check('J9 break the jar, break the king (the bond falls with it)',
      lich.bondHeld === false);
  }
  leaveToHome();
}

// --- RIG K: wave five — the drowned wallow (the anatomy gamut, finally seated) ---
// The Marsh Leviathan was the composite framework's own exemplar and had no
// door for years: five hitboxes fully authored, zero ways to meet them. Its
// seat is the fabric's CHEAPEST lane proven end to end — an in-zone landmark
// (no den tileset, no sidezone, no engine work), the wellspring's LIQUID SEAT
// for a dweller that belongs in the water, and a level band argued against the
// shipped ladder rather than inherited from whatever fen it lands in.
{
  const row = lairOf('marsh_leviathan');
  const lm = landmarkDefs().find(d => d.id === 'leviathan_wallow');
  check('K1 the wallow is registered and pours its own pool',
    !!row && hasLandmark(row.landmark) && lm?.builder === 'lake' && lm?.liquid === 'water'
    && lm?.mustReach === true);
  check('K2 the beast IS the landmark, seated IN the water (the naiad\'s word)',
    lm?.spawns?.where === 'liquid'
    && (lm?.spawns?.table ?? []).length === 1
    && lm?.spawns?.table[0].id === 'marsh_leviathan'
    && lm?.spawns?.count[0] === 1 && lm?.spawns?.count[1] === 1);
  check('K3 the exemplar pays the lean repeatable faucet, not the capstone table',
    MONSTERS.marsh_leviathan?.loot === 'lair_hoard' && MONSTERS.marsh_leviathan?.boss === true);
  check('K4 all five hitboxes still resolve (root + head + two claws + tail)',
    (MONSTERS.marsh_leviathan?.parts ?? []).length === 4
    && (MONSTERS.marsh_leviathan?.parts ?? []).every(p => !!MONSTERS[p.monster]));

  const fen = (level: number) =>
    lairLandmarkRolls({ place: 'surface', biome: 'marsh', level, tileset: 'marsh' });
  const has = (rolls: { landmark: string }[], id: string) => rolls.some(r => r.landmark === id);
  check('K5 the fen\'s crown claims the marsh SURFACE at real levels',
    has(fen(20), 'leviathan_wallow'));
  check('K6 the band is DELIBERATE: a green fen never grows one',
    !has(fen(5), 'leviathan_wallow') && !has(fen(10), 'leviathan_wallow'));
  check('K7 the wallow is surface ground only (no wallow in a cave)',
    !lairLandmarkRolls({ place: 'cave', biome: 'marsh', caveDepth: 1, level: 20, tileset: 'marsh' })
      .some(r => r.landmark === 'leviathan_wallow')
    && !has(lairLandmarkRolls({ place: 'surface', biome: 'downs', level: 20, tileset: 'downs' }), 'leviathan_wallow'));
  // THE FEN READS AS A LADDER, exactly like the highland one: the hovel alone
  // at the low end, hovel AND wallow once the country can feed the apex.
  check('K8 one biome, two rungs (the hag below, the leviathan above)',
    has(fen(5), 'hag_hovel') && !has(fen(5), 'leviathan_wallow')
    && has(fen(20), 'hag_hovel') && has(fen(20), 'leviathan_wallow'));

  // Placement through the standing machinery (RIG C's law): chance-1 roll,
  // one beast, and its seat cell inside the DRAWN water — paintLiquid lays
  // its discs from the very mask `where: 'liquid'` samples, so drawn == tested
  // or this fails.
  const wallow = gen(caveDef({
    landmarks: [{ landmark: 'leviathan_wallow', chance: 1 }],
    caveDepth: undefined, anchor: undefined,
  }), 77321);
  const seats = (wallow.landmarkSpawns ?? []).filter(s => s.id === 'marsh_leviathan');
  check('K9 exactly one leviathan stands per wallow', seats.length === 1, `${seats.length} seated`);
  const water = wallow.doodads.filter(d => d.kind === 'water');
  check('K10 the pool is poured and the reeds ring its shore',
    water.length > 0 && wallow.doodads.some(d => d.kind === 'reeds'),
    `${water.length} water pieces`);
  check('K11 THE LIQUID SEAT holds (the seat cell lies inside the drawn water)',
    seats.length === 1
    && water.some(d => Math.hypot(d.pos.x - seats[0].pos.x, d.pos.y - seats[0].pos.y) <= d.radius));
  // Nothing springs here, deliberately: a composite's parts attach as ordinary
  // actors AFTER the spawn, so arming only the root would leave its limbs
  // awake beside a sleeping body.
  check('K12 the wallow arms no ambush (the composite exemption)', !lm?.spawns?.ambush);

  // Live: the seat delivers a WORKING composite — four parts anchored ahead
  // of, beside and behind the hulk in its own facing frame.
  const beast = w.createMonster('marsh_leviathan', 12, 'enemy') as Actor;
  beast.pos = vec(w.arena.w / 2, w.arena.h / 2);
  beast.facing = 0;
  (beast as any).aiCooldown = 99999;
  w.actors.push(beast);
  step(0.3);
  const parts = (beast.partActors ?? []) as Actor[];
  check('K13 the hulk stands with all four limbs attached', parts.length === 4);
  check('K14 the limbs ride the FACING frame (head ahead, tail behind, claws flanking)',
    parts.length === 4
    && parts.some(p => p.defId === 'leviathan_head' && p.pos.x > beast.pos.x + beast.radius * 0.5)
    && parts.some(p => p.defId === 'leviathan_tail' && p.pos.x < beast.pos.x - beast.radius * 0.5)
    && parts.filter(p => p.defId === 'leviathan_claw').length === 2
    && Math.sign(parts.filter(p => p.defId === 'leviathan_claw')[0].pos.y - beast.pos.y)
      !== Math.sign(parts.filter(p => p.defId === 'leviathan_claw')[1].pos.y - beast.pos.y));
  beast.dead = true;
  for (const p of parts) p.dead = true;
}

// --- RIG L: wave six — THE LAIR MOUTH TENANT (the ring that is somebody's door) --
// The massif fabric's ring-tenant lane meets the lair fabric: a court's
// occupancy table names 'lair_mouth' (data/lairs.ts registers the kind) and
// the winning ring grows spoor + a REGISTERED-SIDEZONE mouth on its own
// floor. Pinned: the door stands INSIDE its ring and joins the walk net,
// same seed → same door, a noDeeper zone strips it (the tenant lane inherits
// the chokepoint), THE FORK LAW as parity (a dress-less lair-mouth table
// leaves the layout byte-identical beyond the door itself), THE REPLACEMENT
// LAW (the table silences ruincourt's independent garrison/inner lanes), and
// the LIVE round trip: loadZone ADOPTS the tenant-planted mouth into the
// dwell registry with a position-hash seed stable across reloads, the dwell
// mints the den country (authored name/fauna/noDeeper through mintCave's
// face-rolled lane), and the gateway ledger stamps.
{
  const W2 = 2200, H2 = 1600;
  const lEntry = vec(140, H2 / 2);
  const lExits = [vec(W2 - 140, H2 / 2)];
  const lGen = (def: ZoneDef, seed: number): GeneratedLayout =>
    generateLayout({ ...def, seed }, { w: W2, h: H2 }, new Rng(seed), lEntry, lExits);
  const bareCtx = (seed: number): GenCtx => ({
    rng: new Rng(seed), arena: { w: W2, h: H2 }, entry: lEntry, exits: lExits, seed,
    doodads: [], pois: [], camps: [], breakables: [], npcs: [],
    garrisons: [], caveSeeds: [], reserved: [],
  });
  const L_PARAMS = { massifCoverage: [0.3, 0.34] as [number, number], massifSizeR: [300, 380] as [number, number] };
  const courtDef = (id: string, tenants: TenantRow[], over?: Partial<ZoneDef>): ZoneDef => caveDef({
    id, size: { w: W2, h: H2 }, layout: [], layoutType: 'massif',
    caveDepth: undefined, anchor: undefined, biome: 'desert',
    layoutParams: {
      ...L_PARAMS,
      massifMasses: [{
        kind: 'ruincourt', weight: 1,
        over: { shapes: [{ shape: 'court', weight: 1 }], tenants },
      }],
    },
    ...(over ?? {}),
  });
  const lairTable: TenantRow[] = [{ kind: 'lair_mouth', weight: 1 }];
  const pr = (ds: GeneratedLayout['doodads']): string =>
    ds.map(d => `${d.kind}:${Math.round(d.pos.x)},${Math.round(d.pos.y)}`).join('|');

  check('L1 the ring-tenant lane is registered (lair_mouth in the occupancy registry)',
    tenantKindIds().includes('lair_mouth'));

  // The seat sweep: doors stand, inside their rings, on the walk net, with
  // the spoor confessing them — and the carve they stand on matches the
  // bare-ctx carve (the K3 cross-read: same seed, same masses).
  let mouths = 0, courts = 0, inRing = 0, reach = 0, spoored = 0;
  let firstSeed = -1;
  for (let s = 0; s < 6; s++) {
    const seed = 553001 + s * 7919;
    const def = courtDef('probe_lair_mouth_gen', lairTable);
    const out = lGen(def, seed);
    const masses = carveMassifs(bareCtx(seed), { ...def, seed });
    const rings = masses.filter(m => m.interior);
    courts += rings.length;
    const wells = out.doodads.filter(d => d.kind === 'scorpion_well');
    mouths += wells.length;
    for (const d of wells) {
      const home = rings.find(m =>
        Math.hypot(d.pos.x - m.interior!.x, d.pos.y - m.interior!.y) <= m.r * 0.6 * 0.9 + 0.5);
      if (home) inRing++;
      if (out.walk instanceof GridWalkField && out.walk.reachable(lEntry, vec(d.pos.x, d.pos.y))) reach++;
      const spoor = out.doodads.filter(o =>
        (o.kind === 'bone_pile' || o.kind === 'bone' || o.kind === 'scree')
        && Math.hypot(o.pos.x - d.pos.x, o.pos.y - d.pos.y) < 110);
      if (spoor.length >= 2) spoored++;
    }
    if (wells.length && firstSeed < 0) firstSeed = seed;
  }
  check('L2 the table grows doors and every door stands INSIDE its ring',
    mouths >= 6 && courts >= 8 && inRing === mouths, `${mouths} doors / ${courts} courts`);
  check('L3 every door is on the walk net (mustReach joins the invariant)',
    mouths > 0 && reach === mouths, `${reach}/${mouths} reachable`);
  check('L4 the spoor confesses the door (the den reads before the dwell)',
    mouths > 0 && spoored === mouths, `${spoored}/${mouths} spoored`);
  {
    const a = lGen(courtDef('probe_lair_mouth_gen', lairTable), firstSeed);
    const b = lGen(courtDef('probe_lair_mouth_gen', lairTable), firstSeed);
    check('L5 same seed, same door (the tenant fork is deterministic)',
      pr(a.doodads) === pr(b.doodads));
    const sealed = lGen(courtDef('probe_lair_mouth_gen', lairTable, { noDeeper: true }), firstSeed);
    check('L6 a sealed zone strips the tenant door (the noDeeper chokepoint reaches the lane)',
      sealed.doodads.every(d => d.kind !== 'scorpion_well'));
  }
  // THE FORK LAW as parity: a DRESS-LESS lair-mouth table vs a vacant table —
  // strip the door itself and the layouts are byte-identical (the handler
  // costs the layout stream nothing); THE REPLACEMENT LAW rides the same
  // runs (ruincourt's independent garrison 0.35 + urn inner rows both stand
  // silent under either table).
  {
    const seed = firstSeed ^ 0x5ca1e;
    const bare: TenantRow[] = [{ kind: 'lair_mouth', weight: 1, params: { dress: [] } }];
    const vac: TenantRow[] = [{ kind: 'vacant', weight: 1 }];
    const a = lGen(courtDef('probe_lair_mouth_par', bare), seed);
    const b = lGen(courtDef('probe_lair_mouth_par', vac), seed);
    const ka = a.walk instanceof GridWalkField ? a.walk.pack().kbits : 'a';
    const kb = b.walk instanceof GridWalkField ? b.walk.pack().kbits : 'b';
    check('L7 absent == identical (strip the door: doodads, grid and POIs all match the vacant run)',
      pr(a.doodads.filter(d => d.kind !== 'scorpion_well')) === pr(b.doodads)
      && ka === kb && JSON.stringify(a.pois) === JSON.stringify(b.pois));
    check('L8 THE REPLACEMENT LAW holds through the lane (no garrison, no inner urns, either table)',
      a.garrisons.length === 0 && b.garrisons.length === 0
      && a.doodads.every(d => d.kind !== 'burial_urn' && d.kind !== 'clay_pots'));
  }

  // THE OPEN DOOR: the mouth kind is the ROW's choice — any registered
  // sidezone hangs under the ring (a graveland table's mausoleum, a city
  // block's sewer grate) — and a row naming an UNREGISTERED kind seats
  // nothing at all (a door that cannot open must not stand), leaving the
  // layout exactly the vacant run.
  {
    const seed = firstSeed ^ 0xbad;
    const alt: TenantRow[] = [{ kind: 'lair_mouth', weight: 1, params: { mouth: 'ruin_gate', dress: [] } }];
    const out = lGen(courtDef('probe_lair_mouth_alt', alt), seed);
    check('L15 the door is a row param (a standing sidezone kind hangs under the ring)',
      out.doodads.some(d => d.kind === 'ruin_gate')
      && out.doodads.every(d => d.kind !== 'scorpion_well'));
    const bogus: TenantRow[] = [{ kind: 'lair_mouth', weight: 1, params: { mouth: 'no_such_door' } }];
    const bo = lGen(courtDef('probe_lair_mouth_alt', bogus), seed);
    const vo = lGen(courtDef('probe_lair_mouth_alt', [{ kind: 'vacant', weight: 1 }]), seed);
    check('L16 a door that cannot open seats NOTHING (unregistered mouth = the vacant layout)',
      pr(bo.doodads) === pr(vo.doodads));
  }
  // THE DEN KEY: `params.den` names a registered LAIR and the ring inherits
  // that den's WHOLE identity from the standing registry — the barrow's
  // actual door AND the barrow's own spoor (obsidian, cinder) — so per-biome
  // tables seat per-biome residents with one field. A key that resolves to
  // no den door (unknown id, or an in-zone lair like the cairn) DEGRADES to
  // the vacant tenant; the seat geometry is a param, not a ring assumption.
  {
    const seed = firstSeed ^ 0xde11;
    const denRows: TenantRow[] = [{ kind: 'lair_mouth', weight: 1, params: { den: 'wyrm_barrow' } }];
    const out = lGen(courtDef('probe_lair_mouth_den', denRows), seed);
    const barrowMouths = out.doodads.filter(d => d.kind === 'wyrm_barrow_mouth');
    const denSpoored = barrowMouths.filter(d => out.doodads.some(o =>
      (o.kind === 'obsidian' || o.kind === 'cinder')
      && Math.hypot(o.pos.x - d.pos.x, o.pos.y - d.pos.y) < 110)).length;
    check('L17 the den key seats the den\'s WHOLE identity (the barrow\'s door, the barrow\'s spoor)',
      barrowMouths.length >= 1 && denSpoored === barrowMouths.length
      && out.doodads.every(d => d.kind !== 'scorpion_well'),
      `${barrowMouths.length} barrow doors, ${denSpoored} den-spoored`);
    const vo2 = lGen(courtDef('probe_lair_mouth_den', [{ kind: 'vacant', weight: 1 }]), seed);
    const unk = lGen(courtDef('probe_lair_mouth_den',
      [{ kind: 'lair_mouth', weight: 1, params: { den: 'no_such_den' } }]), seed);
    const cairn = lGen(courtDef('probe_lair_mouth_den',
      [{ kind: 'lair_mouth', weight: 1, params: { den: 'giants_cairn' } }]), seed);
    check('L18 a key with no den door degrades to VACANT (unknown id AND the doorless cairn)',
      pr(unk.doodads) === pr(vo2.doodads) && pr(cairn.doodads) === pr(vo2.doodads));
    const tight = lGen(courtDef('probe_lair_mouth_den',
      [{ kind: 'lair_mouth', weight: 1, params: { floorFrac: 0.02 } }]), seed);
    check('L19 seat geometry is a PARAM (a floor authored too tight honestly seats no door)',
      tight.doodads.every(d => d.kind !== 'scorpion_well'));
  }

  // LIVE: the adopted door, the persistent seed, the minted den, the ledger.
  let mouth: { pos: Vec2; seed: number; kind: string } | undefined;
  let liveId = '';
  for (let s = 0; s < 4 && !mouth; s++) {
    const zid = `probe_undercourt_${s}`;
    const zdef = courtDef(zid, lairTable, { exits: [{ to: homeId, side: 's' }] });
    zdef.seed = 660001 + s * 104729;
    w.caveMap[zid] = zdef;
    w.loadZone(zid);
    mouth = (w.caveEntrances as { pos: Vec2; seed: number; kind: string }[])
      .find(c => c.kind === 'scorpion_well');
    if (mouth) liveId = zid;
  }
  check('L9 loadZone ADOPTS the tenant-planted door into the dwell registry', !!mouth, liveId);
  if (mouth) {
    const seen = { seed: mouth.seed, x: mouth.pos.x, y: mouth.pos.y };
    leaveToHome();
    w.loadZone(liveId);
    const again = (w.caveEntrances as { pos: Vec2; seed: number; kind: string }[])
      .find(c => c.kind === 'scorpion_well');
    check('L10 same ring, same door, same den seed (position-hash persistence across reloads)',
      !!again && again.seed === seen.seed && again.pos.x === seen.x && again.pos.y === seen.y);
    if (again) {
      w.enterSidezone(again);
      check('L11 the well mints the den (id + name + one sealed rung + the classic ask)',
        w.zone.id === `cave_scorpion_well_${liveId}_${again.seed}`
        && String(w.zone.name).includes('Scorpion Well')
        && w.zone.caveDepth >= 1 && w.zone.noDeeper === true
        && w.zone.objective.kind === 'clear',
        `${w.zone.id} · ${w.zone.name}`);
      const brood = (w.actors as Actor[]).filter(a => a.defId === 'sand_scorpion');
      check('L12 the brood is home (authored fauna, chance 1)', brood.length >= 2,
        `${brood.length} scorpions`);
      check('L13 the gateway ledger stamps (scorpion_well_entered)',
        ((w.ledger?.scorpion_well_entered as number | undefined) ?? 0) >= 1);
    }
    leaveToHome();
  }
  // Mint purity (the E1 idiom) on the den's own sidezone.
  {
    const sz = sidezoneOf('scorpion_well')!;
    const mctx = {
      parent: (w.caveMap[liveId] ?? w.zoneMap[homeId]) as ZoneDef, seed: 424243,
      id: 'probe_well_det', pos: { x: 100, y: 100 }, playerLevel: 10, pkgActive: () => false,
    };
    const a = sz.mint(mctx);
    check('L14 the mint is pure and sealed (byte-equal defs, noDeeper, the brood authored)',
      JSON.stringify(a) === JSON.stringify(sz.mint(mctx))
      && a.noDeeper === true
      && Array.isArray(a.fauna) && a.fauna.some(f => f.id === 'sand_scorpion'));
  }
}

// --- RIG M: THE BIOME DENS (batch 17) — the shipped per-face den mappings -----
// The den key leaves the bench for the SHIPPED tables (data/tilesets.ts):
// tableland's 'court of sands' standard ring may keep the desert's own asking
// (den: 'riddle_vault' — the sphinx's gate where a pot-hoard stood) and
// courtland's base-face well ring may be the crone's (den: 'hag_hovel').
// Pinned here: the rows resolve WHOLE through the standing registries (lair
// row → den_mouth landmark → registered sidezone); THE OVER-ROW LAW
// (over.tenants REPLACES the kind's table wholesale — engine/massif.ts's
// shallow row merge, probe_massif rig M — so the courtland row must carry
// well_court's OWN table verbatim: the drift guard compares it row-by-row
// against data/massifs.ts and SCREAMS when the kind table moves, because the
// face copy must be re-derived by hand); THE SURGICAL APPEND (the den row
// stands LAST and is paid from the TAIL row, so with-vs-without diverges only
// in the flipped tail band: carve, grid, POIs and garrisons byte-equal, every
// doodad delta confined to den kit — or the displaced cache knot — at a
// doored ring); the ratio laws rig J pins on the kind table, held by the
// copy; and the doors standing LIVE on the real faces — inside their rings,
// den-spoored, on the walk net.
{
  const W2 = 2200, H2 = 1600;
  const mEntry = vec(140, H2 / 2);
  const mExits = [vec(W2 - 140, H2 / 2)];
  const mGen = (def: ZoneDef, seed: number): GeneratedLayout =>
    generateLayout({ ...def, seed }, { w: W2, h: H2 }, new Rng(seed), mEntry, mExits);
  const mCtx = (seed: number): GenCtx => ({
    rng: new Rng(seed), arena: { w: W2, h: H2 }, entry: mEntry, exits: mExits, seed,
    doodads: [], pois: [], camps: [], breakables: [], npcs: [],
    garrisons: [], caveSeeds: [], reserved: [],
  });
  const faceDef = (id: string, biome: ZoneDef['biome'], params: Record<string, unknown>): ZoneDef =>
    caveDef({
      id, size: { w: W2, h: H2 }, layout: [], layoutType: 'massif',
      caveDepth: undefined, anchor: undefined, biome,
      layoutParams: params,
    });
  // Sorted position-keyed multiset (order-free: tenant seating and dressing
  // interleave differently per body, the SET is the truth).
  const keys = (ds: GeneratedLayout['doodads']): string[] =>
    ds.map(d => `${d.kind}:${Math.round(d.pos.x)},${Math.round(d.pos.y)}`).sort();
  const minus = (a: string[], b: string[]): string[] => {
    const have = new Map<string, number>();
    for (const k of b) have.set(k, (have.get(k) ?? 0) + 1);
    return a.filter(k => {
      const n = have.get(k) ?? 0;
      if (n > 0) { have.set(k, n - 1); return false; }
      return true;
    });
  };
  const kindOfKey = (k: string): string => k.slice(0, k.indexOf(':'));
  const posOfKey = (k: string): Vec2 => {
    const [x, y] = k.slice(k.indexOf(':') + 1).split(',').map(Number);
    return vec(x, y);
  };

  // M1/M2 — the tableland row: the census + the ratio laws.
  const tlVar = TILESETS.tableland?.variants?.find(v => v.name === 'the court of sands');
  const tlPool = ((tlVar?.layoutParams ?? {}) as Record<string, unknown>)
    .massifMasses as MassPoolRow[] | undefined;
  const tlRow = tlPool?.find(r => r.kind === 'sand_court'
    && !!r.over?.tenants?.some(t => t.kind === 'lair_mouth'));
  const tlTab = tlRow?.over?.tenants ?? [];
  const tlDen = tlTab[tlTab.length - 1];
  check('M1 tableland keeps the desert\'s own asking (den riddle_vault LAST, a find\'s weight, table at 100, vacancy kept)',
    !!tlRow && !!tlDen && tlDen.kind === 'lair_mouth'
    && (tlDen.params as { den?: string } | undefined)?.den === 'riddle_vault'
    && tlDen.weight >= 2 && tlDen.weight <= 4
    && tlTab.reduce((a, r) => a + r.weight, 0) === 100
    && tlTab.some(r => r.kind === 'vacant' && r.weight > 0));
  {
    const manned = tlTab.filter(r => r.kind === 'garrison' || r.kind === 'held_stock')
      .reduce((a, r) => a + r.weight, 0);
    const stock = tlTab.find(r => r.kind === 'stock')?.weight ?? 0;
    check('M2 the ratios hold through the weave (manned a minority, stock the dominant single row)',
      tlTab.length > 0 && manned / 100 <= 0.45
      && tlTab.every(r => r.kind === 'stock' || r.weight <= stock));
  }

  // M3 — both shipped den keys resolve WHOLE through the standing registries.
  for (const [den, mouth] of [['riddle_vault', 'sphinx_gate'], ['hag_hovel', 'hovel_door']] as const) {
    const lair = lairOf(den);
    const lm = lair ? landmarkDefs().find(d => d.id === lair.landmark) : undefined;
    const mk = (lm?.params as { mouthKind?: string } | undefined)?.mouthKind;
    check(`M3 den '${den}' resolves whole (lair → den_mouth landmark → registered sidezone '${mouth}')`,
      !!lair && lm?.builder === 'den_mouth' && mk === mouth && !!sidezoneOf(mouth));
  }

  // M4/M5/M6 — the courtland row: the census, THE FACE-COPY DRIFT GUARD, and
  // rig J's ratio laws held by the copy.
  const clPool = ((TILESETS.courtland?.layoutParams ?? {}) as Record<string, unknown>)
    .massifMasses as MassPoolRow[] | undefined;
  const clRow = clPool?.find(r => r.kind === 'well_court' && !!r.over?.tenants);
  const clTab = clRow?.over?.tenants ?? [];
  const clDen = clTab[clTab.length - 1];
  check('M4 the courtland well ring is the crone\'s at the tail (den hag_hovel LAST, a find\'s weight)',
    !!clRow && !!clDen && clDen.kind === 'lair_mouth'
    && (clDen.params as { den?: string } | undefined)?.den === 'hag_hovel'
    && clDen.weight >= 2 && clDen.weight <= 4);
  {
    const kindTab = massKindOf('well_court').tenants ?? [];
    let copyTrue = clTab.length === kindTab.length + 1 && !!clDen;
    for (let i = 0; i < kindTab.length && copyTrue; i++) {
      const a = clTab[i], b = kindTab[i];
      copyTrue = b.kind === 'vacant'
        ? a.kind === 'vacant' && a.weight === b.weight - (clDen?.weight ?? 0)
        : JSON.stringify(a) === JSON.stringify(b);
    }
    check('M5 THE FACE COPY holds (well_court\'s own table verbatim, vacant paying the den — a moved kind table screams here)',
      copyTrue
      && clTab.reduce((a, r) => a + r.weight, 0) === kindTab.reduce((a, r) => a + r.weight, 0));
    const manned = clTab.filter(r => r.kind === 'garrison' || r.kind === 'held_stock')
      .reduce((a, r) => a + r.weight, 0);
    const vac = clTab.filter(r => r.kind === 'vacant').reduce((a, r) => a + r.weight, 0);
    const tot = clTab.reduce((a, r) => a + r.weight, 0);
    check('M6 the copy honors rig J\'s laws (manned ≤ 0.3, vacancy a present whisper, stock dominant)',
      tot > 0 && manned / tot <= 0.3 && vac > 0 && vac / tot <= 0.25
      && clTab.every(r => r.kind === 'stock'
        || r.weight <= (clTab.find(x => x.kind === 'stock')?.weight ?? 0)));
  }

  // M7/M8 — TABLELAND LIVE + PARITY on the real variant face: A = the shipped
  // pool, B = the pre-change pool (the historical table, cache 12, no den).
  // Bands [0,88) draw the same tenant; [88,97) is cache in both; only
  // [97,100) flips cache → den. So: grid/POIs/garrisons byte-equal, extras
  // are vault kit at a door, misses are the displaced cache knot at a ring
  // whose cache truly left — the door then either STANDS there or honestly
  // REFUSED a too-tight floor (the cache knot's own standoff law: small
  // rings in the variant's [170,300] band may seat nothing, and the ring
  // reads vacant — never a half-den).
  const vaultKit = new Set(['sphinx_gate', 'broken_column', 'ruin_plinth', 'rubble']);
  const cacheKit = new Set(['burial_urn', 'clay_pots', 'bone_pile']);
  if (!tlRow || !tlVar || !tlPool) {
    check('M7 tableland live doors (sweep ran)', false, 'shipped row missing — see M1');
  } else {
    const tlGreat = tlPool.find(r => r !== tlRow);
    const tlBefore: MassPoolRow = { kind: 'sand_court', weight: 3, over: { tenants: [
      { kind: 'stock', weight: 30 },
      { kind: 'garrison', weight: 28 },
      { kind: 'vacant', weight: 18 },
      { kind: 'held_stock', weight: 12 },
      { kind: 'cache', weight: 12 },
    ] } };
    const paramsA = { ...TILESETS.tableland.layoutParams, ...tlVar.layoutParams } as Record<string, unknown>;
    const paramsB = { ...paramsA, massifMasses: tlGreat ? [tlBefore, tlGreat] : [tlBefore] };
    let doors = 0, inRing = 0, spoored = 0, reach = 0, wells = 0;
    let stateOk = 0, extrasBad = 0, missBad = 0, n = 0;
    for (let s = 0; s < 16; s++) {
      const seed = 917003 + s * 104729;
      const dA = faceDef('probe_biome_den_tl', 'desert', paramsA);
      const dB = faceDef('probe_biome_den_tl', 'desert', paramsB);
      const a = mGen(dA, seed);
      const b = mGen(dB, seed);
      n++;
      const rings = carveMassifs(mCtx(seed), { ...dA, seed }).filter(m => m.interior);
      const gates = a.doodads.filter(d => d.kind === 'sphinx_gate');
      doors += gates.length;
      wells += a.doodads.filter(d => d.kind === 'scorpion_well').length;
      for (const d of gates) {
        const home = rings.find(m =>
          Math.hypot(d.pos.x - m.interior!.x, d.pos.y - m.interior!.y) <= m.r * 0.6 * 0.9 + 0.5);
        if (home) inRing++;
        if (a.walk instanceof GridWalkField && a.walk.reachable(mEntry, vec(d.pos.x, d.pos.y))) reach++;
        if (a.doodads.filter(o =>
          (o.kind === 'broken_column' || o.kind === 'ruin_plinth' || o.kind === 'rubble')
          && Math.hypot(o.pos.x - d.pos.x, o.pos.y - d.pos.y) < 110).length >= 2) spoored++;
      }
      const ka = a.walk instanceof GridWalkField ? a.walk.pack().kbits : 'a';
      const kb = b.walk instanceof GridWalkField ? b.walk.pack().kbits : 'b';
      if (ka === kb && JSON.stringify(a.pois) === JSON.stringify(b.pois)
        && JSON.stringify(a.garrisons) === JSON.stringify(b.garrisons)) stateOk++;
      const kA = keys(a.doodads), kB = keys(b.doodads);
      const extras = minus(kA, kB).map(k => ({ kind: kindOfKey(k), pos: posOfKey(k) }));
      for (const e of extras) {
        if (!vaultKit.has(e.kind)
          || !gates.some(g => Math.hypot(g.pos.x - e.pos.x, g.pos.y - e.pos.y) < 130)) extrasBad++;
      }
      for (const k of minus(kB, kA)) {
        const p = posOfKey(k);
        const home = rings.find(m =>
          Math.hypot(p.x - m.interior!.x, p.y - m.interior!.y) <= m.r * 0.6 * 0.9 + 0.5);
        // The displaced knot's home ring flipped to the den: it holds the
        // GATE — or, on a refused floor, NOTHING new at all (ambient scatter
        // that stands in both runs cancels out of the diff and never counts).
        const fr = home ? home.r * 0.6 * 0.9 + 0.5 : 0;
        const gateIn = !!home && gates.some(g =>
          Math.hypot(g.pos.x - home.interior!.x, g.pos.y - home.interior!.y) <= fr);
        const extraIn = !!home && extras.some(e =>
          Math.hypot(e.pos.x - home.interior!.x, e.pos.y - home.interior!.y) <= fr);
        if (!cacheKit.has(kindOfKey(k)) || !home || (!gateIn && extraIn)) missBad++;
      }
    }
    check('M7 the vault stands in the court of sands (doors in rings, den-spoored, on the walk net, never the default well)',
      doors >= 1 && inRing === doors && spoored === doors && reach === doors && wells === 0,
      `${doors} gates over ${n} zones`);
    check('M8 THE SURGICAL PARITY (tableland): grid/POIs/garrisons byte-equal; the diff is the flipped tail band alone',
      stateOk === n && extrasBad === 0 && missBad === 0,
      `${stateOk}/${n} state-equal`);
  }

  // M9/M10 — COURTLAND LIVE + PARITY on the shipped row (isolated for
  // density: the row IS the authored unit; the base-face pool mix around it
  // is standing carve law). B = the bare pre-change row — the kind's own
  // table. Only [98,100) flips vacant → hag, so the diff is PURELY ADDITIVE:
  // nothing missing, every extra hovel kit at a door.
  const hovelKit = new Set(['hovel_door', 'feeding_stake', 'pot_cluster', 'web']);
  if (!clRow) {
    check('M9 courtland live doors (sweep ran)', false, 'shipped row missing — see M4');
  } else {
    const paramsA = {
      massifCoverage: [0.3, 0.34] as [number, number],
      massifSizeR: [200, 260] as [number, number],
      massifMasses: [clRow],
    };
    const paramsB = { ...paramsA, massifMasses: [{ kind: 'well_court', weight: 1.6 }] };
    let doors = 0, inRing = 0, spoored = 0, reach = 0;
    let stateOk = 0, extrasBad = 0, missCount = 0, n = 0;
    for (let s = 0; s < 16; s++) {
      const seed = 881003 + s * 104729;
      const dA = faceDef('probe_biome_den_cl', 'courtland', paramsA);
      const dB = faceDef('probe_biome_den_cl', 'courtland', paramsB);
      const a = mGen(dA, seed);
      const b = mGen(dB, seed);
      n++;
      const rings = carveMassifs(mCtx(seed), { ...dA, seed }).filter(m => m.interior);
      const hovels = a.doodads.filter(d => d.kind === 'hovel_door');
      doors += hovels.length;
      for (const d of hovels) {
        const home = rings.find(m =>
          Math.hypot(d.pos.x - m.interior!.x, d.pos.y - m.interior!.y) <= m.r * 0.68 * 0.9 + 0.5);
        if (home) inRing++;
        if (a.walk instanceof GridWalkField && a.walk.reachable(mEntry, vec(d.pos.x, d.pos.y))) reach++;
        if (a.doodads.filter(o =>
          (o.kind === 'feeding_stake' || o.kind === 'pot_cluster' || o.kind === 'web')
          && Math.hypot(o.pos.x - d.pos.x, o.pos.y - d.pos.y) < 110).length >= 2) spoored++;
      }
      const ka = a.walk instanceof GridWalkField ? a.walk.pack().kbits : 'a';
      const kb = b.walk instanceof GridWalkField ? b.walk.pack().kbits : 'b';
      if (ka === kb && JSON.stringify(a.pois) === JSON.stringify(b.pois)
        && JSON.stringify(a.garrisons) === JSON.stringify(b.garrisons)) stateOk++;
      const kA = keys(a.doodads), kB = keys(b.doodads);
      missCount += minus(kB, kA).length;
      for (const k of minus(kA, kB)) {
        const p = posOfKey(k);
        if (!hovelKit.has(kindOfKey(k))
          || !hovels.some(g => Math.hypot(g.pos.x - p.x, g.pos.y - p.y) < 130)) extrasBad++;
      }
    }
    check('M9 the crone answers on the rim (hovel doors in well rings, den-spoored, on the walk net)',
      doors >= 1 && inRing === doors && spoored === doors && reach === doors,
      `${doors} hovels over ${n} zones`);
    check('M10 THE SURGICAL PARITY (courtland): byte-equal state, the diff purely ADDITIVE hovel kit at doors',
      stateOk === n && extrasBad === 0 && missCount === 0,
      `${stateOk}/${n} state-equal, ${missCount} missing`);
  }
}

// --- RIG N: THE KILNHOARD (batch 18) — the colossal massif's resident --------
// The first den whose ONLY door is a tenant's (data/lairs.ts wave seven):
// the wyrm_caldera anchor (engine/massif.ts massifAnchors — probe_massif rig
// O owns the lane mechanics) keys `den: 'kilnhoard'` from its ring table,
// and the lair row is a TENANT-ONLY CLAIM — biomes [] + chance 0, so the
// seat fold structurally never offers it and the caldera's floor is the one
// door in the world. Pinned here (the full-registry world): the den resolves
// WHOLE; the fold's silence; the Urnfather's whole contract (dormant
// kiln_sleeper latch + rouse rule, colossal hittable worm, kit/looks/portrait
// censuses by the standing rigs); the den tileset's urn floor on every face;
// the pure sealed mint; and the doors standing LIVE on the shipped
// wyrmfields regime — in-ring, kiln-spoored, on the walk net, never the
// default well.
{
  // N1 — the den resolves whole (the M3 contract) + the A5 mouth contract.
  const lair = lairOf('kilnhoard');
  const lm = lair ? landmarkDefs().find(d => d.id === lair.landmark) : undefined;
  const mk = (lm?.params as { mouthKind?: string } | undefined)?.mouthKind;
  check("N1 den 'kilnhoard' resolves whole (lair → den_mouth landmark → sidezone 'kiln_maw')",
    !!lair && lm?.builder === 'den_mouth' && mk === 'kiln_maw' && !!sidezoneOf('kiln_maw'));
  check("N2 mouth 'kiln_maw' carries the full door contract (trigger rule + visual + entrance kind)",
    doodadRuleOf('kiln_maw').overlap === 'trigger'
    && !!DOODAD_VISUALS.kiln_maw && isSidezoneEntranceKind('kiln_maw'));

  // N3 — THE TENANT-ONLY CLAIM: the fold never offers the door on any
  // ground, including the den's own home face.
  check('N3 the claim is tenant-only (biomes [], chance 0, the fold silent on volcanic ground)',
    !!lair && lair.seat.biomes.length === 0 && lair.seat.chance === 0
    && !lairLandmarkRolls({ place: 'surface', biome: 'volcanic', level: 30, tileset: 'wyrmfields' })
      .some(r => r.landmark === 'kilnhoard_maw_site')
    && !lairLandmarkRolls({ place: 'cave', biome: 'volcanic', caveDepth: 1, level: 30, tileset: 'wyrm_barrow' })
      .some(r => r.landmark === 'kilnhoard_maw_site'));

  // N4 — the resident's whole contract: boss-tier, colossal, dormant on the
  // sphinx's latch (tag + rouse rule), a HITTABLE worm file (the surgeon's-
  // robbery coupling: a clipped coil is a landed wound and the rouse rule
  // answers it), and the segment looks painting.
  const wy = MONSTERS.urnfather;
  check('N4 the Urnfather is authored at colossal grade (boss, hittable worm file, the biggest body plan)',
    !!wy && wy.boss === true && !!wy.worm?.hittable && (wy.worm?.length ?? 0) >= 14
    && (wy.radius ?? 0) >= 30 && (wy.heft ?? 1) >= 2);
  check("N5 the sleep is the sphinx's latch (dormant tag registered, rouse rule armed, planted post)",
    wy?.tag === 'kiln_sleeper' && DORMANT_TAGS.has('kiln_sleeper')
    && !!ROUSE_RULES.kiln_sleeper?.() && wy?.post === true);
  const badKit = wy ? wy.skills.filter(s => !SKILLS[s]) : ['<none>'];
  check('N6 the kit resolves', badKit.length === 0, badKit.join(','));
  {
    const segLooks = ['urnfather', 'urnfather_coil', 'urnfather_kilnridge', 'urnfather_flukes'];
    const badLook = segLooks.filter(id => {
      const lk = LOOKS[id];
      return !lk || [...lk.parts, ...(lk.live ?? [])].some(p => !PART_PAINTERS[p.kind]);
    });
    check('N7 the whole file paints (head + coil + kilnridge + flukes)', badLook.length === 0, badLook.join(','));
  }

  // N8 — the den tileset: sealed off the frontier, and the TROVE law — the
  // urn floor stands on EVERY face (common rows + each variant).
  const kts = TILESETS.kilnhoard;
  check('N8 the kilnhoard tileset is a den (frontier false, sheltered sky)',
    !!kts && kts.frontier === false && kts.sky === 'sheltered');
  check('N9 the urn floor is the terrain on every face (common + variants all carry kiln_urn)',
    !!kts && (kts.common ?? []).some(r => r.kind === 'kiln_urn')
    && (kts.variants ?? []).length >= 2
    && (kts.variants ?? []).every(v => v.layout.some(r => r.kind === 'kiln_urn')));

  // N10 — the mint is pure and sealed, and the trove's banked half is
  // authored (gem caches on every mint; the boss ask names the resident).
  const sz = sidezoneOf('kiln_maw');
  if (!sz) check('N10 the kiln mints (sidezone present)', false);
  else {
    const mctx = {
      parent: caveDef({ id: 'probe_kiln_parent', caveDepth: undefined, anchor: undefined, biome: 'volcanic' }),
      seed: 424244, id: 'probe_kiln_det',
      pos: { x: 100, y: 100 }, playerLevel: 12, pkgActive: () => false,
    };
    const a = sz.mint(mctx);
    check('N10 the mint is pure and sealed (byte-equal, noDeeper, the boss ask, the banked caches)',
      JSON.stringify(a) === JSON.stringify(sz.mint(mctx))
      && a.noDeeper === true
      && a.objective?.kind === 'boss' && (a.objective as { id?: string }).id === 'urnfather'
      && Array.isArray(a.fauna) && a.fauna.some(f => f.id === 'gem_cache' && f.chance === 1)
      && a.layout.some(r => r.kind === 'kiln_urn'));
  }

  // N11 — LIVE on the shipped wyrmfields regime (heart geo): calderas crown
  // every mint (rig O's law), and where the tenant draw opened the door the
  // maw stands IN the ring floor, kiln-spoored, on the walk net — and the
  // default well never leaks through the den key.
  const ts = TILESETS.wyrmfields;
  if (!ts) check('N11 wyrmfields regime (tileset present)', false);
  else {
    const W2 = Math.round((ts.sizeW[0] + ts.sizeW[1]) / 2), H3 = Math.round((ts.sizeH[0] + ts.sizeH[1]) / 2);
    const nEntry = vec(140, H3 / 2);
    const nExits = [vec(W2 - 140, H3 / 2)];
    const nDef = (): ZoneDef => caveDef({
      id: 'probe_kilnhoard_field', size: { w: W2, h: H3 },
      layout: [...(ts.common ?? []), ...ts.layout], layoutType: 'massif',
      caveDepth: undefined, anchor: undefined, biome: 'volcanic',
      theme: ts.theme as ZoneDef['theme'],
      layoutParams: ts.layoutParams as Record<string, unknown>,
      geo: { biomeDepth: 1 },
    });
    let crowned = 0, doors = 0, inRing = 0, spoored = 0, reach = 0, wells = 0, n = 0;
    for (let s = 0; s < 16; s++) {
      // Hash-mixed seeds, deliberately: an ARITHMETIC ladder here samples a
      // correlated family (one caldera per zone, its tenant fork at a
      // similar stream position every time) and measured 2/16 doors against
      // the table's 40% — the spy-handler forensics (2026-08-01) showed the
      // DRAWS themselves skewed on the ladder while every drawn door seated.
      // Mixed seeds land the sweep near expectation, so the rig exercises a
      // real door population instead of the ladder's accident.
      const seed = (Math.imul(933103 + s, 2654435761) ^ 0x9e3779b9) >>> 0;
      const def = nDef();
      const out = generateLayout({ ...def, seed }, { w: W2, h: H3 }, new Rng(seed), nEntry, nExits);
      n++;
      const rings = carveMassifs({
        rng: new Rng(seed), arena: { w: W2, h: H3 }, entry: nEntry, exits: nExits, seed,
        doodads: [], pois: [], camps: [], breakables: [], npcs: [],
        garrisons: [], caveSeeds: [], reserved: [],
      }, { ...def, seed }).filter(m => m.kind === 'wyrm_caldera' && m.interior);
      if (rings.length === 1) crowned++;
      const maws = out.doodads.filter(d => d.kind === 'kiln_maw');
      doors += maws.length;
      wells += out.doodads.filter(d => d.kind === 'scorpion_well').length;
      for (const d of maws) {
        const home = rings.find(m =>
          Math.hypot(d.pos.x - m.interior!.x, d.pos.y - m.interior!.y) <= m.r * 0.52 * 0.9 + 0.5);
        if (home) inRing++;
        if (out.walk instanceof GridWalkField && out.walk.reachable(nEntry, vec(d.pos.x, d.pos.y))) reach++;
        if (out.doodads.filter(o =>
          (o.kind === 'kiln_urn' || o.kind === 'obsidian' || o.kind === 'bone_pile')
          && Math.hypot(o.pos.x - d.pos.x, o.pos.y - d.pos.y) < 110).length >= 2) spoored++;
      }
    }
    check('N11 the heart crowns every mint (the measured 40/40 law on the shipped regime)',
      crowned === n, `${crowned}/${n}`);
    check('N12 the doors stand honest (in the caldera floor, kiln-spoored, on the walk net, never the default well)',
      doors >= 2 && inRing === doors && spoored === doors && reach === doors && wells === 0,
      `${doors} maws over ${n} zones`);
  }
}

// --- RIG P: WAVE EIGHT — THE HOMED KIN (the biomes that had none) ------------
// Five new dens (data/lairs.ts wave eight), each seating ONE landed fabric
// as its whole argument: the Scythe Court (jungle — THE READERS: feint
// licensed by worn tells), the Stamping Ground (taiga — THE MASS FABRIC:
// heft + the charge's bowling lane), the Rimevault (tundra — THE PLY
// FABRIC: a 12-ply mail, dormant till the first chip), the Hunt's Rest
// (gloamwood — THE MOUNT FABRIC: true cavalry + the stabled spare), and
// the Tidewomb (littoral — THE HEART PUMP: creepSource.cadence bound to
// the body). Every mint rides the Scorpion Well's undefined-tileset lane.
// The registry/kit/look censuses arrive from rigs A1–A8 via the extended
// arrays; this rig pins the fold envelopes, placement, the per-den fabric
// contracts (static + live), and mint purity.
{
  // P1 — every den resolves whole (lair → den_mouth landmark → its own
  // mouth → registered sidezone), and every resident pays the hoard as a
  // marquee ask (boss + lair_hoard — the courser is the pair's other half,
  // deliberately neither).
  const DENS: { id: string; mouth: string; resident: string }[] = [
    { id: 'scythe_court', mouth: 'bower_gate', resident: 'mantis_abbess' },
    { id: 'stamping_ground', mouth: 'stamping_gap', resident: 'great_aurochs' },
    { id: 'rimevault', mouth: 'glacier_mouth', resident: 'rimeclad_elder' },
    { id: 'hunts_rest', mouth: 'hunt_gate', resident: 'hollow_huntsman' },
    { id: 'tidewomb', mouth: 'tide_hollow', resident: 'tideheart_matron' },
  ];
  for (const den of DENS) {
    const lair = lairOf(den.id);
    const lm = lair ? landmarkDefs().find(d => d.id === lair.landmark) : undefined;
    const mk = (lm?.params as { mouthKind?: string } | undefined)?.mouthKind;
    check(`P1 den '${den.id}' resolves whole (lair → den_mouth → '${den.mouth}' → sidezone)`,
      !!lair && lm?.builder === 'den_mouth' && mk === den.mouth && !!sidezoneOf(den.mouth));
    const res = MONSTERS[den.resident];
    check(`P1 '${den.resident}' is the den's marquee ask (boss, lair_hoard)`,
      res?.boss === true && res?.loot === 'lair_hoard');
  }
  check('P1 the courser is the pair\'s other half (full body, never a boss, no hoard)',
    MONSTERS.gloam_courser?.boss !== true && MONSTERS.gloam_courser?.loot === undefined);

  // P2 — THE FOLD ENVELOPES (pure): each seat present on its home biome at
  // full level, silent below the ramp's floor, silent on foreign ground.
  // The Rimevault alone claims the ladder too (place 'both'): offered in
  // the first two caves under tundra, refused by depth 3 (fadeOut 1).
  const at = (place: 'cave' | 'surface', biome: string, caveDepth: number | undefined,
    level: number) => lairLandmarkRolls({ place, biome, caveDepth, level, tileset: 'cavern' });
  const has = (rolls: { landmark: string }[], lm: string) => rolls.some(r => r.landmark === lm);
  const HOMES: Record<string, { biome: string; full: number; silent: number; lm: string }> = {
    scythe_court: { biome: 'jungle', full: 11, silent: 4, lm: 'bower_gate_site' },
    stamping_ground: { biome: 'taiga', full: 9, silent: 2, lm: 'stamping_gap_site' },
    rimevault: { biome: 'tundra', full: 12, silent: 5, lm: 'glacier_mouth_site' },
    hunts_rest: { biome: 'gloamwood', full: 13, silent: 6, lm: 'hunt_gate_site' },
    tidewomb: { biome: 'littoral', full: 8, silent: 3, lm: 'tide_hollow_site' },
  };
  for (const [id, h] of Object.entries(HOMES)) {
    check(`P2 '${id}' claims ${h.biome} at level ${h.full} and nothing sooner`,
      has(at('surface', h.biome, undefined, h.full), h.lm)
      && !has(at('surface', h.biome, undefined, h.silent), h.lm));
    check(`P2 '${id}' refuses foreign ground (the field hosts none of the five)`,
      !has(at('surface', 'field', undefined, 30), h.lm));
  }
  check('P2 the Rimevault claims the ladder too (depths 1–2 under tundra, refused by 3)',
    has(at('cave', 'tundra', 1, 12), 'glacier_mouth_site')
    && has(at('cave', 'tundra', 2, 12), 'glacier_mouth_site')
    && !has(at('cave', 'tundra', 3, 12), 'glacier_mouth_site'));
  check('P2 the four surface dens never seat underground',
    (['bower_gate_site', 'stamping_gap_site', 'hunt_gate_site', 'tide_hollow_site'] as const)
      .every(lm => !has(at('cave', 'jungle', 1, 30), lm) && !has(at('cave', 'taiga', 1, 30), lm)
        && !has(at('cave', 'gloamwood', 1, 30), lm) && !has(at('cave', 'littoral', 1, 30), lm)));

  // P3 — placement through the standing machinery (the C1/C2 law, all
  // five): a chance-1 roll stands exactly one mouth, spoor dresses the
  // apron, and the sweep is deterministic.
  const SPOOR: Record<string, string[]> = {
    bower_gate: ['web', 'drained_husk', 'fern'],
    stamping_gap: ['log', 'rock', 'bone_pile'],
    glacier_mouth: ['ice_spike', 'icicle_cluster', 'bone_pile'],
    hunt_gate: ['lantern_post', 'hide_rack', 'bone_pile'],
    tide_hollow: ['kelp_wrack', 'sea_rock', 'bone_pile'],
  };
  for (const [id, h] of Object.entries(HOMES)) {
    const mouth = DENS.find(d => d.id === id)!.mouth;
    const def = caveDef({
      landmarks: [{ landmark: h.lm, chance: 1 }],
      caveDepth: undefined, anchor: undefined, biome: h.biome,
    });
    const out = gen(def, 0x8a17 + Object.keys(HOMES).indexOf(id));
    const mouths = out.doodads.filter(d => d.kind === mouth);
    check(`P3 the ${mouth} stands (one mouth through the landmark loop)`,
      mouths.length === 1, `${mouths.length} mouths`);
    const kinds = SPOOR[mouth];
    const spoor = mouths[0] ? out.doodads.filter(d => kinds.includes(d.kind)
      && Math.hypot(d.pos.x - mouths[0].pos.x, d.pos.y - mouths[0].pos.y) < 160) : [];
    check(`P3 the ${mouth} apron is spoored (the den reads before the door)`,
      spoor.length >= 2, `${spoor.length} pieces`);
  }
  {
    const def = caveDef({
      landmarks: [{ landmark: 'glacier_mouth_site', chance: 1 }],
      caveDepth: undefined, anchor: undefined, biome: 'tundra',
    });
    const print = (o: GeneratedLayout) => o.doodads.map(d =>
      `${d.kind}:${Math.round(d.pos.x)},${Math.round(d.pos.y)}`).join('|');
    check('P3 same seed, same door (wave-eight placement determinism)',
      print(gen(def, 77088)) === print(gen(def, 77088)));
    const sealed = gen(caveDef({
      landmarks: [{ landmark: 'tide_hollow_site', chance: 1 }], noDeeper: true,
      caveDepth: undefined, anchor: undefined, biome: 'littoral',
    }), 77099);
    check('P3 a sealed pocket strips the wave-eight door (the noDeeper chokepoint)',
      sealed.doodads.every(d => d.kind !== 'tide_hollow'));
  }

  // P4 — THE FABRIC CONTRACTS (static): each den's one argument, pinned on
  // the def that carries it.
  const abbess = MONSTERS.mantis_abbess;
  check('P4 the Abbess feints AT SCHOOL RATE and wears the license (a feinting tell row — the readable-bluff law)',
    (abbess?.brain?.behavior?.feint?.chance ?? 0) >= 0.3
    && (abbess?.tells ?? []).some(t => t.source === 'feinting')
    && (abbess?.tells ?? []).some(t => t.source === 'casting')
    && (abbess?.tells ?? []).some(t => t.source === 'foecast'));
  const aur = MONSTERS.great_aurochs;
  check('P4 the Aurochs IS the mass argument (heft ≥ 2.5, the knockback charge in kit)',
    (aur?.heft ?? 1) >= 2.5 && (aur?.skills ?? []).includes('charge'));
  const elder = MONSTERS.rimeclad_elder;
  check('P4 the Elder wears the mail (12 plies) over a live pool (the DoT-pierce lane stays open)',
    elder?.plies?.count === 12 && (elder?.base.life ?? 0) > 0);
  check('P4 the Elder\'s sleep is the sphinx\'s latch (dormant tag + rouse rule, no reset)',
    elder?.tag === 'rime_sleeper' && DORMANT_TAGS.has('rime_sleeper')
    && !!ROUSE_RULES.rime_sleeper?.());
  check('P4 the mail is the meter (a plies-source tell row — drawn == tested)',
    (elder?.tells ?? []).some(t => t.source === 'plies'));
  const hm = MONSTERS.hollow_huntsman;
  const cr = MONSTERS.gloam_courser;
  check('P4 the pair is true cavalry (mount ↔ mountSlot, the steed fights on riderless)',
    hm?.mount?.on === 'gloam_courser'
    && (cr?.mountSlot?.kinds ?? []).includes('hollow_huntsman')
    && cr?.mountSlot?.onRiderDeath === 'fight');
  check('P4 the Hunt does not walk (the remount rule on the huntsman\'s brain)',
    (hm?.brain?.rules ?? []).some(r => (r.actions ?? []).some(a => (a as { do?: string }).do === 'mount')));
  const tm = MONSTERS.tideheart_matron;
  const pumped = tm?.creepSource?.cadence?.kind ?? tm?.creepSource?.kind;
  check('P4 the Matron\'s heart PUMPS a registered marching kind (brinesurge carries front levers)',
    tm?.creepSource?.kind === 'brinesurge' && !!tm?.creepSource?.cadence
    && !!pumped && !!CREEPS[pumped]?.front);

  // P5 — THE LIVE DENS: every mouth mints its country (id, name, the boss
  // ask, sealed), the resident stands, the fauna is home, and each fabric
  // argument holds in the running world.
  const slam = {
    id: 'probe_p_slam', name: 'Probe Slam', noDrop: true, description: '',
    tags: ['spell'], color: '#fff',
    manaCost: 0, cooldown: 0, useTime: 0,
    baseDamage: { physical: [500, 500] as [number, number] },
    delivery: { type: 'melee', range: 120, arcDeg: 180 },
    effects: [{ type: 'damage' }],
  } as SkillDef;
  const liveDen = (mouth: string, seed: number): void => {
    w.player.pos = vec(400, 400);
    w.enterSidezone({ pos: { x: 400, y: 400 }, seed, kind: mouth });
  };

  // P5-I: the Scythe Court — the school assembles around its abbess.
  {
    liveDen('bower_gate', 81001);
    check('P5 the bower mints the Scythe Court (boss ask, sealed rung)',
      w.zone.id === `cave_bower_gate_${homeId}_81001`
      && String(w.zone.name).includes('Scythe Court')
      && w.zone.objective.kind === 'boss' && w.zone.objective.id === 'mantis_abbess'
      && w.zone.noDeeper === true, `${w.zone.id} · ${w.zone.name}`);
    check('P5 the Abbess holds the hall', (w.actors as Actor[]).some(a => a.defId === 'mantis_abbess'));
    const court = (w.actors as Actor[]).filter(a =>
      a.defId?.startsWith('mantid_') || a.defId === 'emerald_mantis');
    check('P5 the court is in session (the discriminating pairs staged)',
      court.length >= 2, `${court.length} readers`);
    leaveToHome();
  }

  // P5-II: the Stamping Ground — the herd yards around its bull.
  {
    liveDen('stamping_gap', 81002);
    check('P5 the gap mints the Stamping Ground (boss ask, sealed rung)',
      String(w.zone.name).includes('Stamping Ground')
      && w.zone.objective.kind === 'boss' && w.zone.objective.id === 'great_aurochs'
      && w.zone.noDeeper === true);
    check('P5 the Aurochs holds the yard', (w.actors as Actor[]).some(a => a.defId === 'great_aurochs'));
    check('P5 the herd is home (taiga elk — the bowling lane\'s pins)',
      (w.actors as Actor[]).filter(a => a.defId === 'taiga_elk').length >= 1);
    leaveToHome();
  }

  // P5-III: the Rimevault — the mail eats blows, the first chip wakes it.
  {
    liveDen('glacier_mouth', 81003);
    check('P5 the glacier mints the Rimevault (boss ask, sealed rung)',
      String(w.zone.name).includes('Rimevault')
      && w.zone.objective.kind === 'boss' && w.zone.objective.id === 'rimeclad_elder'
      && w.zone.noDeeper === true);
    const elderA = (w.actors as Actor[]).find(a => a.defId === 'rimeclad_elder');
    check('P5 the Elder stands frozen (dormant, planted)', !!elderA && isDormant(elderA));
    if (elderA) {
      const striker = w.createMonster('zombie', 8, 'player') as Actor;
      striker.sheet.setSource('probe', [mod('accuracy', 'increased', 1000)]);
      w.actors.push(striker);
      striker.pos = vec(elderA.pos.x + 40, elderA.pos.y);
      const pliesFull = elderA.plies;
      const lifeFull = elderA.life;
      const swing = (): void => {
        striker.useLock = 0; striker.mana = striker.maxMana();
        w.executeSkill(striker, makeSkillInstance(slam, 1), vec(elderA.pos.x, elderA.pos.y));
      };
      swing();
      check('P5 a 500-damage slam chips exactly ONE plate and moves NO life (magnitude-blind)',
        elderA.plies === pliesFull - 1 && elderA.life === lifeFull,
        `plies ${elderA.plies}/${pliesFull}, life ${elderA.life}/${lifeFull}`);
      check('P5 the first chip THAWS it (the rouse rule answers the landed blow)',
        elderA.aiAwakened === true && !isDormant(elderA));
      swing(); swing();
      check('P5 the mail keeps eating (three chips, life still whole)',
        elderA.plies === pliesFull - 3 && elderA.life === lifeFull,
        `plies ${elderA.plies}/${pliesFull}`);
      striker.dead = true;
    }
    leaveToHome();
  }

  // P5-IV: the Hunt's Rest — the pair arrives stacked, the spare stands by.
  // (Den seed re-pinned 81004 → 81007 at the theater re-founding, 2026-08-05:
  // the keyed entry draws re-rolled per-seed event seating, shifting this
  // long-lived world's wander-jitter stream — under the old seed's staging
  // the lazy pairing sweep was still mid-mint at the rig's 1.0s window. The
  // claim is structural; a cold hunt_gate boot pairs within 1s. Re-pinned
  // 81007 → 81008 at M-NEWS, 2026-08-22: the world-news floaters left the head
  // for the notice feed and a floater's seat jitter was a GLOBAL rng draw
  // (World.text rolls rand(-10,10)), so every seeded entry that used to
  // announce draws one fewer — 81007's staging no longer pairs inside the
  // window (nor by 3s), 81008 pairs within 1s (scan 81007–81012: 08/11/12 pair).)
  {
    liveDen('hunt_gate', 81008);
    check('P5 the gate mints the Hunt\'s Rest (boss ask, sealed rung)',
      String(w.zone.name).includes("Hunt's Rest")
      && w.zone.objective.kind === 'boss' && w.zone.objective.id === 'hollow_huntsman'
      && w.zone.noDeeper === true);
    const hmA = (w.actors as Actor[]).find(a => a.defId === 'hollow_huntsman');
    check('P5 the Huntsman is home', !!hmA);
    step(1.0); // the lazy pairing sweep saddles him
    const coursers = (w.actors as Actor[]).filter(a => a.defId === 'gloam_courser' && !a.dead);
    check('P5 he arrives MOUNTED (the pairing sweep minted his courser beneath him)',
      !!hmA && hmA.mountId !== undefined && coursers.length >= 1,
      `mountId ${String(hmA?.mountId)}, ${coursers.length} coursers`);
    leaveToHome();
  }

  // P5-V: the Tidewomb — the heart plants its skin and arms the pump clock.
  {
    liveDen('tide_hollow', 81005);
    check('P5 the hollow mints the Tidewomb (boss ask, sealed rung)',
      String(w.zone.name).includes('Tidewomb')
      && w.zone.objective.kind === 'boss' && w.zone.objective.id === 'tideheart_matron'
      && w.zone.noDeeper === true);
    const tmA = (w.actors as Actor[]).find(a => a.defId === 'tideheart_matron');
    check('P5 the Matron is home', !!tmA);
    step(0.2);
    const field = w.creepEnsure();
    const bound = tmA && field ? field.sources.filter((s: { boundTo?: Actor }) => s.boundTo === tmA) : [];
    check('P5 her heart planted the brine skin (a source BOUND to her body)',
      bound.length >= 1, `${bound.length} bound sources`);
    check('P5 the pump clock is ARMED (creepPumpAt stamped — the tide has a heartbeat)',
      tmA?.creepPumpAt !== undefined);
    check('P5 the womb\'s small lives are home (skitters in the galleries)',
      (w.actors as Actor[]).filter(a => a.defId === 'tide_skitter').length >= 1);
    leaveToHome();
  }

  // P6 — mint purity, all five (the E1 law: byte-equal double-mints — same
  // mouth, same den, forever).
  for (const den of DENS) {
    const sz = sidezoneOf(den.mouth);
    if (!sz) { check(`P6 '${den.mouth}' mints (sidezone present)`, false); continue; }
    const mctx = {
      parent: caveDef({
        id: `probe_p6_${den.id}`, caveDepth: undefined, anchor: undefined,
        biome: HOMES[den.id].biome,
      }),
      seed: 0x9917 + DENS.indexOf(den), id: `probe_p6_pocket_${den.id}`,
      pos: { x: 100, y: 100 }, playerLevel: 12, pkgActive: () => false,
    };
    const a = sz.mint(mctx);
    check(`P6 '${den.id}' mints pure and sealed (byte-equal, noDeeper, authored fauna)`,
      JSON.stringify(a) === JSON.stringify(sz.mint(mctx))
      && a.noDeeper === true && Array.isArray(a.fauna) && a.fauna.length >= 2);
  }
}

// --- RIG P: WAVE NINE — THE HOMED KIN CONTINUE (archipelago + hell's marches)
// Two more dens (data/lairs.ts wave nine), the wave-eight bar verbatim: the
// Drumshell (beach/isle — THE COMBO GRAMMAR: the patriarch's two unmatched
// claws drum Twin Measures beside a congregation rapping Drumbeat, pips
// worn, payoffs naming earnable rules) and the Chainworks (steppes — THE
// TRACK FABRIC's unshown faces: a harrow circuit + a pausing pingpong
// shuttle, the sweeper grain (push 'along') delivering into speed-gated
// stake rows, every lane owned by the wright's tag). Both mints ride the
// Scorpion Well's undefined-tileset lane. The registry/kit/look censuses
// arrive from rigs A1–A8 via the extended arrays.
{
  // P7 — every den resolves whole; residents pay the hoard as marquee asks;
  // the drummer is the pair's other half (deliberately neither).
  const DENS9: { id: string; mouth: string; resident: string }[] = [
    { id: 'drumshell', mouth: 'drum_burrow', resident: 'drumclaw_patriarch' },
    { id: 'chainworks', mouth: 'windlass_gate', resident: 'chainwright' },
  ];
  for (const den of DENS9) {
    const lair = lairOf(den.id);
    const lm = lair ? landmarkDefs().find(d => d.id === lair.landmark) : undefined;
    const mk = (lm?.params as { mouthKind?: string } | undefined)?.mouthKind;
    check(`P7 den '${den.id}' resolves whole (lair → den_mouth → '${den.mouth}' → sidezone)`,
      !!lair && lm?.builder === 'den_mouth' && mk === den.mouth && !!sidezoneOf(den.mouth));
    const res = MONSTERS[den.resident];
    check(`P7 '${den.resident}' is the den's marquee ask (boss, lair_hoard)`,
      res?.boss === true && res?.loot === 'lair_hoard');
  }
  check('P7 the drummer is the pair\'s other half (full body, never a boss, no hoard)',
    MONSTERS.strand_drummer?.boss !== true && MONSTERS.strand_drummer?.loot === undefined);

  // P8 — THE FOLD ENVELOPES (pure): the drumshell claims BOTH shores of the
  // archipelago, the chainworks claims hell's marches, both silent below
  // their ramps, on foreign ground, and underground (place 'surface').
  const at = (place: 'cave' | 'surface', biome: string, caveDepth: number | undefined,
    level: number) => lairLandmarkRolls({ place, biome, caveDepth, level, tileset: 'cavern' });
  const has = (rolls: { landmark: string }[], lm: string) => rolls.some(r => r.landmark === lm);
  check('P8 the drumshell claims BOTH shores (beach and isle, one seat row)',
    has(at('surface', 'beach', undefined, 8), 'drum_burrow_site')
    && has(at('surface', 'isle', undefined, 8), 'drum_burrow_site'));
  check('P8 the drumshell is silent below its ramp and on foreign ground',
    !has(at('surface', 'beach', undefined, 2), 'drum_burrow_site')
    && !has(at('surface', 'field', undefined, 30), 'drum_burrow_site'));
  check('P8 the chainworks claims the marches at level 15 and nothing sooner',
    has(at('surface', 'steppes', undefined, 15), 'windlass_gate_site')
    && !has(at('surface', 'steppes', undefined, 8), 'windlass_gate_site'));
  check('P8 the chainworks refuses foreign ground (the field hosts neither)',
    !has(at('surface', 'field', undefined, 30), 'windlass_gate_site'));
  check('P8 the two surface dens never seat underground',
    !has(at('cave', 'beach', 1, 30), 'drum_burrow_site')
    && !has(at('cave', 'isle', 1, 30), 'drum_burrow_site')
    && !has(at('cave', 'steppes', 1, 30), 'windlass_gate_site'));

  // P9 — placement through the standing machinery (the C1/C2 law, both):
  // a chance-1 roll stands exactly one mouth, spoor dresses the apron, the
  // sweep is deterministic, and a sealed pocket strips the stray door.
  const SPOOR9: Record<string, { biome: string; lm: string; kinds: string[] }> = {
    drum_burrow: { biome: 'beach', lm: 'drum_burrow_site', kinds: ['kelp_wrack', 'sea_rock', 'bone_pile'] },
    windlass_gate: { biome: 'steppes', lm: 'windlass_gate_site', kinds: ['brazier', 'rock', 'bone_pile'] },
  };
  for (const [mouth, h] of Object.entries(SPOOR9)) {
    const def = caveDef({
      landmarks: [{ landmark: h.lm, chance: 1 }],
      caveDepth: undefined, anchor: undefined, biome: h.biome,
    });
    const out = gen(def, 0x9a19 + Object.keys(SPOOR9).indexOf(mouth));
    const mouths = out.doodads.filter(d => d.kind === mouth);
    check(`P9 the ${mouth} stands (one mouth through the landmark loop)`,
      mouths.length === 1, `${mouths.length} mouths`);
    const spoor = mouths[0] ? out.doodads.filter(d => h.kinds.includes(d.kind)
      && Math.hypot(d.pos.x - mouths[0].pos.x, d.pos.y - mouths[0].pos.y) < 160) : [];
    check(`P9 the ${mouth} apron is spoored (the den reads before the door)`,
      spoor.length >= 2, `${spoor.length} pieces`);
  }
  {
    const def = caveDef({
      landmarks: [{ landmark: 'drum_burrow_site', chance: 1 }],
      caveDepth: undefined, anchor: undefined, biome: 'beach',
    });
    const print = (o: GeneratedLayout) => o.doodads.map(d =>
      `${d.kind}:${Math.round(d.pos.x)},${Math.round(d.pos.y)}`).join('|');
    check('P9 same seed, same door (wave-nine placement determinism)',
      print(gen(def, 77190)) === print(gen(def, 77190)));
    const sealed = gen(caveDef({
      landmarks: [{ landmark: 'drum_burrow_site', chance: 1 }], noDeeper: true,
      caveDepth: undefined, anchor: undefined, biome: 'beach',
    }), 77191);
    check('P9 a sealed pocket strips the wave-nine door (the noDeeper chokepoint)',
      sealed.doodads.every(d => d.kind !== 'drum_burrow'));
  }

  // P10 — THE FABRIC CONTRACTS (static): each den's one argument, pinned on
  // the data that carries it.
  const pat = MONSTERS.drumclaw_patriarch;
  const patRule = COMBO_RULES.twin_measures;
  const patAttacks = (pat?.skills ?? []).filter(s => SKILLS[s]?.tags?.includes('attack'));
  check('P10 the Patriarch drums Twin Measures and his claws can CLOSE it (two distinct attack skills — the completability license)',
    (pat?.mods ?? []).some(m => m.stat === 'combo_twin_measures')
    && !!patRule?.vary && patRule.vary.n === 2
    && new Set(patAttacks).size >= 2);
  const drm = MONSTERS.strand_drummer;
  check('P10 the congregation raps Drumbeat with a kit that can keep it (an attack to repeat)',
    (drm?.mods ?? []).some(m => m.stat === 'combo_drumbeat')
    && !!COMBO_RULES.drumbeat?.repeat
    && (drm?.skills ?? []).some(s => SKILLS[s]?.tags?.includes('attack')));
  for (const id of ['drumclaw_patriarch', 'strand_drummer'] as const) {
    const look = MONSTERS[id]?.look ? LOOKS[MONSTERS[id].look!] : undefined;
    check(`P10 '${id}' wears the beat pips (the cadenced-kin tell law)`,
      !!look?.live?.some(s => s.kind === 'beatPips'));
  }
  const harrow = trackRider('chain_harrow');
  check('P10 the harrow is the sweeper (push \'along\' — the carry-you-around grain, licensed)',
    !!harrow && harrow.payload.push === 'along' && (harrow.payload.impulse ?? 0) > 0);
  check('P10 the works spare their own crew (the shear disc\'s faction law)',
    !!harrow?.payload.notFactions?.includes('demon'));
  const hv = DOODAD_VISUALS['chain_harrow'];
  const hvp = hv?.params as { beamHw?: number; beamHh?: number } | undefined;
  check('P10 the drawn harrow IS the tested rect (the agreement contract at den grain)',
    harrow?.surface.kind === 'rect'
    && hvp?.beamHw === harrow.surface.hw && hvp?.beamHh === harrow.surface.hh);
  check('P10 the wright anchors his court (def tag = the lanes\' ownerTag; the ring landmark stands)',
    MONSTERS.chainwright?.tag === 'chainwright' && hasLandmark('windlass_ring'));

  // P11 — THE LIVE DENS: each mouth mints its country, the resident stands,
  // and the fabric argument holds in the running world.
  const liveDen9 = (mouth: string, seed: number): void => {
    w.player.pos = vec(400, 400);
    w.enterSidezone({ pos: { x: 400, y: 400 }, seed, kind: mouth });
  };

  // P11-I: the Drumshell — the congregation keeps time (the probe_combo
  // fencer proof at den scale: the buff arrives through def mods alone).
  {
    liveDen9('drum_burrow', 91901);
    check('P11 the burrow mints the Drumshell (boss ask, sealed rung)',
      w.zone.id === `cave_drum_burrow_${homeId}_91901`
      && String(w.zone.name).includes('Drumshell')
      && w.zone.objective.kind === 'boss' && w.zone.objective.id === 'drumclaw_patriarch'
      && w.zone.noDeeper === true, `${w.zone.id} · ${w.zone.name}`);
    check('P11 the Patriarch holds the hall',
      (w.actors as Actor[]).some(a => a.defId === 'drumclaw_patriarch'));
    const drummers = (w.actors as Actor[]).filter(a => a.defId === 'strand_drummer' && !a.dead);
    check('P11 the congregation is in session (drummers staged)',
      drummers.length >= 1, `${drummers.length} drummers`);
    const drummer = drummers[0];
    if (drummer) {
      w.player.invulnerable = true;
      drummer.pos = vec(w.player.pos.x + 70, w.player.pos.y);
      let drummed = false;
      const dt = 1 / 30;
      for (let t = 0; t < 25 && !drummed; t += dt) {
        for (const a of w.actors) updateAI(a, world, dt);
        w.update(dt);
        if (drummer.dead) break;
        if (drummer.buffs.has('drumbeat')) drummed = true;
      }
      check('P11 the drummer closes its measure live (Drumbeat through def mods alone)',
        drummed, drummed ? '' : `ring=${drummer.castRing?.length ?? 'null'} watch=${drummer.comboWatch}`);
      check('P11 the drummer woke through its own grammar (the ring is live)',
        drummer.comboWatch === true && drummer.castRing !== null);
      w.player.invulnerable = false;
    }
    leaveToHome();
  }

  // P11-II: the Chainworks — the wheel turns (lanes placed, owned, grooved,
  // the sweeper licensed, the stakes collecting, the pose clockwork-pure).
  {
    liveDen9('windlass_gate', 91902);
    check('P11 the gate mints the Chainworks (boss ask, sealed rung)',
      String(w.zone.name).includes('Chainworks')
      && w.zone.objective.kind === 'boss' && w.zone.objective.id === 'chainwright'
      && w.zone.noDeeper === true);
    check('P11 the Wright is home', (w.actors as Actor[]).some(a => a.defId === 'chainwright'));
    const tracks = (w.tracks ?? []) as PlacedTrack[];
    const circuit = tracks.find(t => t.spec.closed === true && (t.spec.mode ?? 'loop') === 'loop'
      && t.spec.riders.some(r => r.kind === 'chain_harrow'));
    const shuttle = tracks.find(t => t.spec.mode === 'pingpong'
      && (t.spec.pauses?.length ?? 0) >= 2
      && t.spec.riders.some(r => r.kind === 'chain_harrow'));
    check('P11 the wheel turns (the harrow circuit AND the pausing shuttle both placed)',
      !!circuit && !!shuttle, `${tracks.length} lanes`);
    check('P11 every lane is the wright\'s (ownerTag — the Winter King\'s court law)',
      tracks.length >= 2 && tracks.every(t => t.spec.ownerTag === 'chainwright'));
    const dood = (w.doodads ?? []) as { kind: string }[];
    check('P11 the lanes are carved and the collectors stand (groove + stake rows)',
      dood.filter(d => d.kind === 'track_groove').length >= 8
      && dood.filter(d => d.kind === 'gore_stakes').length >= 3,
      `${dood.filter(d => d.kind === 'track_groove').length} groove, ${dood.filter(d => d.kind === 'gore_stakes').length} stakes`);
    if (circuit) {
      const a = trackPose(circuit, 5.0, 0), b = trackPose(circuit, 5.0, 0), c = trackPose(circuit, 6.0, 0);
      check('P11 the pose is clockwork-pure (two reads one truth; the clock moves the blade)',
        a.x === b.x && a.y === b.y && (a.x !== c.x || a.y !== c.y));
    }
    leaveToHome();
  }

  // P12 — mint purity, both (the E1 law: byte-equal double-mints — same
  // mouth, same den, forever; the appended ring row rides the purity).
  for (const den of DENS9) {
    const sz = sidezoneOf(den.mouth);
    if (!sz) { check(`P12 '${den.mouth}' mints (sidezone present)`, false); continue; }
    const mctx = {
      parent: caveDef({
        id: `probe_p12_${den.id}`, caveDepth: undefined, anchor: undefined,
        biome: den.id === 'drumshell' ? 'beach' : 'steppes',
      }),
      seed: 0x9919 + DENS9.indexOf(den), id: `probe_p12_pocket_${den.id}`,
      pos: { x: 100, y: 100 }, playerLevel: 14, pkgActive: () => false,
    };
    const a = sz.mint(mctx);
    check(`P12 '${den.id}' mints pure and sealed (byte-equal, noDeeper, authored fauna)`,
      JSON.stringify(a) === JSON.stringify(sz.mint(mctx))
      && a.noDeeper === true && Array.isArray(a.fauna) && a.fauna.length >= 2);
  }
  check('P12 the Chainworks mint carries its wheel (the windlass ring appended at chance 1)',
    (() => {
      const sz = sidezoneOf('windlass_gate');
      if (!sz) return false;
      const d = sz.mint({
        parent: caveDef({ id: 'probe_p12_ring', caveDepth: undefined, anchor: undefined, biome: 'steppes' }),
        seed: 0x9920, id: 'probe_p12_ring_pocket',
        pos: { x: 100, y: 100 }, playerLevel: 14, pkgActive: () => false,
      });
      return (d.landmarks ?? []).some(l => l.landmark === 'windlass_ring' && l.chance === 1);
    })());
}

// --- RIG P: WAVE TEN — THE HOMED KIN reach the freshest ground ---------------
// Four claims where the census ran thinnest and the newest fabric work
// landed, each den ONE landed fabric as its whole argument: the Geode Sett
// (crystal — THE ATTUNEMENT FABRIC: an open-retuning court around a locked
// rolled heart, the voices studding the hall), the Rimewick Clutch (the
// windchill mountain faces — THE SURVIVAL FABRIC's cold half: the one warm
// ground is the held ground), the Vane Roost (the wind reaches — THE
// FLOCKING FABRIC: the murmuration, its telegraphed dives, its attackable
// shape; the door rides the COMPOSITION lane because the archipelago starves
// the landmark sitter — measured, see data/lairs.ts), and the Honeyfold (the
// garden's root tier — THE SYMPATHY FABRIC: the matron's draught waters the
// hall). The registry/kit/look censuses arrive from rigs A1–A8 via the
// extended arrays.
{
  // P13 — the den keys resolve whole; residents pay the hoard as marquee
  // asks; the pair laws hold on every court body and both in-zone alphas.
  const DENS10: { id: string; mouth: string; resident: string }[] = [
    { id: 'geode_sett', mouth: 'geode_crack', resident: 'prismbrock_matriarch' },
    { id: 'honeyfold', mouth: 'wax_gate', resident: 'replete_foldmother' },
  ];
  for (const den of DENS10) {
    const lair = lairOf(den.id);
    const lm = lair ? landmarkDefs().find(d => d.id === lair.landmark) : undefined;
    const mk = (lm?.params as { mouthKind?: string } | undefined)?.mouthKind;
    check(`P13 den '${den.id}' resolves whole (lair → den_mouth → '${den.mouth}' → sidezone)`,
      !!lair && lm?.builder === 'den_mouth' && mk === den.mouth && !!sidezoneOf(den.mouth));
    const res = MONSTERS[den.resident];
    check(`P13 '${den.resident}' is the den's marquee ask (boss, lair_hoard)`,
      res?.boss === true && res?.loot === 'lair_hoard');
  }
  check('P13 the roost is the composition lane\'s den (no lair row — the wane-arch family)',
    hasComposition('vane_roost_site') && hasCluster('roost_knoll')
    && !!sidezoneOf('roost_hollow') && !lairOf('vane_roost'));
  const roostComp = compositionDefs().find(c => c.id === 'vane_roost_site');
  check('P13 the knoll anchors on WALKABLE ground (siteWalk — the archipelago\'s own lever)',
    roostComp?.sites?.some(s => s.siteWalk === true) === true);
  check('P13 the court bodies are the pairs\' other halves (full bodies, never bosses, no hoard)',
    (['prism_brock', 'rimewick', 'gale_swift'] as const).every(id =>
      MONSTERS[id]?.boss !== true && MONSTERS[id]?.bossBar !== true && MONSTERS[id]?.loot === undefined));
  check('P13 the in-zone alphas wear the hill giant\'s classification (bossBar elite + hoard, never boss)',
    (['rimewick_matron', 'stream_shrike'] as const).every(id =>
      MONSTERS[id]?.bossBar === true && !MONSTERS[id]?.boss && MONSTERS[id]?.loot === 'lair_hoard'));

  // P14 — THE FOLD ENVELOPES (pure): the sett claims both grounds of its
  // country, the fold claims exactly the garden's first cave, the clutch
  // claims only the measured windchill faces, and the roost claims nothing
  // through the fold at all (P13 pinned the absent row).
  const at = (place: 'cave' | 'surface', biome: string, caveDepth: number | undefined,
    level: number, tileset = 'cavern') =>
    lairLandmarkRolls({ place, biome, caveDepth, level, tileset });
  const has = (rolls: { landmark: string }[], lm: string) => rolls.some(r => r.landmark === lm);
  check('P14 the sett claims the crystal country on BOTH grounds (surface + depths 1-2, refused by 3)',
    has(at('surface', 'crystal', undefined, 11), 'geode_crack_site')
    && has(at('cave', 'crystal', 1, 11), 'geode_crack_site')
    && has(at('cave', 'crystal', 2, 11), 'geode_crack_site')
    && !has(at('cave', 'crystal', 3, 11), 'geode_crack_site'));
  check('P14 the sett is silent below its ramp and on foreign ground',
    !has(at('surface', 'crystal', undefined, 4), 'geode_crack_site')
    && !has(at('surface', 'field', undefined, 30), 'geode_crack_site'));
  check('P14 the fold claims the garden\'s FIRST cave full, whispers into the rootways, silent below',
    has(at('cave', 'garden', 1, 9), 'wax_gate_site')
    && has(at('cave', 'garden', 2, 9), 'wax_gate_site')
    && !has(at('cave', 'garden', 3, 9), 'wax_gate_site'));
  check('P14 the fold never stands on the garden surface or under foreign anchors',
    !has(at('surface', 'garden', undefined, 30), 'wax_gate_site')
    && !has(at('cave', 'highland', 1, 30), 'wax_gate_site'));
  check('P14 the clutch claims the cold faces by ALLOWLIST (snowcrown yes, foothills no, cavern no)',
    has(at('surface', 'highland', undefined, 10, 'snowcrown'), 'rimewick_clutch')
    && has(at('surface', 'highland', undefined, 10, 'pinnacle'), 'rimewick_clutch')
    && !has(at('surface', 'highland', undefined, 10, 'foothills'), 'rimewick_clutch')
    && !has(at('surface', 'highland', undefined, 10), 'rimewick_clutch'));
  check('P14 THE ARGUING-GROUND PIN: every allowlisted face carries the windchill dial',
    (lairOf('rimewick_clutch')?.seat.tilesets ?? []).length >= 4
    && (lairOf('rimewick_clutch')?.seat.tilesets ?? []).every(t =>
      ((TILESETS[t]?.theme as { windchill?: number } | undefined)?.windchill ?? 0) > 0));

  // P15 — placement through the standing machinery: mouths stand and are
  // spoored, the clutch furnishes its ring (ONE stone), the knoll plants
  // the hollow through the composition lane, the sweep is deterministic,
  // and a sealed pocket strips ALL THREE doors however they were planted.
  const SPOOR10: Record<string, { biome: string; lm: string; kinds: string[] }> = {
    geode_crack: { biome: 'crystal', lm: 'geode_crack_site', kinds: ['crystal_cluster', 'scree', 'bone_pile'] },
    wax_gate: { biome: 'garden', lm: 'wax_gate_site', kinds: ['comb_wax', 'egg_clutch', 'bone_pile'] },
  };
  for (const [mouth, h] of Object.entries(SPOOR10)) {
    const def = caveDef({
      landmarks: [{ landmark: h.lm, chance: 1 }],
      caveDepth: undefined, anchor: undefined, biome: h.biome,
    });
    const out = gen(def, 0xa119 + Object.keys(SPOOR10).indexOf(mouth));
    const mouths = out.doodads.filter(d => d.kind === mouth);
    check(`P15 the ${mouth} stands (one mouth through the landmark loop)`,
      mouths.length === 1, `${mouths.length} mouths`);
    const spoor = mouths[0] ? out.doodads.filter(d => h.kinds.includes(d.kind)
      && Math.hypot(d.pos.x - mouths[0].pos.x, d.pos.y - mouths[0].pos.y) < 160) : [];
    check(`P15 the ${mouth} apron is spoored (the den reads before the door)`,
      spoor.length >= 2, `${spoor.length} pieces`);
  }
  {
    const ring = gen(caveDef({
      landmarks: [{ landmark: 'rimewick_clutch', chance: 1 }],
      caveDepth: undefined, anchor: undefined, biome: 'highland',
    }), 0xa131);
    check('P15 the clutch furnishes its ring (EXACTLY one smolderstone — the one warm ground)',
      ring.doodads.filter(d => d.kind === 'smolderstone').length === 1);
    const wicks = (ring.landmarkSpawns ?? []).filter(s => s.id === 'rimewick' || s.id === 'rimewick_matron');
    check('P15 the wicks hold the ring (landmark spawns staged interior)',
      wicks.length >= 5, `${wicks.length} wicks`);
    const knoll = gen(caveDef({
      compositions: [{ composition: 'vane_roost_site', chance: 1 }],
      caveDepth: undefined, anchor: undefined, biome: 'aether_stream',
    }), 0xa132);
    check('P15 the knoll plants the hollow (the composition lane\'s door stands)',
      knoll.doodads.filter(d => d.kind === 'roost_hollow').length === 1
      && knoll.doodads.some(d => d.kind === 'gale_vane'));
    const geodeDef = caveDef({
      landmarks: [{ landmark: 'geode_crack_site', chance: 1 }],
      caveDepth: undefined, anchor: undefined, biome: 'crystal',
    });
    const print = (o: GeneratedLayout) => o.doodads.map(d =>
      `${d.kind}:${Math.round(d.pos.x)},${Math.round(d.pos.y)}`).join('|');
    check('P15 same seed, same door (wave-ten placement determinism)',
      print(gen(geodeDef, 77210)) === print(gen(geodeDef, 77210)));
    const SEALED10: [string, Partial<ZoneDef>][] = [
      ['geode_crack', { landmarks: [{ landmark: 'geode_crack_site', chance: 1 }], biome: 'crystal' }],
      ['wax_gate', { landmarks: [{ landmark: 'wax_gate_site', chance: 1 }], biome: 'garden' }],
      ['roost_hollow', { compositions: [{ composition: 'vane_roost_site', chance: 1 }], biome: 'aether_stream' }],
    ];
    for (const [mouth, over] of SEALED10) {
      const sealed = gen(caveDef({
        ...over, noDeeper: true, caveDepth: undefined, anchor: undefined,
      }), 0xa140);
      check(`P15 a sealed pocket strips the ${mouth} (the noDeeper chokepoint, every planting lane)`,
        sealed.doodads.every(d => d.kind !== mouth));
    }
  }

  // P16 — THE FABRIC CONTRACTS (static): each den's one argument, pinned on
  // the data that carries it.
  check('P16 the brock is the OPEN re-tuner (tune worn, never locked, never rolled)',
    !!MONSTERS.prism_brock?.tune && MONSTERS.prism_brock.tune.locked !== true
    && MONSTERS.prism_brock.tune.roll !== true);
  const mat = MONSTERS.prismbrock_matriarch?.tune;
  check('P16 the Matriarch is the heart\'s riddle at boss scale (rolled + LOCKED, the three elements)',
    mat?.roll === true && mat?.locked === true
    && (mat?.tones?.length ?? 0) === 3 && !mat?.tones?.includes('physical'));
  const stoneRule = doodadRuleOf('smolderstone');
  const stoneVis = DOODAD_VISUALS['smolderstone'];
  check('P16 THE ONE NUMBER on the clutch\'s coal (warms == the drawn light\'s absolute radius)',
    typeof stoneRule.warms === 'number' && stoneRule.warms === stoneVis?.light?.radius);
  check('P16 the coal blesses by contact (hearthglow — the carried warmth the windchill loop reads)',
    (stoneRule.contact?.status as { id?: string } | undefined)?.id === 'hearthglow'
    && !!STATUS_DEFS.hearthglow
    && (STATUS_DEFS.hearthglow.mods ?? []).some(m => m.stat === 'windchillWard'));
  check('P16 the wicks fight in the cold\'s own color (frostbolt in kit, cold-tagged)',
    (MONSTERS.rimewick?.skills ?? []).includes('frostbolt')
    && !!SKILLS.frostbolt?.tags?.includes('cold'));
  const swiftScript = MONSTERS.gale_swift?.brain?.script;
  const swiftAloft = swiftScript?.find(p => p.id === 'aloft');
  const swiftFlock = swiftAloft?.use?.behavior?.flock;
  check('P16 the swift murmurates aloft (the flock lever at full weave on the aloft phase)',
    !!swiftFlock && (swiftFlock.weave ?? 0) >= 1.5 && swiftFlock.kin === 'faction');
  check('P16 the wheel\'s structure is attackable (leader death scatters the flock; packSize fields it)',
    MONSTERS.gale_swift?.brain?.squad?.onLeaderDeath === 'scatter'
    && (MONSTERS.gale_swift?.packSize?.[0] ?? 0) >= 5);
  for (const [id, dive] of [['gale_swift', 'locust_dive'], ['stream_shrike', 'condor_stoop']] as const) {
    const d = SKILLS[dive]?.delivery;
    check(`P16 the ${id}'s stoop is an honest dive (telegraphed leap in kit)`,
      (MONSTERS[id]?.skills ?? []).includes(dive)
      && d?.type === 'leap' && (d as { telegraph?: boolean }).telegraph === true);
  }
  check('P16 the Foldmother wears the born link and the link resolves (matrons_draught → pack)',
    (MONSTERS.replete_foldmother?.sympathy ?? []).includes('matrons_draught')
    && SYMPATHY_LINKS.matrons_draught?.to.includes('pack'));
  check('P16 she can DRINK and afford her kit (swig the reflex flask; heavy_strike payable)',
    (MONSTERS.replete_foldmother?.skills ?? []).includes('swig')
    && SKILLS.swig?.reflex === true
    && (SKILLS.heavy_strike?.manaCost ?? 0) <= (MONSTERS.replete_foldmother?.base.mana ?? 0));

  // P17 — THE LIVE DENS: each mouth mints its country, the residents stand,
  // and the fabric argument holds in the running world.
  const liveDen10 = (mouth: string, seed: number): void => {
    w.player.pos = vec(400, 400);
    w.enterSidezone({ pos: { x: 400, y: 400 }, seed, kind: mouth });
  };
  const flyBolt = (boltId: string, target: Actor): void => {
    w.player.mana = 200;
    const aim = vec(target.pos.x, target.pos.y);
    w.useSkill(w.player, makeSkillInstance(SKILLS[boltId] as SkillDef, 1), aim);
    const dt = 1 / 30;
    for (let t = 0; t < 3; t += dt) w.update(dt); // flight only — no AI, nothing walks
  };

  // P17-I: the Geode Sett — the open court re-tunes to the blow and the
  // wash is faction-blind; the locked heart holds her note.
  {
    liveDen10('geode_crack', 91910);
    check('P17 the crack mints the Geode Sett (boss ask, sealed rung, the grotto face)',
      String(w.zone.name).includes('Geode Sett')
      && w.zone.objective.kind === 'boss' && w.zone.objective.id === 'prismbrock_matriarch'
      && w.zone.noDeeper === true && w.zone.variantName === 'crystal grotto',
      `${w.zone.name} · ${w.zone.tileset} · ${w.zone.variantName}`);
    const brocks = (w.actors as Actor[]).filter(a => a.defId === 'prism_brock' && !a.dead);
    const voices = (w.actors as Actor[]).filter(a => a.defId === 'resonant_crystal');
    check('P17 the court is home and the voices stand (brocks + resonant pillars staged)',
      brocks.length >= 3 && voices.length >= 3, `${brocks.length} brocks, ${voices.length} voices`);
    const brock = brocks[0];
    const matriarch = (w.actors as Actor[]).find(a => a.defId === 'prismbrock_matriarch');
    check('P17 the Matriarch holds the heart', !!matriarch);
    if (brock && matriarch) {
      w.player.invulnerable = true;
      brock.pos = vec(w.player.pos.x + 60, w.player.pos.y);
      flyBolt('firebolt', brock);
      check('P17 the blow re-tunes the brock (fire tone worn — the crystal takes the color)',
        brock.tone === 'fire' && brock.statuses.some(s => s.id === 'attuned_fire'), `tone=${brock.tone}`);
      check('P17 the wash is faction-blind (the pulse attuned the STRIKER too)',
        (w.player as Actor).statuses.some(s => s.id === 'attuned_fire'));
      const heldTone = matriarch.tone;
      check('P17 the heart woke in a rolled elemental note',
        heldTone === 'fire' || heldTone === 'cold' || heldTone === 'lightning', String(heldTone));
      matriarch.pos = vec(w.player.pos.x + 60, w.player.pos.y - 30);
      flyBolt(heldTone === 'fire' ? 'frostbolt' : 'firebolt', matriarch);
      check('P17 the heart HOLDS its note (locked — the counter-tone blow moves nothing)',
        matriarch.tone === heldTone, `${String(heldTone)} → ${String(matriarch.tone)}`);
      w.player.invulnerable = false;
    }
    leaveToHome();
  }

  // P17-II: the Vane Roost — the minted sky is open, the flock's own, and
  // the murmuration takes the wing.
  {
    liveDen10('roost_hollow', 91911);
    check('P17 the hollow mints the Vane Roost (boss ask, sealed rung, the drift face, OPEN sky)',
      String(w.zone.name).includes('Vane Roost')
      && w.zone.objective.kind === 'boss' && w.zone.objective.id === 'stream_shrike'
      && w.zone.noDeeper === true && w.zone.tileset === 'aether_drift' && w.zone.sky === 'open',
      `${w.zone.name} · ${w.zone.tileset} · sky=${String(w.zone.sky)}`);
    check('P17 the roost\'s sky is the flock\'s ALONE (packs override — no galekin hunt inside)',
      (w.zone.packs?.table ?? []).length > 0
      && (w.zone.packs.table as { id: string }[]).every(r => r.id === 'gale_swift' || r.id === 'stream_shrike'));
    const swifts = (w.actors as Actor[]).filter(a => a.defId === 'gale_swift' && !a.dead);
    check('P17 the murmuration is in residence (the fauna wheel staged)',
      swifts.length >= 7, `${swifts.length} swifts`);
    {
      const dt = 1 / 30;
      let aloft = 0;
      for (let t = 0; t < 6 && aloft === 0; t += dt) {
        for (const a of w.actors) updateAI(a, world, dt);
        w.update(dt);
        aloft = swifts.filter(a => !a.dead && (a.flying || a.buffs.has('aloft'))).length;
      }
      check('P17 the wheel takes the wing (swifts ALOFT through their own cycle)',
        aloft >= 1, `${aloft} aloft`);
    }
    leaveToHome();
  }

  // P17-III: the Honeyfold — the matron drinks and the hall drinks with
  // her (the draught live through def data alone).
  {
    liveDen10('wax_gate', 91912);
    check('P17 the gate mints the Honeyfold (boss ask, sealed rung)',
      String(w.zone.name).includes('Honeyfold')
      && w.zone.objective.kind === 'boss' && w.zone.objective.id === 'replete_foldmother'
      && w.zone.noDeeper === true, `${w.zone.name}`);
    const mother = (w.actors as Actor[]).find(a => a.defId === 'replete_foldmother' && !a.dead);
    const tender = (w.actors as Actor[]).find(a => a.defId === 'formic_tender' && !a.dead);
    check('P17 the wet-nurse is home and the milking crew stands', !!mother && !!tender);
    if (mother && tender) {
      w.player.invulnerable = true;
      mother.pos = vec(w.player.pos.x + 70, w.player.pos.y);
      tender.pos = vec(mother.pos.x + 60, mother.pos.y);
      mother.life = mother.maxLife() * 0.5; // past the thirst gate (missing ≥ 20%)
      tender.life = tender.maxLife() * 0.5;
      const woundedAt = tender.life;
      let fed = false;
      const dt = 1 / 30;
      for (let t = 0; t < 25 && !fed; t += dt) {
        for (const a of w.actors) updateAI(a, world, dt);
        w.update(dt);
        if (tender.dead || mother.dead) break;
        if (tender.life > woundedAt + 8) fed = true;
      }
      check('P17 the hall drinks as one (her swig watered the tender through the born link)',
        fed, fed ? '' : `tender ${Math.round(woundedAt)} → ${Math.round(tender.life)}, mother quaffing=${mother.buffs.has('quaffing')}`);
      w.player.invulnerable = false;
    }
    leaveToHome();
  }

  // P18 — mint purity (the E1 law: byte-equal double-mints — same mouth,
  // same den, forever), plus each mint's own authored contract.
  const mintOf = (mouth: string, parentOver: Partial<ZoneDef>, seed: number): ZoneDef | null => {
    const sz = sidezoneOf(mouth);
    if (!sz) return null;
    const mctx = {
      parent: caveDef({ id: `probe_p18_${mouth}`, caveDepth: undefined, anchor: undefined, ...parentOver }),
      seed, id: `probe_p18_pocket_${mouth}`,
      pos: { x: 100, y: 100 }, playerLevel: 12, pkgActive: () => false,
    };
    const a = sz.mint(mctx);
    check(`P18 '${mouth}' mints pure and sealed (byte-equal, noDeeper)`,
      JSON.stringify(a) === JSON.stringify(sz.mint(mctx)) && a.noDeeper === true);
    return a;
  };
  const sett = mintOf('geode_crack', { biome: 'crystal' }, 0xa219);
  check('P18 the sett wears the grotto ALWAYS (forced cavern face, the crystal grotto variant, voices authored)',
    sett?.tileset === 'cavern' && sett?.variantName === 'crystal grotto'
    && (sett?.scenery ?? []).some(s => s.monster === 'resonant_crystal')
    && (sett?.fauna ?? []).some(f => f.id === 'prism_brock'));
  const roost = mintOf('roost_hollow', { biome: 'aether_stream' }, 0xa220);
  check('P18 the roost is a private open sky (drift face, sky OPEN, all-zephyrid packs, the wheel authored)',
    roost?.tileset === 'aether_drift' && roost?.sky === 'open'
    && (roost?.packs?.table ?? []).every(r => r.id === 'gale_swift' || r.id === 'stream_shrike')
    && (roost?.fauna ?? []).some(f => f.id === 'gale_swift' && f.chance === 1));
  const fold = mintOf('wax_gate', { biome: 'garden', caveDepth: 1, anchor: 'garden' }, 0xa221);
  check('P18 the fold mints down the garden ladder (the undefined lane — depth 2 under the anchor, crew authored)',
    fold?.caveDepth === 2 && fold?.anchor === 'garden'
    && (fold?.fauna ?? []).some(f => f.id === 'formic_tender')
    && (fold?.fauna ?? []).some(f => f.id === 'wool_aphid'));
}

// --- RIG P: WAVE ELEVEN — the sea's new faces get their natives --------------
// Two claims and three seated kin on batch-25's freshest ground: the Vent
// Brood (deepsea, the composition lane — the nest brings its own chimney
// ring, and the den's argument is the vent field's eruption economy
// INVERTED: the Matron shrugs what prices your footing), the Pard's Larder
// (the butteland CAVES — THE CLAIM LAW applied: the moot holds the surface,
// the larder takes the axis the moot never touches), the vent crab (the
// deep's first hunger-driven hunter, self-gated to smoker ground), the
// shelf lurker (the grip tutors' marine seat, whose spit clears the needle
// banks' contact line by standing law), and the void angler seated home
// (the chasm-shelf face's native, the pit-home fabric). Registry/kit/look
// censuses arrive from rigs A1–A8 via the extended arrays.
{
  const DENS11: { id: string | null; mouth: string; resident: string }[] = [
    { id: 'pard_larder', mouth: 'larder_crag', resident: 'larder_pard' },
    { id: null, mouth: 'vent_nest', resident: 'vent_matron' },
  ];
  // P19 — the den keys resolve whole; residents pay the hoard as marquee
  // asks; the brood is the composition lane's den (the wane-arch family).
  for (const den of DENS11) {
    if (den.id) {
      const lair = lairOf(den.id);
      const lm = lair ? landmarkDefs().find(d => d.id === lair.landmark) : undefined;
      const mk = (lm?.params as { mouthKind?: string } | undefined)?.mouthKind;
      check(`P19 den '${den.id}' resolves whole (lair → den_mouth → '${den.mouth}' → sidezone)`,
        !!lair && lm?.builder === 'den_mouth' && mk === den.mouth && !!sidezoneOf(den.mouth));
    }
    const res = MONSTERS[den.resident];
    check(`P19 '${den.resident}' is the den's marquee ask (boss, lair_hoard)`,
      res?.boss === true && res?.loot === 'lair_hoard');
  }
  check('P19 the brood is the composition lane\'s den (no lair row — the roost\'s family)',
    hasComposition('vent_nest_site') && hasCluster('vent_nest_ring')
    && !!sidezoneOf('vent_nest') && !lairOf('vent_brood') && !lairOf('vent_nest'));
  const broodComp = compositionDefs().find(c => c.id === 'vent_nest_site');
  check('P19 the nest anchors on WALKABLE seabed (siteWalk — the trench tears are real voids)',
    broodComp?.sites?.some(s => s.siteWalk === true) === true);
  check('P19 the composition is the deepsea tileset\'s own row (the claim rolled on every face)',
    (TILESETS.deepsea?.compositions ?? []).some(c => c.composition === 'vent_nest_site'));
  const nestRing = clusterDefs().find(c => c.id === 'vent_nest_ring');
  check('P19 the nest brings its OWN chimneys (the cluster carries smoker + polyp — vent ground wherever it lands)',
    (['vent_nest', 'black_smoker', 'scald_polyp'] as const).every(k =>
      (nestRing?.pieces ?? []).some(p => p.kind === k)));

  // P20 — THE FOLD ENVELOPES + THE CLAIM LAW, recorded as assertion: one
  // country, two grounds, zero collision by construction (the frostmaw /
  // giants-cairn separation, on the butteland).
  const at11 = (place: 'cave' | 'surface', biome: string, caveDepth: number | undefined,
    level: number, tileset = 'cavern') =>
    lairLandmarkRolls({ place, biome, caveDepth, level, tileset });
  const has11 = (rolls: { landmark: string }[], lm: string) => rolls.some(r => r.landmark === lm);
  check('P20 the larder claims the butteland caves at depth 1-2, whispers at 3, refuses 4',
    has11(at11('cave', 'butteland', 1, 12), 'larder_crag_site')
    && has11(at11('cave', 'butteland', 2, 12), 'larder_crag_site')
    && has11(at11('cave', 'butteland', 3, 12), 'larder_crag_site')
    && !has11(at11('cave', 'butteland', 4, 12), 'larder_crag_site'));
  check('P20 the larder is silent below its ramp and under foreign anchors',
    !has11(at11('cave', 'butteland', 1, 3), 'larder_crag_site')
    && !has11(at11('cave', 'highland', 1, 30), 'larder_crag_site'));
  check('P20 THE CLAIM LAW: the moot holds the surface, the larder the caves — never the same ground',
    has11(at11('surface', 'butteland', undefined, 12), 'gnoll_moot')
    && !has11(at11('cave', 'butteland', 1, 12), 'gnoll_moot')
    && has11(at11('cave', 'butteland', 1, 12), 'larder_crag_site')
    && !has11(at11('surface', 'butteland', undefined, 12), 'larder_crag_site'));

  // P21 — placement through the standing machinery: the crag mouth stands
  // spoored, the composition plants the nest with its chimney ring, the
  // sweep is deterministic, and a sealed pocket strips BOTH doors.
  {
    const crag = gen(caveDef({
      landmarks: [{ landmark: 'larder_crag_site', chance: 1 }],
      caveDepth: undefined, anchor: undefined, biome: 'butteland',
    }), 0xb111);
    const mouths = crag.doodads.filter(d => d.kind === 'larder_crag');
    check('P21 the larder crag stands (one mouth through the landmark loop)',
      mouths.length === 1, `${mouths.length} mouths`);
    const spoor = mouths[0] ? crag.doodads.filter(d =>
      ['bone_pile', 'gore', 'spear_grass'].includes(d.kind)
      && Math.hypot(d.pos.x - mouths[0].pos.x, d.pos.y - mouths[0].pos.y) < 160) : [];
    check('P21 the crag apron is spoored (the kill-larder reads before the door)',
      spoor.length >= 2, `${spoor.length} pieces`);
    // The nest tests on the sea's REAL floor (layoutType underwater — the
    // smoker kit's water habitat refuses dry test arenas by standing law).
    const nest = gen(caveDef({
      compositions: [{ composition: 'vent_nest_site', chance: 1 }],
      caveDepth: undefined, anchor: undefined, biome: 'deepsea',
      layoutType: 'underwater', aquatic: true,
    }), 0xb112);
    check('P21 the composition plants the nest (the door stands among its own chimneys)',
      nest.doodads.filter(d => d.kind === 'vent_nest').length === 1
      && nest.doodads.filter(d => d.kind === 'black_smoker').length >= 2);
    const cragDef = caveDef({
      landmarks: [{ landmark: 'larder_crag_site', chance: 1 }],
      caveDepth: undefined, anchor: undefined, biome: 'butteland',
    });
    const print11 = (o: GeneratedLayout) => o.doodads.map(d =>
      `${d.kind}:${Math.round(d.pos.x)},${Math.round(d.pos.y)}`).join('|');
    check('P21 same seed, same door (wave-eleven placement determinism)',
      print11(gen(cragDef, 77311)) === print11(gen(cragDef, 77311)));
    const SEALED11: [string, Partial<ZoneDef>][] = [
      ['larder_crag', { landmarks: [{ landmark: 'larder_crag_site', chance: 1 }], biome: 'butteland' }],
      // Same real floor as the standing pin above — a dry arena could pass
      // this vacuously if the door never stood at all.
      ['vent_nest', {
        compositions: [{ composition: 'vent_nest_site', chance: 1 }],
        biome: 'deepsea', layoutType: 'underwater', aquatic: true,
      }],
    ];
    for (const [mouth, over] of SEALED11) {
      const sealed = gen(caveDef({
        ...over, noDeeper: true, caveDepth: undefined, anchor: undefined,
      }), 0xb120);
      check(`P21 a sealed pocket strips the ${mouth} (the noDeeper chokepoint, both planting lanes)`,
        sealed.doodads.every(d => d.kind !== mouth));
    }
  }

  // P22 — THE FABRIC CONTRACTS (static): each seat's one argument, pinned
  // on the data that carries it.
  const needleRule = doodadRuleOf('needle_coral');
  const gulpSeize = (SKILLS.gulp?.effects ?? []).find(e => e.type === 'grabSeize') as
    { grab?: { throw?: { impulse?: number } } } | undefined;
  check('P22 THE NEEDLE INTERPLAY: the lurker\'s spit clears the bank\'s contact line (zero new code)',
    (MONSTERS.shelf_lurker?.skills ?? []).includes('gulp')
    && typeof needleRule.contact?.minSpeed === 'number'
    && (gulpSeize?.grab?.throw?.impulse ?? 0) >= (needleRule.contact?.minSpeed ?? Infinity),
    `impulse ${gulpSeize?.grab?.throw?.impulse} vs minSpeed ${needleRule.contact?.minSpeed}`);
  check('P22 the lurker is seated on the terraces (deepsea packs) with the gulper\'s grammar',
    (TILESETS.deepsea?.packs.table ?? []).some(r => r.id === 'shelf_lurker')
    && (MONSTERS.shelf_lurker?.skills ?? []).includes('tongue_reel')
    && (MONSTERS.shelf_lurker?.heft ?? 0) > 1 && !!MONSTERS.shelf_lurker?.ambush);
  check('P22 the angler comes home (deepsea packs, from 10) with its chasm habitat intact',
    (TILESETS.deepsea?.packs.table ?? []).some(r =>
      r.id === 'void_angler' && typeof r.presence === 'object' && r.presence.from === 10)
    && MONSTERS.void_angler?.habitat?.kind === 'chasm'
    && MONSTERS.void_angler?.noObjective === true);
  check('P22 the crab is the smoker field\'s own (WILDLIFE self-gated near the chimneys)',
    (WILDLIFE.deepsea ?? []).some(r => r.id === 'vent_crab' && r.near === 'black_smoker'));
  check('P22 the crab hunts by drives and TELLS (the family lean — the deep\'s first)',
    !!MONSTERS.vent_crab?.brain?.drives?.hunger
    && MONSTERS.vent_crab?.tells === HUNGER_LEAN
    && MONSTERS.larder_pard?.tells === HUNGER_LEAN);
  check('P22 the shell shrugs the field (fireRes on crab and Matron — the eruption clocks are the hearth)',
    (MONSTERS.vent_crab?.mods ?? []).some(m => m.stat === 'fireRes' && m.value >= 0.5)
    && (MONSTERS.vent_matron?.mods ?? []).some(m => m.stat === 'fireRes' && m.value >= 0.8));
  check('P22 the Matron affords her kit from her own pool (the anatomy net\'s law, pinned at the seat)',
    (['heavy_strike', 'groundswell', 'magma_lob'] as const).every(s =>
      (MONSTERS.vent_matron?.skills ?? []).includes(s)
      && (SKILLS[s]?.manaCost ?? 0) <= (MONSTERS.vent_matron?.base.mana ?? 0)));
  check('P22 Old Tawny affords the leap and hunts the herd (crushing_leap payable; prey in the rules)',
    (SKILLS.crushing_leap?.manaCost ?? 0) <= (MONSTERS.larder_pard?.base.mana ?? 0)
    && MONSTERS.larder_pard?.brain?.rules?.some(r =>
      r.use?.target?.prey?.includes('critter')) === true);

  // P23 — THE LIVE DENS: each mouth mints its country, the residents stand,
  // and the argument holds in the running world.
  const liveDen11 = (mouth: string, seed: number): void => {
    w.player.pos = vec(400, 400);
    w.enterSidezone({ pos: { x: 400, y: 400 }, seed, kind: mouth });
  };
  {
    liveDen11('vent_nest', 92110);
    check('P23 the nest mints the Vent Brood (boss ask, sealed rung, the FORCED vent-field face)',
      String(w.zone.name).includes('Vent Brood')
      && w.zone.objective.kind === 'boss' && w.zone.objective.id === 'vent_matron'
      && w.zone.noDeeper === true && w.zone.tileset === 'deepsea'
      && w.zone.variantName === 'vent field',
      `${w.zone.name} · ${w.zone.tileset} · ${w.zone.variantName}`);
    const smokers = (w.doodads as { kind: string }[]).filter(d => d.kind === 'black_smoker');
    check('P23 the den IS eruption country (chimneys stand in the minted brood)',
      smokers.length >= 2, `${smokers.length} smokers`);
    const crabs = (w.actors as Actor[]).filter(a => a.defId === 'vent_crab' && !a.dead);
    const matron = (w.actors as Actor[]).find(a => a.defId === 'vent_matron' && !a.dead);
    check('P23 the court is home and the Matron holds the nest',
      crabs.length >= 2 && !!matron, `${crabs.length} crabs, matron=${!!matron}`);
    leaveToHome();
  }
  {
    liveDen11('larder_crag', 92111);
    check('P23 the crag mints the Pard\'s Larder (boss ask, sealed rung)',
      String(w.zone.name).includes("Pard's Larder")
      && w.zone.objective.kind === 'boss' && w.zone.objective.id === 'larder_pard'
      && w.zone.noDeeper === true, `${w.zone.name}`);
    const oryx = (w.actors as Actor[]).filter(a => a.defId === 'veld_oryx' && !a.dead);
    const tawny = (w.actors as Actor[]).find(a => a.defId === 'larder_pard' && !a.dead);
    check('P23 the larder is LIVE and the keeper is home (the dragged herd + Old Tawny)',
      oryx.length >= 2 && !!tawny, `${oryx.length} oryx, tawny=${!!tawny}`);
    leaveToHome();
  }

  // P24 — mint purity (the E1 law) + each mint's own authored contract.
  const mintOf11 = (mouth: string, parentOver: Partial<ZoneDef>, seed: number): ZoneDef | null => {
    const sz = sidezoneOf(mouth);
    if (!sz) return null;
    const mctx = {
      parent: caveDef({ id: `probe_p24_${mouth}`, caveDepth: undefined, anchor: undefined, ...parentOver }),
      seed, id: `probe_p24_pocket_${mouth}`,
      pos: { x: 100, y: 100 }, playerLevel: 12, pkgActive: () => false,
    };
    const a = sz.mint(mctx);
    check(`P24 '${mouth}' mints pure and sealed (byte-equal, noDeeper)`,
      JSON.stringify(a) === JSON.stringify(sz.mint(mctx)) && a.noDeeper === true);
    return a;
  };
  const brood = mintOf11('vent_nest', { biome: 'deepsea' }, 0xb219);
  check('P24 the brood wears the vent field ALWAYS (forced deepsea face, court + shoal larder authored)',
    brood?.tileset === 'deepsea' && brood?.variantName === 'vent field'
    && (brood?.fauna ?? []).some(f => f.id === 'vent_crab' && f.chance === 1)
    && (brood?.fauna ?? []).some(f => f.id === 'silver_shoal'));
  const larder = mintOf11('larder_crag', { biome: 'butteland', anchor: 'butteland' }, 0xb220);
  check('P24 the larder mints down the butteland ladder (the undefined lane — herd + skulk authored)',
    larder?.caveDepth === 1 && larder?.anchor === 'butteland'
    && (larder?.fauna ?? []).some(f => f.id === 'veld_oryx' && f.chance === 1)
    && (larder?.fauna ?? []).some(f => f.id === 'pan_jackal'));
}

// --- RIG P, BATCH 28: THE BABOON KING'S MIDDEN (THE ALOFT LANE's debut) ----------
// The butte TOPS' claim: butteland's THIRD axis (the moot holds the open
// ground, the larder the caves, the midden the STORY — the first
// triple-stacked biome), seated through LandmarkDef.siteTier 1. P25 pins the
// claim law + the aloft def's own laws; P26 walks the real fold end to end —
// a devMintTileset needles mint carries the mouth ALOFT (mouthTier 1 on
// sovereign butte_top), the dwell opens the king's court, and the climb-out
// lands the party back on the summit at the door (the arrivalStory law, up
// lane — probe_tiers rig O pins the lane itself on qa content).
{
  // P25 — the claim law at the third axis + the aloft def's laws.
  const middenRow = lairOf('baboon_midden');
  const middenDef = landmarkOf('midden_mouth_site');
  const mootDef = landmarkOf(lairOf('gnoll_moot')?.landmark ?? '');
  check('P25 three claims, three axes (moot: valley surface; larder: cave; midden: the STORY)',
    lairOf('gnoll_moot')?.seat.place === 'surface' && mootDef?.siteTier === undefined
    && lairOf('pard_larder')?.seat.place === 'cave'
    && middenRow?.seat.place === 'surface' && middenDef?.siteTier === 1);
  check('P25 an aloft def makes no tier-0 promises (no poi, no mustReach — the story road is the net)',
    !!middenDef && !middenDef.poi && !middenDef.mustReach && middenDef.clearSite === true);
  const aloftAt = (place: 'cave' | 'surface', level: number): string[] =>
    lairLandmarkRolls({ place, biome: 'butteland', caveDepth: place === 'cave' ? 1 : undefined, level, tileset: 'needles' })
      .map(r => r.landmark);
  // (presenceMul fades BELOW `from`: full at 7, ramping 4..7, hard zero at 4
  // — the B11 law.)
  check('P25 the fold seats the midden on butteland\'s surface at 12, never in its caves, silent at 4',
    aloftAt('surface', 12).includes('midden_mouth_site')
    && !aloftAt('cave', 12).includes('midden_mouth_site')
    && !aloftAt('surface', 4).includes('midden_mouth_site'));
  check('P25 the king wears the boss law and pays the lair hoard',
    MONSTERS.baboon_king?.boss === true && MONSTERS.baboon_king?.loot === 'lair_hoard');

  // P26a — headless placement at chance 1: the mouth stands SOVEREIGN and
  // spoored on a real needles face (the aloft lane through the real def).
  const WN = 2600, HN = 1950;
  const entryN = vec(140, HN / 2);
  const exitsN: Vec2[] = [vec(WN - 140, HN / 2)];
  const tsN = TILESETS.needles;
  const middenZone = (): ZoneDef => ({
    id: 'probe_midden_zone', name: 'Probe Needles', level: 12,
    size: { w: WN, h: HN }, theme: { ...tsN.theme },
    layoutType: 'needles', layout: tsN.layout, layoutParams: { ...tsN.layoutParams },
    objective: { kind: 'none' }, packs: tsN.packs,
    exits: [{ to: 'probe_home', side: 's' }], map: { x: 0, y: 0 }, seed: 0,
    geo: { biomeDepth: 0.7 },
    landmarks: [{ landmark: 'midden_mouth_site', chance: 1 }],
  });
  const genN = (seed: number): GeneratedLayout =>
    generateLayout({ ...middenZone(), seed }, { w: WN, h: HN }, new Rng(seed), entryN, exitsN);
  {
    const out = genN(0xa1de);
    const mouth = out.doodads.find(d => d.kind === 'midden_mouth');
    const walkN = out.walk as GridWalkField | undefined;
    check('P26a the midden mouth seats ALOFT (sovereign butte_top, tier-stamped, story road green)',
      !!mouth && mouth.tier === 1
      && walkN?.regionAt?.(mouth.pos.x, mouth.pos.y) === 'butte_top'
      && !!walkN && storyReachable(walkN, entryN, mouth.pos, 1),
      mouth ? `at=${mouth.pos.x.toFixed(0)},${mouth.pos.y.toFixed(0)} kind=${walkN?.regionAt?.(mouth.pos.x, mouth.pos.y)}` : 'NO MOUTH');
    const spoorN = out.doodads.filter(d => (d.kind === 'bone_pile' || d.kind === 'gore')
      && mouth && Math.hypot(d.pos.x - mouth.pos.x, d.pos.y - mouth.pos.y) < 160 && d.tier === 1);
    check('P26a the midden ring spoors the summit (aloft bone + gore at the door)',
      spoorN.length >= 2, `${spoorN.length} pieces`);
  }

  // P26b — mint purity + the court's contract (the P24 idiom).
  {
    const sz = sidezoneOf('midden_mouth');
    const mctx = {
      parent: caveDef({ id: 'probe_p26_midden', caveDepth: undefined, anchor: undefined, biome: 'butteland' }),
      seed: 0xb28a, id: 'probe_p26_pocket_midden',
      pos: { x: 100, y: 100 }, playerLevel: 12, pkgActive: () => false,
    };
    const court = sz ? sz.mint(mctx) : null;
    check('P26b the midden mints pure and sealed (byte-equal, noDeeper, the king\'s court authored)',
      !!court && JSON.stringify(court) === JSON.stringify(sz!.mint(mctx))
      && court.noDeeper === true
      && court.name === "the Baboon King's Midden"
      && court.objective?.kind === 'boss' && (court.objective as { id?: string }).id === 'baboon_king'
      && (court.fauna ?? []).some(f => f.id === 'mesa_baboon' && f.chance === 1)
      && (court.fauna ?? []).some(f => f.id === 'sun_hyrax'));
  }

  // P26c — THE ALOFT ROUND TRIP on the REAL fold path (the discovery-loop
  // replay: devMintTileset at level 12 walks placeZoneAt → the lair fold →
  // the aloft sitter → the mouth stamp → world's caveEntrances read).
  {
    seedGlobalRandom(0xa10f);
    const w = makeSimWorld('warrior', 0x1a28);
    w.player.invulnerable = true;
    type AloftCm = { pos: { x: number; y: number }; seed: number; kind: string; mouthTier?: number };
    type AloftInnards = {
      enterSidezone(cm: { pos: { x: number; y: number }; seed: number; kind: string }): void;
      travelThrough(e: { to: string; side: 'n' | 's' | 'e' | 'w' }): void;
      caveEntrances: AloftCm[];
      walk: { regionAt?(x: number, y: number): string } | null;
    };
    const innards = w as unknown as AloftInnards;
    const stepFrom = (seat: { x: number; y: number }): number => {
      let best = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        w.player.pos.x = seat.x; w.player.pos.y = seat.y;
        for (let i = 0; i < 6; i++) w.moveActor(w.player, dx, dy, 0.1);
        best = Math.max(best, Math.hypot(w.player.pos.x - seat.x, w.player.pos.y - seat.y));
      }
      w.player.pos.x = seat.x; w.player.pos.y = seat.y;
      return best;
    };
    let found: { zoneId: string; cm: AloftCm } | null = null;
    for (let i = 0; i < 12 && !found; i++) {
      const zid = w.devMintTileset('needles', i, 12, { seed: 954001 + i });
      if (!zid) continue;
      const cm = innards.caveEntrances.find(en => en.kind === 'midden_mouth');
      if (cm) found = { zoneId: zid, cm };
    }
    check('P26c a real needles mint carries the mouth ALOFT (the fold at placeZoneAt, mouthTier 1)',
      !!found && found.cm.mouthTier === 1, found ? `zone=${found.zoneId}` : 'no hit in 12 seeds');
    if (found) {
      const mouthAt = { x: found.cm.pos.x, y: found.cm.pos.y };
      const drawn = w.doodads.filter(dd => dd.kind === 'midden_mouth')
        .sort((a2, b2) => Math.hypot(a2.pos.x - mouthAt.x, a2.pos.y - mouthAt.y)
          - Math.hypot(b2.pos.x - mouthAt.x, b2.pos.y - mouthAt.y))[0];
      check('P26c drawn == dwelled on sovereign ground (the door doodad AT the seat, butte_top, tier 1)',
        !!drawn && Math.hypot(drawn.pos.x - mouthAt.x, drawn.pos.y - mouthAt.y) < 2
        && drawn.tier === 1 && innards.walk?.regionAt?.(mouthAt.x, mouthAt.y) === 'butte_top',
        drawn ? `nudge=${Math.hypot(drawn.pos.x - mouthAt.x, drawn.pos.y - mouthAt.y).toFixed(1)}px kind=${innards.walk?.regionAt?.(mouthAt.x, mouthAt.y)}` : 'NO DOODAD');
      const parentId = w.zone.id;
      for (const a of w.actors) { if (a.team === 'enemy' && !a.dead) a.dead = true; }
      w.player.pos.x = mouthAt.x; w.player.pos.y = mouthAt.y;
      w.player.tier = 1;
      innards.enterSidezone(found.cm);
      check('P26c the dwell opens the king\'s court (arrival on the ground story, mobile, rung remembers)',
        w.zone.id.startsWith('cave_') && w.zone.name === "the Baboon King's Midden"
        && w.player.tier === 0 && w.caveReturn?.tier === 1,
        `zone=${w.zone.id} tier=${w.player.tier} rung=${w.caveReturn?.tier}`);
      check('P26c the court is HELD (the king home among his troop)',
        w.actors.some(a => a.defId === 'baboon_king' && !a.dead)
        && w.actors.some(a => a.defId === 'mesa_baboon' && !a.dead));
      for (const a of w.actors) { if (a.team === 'enemy' && !a.dead) a.dead = true; }
      const inStep = stepFrom({ x: w.player.pos.x, y: w.player.pos.y });
      check('P26c the arrival is MOBILE', inStep > 15, `step=${inStep.toFixed(1)}px`);
      innards.travelThrough({ to: parentId, side: 'n' });
      const p2 = w.player;
      // THE STORY-AWARE LANDING (landed by the coordinator at batch-28
      // close — the shape this comment used to carry): landPartyAt's put()
      // now clamps an aloft landing through ITS OWN story's walk view, so
      // the summit seat holds AT the door and the drift bar is the N3.8
      // law's own < 2px (was < 300 while the tier-0 clamp dragged the seat
      // ~195px to the ramp foot).
      check('P26c the climb-out wears the summit story on story floor, AT the mouth (the N3.8 bar — the story-aware landing holds)',
        w.zone.id === parentId && p2.tier === 1
        && tierFloorAt(innards.walk?.regionAt?.(p2.pos.x, p2.pos.y), 1)
        && Math.hypot(p2.pos.x - mouthAt.x, p2.pos.y - mouthAt.y) < 2,
        `tier=${p2.tier} d=${Math.hypot(p2.pos.x - mouthAt.x, p2.pos.y - mouthAt.y).toFixed(1)}px kind=${innards.walk?.regionAt?.(p2.pos.x, p2.pos.y)}`);
      for (const a of w.actors) { if (a.team === 'enemy' && !a.dead) a.dead = true; }
      const outStep = stepFrom({ x: p2.pos.x, y: p2.pos.y });
      check('P26c the return is MOBILE on its story', outStep > 15, `step=${outStep.toFixed(1)}px`);
    }
  }
}

// --- RIG S, BATCH 30: THE SLEEPLESS WATCH (the pinnacle crown's claim) --------
// THE STORIES GATE's first live consumer: `stories: 3` refuses every flat
// highland face at the fold (the RIG Q law carried by real content), the
// horn gate seats the third terrace through the aloft dart (siteTier 3 +
// the first live siteTryMul — probe_tiers O16 pins the placement), and the
// den behind it is THE WATCH FABRIC AT BOSS GRAIN in its extreme regime:
// the far-seer's narrow slow beam, the drowsing horn-thegns, and THE HORN
// (perception.alertShout at bowl reach — his lock stands the court up
// through the fabric's own ladder-jump). S1 pins the envelope + the family
// claim law, S2 the sovereign seat, S3 mint purity + the open-sky bowl,
// S4 the aloft round trip on the real fold, S5 the watch regime's numbers.
// (Registers BEFORE rig Q: the qa_stories row stays the registry's last
// write — the probe-local content law.)
{
  // S1 — the envelope + THE CLAIM LAW at the family's fifth axis: the cairn
  // squats the valleys, the frostmaw the caves, the rimewick ring the cold
  // skirts (tileset-pinned), the roost the deep high heart (interior +
  // climate), and the watch takes the STORIES none of them read.
  const watchRow = lairOf('sleepless_watch');
  const gateDef = landmarkOf('horn_gate_site');
  check('S1 the claim asks the stories and the def asks the terrace (stories 3 at the fold, siteTier 3 at the dart)',
    watchRow?.seat.place === 'surface' && watchRow?.seat.stories === 3
    && gateDef?.siteTier === 3 && gateDef?.siteTryMul === 3
    && !gateDef?.poi && !gateDef?.mustReach && gateDef?.clearSite === true);
  const foldHl = (tileset: string, level: number, place: 'cave' | 'surface' = 'surface'): string[] =>
    lairLandmarkRolls({
      place, biome: 'highland', caveDepth: place === 'cave' ? 1 : undefined,
      level, tileset,
    }).map(r => r.landmark);
  check('S1 the fold seats the watch on the pinnacle alone (the stories gate live: flat faces refuse, caves refuse, level 6 silent)',
    foldHl('pinnacle', 16).includes('horn_gate_site')
    && !foldHl('highland', 16).includes('horn_gate_site')
    && !foldHl('snowcrown', 16).includes('horn_gate_site')
    && !foldHl('pinnacle', 16, 'cave').includes('horn_gate_site')
    && !foldHl('pinnacle', 6).includes('horn_gate_site'));
  // Two claims, two axes, ONE face: the rimewick ring holds the pinnacle's
  // valley skirt (its allowlist) while the watch holds the crown — both
  // fold on the same query, readable in one zone. The roost stays refused
  // here BY ITS OWN LAW (its row asks interior + climate and this ground
  // carries no readings — the family's separation, pinned).
  check('S1 the family separates by axis on the crown face (rimewick beside the watch; the roost asks readings this ground lacks)',
    foldHl('pinnacle', 16).includes('rimewick_clutch')
    && !foldHl('pinnacle', 16).includes('roost_crag_site'));

  // S2 — headless placement at chance 1 on the cone face (the batch-30
  // sweep's generous face: 40/40 placed, all sovereign/rim/road): the mouth
  // stands SOVEREIGN on peak_terrace_3, tier-stamped, story-road-reached,
  // with the vigil's spoor dressed to its story.
  const WP = 3000, HP = 2350;
  const entryP = vec(140, HP / 2);
  const exitsP: Vec2[] = [vec(WP - 140, HP / 2)];
  const tsP = TILESETS.pinnacle;
  const coneP = { ...tsP.layoutParams, ...tsP.variants![0].layoutParams };
  const watchZone = (seed: number): ZoneDef => ({
    id: 'probe_watch_zone', name: 'Probe Pinnacle', level: 16,
    size: { w: WP, h: HP }, theme: { ...tsP.theme },
    layoutType: 'switchback', layout: tsP.layout, layoutParams: { ...coneP },
    objective: { kind: 'none' }, packs: tsP.packs,
    exits: [{ to: 'probe_home', side: 's' }], map: { x: 0, y: 0 }, seed,
    geo: { biomeDepth: 0.85 },
    landmarks: [{ landmark: 'horn_gate_site', chance: 1 }],
  });
  {
    const out = generateLayout(watchZone(0x51ee9), { w: WP, h: HP }, new Rng(0x51ee9), entryP, exitsP);
    const mouth = out.doodads.find(d => d.kind === 'horn_gate');
    const walkP = out.walk as GridWalkField | undefined;
    check('S2 the horn gate seats ALOFT (sovereign peak_terrace_3, tier-stamped, story road green)',
      !!mouth && mouth.tier === 3
      && walkP?.regionAt?.(mouth.pos.x, mouth.pos.y) === 'peak_terrace_3'
      && !!walkP && storyReachable(walkP, entryP, mouth.pos, 3),
      mouth ? `at=${mouth.pos.x.toFixed(0)},${mouth.pos.y.toFixed(0)} kind=${walkP?.regionAt?.(mouth.pos.x, mouth.pos.y)}` : 'NO MOUTH');
    const spoorP = out.doodads.filter(d => (d.kind === 'cairn' || d.kind === 'campfire' || d.kind === 'rock')
      && mouth && Math.hypot(d.pos.x - mouth.pos.x, d.pos.y - mouth.pos.y) < 160 && d.tier === 3);
    check('S2 the vigil spoors its terrace (waymark cairns + the watch-fire at the door, story-stamped)',
      spoorP.length >= 2, `${spoorP.length} pieces`);
  }

  // S3 — mint purity + the den's contract (the P24 idiom): byte-equal,
  // sealed, the boss ask authored, and THE OPEN-SKY BOWL (the roost's law:
  // an explicit def sky over the caveDepth derivation — the watch stands
  // under real weather and real radiance, or the beacon's breathing lies).
  {
    const sz = sidezoneOf('horn_gate');
    const mctx = {
      parent: caveDef({ id: 'probe_s3_watch', caveDepth: undefined, anchor: undefined, biome: 'highland' }),
      seed: 0xb30a, id: 'probe_s3_pocket_watch',
      pos: { x: 100, y: 100 }, playerLevel: 16, pkgActive: () => false,
    };
    const bowl = sz ? sz.mint(mctx) : null;
    check('S3 the watch mints pure and sealed under open sky (byte-equal, noDeeper, the boss ask + the tithe authored)',
      !!bowl && JSON.stringify(bowl) === JSON.stringify(sz!.mint(mctx))
      && bowl.noDeeper === true
      && bowl.name === 'the Sleepless Watch'
      && bowl.objective?.kind === 'boss' && (bowl.objective as { id?: string }).id === 'sleepless_warden'
      && bowl.sky === 'open' && skyOf(bowl) === 'open'
      && (bowl.fauna ?? []).some(f => f.id === 'gem_cache' && f.chance === 1));
  }

  // S4 — THE ALOFT ROUND TRIP on the REAL fold path at THREE STORIES (the
  // P26c discovery-loop replay, two terraces higher): devMintTileset walks
  // placeZoneAt → the stories gate → the aloft sitter → the mouth stamp,
  // the dwell opens the watch, and the climb-out lands the party back on
  // the third terrace AT the door (the story-aware landing at its highest
  // shipped ask — the N3.8 bar).
  {
    // The measured configuration verbatim (the batch-30 sweep's fold ladder
    // ran under exactly these seeds; hits at 954004/954020/954026 off base
    // 954001). Re-measured at THE SCALD BASIN M1, 2026-08-21 — BIOME_FIELD
    // grew the scald row, so every seeded world's field re-dealt where the
    // warm∧damp∧low claim holds and base 954001's window lost its hit (the
    // budget never widens — the base moves): base 954101 hits at boot 2.
    seedGlobalRandom(0xa10f);
    const w = makeSimWorld('warrior', 0x1a28);
    w.player.invulnerable = true;
    type WatchCm = { pos: { x: number; y: number }; seed: number; kind: string; mouthTier?: number };
    type WatchInnards = {
      enterSidezone(cm: { pos: { x: number; y: number }; seed: number; kind: string }): void;
      travelThrough(e: { to: string; side: 'n' | 's' | 'e' | 'w' }): void;
      caveEntrances: WatchCm[];
      walk: { regionAt?(x: number, y: number): string } | null;
    };
    const innards = w as unknown as WatchInnards;
    const stepFrom = (seat: { x: number; y: number }): number => {
      let best = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        w.player.pos.x = seat.x; w.player.pos.y = seat.y;
        for (let i = 0; i < 6; i++) w.moveActor(w.player, dx, dy, 0.1);
        best = Math.max(best, Math.hypot(w.player.pos.x - seat.x, w.player.pos.y - seat.y));
      }
      w.player.pos.x = seat.x; w.player.pos.y = seat.y;
      return best;
    };
    let found: { zoneId: string; cm: WatchCm } | null = null;
    for (let i = 0; i < 12 && !found; i++) {
      const zid = w.devMintTileset('pinnacle', i, 16, { seed: 954101 + i });
      if (!zid) continue;
      const cm = innards.caveEntrances.find(en => en.kind === 'horn_gate');
      if (cm) found = { zoneId: zid, cm };
    }
    check('S4 a real pinnacle mint carries the horn gate ALOFT (the fold at placeZoneAt, mouthTier 3)',
      !!found && found.cm.mouthTier === 3, found ? `zone=${found.zoneId}` : 'no hit in 12 seeds');
    if (found) {
      const mouthAt = { x: found.cm.pos.x, y: found.cm.pos.y };
      const drawn = w.doodads.filter(dd => dd.kind === 'horn_gate')
        .sort((a2, b2) => Math.hypot(a2.pos.x - mouthAt.x, a2.pos.y - mouthAt.y)
          - Math.hypot(b2.pos.x - mouthAt.x, b2.pos.y - mouthAt.y))[0];
      check('S4 drawn == dwelled on sovereign ground (the door doodad AT the seat, peak_terrace_3, tier 3)',
        !!drawn && Math.hypot(drawn.pos.x - mouthAt.x, drawn.pos.y - mouthAt.y) < 2
        && drawn.tier === 3 && innards.walk?.regionAt?.(mouthAt.x, mouthAt.y) === 'peak_terrace_3',
        drawn ? `nudge=${Math.hypot(drawn.pos.x - mouthAt.x, drawn.pos.y - mouthAt.y).toFixed(1)}px kind=${innards.walk?.regionAt?.(mouthAt.x, mouthAt.y)}` : 'NO DOODAD');
      const parentId = w.zone.id;
      for (const a of w.actors) { if (a.team === 'enemy' && !a.dead) a.dead = true; }
      w.player.pos.x = mouthAt.x; w.player.pos.y = mouthAt.y;
      w.player.tier = 3;
      innards.enterSidezone(found.cm);
      check('S4 the dwell opens the watch (arrival on the bowl floor, rung remembers the third terrace)',
        w.zone.id.startsWith('cave_') && w.zone.name === 'the Sleepless Watch'
        && w.player.tier === 0 && w.caveReturn?.tier === 3,
        `zone=${w.zone.id} tier=${w.player.tier} rung=${w.caveReturn?.tier}`);
      check('S4 the watch is HELD (the far-seer at his beacon, the thegns drowsing on their posts)',
        w.actors.some(a => a.defId === 'sleepless_warden' && !a.dead)
        && w.actors.some(a => a.defId === 'horn_thegn' && !a.dead));
      for (const a of w.actors) { if (a.team === 'enemy' && !a.dead) a.dead = true; }
      const inStep = stepFrom({ x: w.player.pos.x, y: w.player.pos.y });
      check('S4 the arrival is MOBILE', inStep > 15, `step=${inStep.toFixed(1)}px`);
      innards.travelThrough({ to: parentId, side: 'n' });
      const p2 = w.player;
      check('S4 the climb-out wears the THIRD story on story floor, AT the mouth (the N3.8 bar at the lane\'s highest shipped ask)',
        w.zone.id === parentId && p2.tier === 3
        && tierFloorAt(innards.walk?.regionAt?.(p2.pos.x, p2.pos.y), 3)
        && Math.hypot(p2.pos.x - mouthAt.x, p2.pos.y - mouthAt.y) < 2,
        `tier=${p2.tier} d=${Math.hypot(p2.pos.x - mouthAt.x, p2.pos.y - mouthAt.y).toFixed(1)}px kind=${innards.walk?.regionAt?.(p2.pos.x, p2.pos.y)}`);
      for (const a of w.actors) { if (a.team === 'enemy' && !a.dead) a.dead = true; }
      const outStep = stepFrom({ x: p2.pos.x, y: p2.pos.y });
      check('S4 the return is MOBILE on its story', outStep > 15, `step=${outStep.toFixed(1)}px`);
    }
  }

  // S5 — THE WATCH REGIME's numbers, pinned as floors: the far-seer's whole
  // argument is the fabric's extreme regime (detection past the census
  // ceiling, the narrow slow LIGHTHOUSE beam, THE HORN at bowl reach — his
  // lock jumps every drowsing thegn's ladder through standing law). A tuning
  // that silences the horn or widens the beam into a barrow lantern moves
  // this pin ON PURPOSE, never by drift.
  const seer = MONSTERS.sleepless_warden;
  const thegn = MONSTERS.horn_thegn;
  check('S5 the far-seer wears the extreme regime (boss + hoard + post, sweep ≤70° drawn, detection ≥1.8, the Horn ≥1000)',
    seer?.boss === true && seer?.loot === 'lair_hoard' && seer?.post === true
    && (seer?.watch?.sweep?.arcDeg ?? 999) <= 70 && seer?.watch?.fan === 'show'
    && (seer?.detection ?? 0) >= 1.8
    && (seer?.brain?.perception?.alertShout ?? 0) >= 1000,
    `arc=${seer?.watch?.sweep?.arcDeg} detect=${seer?.detection} horn=${seer?.brain?.perception?.alertShout}`);
  check('S5 the thegns drowse on their posts (the ghoul\'s law in the crown\'s colors, hearing rims drawn)',
    thegn?.watch?.sleep === true && thegn?.watch?.fan === 'show' && thegn?.post === true
    && thegn?.faction === 'jotun' && seer?.faction === 'jotun');
}

// --- RIG T, BATCH 31: THE STORM CROWN (the bombardment fabric at lair grain) --
// The gap the pinnacle pass named, built and consumed in one claim: ONE new
// siegecraft skill (levinshot_volley — hellshot's exact trebuchet shape in
// the LIGHTNING voice, noDrop, zone-range sky posture, ai-hinted) unblocks
// "the mountain shells the climb" — the Stormcrowned stands the FOURTH
// terrace as a standing gun (MonsterDef.bombard, the D2 catapult law:
// player seats shelled zone-wide, perception-free) while THE ALOFT COURT
// (the lane's debut: landmarkSpawns rows WITH tier) holds the bench around
// him, ambush-armed. T1 pins the skill's siegecraft posture, T2 the fold's
// story ladder (watch AND crown on one cone — two rungs, one axis, one
// zone), T3 the headless seat (resident + court rows, story-stamped), T4
// the gun law live (sky posture, the rod's silence), T5 the aloft court
// live on a real mint. NOTE the stream shift (the re-roll law): the crown
// row joined the highland fold, so the batch-30 ladder's hit seeds moved —
// the watch now lands first at 954004 (S4's first-hit law holds); the
// crown's own ladder hit under the same configuration is pinned in T5.
// (Registers BEFORE rig Q: the qa_stories row stays the registry's last
// write — the probe-local content law.)
{
  // T1 — the siegecraft posture (the named gap, closed): hellshot's shape in
  // the lightning voice — noDrop (a rite, never a gem), free (the sky pays),
  // zone-range sky delivery with the lob comet read, fx UNSET so the strike
  // derives the true bolt ('bolt' stays reserved to real levin — the
  // effect-voice law), the levin pock, and an ai hint (the anatomy net's
  // own floor, pinned here as identity).
  const shot = SKILLS.levinshot_volley;
  const shotD = shot?.delivery as {
    type?: string; castRange?: number; sky?: true; lob?: { arc?: number };
    occlusion?: string; telegraph?: number; fx?: string;
    impactDress?: { kind?: string };
  } | undefined;
  check('T1 levinshot is the trebuchet shape in the lightning voice (noDrop, free, zone-range sky + lob, ai-hinted)',
    shot?.noDrop === true && shot?.manaCost === 0 && !!shot?.ai
    && shotD?.type === 'storm' && (shotD?.castRange ?? 0) >= 4000
    && shotD?.sky === true && !!shotD?.lob && shotD?.occlusion === 'free'
    && (shotD?.telegraph ?? 0) >= 1,
    `range=${shotD?.castRange} sky=${shotD?.sky}`);
  check('T1 the strike keeps the reserved bolt (fx unset) and pocks levin glass',
    shotD?.fx === undefined && shotD?.impactDress?.kind === 'levin_scar'
    && !!DOODAD_VISUALS.levin_scar);
  const caller = MONSTERS.stormcrown_caller;
  check('T1 the caller is a standing gun in its own kit (bombard.skillId owned; the rod is the break-lesson)',
    caller?.bombard?.skillId === 'levinshot_volley'
    && caller?.skills.includes('levinshot_volley')
    && !!caller?.parts?.some(p => p.monster === 'levin_rod'
      && p.breakDisables?.includes('levinshot_volley'))
    && caller?.boss === true && caller?.loot === 'lair_hoard'
    && caller?.base.moveSpeed === 0 && caller?.faction === 'jotun');

  // T2 — the fold's story LADDER: the crown row asks stories 4 + the dart
  // asks the fourth terrace; on ONE pinnacle query the watch (stories 3)
  // and the crown (stories 4) fold TOGETHER — two rungs of one axis,
  // readable in a single zone — while every flat face refuses both and the
  // roost stays out by its own law (it asks readings this ground lacks).
  const crownRow = lairOf('storm_crown');
  const siteDef = landmarkOf('storm_crown_site');
  check('T2 the claim asks the stories and the def asks the terrace (stories 4 at the fold, siteTier 4 + siteTryMul 3 at the dart)',
    crownRow?.seat.place === 'surface' && crownRow?.seat.stories === 4
    && siteDef?.siteTier === 4 && siteDef?.siteTryMul === 3
    && !siteDef?.poi && !siteDef?.mustReach && siteDef?.clearSite === true);
  const foldT = (tileset: string, level: number, place: 'cave' | 'surface' = 'surface'): string[] =>
    lairLandmarkRolls({
      place, biome: 'highland', caveDepth: place === 'cave' ? 1 : undefined,
      level, tileset,
    }).map(r => r.landmark);
  const pinn16 = foldT('pinnacle', 16);
  check('T2 the ladder stacks on one face (watch at 3, crown at 4, both on the cone; the roost refused)',
    pinn16.includes('storm_crown_site') && pinn16.includes('horn_gate_site')
    && !pinn16.includes('roost_crag_site'));
  check('T2 the crown refuses what cannot stack it (flat faces, caves, a green world)',
    !foldT('highland', 16).includes('storm_crown_site')
    && !foldT('snowcrown', 16).includes('storm_crown_site')
    && !foldT('pinnacle', 16, 'cave').includes('storm_crown_site')
    && !foldT('pinnacle', 6).includes('storm_crown_site'));

  // T3 — headless placement at chance 1 on the cone face (the sweep's
  // generous face: 40/40 placed, all sovereign/road/court at the shipped
  // dials): the RESIDENT row stands at the ring's heart on sovereign
  // peak_terrace_4, story-stamped and UNARMED (the gun never pretends to
  // sleep), the court rows all wear the story AND the ambush arm (THE
  // ALOFT COURT's debut shape), and the rod-ring dresses its terrace.
  const WT = 3000, HT = 2350;
  const entryT = vec(140, HT / 2);
  const exitsT: Vec2[] = [vec(WT - 140, HT / 2)];
  const tsT = TILESETS.pinnacle;
  const coneT = { ...tsT.layoutParams, ...tsT.variants![0].layoutParams };
  {
    const seed = 0x51ee9;
    const zdef: ZoneDef = {
      id: 'probe_crown_zone', name: 'Probe Storm Crown', level: 16,
      size: { w: WT, h: HT }, theme: { ...tsT.theme },
      layoutType: 'switchback', layout: tsT.layout, layoutParams: { ...coneT },
      objective: { kind: 'none' }, packs: tsT.packs,
      exits: [{ to: 'probe_home', side: 's' }], map: { x: 0, y: 0 }, seed,
      geo: { biomeDepth: 0.85 },
      landmarks: [{ landmark: 'storm_crown_site', chance: 1 }],
    };
    const out = generateLayout(zdef, { w: WT, h: HT }, new Rng(seed), entryT, exitsT);
    const res = (out.landmarkSpawns ?? []).find(ls => ls.id === 'stormcrown_caller');
    const walkT = out.walk as GridWalkField | undefined;
    check('T3 the resident row seats ALOFT and UNARMED (sovereign peak_terrace_4, tier-stamped, story road green, no ambush)',
      !!res && res.tier === 4 && !res.ambush
      && walkT?.regionAt?.(res.pos.x, res.pos.y) === 'peak_terrace_4'
      && !!walkT && storyReachable(walkT, entryT, res.pos, 4),
      res ? `at=${res.pos.x.toFixed(0)},${res.pos.y.toFixed(0)} kind=${walkT?.regionAt?.(res.pos.x, res.pos.y)}` : 'NO RESIDENT');
    const court = (out.landmarkSpawns ?? []).filter(ls => ls.id === 'levin_thegn');
    check('T3 the court rows wear the story and the arm (THE ALOFT COURT: every bench row tier 4 + ambush)',
      court.length >= 2 && court.every(c => c.tier === 4 && !!c.ambush),
      `${court.length} thegns`);
    const ring = out.doodads.filter(d => (d.kind === 'standing_stone' || d.kind === 'glass_shard')
      && res && Math.hypot(d.pos.x - res.pos.x, d.pos.y - res.pos.y) < 160 && d.tier === 4);
    check('T3 the rod-ring dresses its terrace (story-stamped stones at the seat)',
      ring.length >= 2, `${ring.length} pieces`);
  }

  // T4 — THE GUN LAW live (the warfront idiom in the arena): the rod
  // attaches, the stationary stamp prices him for the siegebreaker lane,
  // a due clock volleys AT THE SEAT through the ONE pipeline with the sky
  // posture (hitAll + spareDormant + spareRoofed — the sentry law arrives
  // from StormDelivery.sky by construction), the comet knows its engine,
  // and breaking the rod SILENCES the gun while the clock keeps asking.
  {
    const gw = makeSimWorld('warrior', 0xc0117);
    gw.zone.objective = { kind: 'clear' }; // bombard's sanctuary gate stands down
    const stepG = (seconds: number): void => {
      const dt = 1 / 60;
      for (let t = 0; t < seconds - 1e-9; t += dt) {
        gw.applyInputs(new Map(), dt);
        for (const a of [...gw.actors]) updateAI(a, gw, dt);
        gw.update(dt);
      }
    };
    const hero = gw.player;
    hero.invulnerable = true;
    hero.pos = vec(600, 500);
    const gun = (gw as unknown as { createMonster(id: string, lv: number, team: string): Actor })
      .createMonster('stormcrown_caller', 14, 'enemy');
    gun.pos = vec(2600, 500); // 2000px out — past every aimed range, inside the 4200 reach
    gw.actors.push(gun);
    stepG(0.1);
    check('T4 the rod attached itself and the emplacement stamp holds (stationary, never ambush-armed)',
      gun.partActors?.length === 1 && gun.partActors[0].defId === 'levin_rod'
      && gun.stationary === true && gun.ambushArmed !== true);
    gun.bombardAt = gw.time;
    stepG(2.4); // useTime 1.1 + margin
    const shells = gw.zones.filter(z => z.caster === gun);
    check('T4 a due clock volleys at the SEAT zone-wide (2000px, perception-free, scatter on the hero)',
      shells.length >= 2
      && shells.every(z => Math.hypot(z.pos.x - hero.pos.x, z.pos.y - hero.pos.y) <= 130),
      `${shells.length} strikes`);
    check('T4 every strike is WEATHER (sky posture: hitAll + spareDormant + spareRoofed — the sentry law by construction)',
      shells.every(z => z.hitAll === true && z.spareDormant === true && z.spareRoofed === true));
    check('T4 the comet knows its engine and pocks levin glass (lobFrom + delay0 + levin_scar)',
      shells.every(z => !!z.lobFrom && (z.delay0 ?? 0) > 0 && z.impactDress?.kind === 'levin_scar'));
    const rod = gun.partActors![0];
    (gw as unknown as { kill(a: Actor, silent: boolean, killer?: Actor): void }).kill(rod, false, hero);
    stepG(0.2);
    check('T4 the break: the volley is DISARMED off the root (breakDisables — the crippled crown still stands)',
      !gun.skills.some(s => s?.def.id === 'levinshot_volley') && !gun.dead);
    const before = gw.zones.filter(z => z.caster === gun).length;
    gun.bombardAt = gw.time;
    stepG(2.6);
    const after = gw.zones.filter(z => z.caster === gun).length;
    check('T4 the silence: a due clock on a broken rod fires NOTHING, and keeps asking (a refusal, never a crash)',
      after <= before && gun.bombardAt !== undefined, `${before} -> ${after}`);
  }

  // T5 — THE ALOFT COURT live on a REAL mint (the S4 configuration
  // verbatim; the crown's own ladder hit under it is the honest pin): the
  // fold at placeZoneAt seats the caller ALOFT on sovereign ground, awake
  // and unarmed beside his ARMED court on the same bench — and a sprung
  // thegn is MOBILE on its story (the materializer seat law: a story-blind
  // spawn would snap off the rim at the first step).
  {
    seedGlobalRandom(0xa10f);
    const lw = makeSimWorld('warrior', 0x1a28);
    lw.player.invulnerable = true;
    let hitSeed = 0;
    for (let i = 0; i < 26 && !hitSeed; i++) {
      const zid = lw.devMintTileset('pinnacle', i, 16, { seed: 954701 + i });
      if (!zid) continue;
      if (lw.actors.some(a => a.defId === 'stormcrown_caller' && !a.dead)) hitSeed = 954701 + i;
    }
    // The measured configuration's own hit (re-measured at the theater CAST,
    // 2026-08-05: window 954201+26 lost its hit, base 954301 hit at boot 12
    // = 954313; re-measured again at the STORY FOLD, 2026-08-06 — spawnPacks
    // rolls the tier split before the type pick, so every tiered LOAD's
    // draws shifted every downstream boot's stream: base 954301's first
    // crown moved to boot 41 and base 954401's to boot 33, both outside the
    // try budget (the budget never widens — the base moves), base 954501
    // hits at boot 24 = 954525; re-measured at WAVE TWELVE, 2026-08-07 —
    // the pinnacle table grew the peak_roc row, so the same window's pack
    // TYPE picks re-dealt and the first crown moved up to boot 15): 954516;
    // re-measured at THE SCALD BASIN M1, 2026-08-21 — BIOME_FIELD grew the
    // scald row, so every seeded world's field re-dealt where the warm∧damp
    // ∧low claim holds and the first crown moved up to boot 6): 954507;
    // re-measured at M-NEWS, 2026-08-22 — the world-news floaters left the head
    // for the notice feed, and a floater's seat jitter was a GLOBAL rng draw
    // (World.text rolls rand(-10,10)), so every seeded entry that used to
    // announce now draws one fewer and the first crown moved to boot 15): 954516.
    check('T5 a real pinnacle mint carries the crown (the fold at placeZoneAt, the ladder pin)',
      // Landform destinations alter the starting graph and subsequent boot
      // draws. Re-measured over the full rig; same 26-try budget and crown checks.
      hitSeed === 954705, hitSeed ? `hit=${hitSeed}` : 'no hit in 26 seeds');
    if (hitSeed) {
      const lc = lw.actors.find(a => a.defId === 'stormcrown_caller' && !a.dead)!;
      const thegns = lw.actors.filter(a => a.defId === 'levin_thegn' && !a.dead);
      const lWalk = (lw as unknown as { walk: { regionAt?(x: number, y: number): string } | null }).walk;
      check('T5 the caller stands the fourth terrace AWAKE (sovereign, tier 4, unarmed, undormant, stationary)',
        lc.tier === 4 && lWalk?.regionAt?.(lc.pos.x, lc.pos.y) === 'peak_terrace_4'
        && lc.ambushArmed !== true && !isDormant(lc) && lc.stationary === true,
        `kind=${lWalk?.regionAt?.(lc.pos.x, lc.pos.y)}`);
      check('T5 the court holds the bench ARMED (every thegn tier 4 + ambushArmed — the aloft court debut, live)',
        thegns.length >= 2 && thegns.every(t => t.tier === 4 && t.ambushArmed === true),
        `${thegns.length} thegns`);
      const t0 = thegns[0];
      lw.springAmbush(t0);
      let best = 0;
      const seat = { x: t0.pos.x, y: t0.pos.y };
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        t0.pos.x = seat.x; t0.pos.y = seat.y;
        for (let i = 0; i < 6; i++) lw.moveActor(t0, dx, dy, 0.1);
        best = Math.max(best, Math.hypot(t0.pos.x - seat.x, t0.pos.y - seat.y));
      }
      check('T5 a sprung thegn is MOBILE on its story (the mover contract holds the bench)',
        !t0.ambushArmed && best > 15, `step=${best.toFixed(1)}px`);
    }
  }
}

// --- RIG Q: THE STORIES GATE (LairSeat.stories — batch 29, the fold's story rung)
// A story-hungry claim (a landmark wearing siteTier N) refuses at the FOLD
// on country that can never stack it — no darts, no rng — through the
// story-reach resolver engine/tiers.ts installs (registerLairStoryReach:
// per-layout reach registry × the tileset's faces and routes). Tileset
// GRAIN by design: per-mint rolls that come up short (a shed mountain, a
// course's riverland override) still refuse at the dart, the standing
// starved-landmark class. The qa row registers LAST deliberately — nothing
// after this block reads the lair registry (the probe-local content law).
{
  check('Q1 the reach resolver speaks the register (pinnacle stacks 5, needles 1, flat country 0)',
    tilesetStoryReach(TILESETS.pinnacle) === 5 && tilesetStoryReach(TILESETS.needles) === 1
    && tilesetStoryReach(TILESETS.meadow) === 0 && tilesetStoryReach(TILESETS.aether_drift) === 0,
    `pinnacle=${tilesetStoryReach(TILESETS.pinnacle)} needles=${tilesetStoryReach(TILESETS.needles)}`);
  registerLair({
    id: 'qa_stories_claim', landmark: 'qa_stories_site',
    seat: { biomes: ['highland'], place: 'surface', chance: 1, stories: 2 },
  });
  const hasQ = (tileset: string): boolean =>
    lairLandmarkRolls({ place: 'surface', biome: 'highland', level: 20, tileset })
      .some(r => r.landmark === 'qa_stories_site');
  check('Q2 a stories-2 claim folds IN on the face that stacks (the pinnacle)', hasQ('pinnacle'));
  check('Q3 the same claim refuses the same biome\'s FLAT faces at the fold (no darts burned)',
    !hasQ('snowcrown') && !hasQ('highland') && !hasQ('meadow'));
  check('Q4 storyless rows stand beside the gated one unmoved (absent == byte-identical at the fold)',
    lairLandmarkRolls({ place: 'surface', biome: 'highland', level: 20, tileset: 'snowcrown' })
      .some(r => r.landmark === 'giants_cairn')
    && lairLandmarkRolls({ place: 'surface', biome: 'butteland', level: 12, tileset: 'needles' })
      .some(r => r.landmark === 'midden_mouth_site'));
}

// --- RIG R: THE SENTRY LAW ON ERUPTION COUNTRY (the dormant-sentry flag) -----
// effectLavaOrb's volley zones ARE the vent-field economy: hitAll, so a pack
// kited across a waking vent pays the same toll you would (the smoker face's
// own authored law). But the sentry law — environmental strikes pass dormant
// un-roused neutrals by (Zone.spareDormant) — must hold on the same ground:
// the kilnhoard scatters ember_vent among the Urnfather's dormant coils, and
// an unflagged volley chips + ROUSES the sleeper with no player act (the
// Surgeon's Robbery broken by ambient clocks). The pair below pins both
// sides at the engine seam, live: the awake still pay, the dormant are
// passed by unroused. (The emberwyrm's drowse is the WATCH fabric — not
// isDormant — and stays deliberately untouched by this law.)
{
  leaveToHome();
  w.player.pos = vec(1400, 400); // out of the blast — the pair reads clean
  const eruptionSpares = (tag?: string): Actor => {
    const m = world.createMonster('zombie', 1, 'enemy');
    m.pos = vec(tag ? 370 : 430, 400);
    if (tag) m.tag = tag;
    w.actors.push(m);
    return m;
  };
  const ventDormant = eruptionSpares('kiln_sleeper'); // the census's own tag
  const ventAwake = eruptionSpares();
  check('R1 the rig premise holds (one dormant sleeper, one awake body, both in reach)',
    isDormant(ventDormant) && !isDormant(ventAwake) && !ventDormant.aiAwakened);
  // One orb straight down on the vent's own seat (ring 0), blast wide enough
  // to catch both bodies — the handler's smallest honest eruption.
  const qaVentEff = { id: 'lava_orb', interval: 1, radius: 0, chance: 1,
    count: 1, ringRadius: 0, jitter: 0, stagger: 0, blast: 130, power: 0 };
  const z0: number = w.zones.length;
  w.effectLavaOrb({ pos: vec(400, 400), radius: 20, kind: 'ember_vent', rot: 0 }, qaVentEff);
  check('R2 the vent minted its orb (one zone, telegraph pending)', w.zones.length === z0 + 1);
  for (let i = 0; i < 5; i++) w.updateZones(0.3); // past the 0.9s drop — AI never runs
  check('R3 the volley resolved and spent itself', w.zones.length === z0);
  check('R4 the AWAKE body still pays the field (the smoker economy untouched)',
    ventAwake.life < ventAwake.maxLife(),
    `life=${ventAwake.life.toFixed(1)}/${ventAwake.maxLife().toFixed(1)}`);
  check('R5 the DORMANT body is passed by unwounded (Zone.spareDormant)',
    ventDormant.life >= ventDormant.maxLife() - 0.001,
    `life=${ventDormant.life.toFixed(1)}/${ventDormant.maxLife().toFixed(1)}`);
  check('R6 …and never roused (ambience is nobody\'s wounding strike)',
    !ventDormant.aiAwakened && isDormant(ventDormant));
}

// --- RIG S: THE SENTRY LAW RIDES THE RE-STRIKES (tick + pulse lanes) ---------
// Batch 30 flagged the eruption's IMPACT (RIG R above); the tick and pulse
// loops — the lanes a LINGERING eruption re-strikes through — carried no
// dormant check (the recorded watch item). No shipped content lingers a
// spareDormant zone yet, so the leak was latent: this rig mints the vent's
// own zone through the real path, then gives it the linger a future consumer
// would (exploded pre-set — the initial burst never runs, so every wound
// below is a RE-STRIKE wound). The awake body keeps paying on both lanes
// (the smoker economy); the dormant sleeper rides the whole linger unwounded
// and unroused. Damage asserted as inequality only — a spare shifts the
// stream for later victims.
{
  leaveToHome();
  w.player.pos = vec(1400, 400); // out of both blasts — the pairs read clean
  const restrikeSpares = (tag: string | undefined, x: number): Actor => {
    const m = world.createMonster('zombie', 1, 'enemy');
    m.pos = vec(x, 400);
    if (tag) m.tag = tag;
    w.actors.push(m);
    return m;
  };
  const qaVentEff = { id: 'lava_orb', interval: 1, radius: 0, chance: 1,
    count: 1, ringRadius: 0, jitter: 0, stagger: 0, blast: 130, power: 0 };

  // The TICK lane: the mint's own zone, lingered.
  const tickDormant = restrikeSpares('kiln_sleeper', 870); // the census's own tag
  const tickAwake = restrikeSpares(undefined, 930);
  let z0: number = w.zones.length;
  w.effectLavaOrb({ pos: vec(900, 400), radius: 20, kind: 'ember_vent', rot: 0 }, qaVentEff);
  check('S1 the vent minted its orb for the tick lane', w.zones.length === z0 + 1);
  const zt = w.zones[w.zones.length - 1];
  zt.exploded = true; // the burst never runs — ticks alone wound below
  zt.linger = 1.21; zt.tickInterval = 0.5; zt.tickTimer = 0.5;
  for (let i = 0; i < 5; i++) w.updateZones(0.3); // past the linger — AI never runs
  check('S2 the lingering field TICKED the awake body (the lane is live, the toll stands)',
    tickAwake.life < tickAwake.maxLife(),
    `life=${tickAwake.life.toFixed(1)}/${tickAwake.maxLife().toFixed(1)}`);
  check('S3 the DORMANT body rides the whole linger unwounded (the tick spares)',
    tickDormant.life >= tickDormant.maxLife() - 0.001,
    `life=${tickDormant.life.toFixed(1)}/${tickDormant.maxLife().toFixed(1)}`);
  check('S4 …and never roused (the tick is nobody\'s wounding strike)',
    !tickDormant.aiAwakened && isDormant(tickDormant));
  check('S5 the lingering field spent itself clean', w.zones.length === z0);

  // The PULSE lane: the armed re-detonation beat, same law.
  const pulseDormant = restrikeSpares('kiln_sleeper', 570);
  const pulseAwake = restrikeSpares(undefined, 630);
  z0 = w.zones.length;
  w.effectLavaOrb({ pos: vec(600, 400), radius: 20, kind: 'ember_vent', rot: 0 }, qaVentEff);
  const zp = w.zones[w.zones.length - 1];
  zp.exploded = true; zp.linger = 2;
  zp.tickInterval = 99; zp.tickTimer = 99; // the tick lane stays silent here
  zp.pulse = { delay: 0, interval: 0.4, intervalStep: 1, dmgMult: 1, dmgStep: 1,
    radiusMult: 1, radiusStep: 1, left: 1, next: 0 }; // fires on the first step
  for (let i = 0; i < 7; i++) w.updateZones(0.3); // one beat, then the linger dies
  check('S6 the armed PULSE struck the awake body (the beat is live)',
    pulseAwake.life < pulseAwake.maxLife(),
    `life=${pulseAwake.life.toFixed(1)}/${pulseAwake.maxLife().toFixed(1)}`);
  check('S7 the DORMANT body is passed by the quake (the pulse spares)',
    pulseDormant.life >= pulseDormant.maxLife() - 0.001,
    `life=${pulseDormant.life.toFixed(1)}/${pulseDormant.maxLife().toFixed(1)}`);
  check('S8 …and never roused (the quake is nobody\'s wounding strike)',
    !pulseDormant.aiAwakened && isDormant(pulseDormant));
}

// --- RIG P: WAVE TWELVE — THE SUCCESSION LADDERS (the presence fabric) -------
// Her commission: "…actual leveled lists where certain entities begin
// appearing later, or, even more interestingly, weighted more heavily at
// different ranges… it induces what feels like a genuine world continuing."
// The wave authors no machinery — presence.ts already folds at
// World.weightedPick — so these pins hold the SHAPE: one full pack-table
// ladder (early kin absent high, band kin peaked, late kin absent low), the
// per-list law's debut (one cat, two different peaks), the stops gradient's
// debut, the game's first def-level BAND, the wildlife layers' succession
// (field / highland / cavern / the deepsea coda), and the new kits'
// affordability + grab credentials.
{
  // P27a — THE FULL LADDER through the REAL fold (presenceTable folds entry
  // × def envelopes exactly as World.weightedPick does): the grassland at 5
  // has the sounder and no lion; at 25 the lion and no sounder; the harrier
  // peaks between and YIELDS both ways.
  const defP = (id: string) => MONSTERS[id]?.presence;
  const gl = TILESETS.grassland?.packs.table ?? [];
  const glAt = (lvl: number) => presenceTable(gl, lvl, defP);
  const wOf = (rows: readonly { id: string; weight: number }[], id: string) =>
    rows.find(r => r.id === id)?.weight ?? 0;
  check('P27a the grassland ladders: the sounder is EARLY (present at 5, gone by 25)',
    wOf(glAt(5), 'sod_boar') > 0 && wOf(glAt(25), 'sod_boar') === 0);
  check('P27a the lion is LATE (absent at 5, present at 25 — the def envelope alone gates its bare row)',
    wOf(glAt(5), 'dust_lion') === 0 && wOf(glAt(25), 'dust_lion') > 0);
  check('P27a the harrier is the BAND (peaked at 12 above both edges, gone by 30)',
    wOf(glAt(12), 'steppe_harrier') > wOf(glAt(4), 'steppe_harrier')
    && wOf(glAt(12), 'steppe_harrier') > wOf(glAt(26), 'steppe_harrier')
    && wOf(glAt(30), 'steppe_harrier') === 0);

  // P27b — THE PER-LIST LAW (presence.ts's own doc promise, first kept):
  // the SAME lynx peaks early in the foothills and late on the highland —
  // and the folds truly diverge at 24 (closed there, alive here).
  const fh = TILESETS.foothills?.packs.table ?? [];
  const hl = TILESETS.highland?.packs.table ?? [];
  const lynxFh = fh.find(r => r.id === 'crag_lynx')?.presence;
  const lynxHl = hl.find(r => r.id === 'crag_lynx')?.presence;
  check('P27b the lynx wears DIFFERENT bands per roster (foothills 4..16, highland 6..20)',
    typeof lynxFh === 'object' && typeof lynxHl === 'object'
    && lynxFh.from === 4 && lynxFh.to === 16 && lynxHl.from === 6 && lynxHl.to === 20);
  check('P27b …and the folds diverge at 24 (closed in the foothills, alive on the highland)',
    wOf(presenceTable(fh, 24, defP), 'crag_lynx') === 0
    && wOf(presenceTable(hl, 24, defP), 'crag_lynx') > 0);

  // P27c — THE STOPS DEBUT (the census counted zero anywhere): the field's
  // crows RISE with level — an arbitrary-gradient row, monotone up.
  const crow = (WILDLIFE.field ?? []).find(r => r.id === 'carrion_crow');
  check('P27c the crows thicken over harder country (the stops gradient, rising)',
    typeof crow?.presence === 'object' && (crow.presence.stops?.length ?? 0) >= 2
    && presenceMul(crow.presence, 4) < 1 && presenceMul(crow.presence, 16) > 1);

  // P27d — THE FIRST DEF-LEVEL BAND: the weaver arrives ~4 and yields by
  // ~25 EVERYWHERE it ever seats (the def is the envelope's home).
  const wv = MONSTERS.dripstone_weaver?.presence;
  check('P27d the weaver\'s def carries from AND to (the game\'s first def-level band)',
    typeof wv === 'object' && wv.from !== undefined && wv.to !== undefined
    && presenceMul(wv, 2) === 0 && presenceMul(wv, 10) === 1 && presenceMul(wv, 26) === 0);

  // P27e — THE WILDLIFE SUCCESSION (the ambience layer ladders too):
  // spawnWildlife folds row × def envelopes into CHANCE — these pins hold
  // that same fold at the discriminating levels for all four countries.
  const wrow = (key: string, id: string) => (WILDLIFE[key] ?? []).find(r => r.id === id);
  const wmul = (key: string, id: string, lvl: number): number => {
    const r = wrow(key, id);
    return r ? presenceMul(r.presence, lvl) * presenceMul(MONSTERS[id]?.presence, lvl) : -1;
  };
  check('P27e the field turns over (hares + the sounder fade out; the lion walks in)',
    wmul('field', 'meadow_hare', 5) === 1 && wmul('field', 'meadow_hare', 25) === 0
    && wmul('field', 'sod_boar', 25) === 0
    && wmul('field', 'dust_lion', 5) === 0 && wmul('field', 'dust_lion', 25) === 1);
  check('P27e the dark turns over (rats out by 25, the creeper in from 10, near-gated to the pools)',
    wmul('cavern', 'gutter_rat', 25) === 0 && wmul('cavern', 'pallid_creeper', 5) === 0
    && wmul('cavern', 'pallid_creeper', 25) === 1
    && wrow('cavern', 'pallid_creeper')?.near === 'water');
  check('P27e the deep ladders (shoals thin, the jelly bloom is a band, the vent crab endures FLAT)',
    wmul('deepsea', 'silver_shoal', 28) === 0
    && wmul('deepsea', 'moon_jelly', 1) === 0 && wmul('deepsea', 'moon_jelly', 10) === 1
    && wmul('deepsea', 'moon_jelly', 28) === 0
    && wmul('deepsea', 'vent_crab', 30) === 1);
  check('P27e the heights turn over (the elk herds yield; the white hart stands from 14)',
    wmul('highland', 'taiga_elk', 25) === 0 && wmul('highland', 'white_hart', 8) === 0
    && wmul('highland', 'white_hart', 20) === 1);

  // P27f — THE KITS (standing verbs recombined, zero new skills; the
  // anatomy net pins these repo-wide — these are the seat-grain contracts):
  // every new hunter pays its kit from its own pool, the lion and the roc
  // carry true grab credentials (mass authority — the lurker's P22 idiom),
  // and the roc is the only FLIER wearing the yeti's verbs.
  const afford12 = (id: string) => (MONSTERS[id]?.skills ?? []).every(s =>
    (SKILLS[s]?.manaCost ?? 0) <= (MONSTERS[id]?.base.mana ?? 0));
  check('P27f every wave-twelve kit is affordable from its own pool',
    (['sod_boar', 'steppe_harrier', 'dust_lion', 'crag_lynx', 'peak_roc', 'white_hart', 'dripstone_weaver'] as const)
      .every(afford12));
  check('P27f the lion pins (the yoke-mauler\'s clinch on a cat, with the heft to open it)',
    (MONSTERS.dust_lion?.skills ?? []).includes('mauler_clinch')
    && (MONSTERS.dust_lion?.heft ?? 0) > 1);
  check('P27f the roc carries (the frostmaw\'s snatch + hurl on a flier, heft-backed)',
    (MONSTERS.peak_roc?.skills ?? []).includes('yeti_snatch')
    && (MONSTERS.peak_roc?.skills ?? []).includes('yeti_hurl')
    && MONSTERS.peak_roc?.flier === true && (MONSTERS.peak_roc?.heft ?? 0) > 1);
  check('P27f the harrier is the pure air mix (stoop + rake + wing — a set no standing raptor owns)',
    (['condor_stoop', 'talon_rake', 'take_wing'] as const).every(s =>
      (MONSTERS.steppe_harrier?.skills ?? []).includes(s)));
  check('P27f the weaver snares and saws (the web without the widow\'s claw or her brood)',
    (MONSTERS.dripstone_weaver?.skills ?? []).includes('web_shot')
    && (MONSTERS.dripstone_weaver?.skills ?? []).includes('rend')
    && !(MONSTERS.dripstone_weaver?.skills ?? []).includes('claw')
    && !(MONSTERS.dripstone_weaver?.skills ?? []).includes('lay_brood_egg'));
}

console.log(fails ? `\nprobe_lairs: ${fails} FAILURE(S)` : '\nprobe_lairs: ALL PASS');
process.exit(fails ? 1 : 0);
