// ---------------------------------------------------------------------------
// THE SIM ARENA — a quiet, flat, event-free zone plus the world factory that
// boots a REAL World into it headless.
//
// Boot mirrors main.ts exactly (same side-effect registrations, same
// validateContent, same World/createPlayer path) so a sim world and a played
// world are the same machine. Differences are all DATA, not code paths:
//   - the account is fresh + fully class-unlocked (sims may probe anything),
//   - every expedition package is disabled (no invasions landing mid-probe),
//   - the arena zone is registered into ZONES before construction (it rides
//     cloneZones into the world graph like any authored zone),
//   - after the town boot we loadZone into the arena and hold there.
// ---------------------------------------------------------------------------

import { installHeadlessShims } from './shims';
import { SKILLS } from '../data/skills';
import { POWER_PROGRESSION, odysseyMilestoneKey } from '../data/powerProgression';
import { resetActorIdCounter } from '../engine/actor';
import { FORECHART_CFG } from '../world/forechart';
// The same side-effect registrations main.ts performs — a World without them
// is missing stamps/landmarks/layouts and zone generation would be wrong.
import '../data/clusters';
import '../data/formations';
import '../engine/landmarkBuilders';
import '../data/landmarks';
import '../data/lairs';
import '../engine/layoutRecipes';
import '../engine/interiorGen';
import '../data/massifs';
import '../data/watchposts';
import '../data/occurrences'; // the 'occurrence' ring tenant + occurrence defs
import '../data/settled';
import '../data/garden';
import '../data/catacombs';
import '../data/merelake';
import '../data/cistern';
import '../data/lonecrypt';
import '../data/grove';
import '../data/innfolk'; // THE FOLK ROSTER — the inn's pools
import '../data/theater'; // THE THEATER FABRIC's defaults (before warfront — kind priority is registration order)
import '../data/warfront';
import '../data/scald'; // the Scald Basin kit (pool rows, mineral furniture, the meld, its weather)
import '../data/greatgeyser'; // THE GREAT GEYSER den lane (the mouth, the lair seat, the Geysermaw's ledger)
import '../data/scaldkit'; // THE SCALD KIT K1 (the steam bank, the lacksStatus condition, the kit census)
import '../data/pilgrimage'; // THE TERRACE PILGRIMAGE theater kind + rows (after data/theater — registration order is priority)
import '../data/compositions';
import '../data/fog';
import '../data/creeps';
import '../data/traversals';
import '../data/glyphParts'; // the shipped glyph part kinds (looks reference them)
import '../data/commanders'; // the tutorial factions (the Fathers) — under every census net
import '../data/locales';
import '../data/authoredMaps'; // THE AUTHORED-MAP FABRIC's shipped maps (+ the 'authored' layout via engine/authoredMaps)
import '../data/bountyJourneys';
import '../data/bountyPassages';
import '../data/bountyExpeditions'; // the bounty board's 'expedition' kind (mints an authored map at the take)
import { validateContent } from '../data/validate';
import { registerAllPackageFactions } from '../packages/factionGen';
import { buildManifest } from '../packages/manifest';
import { makeAccount } from '../meta/account';
import { World } from '../engine/world';
import { CLASSES, type ClassDef } from '../data/classes';
import { ZONES, type ZoneDef } from '../data/zones';

/** Open sim knobs — modular thresholds, never magic numbers inline. */
export const SIM_CFG = {
  /** Arena zone geometry. Roomy enough to kite, small enough to always meet. */
  arena: { w: 1600, h: 1200 },
  /** Fixed arena layout seed — the floor itself is not part of the experiment. */
  arenaSeed: 0x51713a,
  /** Fixed tick. 60 Hz matches the live game's cadence assumptions. */
  dt: 1 / 60,
  /** Default hero-vitals sampling rate (Hz). */
  sampleHz: 5,
  /** Default wave spawn ring distance (px). */
  spawnDistance: 260,
  /** Hard per-episode wall: ticks beyond duration/stop we refuse to run. */
  maxTicksHardCap: 60 * 60 * 30, // 30 sim-minutes
};

export const SIM_ARENA_ID = 'sim_arena';

/** The arena: objective 'safe' keeps every ambient system quiet (no frontier
 *  minting, no events, no storms) — combat itself works fine in safe zones
 *  (the town training dummy proves it). Flat floor, no stamps, no exits. */
function simArenaDef(): ZoneDef {
  return {
    id: SIM_ARENA_ID, name: 'Proving Grounds',
    level: 1,
    size: { ...SIM_CFG.arena },
    theme: {
      floor: '#101010', grid: '#181818', border: '#3a3a3a',
      obstacle: '#2a2a2a', obstacleEdge: '#444444', accent: '#888888',
    },
    seed: SIM_CFG.arenaSeed,
    layout: [],
    objective: { kind: 'safe' },
    exits: [],
    map: { x: 9000, y: 9000 }, // far off every real chart
  };
}

let booted = false;

/** One-time engine boot for a sim process: shims, registrations, validation,
 *  arena zone injection. Idempotent — every factory entry point calls it.
 *  `validate: false` skips the content census: the skill showcase engine
 *  (src/showcase/engine.ts) boots inside a game that already ran it. */
export function bootSimEngine(opts: { validate?: boolean } = {}): void {
  if (booted) return;
  booted = true;
  installHeadlessShims();
  // THE PINNED GOVERNOR: forechart's TIME GOVERNOR (beatBudgetMs) is a
  // wall-clock frame guard for the live client — under the harness it made
  // halo progress a function of MACHINE LOAD (units-per-beat varied with the
  // clock), so the standing web at any world-time wobbled, and every seeded
  // roll downstream of web state (mint name-dedupe retries, exit picks, and
  // through them zone-load fixture counts) wobbled with it — one seed rolled
  // 3/4/5 burial mounds in probe_objectives G1. Sim beats run the COUNT
  // budget alone: determinism is a harness property (see sim/rng.ts), and
  // the live game keeps its guard untouched.
  FORECHART_CFG.beatBudgetMs = Infinity;
  registerAllPackageFactions();
  if (opts.validate !== false) validateContent();
  ZONES[SIM_ARENA_ID] = simArenaDef();
}

export function classById(id: string): ClassDef {
  const cls = CLASSES.find(c => c.id === id);
  if (!cls) throw new Error(`sim: unknown class '${id}' (have: ${CLASSES.map(c => c.id).join(', ')})`);
  return cls;
}

/** A fresh, quiet, headless World parked in the arena with a level-1 hero of
 *  the given class (the build injector then reshapes that hero wholesale). */
export function makeSimWorld(classId: string, seed: number): World {
  bootSimEngine();
  // THE HERMETIC-WORLD LAW (the episode runner's id re-zero, extended to
  // every sim world): actor ids feed per-body variety salts, so without
  // this a probe file's SECOND world inherits the id watermark of its
  // first — and every downstream section's seeded assertions ride the
  // upstream sections' dynamics (edit rig 2, break rig 5). A fresh
  // throwaway world starts a fresh id space, by construction.
  resetActorIdCounter();
  const account = makeAccount();
  for (const gate of Object.values(POWER_PROGRESSION)) account.ledger[odysseyMilestoneKey(gate.odysseyStage)] = 1;
  // Sims may probe any class — unlock the full roster on the throwaway account.
  for (const c of CLASSES) account.unlockedClasses.add(c.id);
  // Combat rigs exercise fully available trees; progression probes clear this fixture.
  for (const id of Object.keys(SKILLS)) account.memorySecondary.add(`skill:${id}`);
  const manifest = buildManifest(account, seed);
  for (const p of manifest.packages) p.enabled = false; // a QUIET expedition
  const world = new World(account, Object.freeze(manifest));
  // Isolated skill arenas field their own actors; production creation grants its class companions.
  world.createPlayer(classById(classId), { startingCompanions: false });
  world.loadZone(SIM_ARENA_ID);
  // Center the hero — spawn points are an exits concern and the arena has none.
  world.player.pos.x = SIM_CFG.arena.w / 2;
  world.player.pos.y = SIM_CFG.arena.h / 2;
  return world;
}
