import { bodyActionPoseOf } from '../engine/bodyAction';
import { bodyWalkPoseOf } from '../engine/bodyWalk';
import { meleeReachCueOf } from '../engine/meleeReach';
import { foresightRowOf, foresightOfRow, type ForesightW } from './foresightWire';
import { empowermentRank, skillInstanceName } from '../engine/skillEmpowerment';
import { afflictionPressureOf } from '../engine/afflictionPressure';
import { armedStatusCues } from '../engine/armedCues';
import { reactiveCueOf, wardCueActive, wardGuardians } from '../engine/combatReadability';
import { memoryAccessView } from '../meta/memoryUnlocks';
import { castingCompletion, castingCueOf } from '../engine/castingCues';
import { selfBankCuesOf, type SelfBankCue } from '../engine/skillSelfVisual';
import { guardReleaseCue } from '../engine/warningCues';
import { encounterCueOf } from '../engine/encounterCombat';
import { guardArcRadians, parryCueStrength } from '../engine/combatCues';
import type { TitanScenePiece } from '../engine/titans';
import { cosmeticStyle, COSMETIC_PROJECTILES } from '../data/cosmeticStyles';
import { cosmeticLoadoutFor, cosmeticSummonSkill, cosmeticSkillPaint, sanitizeCosmeticLoadout } from '../meta/cosmetics';
import { skillFieldVisual, cloneSkillFieldVisual, type SkillFieldVisual } from '../engine/skillFieldVisual';
import { skillTetherVisual } from '../engine/skillTetherVisual';
import { cloneLightningTrace, type LightningTrace } from '../engine/lightningVisual';
import { cloneMovementTrail, type MovementTrail } from '../engine/skillMovementVisual';
import type { CosmeticLoadout, CosmeticMotif } from '../engine/cosmetics';
const EMPTY_COSMETIC_LOADOUT: CosmeticLoadout = { slots: {}, skills: {} };
import { flaskChargeBanks, restoreFlaskChargeBanks } from '../engine/flaskState';
// ---------------------------------------------------------------------------
// SNAPSHOT — the host→client render-state wire format + (de)serialization.
//
// Host-authoritative co-op: only the host runs the sim. Each wire tick the host
// SERIALIZES the renderable world into a flat, JSON-safe StateSnapshot (no Actor
// objects, no StatSheets, no Maps — ids/numbers/strings only); clients APPLY it
// onto a render-only World they never simulate, then draw it with the EXISTING
// renderer untouched. To make the renderer work unchanged, applySnapshot rebuilds
// lightweight Actor objects and re-installs the few StatSheet bases the renderer
// reads (maxLife/maxMana/maxEs, invisible, detectability) so actor.maxLife() etc.
// return the host's numbers.
//
// MVP fidelity: heroes, enemies, projectiles, drops, orbs, texts, flashes render
// faithfully. Exotic per-actor FX (cast bars, auras, worm tails, constructs) are
// NOT shipped and degrade gracefully — the renderer guards every one of them, so
// they simply don't draw on a client. The HOST always sees full fidelity.
// ---------------------------------------------------------------------------

import type { RefugeDeparture } from '../engine/refugeDeparture';
import { replenishingDelivery } from '../engine/replenishment';
import { Actor, type ActorAdorn, type ActorShape, type Team,
  type CastingState, type ActiveAura, type ConstructState, type LeapState, type WormBody } from '../engine/actor';
import type { CourseJourney } from '../world/courseStages';
import type { AnnexSpec, Doodad, DoodadDoor, HollowSpec, PlacedStructure } from '../engine/levelgen';
import { bagBoard } from '../engine/inventory';
import { containerBoard, containerList, packContainerBoard, type ContainerBoardW } from '../engine/containers';
import type { HitShape } from '../engine/shapes';
import type { TrackSpec } from '../engine/tracks';
import type { TrapworkSpec } from '../engine/trapworks';
import { eyecatchElapsed } from '../engine/ultimates';
import type { PartSpec } from '../render/vis/parts';
import type { ZoneDef, ZoneTheme } from '../data/zones';
import { hullOf, type ZoneShape } from '../world/shape';
import { GridWalkField, type PackedWalk } from '../world/gridWalk';
import { emptyAbilityEssences, emptyEssences } from '../engine/world';
import type { World, Seat, VendorEntry } from '../engine/world';
import { SKILLS } from '../data/skills';
import { SUPPORTS } from '../data/supports';
import { MONSTERS } from '../data/monsters';
import { PASSIVE_NODES } from '../data/passives';
import { sanitizeChoices, sanitizeGrafts } from '../data/passiveChoices';
import { makeSkillInstance, validTreeNodes, type SkillInstance, type SupportInstance, type SkillRarity } from '../engine/skills';
import { rebuildItem } from '../engine/itemgen';
import { rebuildAnyItem } from '../engine/gemitems';
import { sanitizeCompanionStances } from '../engine/companionStances';
import { ITEM_RARITIES, type ItemInstance } from '../engine/items';
import { VESTIGES } from '../data/vestiges';
import { abilityEssenceOfTier, ESSENCES } from '../data/essences';
import type { Attributes } from '../engine/stats';
import { comboCueRows } from '../engine/comboCues';
import { poolCueRows } from '../engine/reserveCues';
import { payloadCueRows } from '../engine/payloadCues';
import { procCueRows } from '../engine/procCues';
import { anatomyCueState, cloneAnatomyCues } from '../engine/anatomyCues';
import { feedingCueState, cloneFeedingCues } from '../engine/feedingCues';
import { companionCueState, cloneCompanionCues, cloneRecoveryCue } from '../engine/companionCues';
import { GRAB_VERB_LABEL } from '../engine/grab';
import { tellSpecsOf } from '../engine/tells';
import { fellProgress } from '../engine/rampage';
import { watchRungOf, watchValueOf } from '../engine/watch';

export type Vec2W = [number, number];

/** One renderer-visible actor on the wire. Short keys keep the JSON small. */
export interface ActorW {
  bodyActionPose?: import('../engine/bodyAction').BodyActionPose;
  bodyWalkPose?: import('../engine/bodyWalk').BodyWalkPose;
  selfBankCues?: SelfBankCue[];
  presenceBadge?: import('../data/skillPresenceVisuals').PresenceBadge;
  movementTether?: Actor['movementTether'];
  encounterGroup?: Actor['encounterGroup'];
  encounterCue?: import('../engine/warningCues').EncounterCue;
  afflictionPressure?: import('../engine/afflictionPressure').AfflictionPressure;
  armedCues?: import('../engine/armedCues').ArmedCue[];
  reactiveCue?: import('../engine/combatReadability').ReactiveCue;
  poolCues?: import('../engine/reserveCues').PoolCueRow[];
  payloadCues?: import('../engine/payloadCues').PayloadCueRow[];
  procCues?: import('../engine/procCues').ProcCueRow[];
  anatomyCues?: import('../engine/anatomyCues').AnatomyCueState;
  feedingCues?: import('../engine/feedingCues').FeedingCueState;
  companionCues?: import('../engine/companionCues').CompanionCueState;
  wardCue?: { profile?: string; sources: number[] };
  encounterOrder?: Pick<NonNullable<Actor['encounterOrder']>, 'group' | 'recipe' | 'plan' | 'leader' | 'phase' | 'until'>;
  cosmeticKind?: 'wisp';
  cosmeticLoadout?: CosmeticLoadout;
  id: number;
  p: Vec2W; f: number; r: number; c: string; sh: ActorShape;
  team: Team; name: string;
  life: number; maxLife: number; es: number; maxEs: number;
  hf: number;                  // hitFlash
  downed: boolean; dead: boolean;
  mn: boolean;                 // isMinion() (purple outline)
  passive: boolean;
  ut: boolean;                 // untargetable (ghostly alpha)
  summonReform?: [number, number]; // remaining / full reconstruction time
  thu?: number; // throngUnits: constituent count in a cluster
  the?: number; // throngEgg: batch held by a find
  thg?: Record<string, number>; // native hatch gauges by equipped skill
  assault?: Actor['assaultHud'];
  assaultOrbit?: boolean;
  assaultAura?: boolean;
  hive?: Actor['hivecallHud'];
  thr?: Record<string, number>; // host-authored full roster counts
  tw?: string;                 // throngWild husk kind (per-viewer sight gate)
  /** THE GRAB FABRIC's held-meter row, host-computed on the HELD body
   *  ([verb label, struggle 0..1] — the boss-bar idiom; clients hold no
   *  pair state). Everyone reads the same bar: victim, holder, rescuers. */
  gb?: [string, number];
  pl?: number;                 // plies remaining (THE PLY FABRIC pips)
  plm?: number;                // plies ceiling (omit both when the fabric is off)
  /** THE TELL FABRIC's quantized values (engine/tells.ts), host-swept —
   *  the DERIVED scalars, never the source state (drives/morale live only
   *  in the host's brains). Omitted when every reading is 0: the client
   *  materializes zeros and the dress is identical. */
  tl?: number[];
  /** Rolled brainVariants index — the client rebuilds the same variant
   *  tell rows from its own def registry (tellSpecsOf). */
  bv?: number;
  /** THE PACK LAYER's bond holder (engine/pack.ts): the HOST id of the body
   *  currently empowering this one. Absent = no bond worn. The client
   *  re-points it at its own pooled shell, then derives the same link list
   *  the host draws — over live positions, so lines track moving bodies. */
  bl?: number;
  /** THE WATCH FABRIC's drawn read (engine/watch.ts), host-stamped —
   *  [reach base, arc half-angle (rad, 3dp), rear fraction (3dp),
   *  alerted 0|1, ladder value (3dp)]. DERIVED scalars in the tell wire's
   *  own idiom: the client re-folds the same fan from the same numbers
   *  (its own hero's detectability/stealth fold locally) — suspicion
   *  sources never cross the wire. Omitted until the first scan stamps. */
  wp?: [number, number, number, number, number];
  tr?: number;                 // THE TIER FABRIC: walkable layer (omit at 0)
  aims?: false;                // Actor.aims=false (no aim tick) — omit when it aims
  wn?: number;                 // waning presence pulse, 0..1 (omit when 0)
  inv?: number;                // sheet invisible (omit when 0)
  concealment?: number;
  concealmentExposedUntil?: number;
  det?: number;                // sheet detectability (omit when 1)
  seat?: string;               // player-seat id (own-hero + party identity)
  adorn?: ActorAdorn;
  /** Surface material (render bake key) — the client skins bodies identically. */
  mat?: string;
  /** Part-grammar look id — same reason. */
  lk?: string;
  /** Runtime tack (Actor.extraParts — the tamed collar): render-only parts
   *  worn over the body; the client bakes them identically. */
  ep?: PartSpec[];
  rarity?: string;
  magicPack?: import('../engine/magicPacks').MagicPackState;
  magicPackFrom?: number;
  magicPackPower?: number;
  magicPackRole?: Actor['magicPackRole'];
  magicPackDonors?: number;
  magicPackPending?: number;
  defId?: string;
  cosmeticSourceSkill?: string; // resolved cosmeticSummonSkill; no skill instance or combat payload
  ss?: Actor['summonShell'];
  sg?: Actor['shellGuard'];
  pb?: true; // persistent broken-poise cue, cleared on rearm/removal
  faction?: string;
  /** THE BOSS BAR row, host-computed (World.bossBarInfo — clients have no
   *  brain to derive pips from): [pips, lit, highlight]. Present only while
   *  this body owns the top-center bar. */
  bb?: [number, number, number];
  /** INVOCATION RUNES (players only, while banked) — the client's own bar
   *  draws the woven sequence the host is holding for it. */
  rn?: string[];
  /** THE PRIMED POUR's banked sips (players, while held) — the SKILL IDS
   *  only (the runes idiom: one derived label per hotbar glint;
   *  chargesSpent and the release live host-side, host-authoritative). */
  pp?: string[];
  /** Host-owned flask ammunition for the remote hotbar. */
  fq?: Record<string, number>;
  /** COMBO GRAMMAR chips, host-computed like the boss bar (clients hold no
   *  ring): per equipped rule [id, lit, len, glow]. Players only. */
  cb?: [string, number, number, number][];
  /** THE MIMIC BANK (players only, while filled — engine/mimic.ts): the
   *  captured arts as [skillId, sourceMonsterId] pairs, oldest first, plus
   *  the selection. The client's own build flap/bar draws the chips; the
   *  bank itself only ever fills host-side through the capture gates. */
  mk?: [string, string][];
  ms?: string;
  // --- FX (all omitted when absent → renderer skips them gracefully) ---
  ab?: number;                 // absorb pool (white bar)
  st?: StatusW[];              // active statuses (pips + screen ailment FX)
  cast?: CastW;                // cast bar + guard arc
  auras?: AuraW[];             // emanating aura fields
  con?: { kind: string; domeRadius?: number };  // construct (dome bubble)
  fuse?: number;               // armed bomber fuse
  leap?: { timer: number; total: number; vent?: number };  // airborne leap (body swell; `vent` = the vent-ride's column radius — the steam jet draws)
  /** Snake/worm trailing segments. SEGMENT-FABRIC extras ride only when
   *  live (bosses, briefly): `ht` = hittable chain (solid draw + hitbox
   *  overlay truth), `wd` = torn-segment bitmask (torn draws/tests smaller),
   *  `sf` = per-segment flash countdowns. Kit-part looks are NOT shipped —
   *  the client re-resolves them from MONSTERS[defId].worm.looks. */
  worm?: { seg: Vec2W[]; taper: number; ht?: 1; wd?: number; sf?: number[] };
}

/** `bk` = THE BANK READ (StatusDef.bank — ActiveStatus.bankFrac, 0..1 at
 *  two decimals): the derived scalar the body FX scale by (the tells-wire
 *  idiom — never the bank's source numbers). Absent = no bank worn. */
export interface StatusW { id: string; stacks: number; bk?: number; dot?: 1; rem?: number; statusDuration?: number; }
export interface AuraW { c: string; r: number; sh: number; skillId?: string; }
/** A cast in progress — the few fields the renderer's cast bar + guard arc read. */
export interface CastW { parryCue?: number;
  fg?: ForesightW;
  meleeReach?: import('../engine/meleeReach').MeleeReachCue;
  /** Optional player skill identity; older hosts keep their plain cast bar. */
  sk?: string;
  castingCompletion?: number;
  castingCue?: import('../engine/castingCues').CastingCue;
  focusBroken?: boolean;
  guardReleaseCue?: import('../engine/warningCues').GuardReleaseCue;
  c: string; mode: string; total: number; elapsed: number;
  pulseTimer?: number; shield?: number; maxShield?: number;
  indicatorAt?: number; presses?: number; channelTime?: number;
  guardArc?: number;           // guard spec arcDeg (mode === 'guard')
  /** Guard bash tic: live arming line + inverted contract (mode 'guard'). */
  bashAt?: number; bashLow?: boolean;
  /** THE ARM CLOCK (held seconds before the bash may convert): with the
   *  shipped channelTime the client re-folds guardBashReady exactly as the
   *  host did — the arm meter and the readied gold agree across the wire. */
  bashArmAt?: number;
  /** THE VENT-RIDE's broil (LeapDelivery.vent): the column radius a casting
   *  vent-leaper will erupt at take-off — the client draws the same roil
   *  under the caster's feet (render/vis/ventRideLayer.ts). */
  vent?: number;
}

/** `a` = flight age (sim seconds): the deterministic phase clock the form
 *  painters roll on (wave crest, square tumble) — client and host draw the
 *  same curve the host's hit test sampled. */
export interface ProjW { skillId?: string; reflectedCue?: true; orbPaint?: import('../engine/skills').OrbPaint; cosmeticProjectile?: string; cosmeticMotif?: CosmeticMotif; p: Vec2W; d: number; r: number; c: string; sh: string; a: number; }
/** A tether band, RENDER-ONLY on the client (the host owns the damage ticks). */
export interface TetherW { ax: number; ay: number; bx: number; by: number; c: string; w: number;
  voice?: string; skillId?: string; age?: number; fade?: number; fromTier?: number; toTier?: number; }
export interface DropW { p: Vec2W; bob: number; kind: 'skill' | 'support' | 'gear' | 'vestige' | 'essence' | 'abilityEssence'; color: string; rarity?: string; name?: string; baseId?: string; vid?: string; eid?: string; tid?: number; cnt?: number; }
/** kind is an ORB_DEFS registry id — the client renders from the registry. */
export interface OrbW { p: Vec2W; bob: number; life: number; kind: string; tier?: number; flowTo?: Vec2W; flowTier?: number; flowFromTier?: number; }
export interface TextW { p: Vec2W; life: number; maxLife: number; size: number; color: string; text: string;
  /** INFO-STREAM float kind — ships so each CLIENT gates the draw by its own
   *  Settings.floatKinds (the host mints one truth; every seat curates). */
  k?: string; }
/** A notice-feed line (screen-anchored world news) — the client filters by
 *  its own channel mutes and draws at its own anchor/duration. */
export interface NoticeW { text: string; color: string; size: number; ch: string; born: number; }
/** A pickup-feed row — `s` is the owning seat id; each client lists only its
 *  own seat's rows on its flank. */
export interface PickupW { s: string; l: string; c: string; n: number; born: number; }
/** THE EFFECT VOICE ON THE WIRE (the tell-wire idiom): `fx` is a registry
 *  KIND — the client rebuilds the painter from its OWN effectVoice registry,
 *  never from shipped draw state — and `bolt`/`meteor` carry the lightning/
 *  demon-sky flags so those skies stop landing generic on remote seats. All
 *  three absent (an old host, an unkeyed flash) = the classic ring, byte-
 *  identical to the pre-wire client. FlashW also carries shape, safe center,
 *  facing, arc and beam so skillBurstVoice and remote hit footprints agree. */
export interface FlashW { combatCue?: import('../engine/combatCues').CombatCue; defenseCue?: import('../engine/defenseCues').DefenseCue; cosmeticMotif?: CosmeticMotif; p: Vec2W; radius: number; color: string; life: number; maxLife: number;
  arcRad?: number; lightning?: LightningTrace;
  movement?: MovementTrail;
  feedingCue?: import('../engine/feedingCues').FeedingTransfer;
  companionCue?: import('../engine/companionCues').CompanionCueFlash;
  recoveryCueTier?: number;
  fx?: string; bolt?: boolean; meteor?: boolean; departure?: RefugeDeparture; onGround?: string[];
  shape?: number; facing?: number; edgeFrac?: number;
  arc?: { facing: number; arcRad: number }; beam?: boolean; }
/** A death-burst telegraph (coalesce gather → tracking orb). RENDER-ONLY: the client
 *  never simulates these (homing is host-authoritative via nearestSeatPos over the seats);
 *  it just draws the host's state so the remote seat gets the same escape window. Carries
 *  only the fields drawDeathBursts reads — phase/t/coalesce/radius/color/pos/arming/trail
 *  + team (`tm`: THE SPARED RING softens command cues for the team a burst cannot hurt).
 *  `tm` is optional on the wire: absent — an old host — the client row's team stays
 *  undefined and the ring draws classic full-strength, never a false "safe". */
export interface DeathBurstW { p: Vec2W; ph: 0 | 1; r: number; c: string; arm: 0 | 1; t: number; co: number; trail: Vec2W[]; tm?: Team; }

/** Per-seat camera + HUD anchor (broadcast for all seats; each client reads its own). */
export interface SeatW {
  pos: Vec2W;
  life: number; maxLife: number; mana: number; maxMana: number; es: number; maxEs: number;
  dead: boolean; downed: boolean;
  /** Movement-PREDICTION fields: `seq` = the last input the host applied for this
   *  seat (the client replays its unacked inputs forward from `pos`); `rooted` =
   *  the host has this hero movement-locked (so the client stops predicting forward);
   *  `slippery` = low-traction ground (ice) whose momentum physics the client can't
   *  reproduce — so it anchors to the authoritative pos instead of predicting. */
  seq?: number;
  rooted?: boolean;
  slippery?: boolean;
  /** Environmental-survival meters (breath, light) — only rows BELOW max ride
   *  (the HUD hides full meters, and most frames most seats carry none). The
   *  client rebuilds its own hero's Actor.survival map from this so the
   *  registry-driven survival bars draw exactly as on the host. */
  survival?: Record<string, number>;
}

// --- per-seat META wire (Layer 2: the build/progression the client UI reads) ---
// JSON-safe replicas — NEVER ship def bodies (a SkillDef is huge); ship def IDS
// + level/sockets/rarity and rehydrate via the SKILLS/SUPPORTS catalogs on apply.
// Sent only when a seat's meta CHANGES (dirty-flagged), so it's nearly free.
/** `lk` = THE KEEPER'S MARK (salvageLock) — 1 when the gem is locked, absent
 *  otherwise (the derived-bit idiom; the client renders 🔒 and computes its
 *  toggle asks from it — the host stays the authority). */
export interface SupportInstW { id: string; lvl: number; lk?: 1; }
/** `tn` = THE SKILL-MODE TREE picks (spent node ids, spend order) — absent
 *  when unpicked (the sparse idiom); the client rehydrates through
 *  validTreeNodes so its tooltip/pip/panel read the same truth the host
 *  spends (orphans from a version-skewed host drop with a note). */
export interface SkillInstW { id: string; lvl: number; rarity?: string; sockets: (SupportInstW | null)[]; mark?: { x: number; y: number } | null; g?: boolean; lk?: 1; tn?: string[]; rp?: 1; triggerOff?: boolean; empowermentRank?: number; }
/** The client OWN-seat build: enough to render the char-sheet / skill-book / tree
 *  and re-derive the stat sheet (recalcSeat) on the client. */
export interface SeatMetaW {
  level: number;
  xp: number; xpNeeded: number;
  passivePoints: number;
  vocationPoints: number;
  vocations: string[];              // granted vocations (center-tree render + gates)
  baseAttrs: Attributes;            // recalcSeat derives `attrs` from this + allocated
  allocated: string[];              // passive node ids
  /** Choice-node picks by node id (optional → tolerant of an older host). */
  choices?: Record<string, string[]>;
  /** Realm-currency wallet + graft bindings (optional, same tolerance). */
  realmPoints?: Record<string, number>;
  grafts?: Record<string, string | null>;
  known: Record<string, SkillInstW>;
  // THE RESIDENCE (skill-items M1): loose gems ride `gear.items` as their
  // 1×1 wrapper items (pure JSON, payload included) — the old inv/skillInv
  // arms retired with the side arrays they mirrored.
  bar: (string | null)[];          // bar slot → learned skill id
  /** THE STAMPED OPENING (PlayerMeta.opening) — the client's starter strip
   *  reads it; the hatch itself is host-judged. Optional → a host one
   *  wire-version behind ships the class's base bar. */
  op?: (string | null)[];
  /** THE COMPANION STANCES (PlayerMeta.stances) — the client's meta button
   *  wears the current stance off it; the shift itself is host-judged.
   *  Optional → a host one wire-version behind ships the default. */
  st?: Record<string, string>;
  /** GEAR: bag + doll. ItemInstances are already pure JSON (ids + rolls —
   *  never def bodies), so the instance IS the wire shape; rebuildItem
   *  re-validates against the client's registries on apply. Optional →
   *  tolerant of a host one wire-version behind. */
  gear?: {
    items: ItemInstance[]; equipped: Record<string, ItemInstance>;
    /** THE CONTAINER FABRIC (engine/containers.ts): seated pieces by board
     *  id, seat cells included. Optional → a host one wire-version behind
     *  ships bare boards. */
    containers?: Record<string, ItemInstance[]>;
    relicEmpowerment?: number;
    relicEnabled?: boolean;
  };
  /** Essence wallet (salvage currency), per essence id. */
  ess?: Record<string, number>;
  /** Ability Essence wallet (skill food), per tier id. */
  abil?: Record<string, number>;
  /** Vestige wallet (socket material), per vestige id. */
  vest?: Record<string, number>;
}

const supW = (s: SupportInstance): SupportInstW =>
  ({ id: s.def.id, lvl: s.level, lk: s.locked ? 1 : undefined });
const skillInstW = (s: SkillInstance): SkillInstW => ({
  empowermentRank: empowermentRank(s) || undefined,
  id: s.def.id, lvl: s.level, rarity: s.rarity,
  sockets: s.sockets.map(x => (x ? supW(x) : null)),
  mark: s.state?.markPos ?? undefined,
  g: s.granted || undefined,
  lk: s.locked ? 1 : undefined,
  tn: s.treeNodes?.length ? [...s.treeNodes] : undefined,
  rp: s.replenishmentPaused ? 1 : undefined,
  triggerOff: s.state?.triggerOff,
});

/** Host: serialize one seat's build/progression for its owning client.
 *  Level + bar read the HERO body (the possession seam, engine/possess.ts):
 *  a seat riding a borrowed body still ships ITS OWN build — the char
 *  sheet never wears a monster's level. */
export function serializeSeatMeta(seat: Seat): SeatMetaW {
  const m = seat.meta;
  const hero = seat.home ?? seat.actor;
  return {
    level: hero.level,
    xp: m.xp, xpNeeded: m.xpNeeded,
    passivePoints: m.passivePoints,
    vocationPoints: m.vocationPoints,
    vocations: [...m.vocations],
    baseAttrs: { ...m.baseAttrs },
    allocated: [...m.allocated],
    choices: Object.fromEntries(Object.entries(m.choices).map(([k, v]) => [k, [...v]])),
    realmPoints: { ...m.realmPoints },
    grafts: { ...m.grafts },
    known: Object.fromEntries([...m.knownSkills].map(([id, inst]) => [id, skillInstW(inst)])),
    bar: hero.skills.map(s => (s ? s.def.id : null)),
    op: [...m.opening],
    st: { ...m.stances },
    gear: {
      relicEmpowerment: m.relicEmpowerment ?? 0,
      relicEnabled: m.relicEnabled !== false,
      items: m.items.map(i => ({ ...i })),
      equipped: Object.fromEntries(
        Object.entries(m.equipped).flatMap(([k, v]) => (v ? [[k, { ...v }] as const] : [])),
      ),
      containers: Object.fromEntries(
        Object.entries(m.containers).map(([id, held]) => [id, held.map(i => ({ ...i }))]),
      ),
    },
    ess: { ...m.essences },
    abil: { ...m.abilityEssences },
    vest: { ...m.vestiges },
  };
}

const rehydrateSupport = (w: SupportInstW): SupportInstance | null => {
  const def = SUPPORTS[w.id];
  return def ? { def, level: w.lvl, ...(w.lk ? { locked: true } : {}) } : null;
};
const rehydrateSkill = (w: SkillInstW): SkillInstance | null => {
  const def = SKILLS[w.id];
  if (!def) return null;
  const inst = makeSkillInstance(def, w.lvl, w.sockets.length);
  inst.rarity = w.rarity as SkillRarity | undefined;
  if (empowermentRank(w)) inst.empowermentRank = empowermentRank(w);
  inst.sockets = w.sockets.map(s => (s ? rehydrateSupport(s) : null));
  if (w.mark) inst.state = { markPos: w.mark };
  if (w.g) inst.granted = true;
  if (w.lk) inst.locked = true; // the keeper's mark (salvageLock)
  // Untrusted wire → the one validation seam (structure + budget), so the
  // client's panels can never render a state the host would refuse.
  if (w.tn?.length) inst.treeNodes = validTreeNodes(def, w.tn, w.lvl, inst);
  if (typeof w.triggerOff === 'boolean') (inst.state ??= {}).triggerOff = w.triggerOff;
  if (w.rp === 1 && replenishingDelivery(inst)?.replenish?.toggle) inst.replenishmentPaused = true;
  return inst;
};

// --- vendor stock wire (shared, not per-seat) -------------------------------
// Brandt's wares live on the host's world and the client never ticks the sim, so
// its local stock would diverge — and a buyVendor intent addresses stock by INDEX.
// Replicate the host's stock so the client renders the authoritative list + its
// indices line up. Reuses the skill/support instance wire shapes (defId only).
export type VendorEntryW = (
  | { kind: 'skill'; s: SkillInstW }
  | { kind: 'support'; g: SupportInstW }
  // Rolled GEAR rides as the full instance (already pure JSON — the same
  // stance as seat gear); rebuildItem re-validates on the client.
  | { kind: 'item'; i: ItemInstance }
) & {
  /** THE PATRON'S HOLD, on the wire: 1 = reserved row, 2 = the standing
   *  order's find. Rides ON the entry (never a parallel array — a row that
   *  fails rehydrate must take its flag down with it). */
  lk?: 1 | 2;
};

const vendorEntryW = (e: VendorEntry, world: World): VendorEntryW => {
  const base: VendorEntryW =
    e.kind === 'skill' ? { kind: 'skill', s: skillInstW(e.inst) }
      : e.kind === 'support' ? { kind: 'support', g: supW(e.gem) }
      : { kind: 'item', i: { ...e.item } };
  const row = world.vendorEntryHold('brandt', e);
  if (row) base.lk = row.commission ? 2 : 1;
  return base;
};

const rehydrateVendor = (w: VendorEntryW): VendorEntry | null => {
  if (w.kind === 'skill') { const inst = rehydrateSkill(w.s); return inst ? { kind: 'skill', inst } : null; }
  if (w.kind === 'item') { const item = rebuildItem(w.i); return item ? { kind: 'item', item } : null; }
  const gem = rehydrateSupport(w.g); return gem ? { kind: 'support', gem } : null;
};

/** Client: graft a replicated build onto a seat's meta + re-derive the stat sheet.
 *  recalcSeat installs the build's stat SOURCES over the actor's clean STAT_DEFS
 *  base — so maxLife()/maxMana()/derived stats match the host bit-for-bit, AS LONG
 *  AS the per-frame apply NEVER setBase's those for the local hero (it doesn't). */
export function applySeatMeta(world: World, seat: Seat, w: SeatMetaW): void {
  const m = seat.meta;
  seat.actor.level = w.level;
  m.xp = w.xp; m.xpNeeded = w.xpNeeded;
  m.passivePoints = w.passivePoints;
  // Tolerant of a host one wire-version behind (fields absent from old JSON).
  m.vocationPoints = w.vocationPoints ?? 0;
  m.vocations = [...(w.vocations ?? [])];
  m.baseAttrs = { ...w.baseAttrs };
  m.allocated = new Set(w.allocated);
  // Untrusted wire → the same registry-tolerant rebuild the disk save gets.
  m.choices = sanitizeChoices(w.choices, PASSIVE_NODES, m.allocated);
  m.realmPoints = { ...(w.realmPoints ?? {}) };
  const known = new Map<string, SkillInstance>();
  for (const [id, sw] of Object.entries(w.known)) { const inst = rehydrateSkill(sw); if (inst) known.set(id, inst); }
  m.knownSkills = known;
  // Graft bindings resolve against the freshly rehydrated book + allocation.
  m.grafts = sanitizeGrafts(w.grafts, m.allocated, m.choices, PASSIVE_NODES, id => known.has(id));
  // THE ONE BAG: gear tiles and gem wrappers alike — re-validate every
  // instance (payloads included) against the client's live registries.
  m.items = (w.gear?.items ?? []).map(rebuildAnyItem).filter((x): x is ItemInstance => !!x);
  m.equipped = {};
  for (const [slot, it] of Object.entries(w.gear?.equipped ?? {})) {
    const item = rebuildItem(it);
    if (item) m.equipped[slot] = item;
  }
  // THE CONTAINER FABRIC: every board's seated pieces, re-validated like
  // the doll's (a client whose registry lacks a board keeps the rows — the
  // host is the authority on what sits where).
  m.relicEmpowerment = Number.isFinite(w.gear?.relicEmpowerment) ? Math.max(0, w.gear!.relicEmpowerment!) : 0;
  m.relicEnabled = w.gear?.relicEnabled !== false;
  m.containers = {};
  for (const [cid, held] of Object.entries(w.gear?.containers ?? {})) {
    m.containers[cid] = (held ?? []).map(rebuildItem).filter((x): x is ItemInstance => !!x);
  }
  m.essences = { ...emptyEssences(), ...(w.ess ?? {}) };
  m.abilityEssences = { ...emptyAbilityEssences(), ...(w.abil ?? {}) };
  m.vestiges = { ...(w.vest ?? {}) };
  // Rebuild the action bar from slot ids → the (just-rehydrated) learned
  // instances, or the GRANTED lane (seatSkillById mints a worn grant on
  // demand off the rehydrated gear — THE LEGEND FABRIC), so the client's
  // bar seats a granted skill exactly where the host's does.
  seat.actor.skills = w.bar.map(id => (id ? world.seatSkillById(seat, id) : null));
  // THE STAMPED OPENING: the host's stamp verbatim (an older host ships none —
  // the class's base bar stands in, the pre-stamp reading).
  m.opening = [...(w.op ?? m.classDef.bar)];
  // THE COMPANION STANCES: the host's held choices, registry-sanitized (an
  // older host ships none — every bond reads the default).
  m.stances = sanitizeCompanionStances(w.st);
  world.recalcSeat(seat);            // derive attrs + the full stat sheet from the build
}

/** The full render-state replace a client draws each frame. */
export interface StateSnapshot {
  skillFields?: SkillFieldVisual[];
  satellites?: import('../engine/satellites').SatelliteVisual[];
  guardArts?: import('../engine/guardArts').GuardArtVisual[];
  satelliteFlights?: import('../engine/satelliteFlights').SatelliteFlightVisual[];
  auroras?: import('../engine/auroras').AuroraVisual[];
  guardians?: import('../engine/guardians').GuardianVisual[];
  creepers?: import('../engine/creepers').CreeperVisual[];
  magicPackEffects?: import('../engine/magicPackMechanics').MagicPackVisual[];
  /** Per-owner terrain grants: replicas draw exactly the host's circles. */
  grantedPockets?: { owner: number; pockets: import('../engine/fieldgrants').GrantedPocket[] }[];
  tick: number;
  time: number;
  zoneId: string;
  arena: { w: number; h: number };
  seats: Record<string, SeatW>;
  /** Per-seat build/progression — present ONLY for seats whose meta CHANGED since
   *  the last broadcast (dirty-flagged), so it rides along cheaply. Each client
   *  applies its OWN entry (snap.seatMeta[clientSeatId]). */
  seatMeta?: Record<string, SeatMetaW>;
  /** Brandt's shared vendor stock (host-authoritative) + its restock clock — so a
   *  client renders the SAME list the host will resolve a buyVendor index against. */
  vendor: VendorEntryW[];
  vendorRestockAt: number;
  /** The HOST account's reserve capacity (World.vendorLockCap) — the client
   *  panel draws toggles against the counter's true ledger, not its own. */
  vendorCap?: number;
  memoryAccess?: import('../meta/memoryUnlocks').MemoryAccess;
  /** THE KEEPER'S GATE, mirrored (World.vendorTradeRefusal === null /
   *  vendorGemsOpen): the host's trade-gate + gem-case verdicts, so a client
   *  panel disables and seals with the keeper's own truth. Absent (older
   *  host) reads as open. */
  vendorTradeOpen?: boolean;
  vendorGemsOpen?: boolean;
  /** THE BAG BOARD, shipped: the keeper's bag dims (engine/inventory.ts
   *  bagBoard — base + the host account's expansions), so a client draws
   *  and tests the board the host places on. Absent (older host) = base. */
  bagBoard?: { w: number; h: number };
  /** THE CONTAINER BOARDS, shipped (engine/containers.ts packContainerBoard):
   *  the keeper's live fold per owned side board — a board absent here does
   *  not exist for the run. Absent whole (older host) = no containers. */
  containerBoards?: Record<string, ContainerBoardW>;
  actors: ActorW[];
  projectiles: ProjW[];
  tethers: TetherW[];
  drops: DropW[];
  townPortalViews?: import('../engine/townportal').TownPortalView[];
  orbs: OrbW[];
  texts: TextW[];
  /** THE NOTICE FEED + PICKUP FEED (world/bulletins.ts) — absent from older
   *  hosts reads as empty (the client simply has no news to stack). */
  no?: NoticeW[];
  pfd?: PickupW[];
  flashes: FlashW[];
  recoveryCues?: import('../engine/world').EmergeRecord[];
  /** THE EYECATCH (engine/ultimates.ts) — the live super-art pane, shipped
   *  as ELAPSED seconds (`el`) so client clocks need no shared epoch: the
   *  client re-stamps t0 against its own timeflow age (the tell-wire idiom
   *  — derived scalars, the pane rebuilt from the client's own registry).
   *  Absent = no pane (older hosts read as none). */
  ec?: {
    ci: number; sk: string; st: string; ti: string; sb?: string;
    tn: string; sd: 'ally' | 'enemy'; el: number; ps: number; av?: string;
  };
  deathBursts: DeathBurstW[];
  /** Structure-door states (id → open/broken), present only when any door has
   *  flipped — rides the 20 Hz snapshot so a dropped packet SELF-HEALS on the
   *  next one (the meta-delta lesson: a one-shot door msg is a permanent
   *  desync when the channel hiccups). Clients apply via the shared
   *  setDoorState path (their own grid repaint included). */
  doors?: Record<string, 'open' | 'broken'>;
  /** Opened SECRET HOLLOWS (the hollows fabric) — the same meta-delta lesson
   *  as doors: the 20 Hz repeat converges a client that missed the reveal
   *  (openHollow is idempotent, applied in bare mode: carve + seam splice;
   *  the contents ride the host's own streams). */
  hollows?: string[];
  /** Revealed ANNEX pieces (the composite bound) — the hollows row's twin:
   *  the 20 Hz repeat converges a client that missed a reveal (annexReveal
   *  is idempotent; the geometry shipped with the zone message). */
  annexes?: string[];
  /** LIVE POOLED LIGHTWELLS (engine/lightwells.ts): runtime-spawned light
   *  sources with per-tick power (dim) state. They never ride the one-shot
   *  zone doodad list — this 20 Hz reconcile IS their client existence
   *  (upsert by id, absent = dissipated; the gutter-out flash rides the
   *  ordinary flash stream). Present only while any pooled well stands. */
  wells?: WellW[];
  titans?: TitanScenePiece[];
  /** The current zone's eased GLOOM (the Gloaming) — the client's ambient
   *  darkness, wash, and zone-info read it off the world exactly as the
   *  host's renderer does. Present only while > 0. */
  gloom?: number;
  /** RUNTIME LANE STATE (the track fabric's trapworks levers). `laneArm` =
   *  the complete tag→armed map whenever any TAGGED lane stands (both-ways
   *  toggles need the full map — a reverted flip must still converge);
   *  `laneOnce` = every live ONCE-lane's spec (the loosed boulder, the
   *  volley in flight) — the wells idiom: this 20 Hz reconcile IS their
   *  client existence, absence culls, a dropped packet self-heals. */
  laneArm?: Record<string, 0 | 1>;
  laneOnce?: TrackSpec[];
  /** TRAPWORK states (engine/trapworks.ts): id + armed/sprung + spring
   *  clock, shipped while any mechanism stands — the same idempotent 20 Hz
   *  convergence; an armed→sprung edge replays each effect's MIRROR half
   *  client-side (visuals only; lanes ride laneArm/laneOnce). */
  trapState?: { i: string; s: 0 | 1; t: number }[];
  /** THE LITE TIER's pool draw list (engine/lite.ts): `k` = kind table
   *  (MonsterDef ids), `b` = flat (kindIdx, x, y) triples. Present only
   *  while the host's pool holds bodies; the client renders it verbatim
   *  (World.liteWire) — host-authoritative, self-healing at 20 Hz. */
  lt?: { k: string[]; b: number[] };
  /** THE RAMPAGE FABRIC's felled set (engine/rampage.ts): position-keyed
   *  (doodad positions are seed-shared and immutable — splice-proof where
   *  indices are not) with the host-resolved stand-up progress `p` (-1 =
   *  crushed flat, 0..1 = the regrow swell). The wells idiom throughout:
   *  this 20 Hz reconcile IS the client's felled truth (absence = standing),
   *  the stamped `p` drives both the guest's drawn face (fellFace) and its
   *  predicted collision (the blocking trio reads Doodad.felled), and a
   *  dropped packet self-heals on the next beat. Present only while any
   *  piece lies crushed — the whole-ground common case ships zero bytes. */
  fell?: { x: number; y: number; p: number }[];
  /** THE EVAPORATING GROUND's drying set (World.updateEvaporation): position-
   *  keyed rows shipping the host-resolved DERIVED draw scalar — the radius,
   *  the fabric's one truth — for every doodad mid-dry (rubble pocks, weather
   *  dress, creep wakes, blast pocks). The wells idiom throughout: this 20 Hz
   *  reconcile IS the client's drying truth — a listed row restates radius
   *  (and MINTS a runtime-planted piece the one-shot zone list never carried),
   *  a TRACKED row's disappearance retires the piece (the host spliced it
   *  dry), and a dropped packet self-heals on the next beat. Clients never
   *  run the sweep — they draw what the wire says. Present only while ground
   *  dries: the whole-ground common case ships zero bytes (absent == the
   *  pre-evap wire, byte for byte). */
  ev?: EvapW[];
  /** THE ENTRY FREEZE's mid-visit wire (World.freezeStandingWater): 1 while a
   *  Deepwinter front holds the host's zone. Join/entry guests already meet
   *  frozen KINDS on the one-shot zone list (the host materializes before
   *  serving) — this bit reaches the guest who was STANDING in the zone when
   *  the marching front swallowed it: the client runs the SAME registry swap
   *  over its own replicated list (idempotent by the same scan memo, so the
   *  20 Hz repeat is free). ABSENCE NEVER THAWS — the host has no unfreeze
   *  pass either; on both sides the only thaw road is the next zone (re)apply
   *  minting ordinary water (transience by construction). Absent while no
   *  front holds — the common case ships zero bytes. */
  dwf?: 1;
}

/** One drying doodad on the wire: position key, current radius (the derived
 *  draw scalar — quantized host-side by the sweep itself), kind + shallow so
 *  a client can mint a piece planted after its join (the wells push lane). */
export interface EvapW { x: number; y: number; r: number; k: string; s?: 1 }

/** One live pooled lightwell: id, kind, pos, doodad radius, power fraction. */
export interface WellW { i: number; k: string; x: number; y: number; r: number; pf: number; }

const v2 = (p: { x: number; y: number }): Vec2W => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100];

function actorToW(a: Actor, world: World): ActorW {
  const inv = a.sheet.get('invisible');
  const det = a.sheet.get('detectability');
  const w: ActorW = {
    id: a.id, p: v2(a.pos), f: a.facing, r: a.radius, c: a.color, sh: a.shape,
    team: a.team, name: a.name,
    life: Math.max(0, Math.round(a.life)), maxLife: Math.round(a.maxLife()),
    es: Math.round(a.es), maxEs: Math.round(a.maxEs()),
    hf: a.hitFlash, downed: a.downed, dead: a.dead, mn: a.isMinion(), passive: a.passive, ut: a.untargetable,
    summonReform: a.summonReform ? [a.summonReform.remaining, a.summonReform.duration] : undefined,
  };
  if (inv > 0) w.inv = inv;
  if (a.movementTether && !a.movementTether.released) w.movementTether = {
    ...a.movementTether, point: { ...a.movementTether.point }, safe: { ...a.movementTether.safe },
  };
  if (det !== 1) w.det = det;
  if (a.sheet.get('concealment') > 0) w.concealment = a.sheet.get('concealment');
  if (a.concealmentExposedUntil > world.time) w.concealmentExposedUntil = a.concealmentExposedUntil;
  if (!a.aims) w.aims = false;
  // THE THRONG's husk marker rides the wire so a co-op client's renderer
  // sight-gates against ITS OWN bar (engine/throng.ts).
  if (a.throngWild) w.tw = a.throngWild;
  if (a.throngUnits) w.thu = a.throngUnits;
  const throngAnchors = a.skills.filter(s => s?.def.throng);
  if (throngAnchors.length) w.thr = Object.fromEntries(throngAnchors.map(s => [s!.def.id, world.throngRosterCount(a, s!)]));
  if (a.throngEgg) w.the = a.throngEgg;
  if (a.hivecallHud) w.hive = a.hivecallHud;
  if (a.assaultHud) w.assault = a.assaultHud;
  if (a.assaultOrbit) w.assaultOrbit = true;
  if (a.assaultAura) w.assaultAura = true;
  const throngEvolutionGauges = a.skills.filter(s => s?.state?.throngEvolutionGauge !== undefined);
  if (throngEvolutionGauges.length) w.thg = Object.fromEntries(throngEvolutionGauges.map(s => [s!.def.id, s!.state!.throngEvolutionGauge!]));
  // THE GRAB FABRIC's held meter (engine/grab.ts): computed off the LIVE
  // pair on the holder, shipped on the held body's own row.
  const gbHold = GRAB_HUD_OF(a);
  if (gbHold) w.gb = gbHold;
  // THE PLY FABRIC's pips (engine/plies.ts).
  if (a.pliesMax > 0) { w.pl = a.plies; w.plm = a.pliesMax; }
  // THE TELL FABRIC (engine/tells.ts): derived scalars + the variant roll.
  if (a.tellSpecs?.length) {
    if (a.brainVariant !== undefined) w.bv = a.brainVariant;
    if (a.tells?.some(v => v > 0)) w.tl = a.tells;
  }
  // THE PACK LAYER's drawn bond (engine/pack.ts): the HOLDER whose mods this
  // body wears, shipped as the host's actor id and re-pointed client-side
  // through the same pool the snapshot already keys on. We ship the holder
  // rather than the derived line so the client runs the IDENTICAL link
  // derivation over its OWN interpolated positions — the link then tracks
  // smoothly between moving bodies instead of snapping at 20 Hz, and host
  // and client cannot draw different structures.
  if (a.bondHeld && a.bondFrom && !a.bondFrom.dead) w.bl = a.bondFrom.id;
  // THE WATCH FABRIC (engine/watch.ts): the stamped sense + the ladder,
  // quantized to the wire grid — the client draws the same fan from the
  // same numbers (never the suspicion sources).
  if (a.watch && a.senseDetect > 0) {
    w.wp = [
      Math.round(a.senseDetect),
      Math.round(a.senseArcHalf * 1000) / 1000,
      Math.round(a.senseRearMul * 1000) / 1000,
      a.senseAlerted ? 1 : 0,
      Math.round(WATCH_V_OF(a) * 1000) / 1000,
    ];
  }
  // THE TIER FABRIC's layer (engine/tiers.ts) — clients gate draw + veil on it.
  if (a.tier) w.tr = a.tier;
  if (a.wane > 0) w.wn = Math.round(a.wane * 100) / 100;
  w.bodyActionPose = bodyActionPoseOf(a, world.time);
  w.bodyWalkPose = bodyWalkPoseOf(a, world.time);
  if (a.kind === 'player') { const s = SEAT_OF(a); if (s) w.seat = s; }
  if (a.adorn) w.adorn = a.adorn;
  if (a.material) w.mat = a.material;
  if (a.look) w.lk = a.look;
  if (a.extraParts?.length) w.ep = a.extraParts;
  if (a.rarity) w.rarity = a.rarity;
  if (a.magicPack) w.magicPack = { ...a.magicPack, runtime: undefined };
  w.encounterCue = encounterCueOf(a, world);
  if (a.kind === 'player' && a.statuses.length) w.afflictionPressure = afflictionPressureOf(a);
  const armedCues = armedStatusCues(a);
  if (armedCues.length) w.armedCues = armedCues.map(cue => ({ ...cue }));
  w.reactiveCue = reactiveCueOf(a, world.time);
  const selfBanks = selfBankCuesOf(a, world.time);
  if (a.presenceBadge) w.presenceBadge = { ...a.presenceBadge };
  if (selfBanks.length) w.selfBankCues = selfBanks.map(row => ({ ...row }));
  const poolCues = poolCueRows(a);
  if (poolCues.length) w.poolCues = poolCues;
  const payloadCues = payloadCueRows(a, world);
  if (payloadCues.length) w.payloadCues = payloadCues;
  const procCues = procCueRows(a);
  if (procCues.length) w.procCues = procCues.map(row => ({ ...row }));
  const anatomyState = anatomyCueState(a);
  const feedingCues = feedingCueState(a);
  const companionCues = companionCueState(a, world);
  if (companionCues.links.length || companionCues.marks.length || companionCues.stance) w.companionCues = cloneCompanionCues(companionCues);
  if (feedingCues.gains.length || feedingCues.flows?.length || feedingCues.meal || feedingCues.mass) w.feedingCues = cloneFeedingCues(feedingCues);
  if (anatomyState.weakpoints.length || anatomyState.parts.length || anatomyState.segments.length || anatomyState.part)
    w.anatomyCues = cloneAnatomyCues(anatomyState);
  if (wardCueActive(a)) w.wardCue = { profile: a.wardCueProfile, sources: wardGuardians(a, world.actors).map(x => x.id) };
  if (a.encounterGroup) w.encounterGroup = { ...a.encounterGroup };
  if (a.encounterOrder) {
    const {group,recipe,plan,leader,phase,until}=a.encounterOrder;
    w.encounterOrder={group,recipe,plan,leader,phase,until};
  }
  if (a.magicPackRole) w.magicPackRole = a.magicPackRole;
  if (a.magicPackDonors) w.magicPackDonors = a.magicPackDonors;
  if (a.magicPackPending) w.magicPackPending = a.magicPackPending;
  if (a.magicPackFrom && !a.magicPackFrom.dead) w.magicPackFrom = a.magicPackFrom.id;
  if (a.magicPackPower) w.magicPackPower = a.magicPackPower;
  if (a.defId) w.defId = a.defId;
  if (a.isMinion()) w.cosmeticSourceSkill = cosmeticSummonSkill(a);
  if (a.summonShell) w.ss = { ...a.summonShell };
  if (a.shellGuard) w.sg = { ...a.shellGuard, breathe: a.shellGuard.breathe ? { ...a.shellGuard.breathe } : undefined };
  if (a.poiseBroken) w.pb = true;
  if (a.faction) w.faction = a.faction;
  // THE BOSS BAR row rides the wire host-computed (clients have no brain
  // to derive pips from, and the policy must not fork): see BOSS_BAR_OF.
  const bb = BOSS_BAR_OF(a);
  if (bb) w.bb = [bb.pips, bb.lit, bb.hl ? 1 : 0];
  // comboCueRows also carries enemy/companion completion, with no client cast simulation.
  const comboCues = comboCueRows(a, world.time);
  if (comboCues.length) w.cb = comboCues.map(row => [row.id, row.lit, row.len, Math.round(row.glow * 100) / 100]);
  // Player bar readouts the host owns: banked runes (comboCueRows lives above).
  if (a.kind === 'player') {
    if (a.runes.length) w.rn = a.runes.slice();
    // THE PRIMED POUR's glints (pourPrime) — ids only, the runes idiom.
    if (a.primedPours.length) w.pp = a.primedPours.map(e => e.skillId);
    w.fq = flaskChargeBanks(a);
    if (a.mimicBank?.length) {
      w.mk = a.mimicBank.map(e => [e.sid, e.src] as [string, string]);
      if (a.mimicSel) w.ms = a.mimicSel;
    }
  }
  if (a.absorbTotal > 0) w.ab = Math.round(a.absorbTotal);
  if (a.statuses.length) {
    w.st = a.statuses.map(s => ({
      rem: s.remaining, statusDuration: s.statusDuration ?? s.total, id: s.id, stacks: s.stacks,
      ...(s.dps > 0 ? { dot: 1 as const } : {}),
      ...(s.bankFrac !== undefined ? { bk: Math.round(s.bankFrac * 100) / 100 } : {}) }));
  }
  if (a.casting) {
    const cs = a.casting;
    const cw: CastW = { c: cs.inst.def.color, mode: cs.mode, total: cs.total, elapsed: cs.elapsed };
    if (a.kind === 'player') cw.sk = cs.inst.def.id;
    const fg = foresightRowOf(a, cs);
    if (fg) cw.fg = fg;
    cw.meleeReach = meleeReachCueOf(a);
    // THE VENT-RIDE's broil rides the cast wire (the client draws the roil).
    const cd = cs.inst.def.delivery;
    if (cd.type === 'leap' && cd.vent) cw.vent = cd.vent.columnR;
    if (cs.pulseTimer !== undefined) cw.pulseTimer = cs.pulseTimer;
    if (cs.shield !== undefined) cw.shield = cs.shield;
    if (cs.maxShield !== undefined) cw.maxShield = cs.maxShield;
    if (cs.indicatorAt !== undefined) cw.indicatorAt = cs.indicatorAt;
    if (cs.presses !== undefined) cw.presses = cs.presses;
    if (cs.channelTime !== undefined) cw.channelTime = cs.channelTime;
    if (cs.mode === 'guard') cw.parryCue = parryCueStrength(a);
    cw.guardReleaseCue = guardReleaseCue(a, world.time);
    cw.castingCompletion = castingCompletion(a);
    cw.castingCue = castingCueOf(a);
    cw.focusBroken = cs.focusBroken;
    if (cs.mode === 'guard' && cs.inst.def.guard) cw.guardArc = guardArcRadians(a) * 180 / Math.PI;
    if (cs.bashAt !== undefined) cw.bashAt = cs.bashAt;
    if (cs.bashLow) cw.bashLow = true;
    if (cs.bashArmAt !== undefined) cw.bashArmAt = cs.bashArmAt;
    w.cast = cw;
  }
  if (a.activeAuras.size) {
    w.auras = [...a.activeAuras.values()].map(au => ({ skillId: au.inst.def.id,
      c: cosmeticSkillPaint(world, a, au.inst.def.id).color ?? au.inst.def.color, r: au.radius, sh: au.shape }));
  }
  if (a.construct) w.con = { kind: a.construct.kind, domeRadius: a.construct.domeRadius };
  if (a.fuse !== undefined) w.fuse = a.fuse;
  if (a.leap) {
    w.leap = a.leap.vent
      ? { timer: a.leap.timer, total: a.leap.total, vent: a.leap.vent.columnR }
      : { timer: a.leap.timer, total: a.leap.total };
  }
  if (a.worm) {
    w.worm = { seg: a.worm.segments.map(v2), taper: a.worm.taper };
    // SEGMENT FABRIC: hittable/torn/flash state rides only while present.
    if (a.worm.hittable) w.worm.ht = 1;
    if (a.worm.wounded?.some(t => t)) {
      let bits = 0;
      a.worm.wounded.forEach((t, i) => { if (t && i < 30) bits |= (1 << i); });
      w.worm.wd = bits;
    }
    if (a.worm.flash?.some(f => f > 0)) {
      w.worm.sf = a.worm.flash.map(f => Math.round(f * 100) / 100);
    }
  }
  return w;
}

// Set per-serialize so actorToW can tag player actors with their seat id.
let SEAT_OF: (a: Actor) => string | undefined = () => undefined;
// Set per-serialize so actorToW ships the host's boss-bar read (one policy —
// World.bossBarInfo — for the local renderer and every client alike).
let BOSS_BAR_OF: (a: Actor) => { pips: number; lit: number; hl: boolean } | null = () => null;
// Set per-serialize: the grab fabric's held-meter row for a HELD body
// (engine/grab.ts — pair state lives host-side only; the same bar the
// host renderer draws off the live pair).
let GRAB_HUD_OF: (a: Actor) => [string, number] | null = () => null;
// Set per-serialize: the watch fabric's ladder read at the host clock
// (engine/watch.ts — suspicion decay is a function of world.time, which
// actorToW does not otherwise carry).
let WATCH_V_OF: (a: Actor) => number = () => 0;

export function serializeSnapshot(world: World, tick: number): StateSnapshot {
  const seatById = new Map<Actor, string>();
  for (const s of world.seats) seatById.set(s.actor, s.id);
  SEAT_OF = (a) => seatById.get(a);
  BOSS_BAR_OF = (a) => world.bossBarInfo(a);
  GRAB_HUD_OF = (a) => {
    if (a.heldBy === undefined) return null;
    const hold = world.actors.find(h => h.id === a.heldBy)?.gripping;
    if (!hold || hold.id !== a.id) return null;
    return [GRAB_VERB_LABEL[hold.verb], Math.round(Math.min(1, hold.struggle) * 100) / 100];
  };
  WATCH_V_OF = (a) => (a.watch ? watchValueOf(a, a.watch, world.time) : 0);

  const seats: Record<string, SeatW> = {};
  for (const s of world.seats) seats[s.id] = seatW(s, world);

  // META: ship a seat's build only when it CHANGED (level/pickup/mutation marked
  // it dirty). The host clears world.metaDirty after the broadcast (main.ts).
  let seatMeta: Record<string, SeatMetaW> | undefined;
  if (world.metaDirty.size) {
    seatMeta = {};
    for (const s of world.seats) if (world.metaDirty.has(s.id)) seatMeta[s.id] = serializeSeatMeta(s);
  }

  return {
    tick, time: world.time, zoneId: world.zone.id,
    magicPackEffects: world.magicPackEffects.map(v => ({ ...v })),
    satellites: world.satellites.visuals.map(v => ({ ...v })),
    guardArts: world.guardArts.visuals.map(v => ({ ...v })),
    auroras: world.auroras.visuals.map(v => ({ ...v })),
    guardians: world.guardians.visuals.map(v => ({ ...v })),
    creepers: world.creepers.visuals.map(v => ({ ...v, trail: v.trail.map(p => ({ ...p })) })),
    satelliteFlights: world.satellites.flights.visuals.map(v => ({ ...v, from: { ...v.from }, to: { ...v.to } })),
    grantedPockets: (() => {
      const rows = world.seats.map(s => ({ owner: s.actor.id, pockets: world.grantedPocketsFor(s.actor) }))
        .filter(r => r.pockets.length);
      return rows.length ? rows : undefined;
    })(),
    arena: { w: world.arena.w, h: world.arena.h },
    seats, seatMeta,
    vendor: world.vendorStock.map(e => vendorEntryW(e, world)), vendorRestockAt: world.vendorRestockAt,
    vendorCap: world.vendorLockCap(),
    memoryAccess: memoryAccessView(world.account),
    vendorTradeOpen: world.vendorTradeRefusal() === null,
    vendorGemsOpen: world.vendorGemsOpen(),
    bagBoard: bagBoard(),
    containerBoards: Object.fromEntries(containerList().flatMap(c => {
      const b = containerBoard(c);
      return b ? [[c.id, packContainerBoard(b)] as const] : [];
    })),
    actors: world.actors.filter(a => !a.dead || a.isPlayerKind()).map(a => ({ ...actorToW(a, world), cosmeticKind: a.cosmeticKind, cosmeticLoadout: cosmeticLoadoutFor(world, a) })),
    skillFields: world.zones.map(z => skillFieldVisual(z, world.time)),
    projectiles: world.projectiles.map(p => ({ skillId: p.inst?.def.id ?? p.skillVisualId, reflectedCue: p.parryDamage ? true : undefined, orbPaint: p.orbPaint ? { ...p.orbPaint } : undefined, p: v2(p.pos), d: p.dir, r: p.radius, c: p.color, sh: p.shape, a: p.age, cosmeticMotif: p.cosmeticMotif, cosmeticProjectile: p.cosmeticProjectile })),
    tethers: world.tethers.map(t => {
      const v = skillTetherVisual(t);
      return { ax: Math.round(v.ax), ay: Math.round(v.ay), bx: Math.round(v.bx), by: Math.round(v.by), c: v.color, w: v.width,
        voice: v.voice, skillId: v.skillId, age: v.age, fade: v.fade, fromTier: v.fromTier, toTier: v.toTier };
    }),
    townPortalViews: world.townPortalViews(),
    drops: world.drops.map(d => ({
      p: v2(d.pos), bob: d.bob, kind: d.item.kind,
      color: d.item.kind === 'support' ? d.item.gem.def.color
        : d.item.kind === 'gear' ? ITEM_RARITIES[d.item.item.rarity].color
        : d.item.kind === 'vestige' ? (VESTIGES[d.item.id]?.color ?? '#b06bd4')
        : d.item.kind === 'essence' ? ESSENCES[d.item.essence].color
        : d.item.kind === 'abilityEssence' ? abilityEssenceOfTier(d.item.tier).color
        : d.item.inst.def.color,
      rarity: d.item.kind === 'skill' ? (d.item.inst.rarity ?? 'common')
        : d.item.kind === 'gear' ? d.item.item.rarity : undefined,
      name: d.item.kind === 'gear' ? d.item.item.name
        : d.item.kind === 'skill' ? skillInstanceName(d.item.inst)
        : d.item.kind === 'support' ? d.item.gem.def.name : undefined,
      baseId: d.item.kind === 'gear' ? d.item.item.baseId : undefined,
      vid: d.item.kind === 'vestige' ? d.item.id : undefined,
      eid: d.item.kind === 'essence' ? d.item.essence : undefined,
      tid: d.item.kind === 'abilityEssence' ? d.item.tier : undefined,
      cnt: d.item.kind === 'essence' || d.item.kind === 'abilityEssence' ? d.item.count : undefined,
    })),
    orbs: world.orbs.map(o => ({ p: v2(o.pos), bob: o.bob, life: o.life, kind: o.kind, tier: o.tier,
      flowFromTier: o.flowFromTier,
      flowTo: o.homeTo && !o.homeTo.dead ? v2(o.homeTo.pos) : undefined,
      flowTier: o.homeTo && !o.homeTo.dead ? o.homeTo.tier ?? 0 : undefined })),
    texts: world.texts.map(t => ({ p: v2(t.pos), life: t.life, maxLife: t.maxLife, size: t.size, color: t.color, text: t.text, k: t.kind })),
    no: world.notices.map(n => ({ text: n.text, color: n.color, size: n.size, ch: n.channel, born: n.bornAt })),
    pfd: world.pickupFeed.map(e => ({ s: e.seatId, l: e.label, c: e.color, n: e.count, born: e.bornAt })),
    recoveryCues: world.emergences.filter(e => e.recoveryCueTier !== undefined && e.life > 0).map(cloneRecoveryCue),
    flashes: world.flashes.map(f => ({ combatCue: f.combatCue ? { ...f.combatCue } : undefined, p: v2(f.pos), radius: f.radius, color: f.color, life: f.life, maxLife: f.maxLife,
      shape: f.shape, facing: f.facing, arcRad: f.arcRad, lightning: cloneLightningTrace(f.lightning), movement: cloneMovementTrail(f.movement), edgeFrac: f.edgeFrac, arc: f.arc && { ...f.arc }, beam: f.beam,
      feedingCue: f.feedingCue ? { ...f.feedingCue, to: { ...f.feedingCue.to } } : undefined,
      companionCue: f.companionCue ? { ...f.companionCue, from: f.companionCue.from && { ...f.companionCue.from } } : undefined,
      recoveryCueTier: f.recoveryCueTier,
      defenseCue: f.defenseCue ? { ...f.defenseCue } : undefined, fx: f.fx, onGround: f.onGround?.slice(), cosmeticMotif: f.cosmeticMotif, departure: f.departure, bolt: f.bolt || undefined, meteor: f.meteor || undefined })),
    ec: world.eyecatch
      && eyecatchElapsed(world.eyecatch, world.timeflow.age) < world.eyecatch.paneSec
      ? {
        ci: world.eyecatch.casterId, sk: world.eyecatch.skillId,
        st: world.eyecatch.style, ti: world.eyecatch.title, sb: world.eyecatch.sub,
        tn: world.eyecatch.tint, sd: world.eyecatch.side,
        el: Math.round(eyecatchElapsed(world.eyecatch, world.timeflow.age) * 1000) / 1000,
        ps: world.eyecatch.paneSec, av: world.eyecatch.avatarDefId,
      }
      : undefined,
    deathBursts: world.deathBurstsView().map(b => ({
      p: v2(b.pos), ph: (b.phase === 'gather' ? 0 : 1) as 0 | 1, r: b.radius, c: b.color,
      arm: (b.arming ? 1 : 0) as 0 | 1, t: Math.round(b.t * 100) / 100, co: b.coalesce, trail: b.trail.map(v2),
      tm: b.team,
    })),
    doors: doorStatesOf(world),
    hollows: world.openedHollows.size ? [...world.openedHollows] : undefined,
    annexes: world.annexOpen.size ? [...world.annexOpen] : undefined,
    wells: wellsOf(world),
    titans: world.titans.scene(),
    gloom: world.gloom() > 0.005 ? Math.round(world.gloom() * 1000) / 1000 : undefined,
    laneArm: laneArmOf(world),
    laneOnce: laneOnceOf(world),
    trapState: world.trapworks.length
      ? world.trapworks.map(tw => ({ i: tw.id, s: (tw.state === 'sprung' ? 1 : 0) as 0 | 1, t: Math.round(tw.sprungAt * 100) / 100 }))
      : undefined,
    lt: liteOf(world),
    fell: fellOf(world),
    ev: evapOf(world),
    dwf: world.frostHeld() ? 1 : undefined,
  };
}

/** The rampage fabric's felled rows (undefined while the ground stands whole
 *  — the common case). Progress is resolved host-side so guests need no
 *  clock agreement: they draw and test the shipped fraction verbatim. */
function fellOf(world: World): { x: number; y: number; p: number }[] | undefined {
  if (!world.rampageActive()) return undefined;
  let out: { x: number; y: number; p: number }[] | undefined;
  for (const d of world.doodads) {
    if (!d.felled) continue;
    (out ??= []).push({
      x: Math.round(d.pos.x), y: Math.round(d.pos.y),
      p: Math.round(fellProgress(d.felled, world.time) * 1000) / 1000,
    });
  }
  return out;
}

/** THE EVAPORATING GROUND's drying rows (undefined while nothing dries — the
 *  common case, zero bytes). The radius is resolved HOST-side by the sweep
 *  (quantized contraction — the fabric's one truth), so guests draw the
 *  shipped number verbatim and never run the sweep themselves. `k`/`s` ride
 *  along so a piece planted AFTER a client's join (a rubble pock, a creep
 *  wake, weather dress) can mint client-side — the zone list only ships once.
 *  Pooled wells are excluded: they ride the wells channel exclusively (the
 *  serializeZone precedent — one driver per doodad). */
function evapOf(world: World): EvapW[] | undefined {
  let out: EvapW[] | undefined;
  for (const d of world.doodads) {
    if (!d.evap || d.gone || d.well) continue;
    (out ??= []).push({
      x: Math.round(d.pos.x), y: Math.round(d.pos.y),
      r: Math.round(d.radius * 10) / 10, k: d.kind,
      ...(d.shallow ? { s: 1 as const } : {}),
    });
  }
  return out;
}

/** THE LITE TIER's draw list (engine/lite.ts): a kind table + flat rounded
 *  (kindIdx, x, y) triples — positions only, the wells idiom (this 20 Hz
 *  reconcile IS the pool's client existence; a dropped packet self-heals).
 *  Undefined while the pool is empty (the common case ships zero bytes). */
function liteOf(world: World): { k: string[]; b: number[] } | undefined {
  const pool = world.lite;
  if (!pool.liveCount) return undefined;
  const k = world.liteKinds.map(x => x.defId);
  const b: number[] = [];
  for (let i = 0; i < pool.used; i++) {
    if (!pool.alive[i]) continue;
    b.push(pool.kind[i], Math.round(pool.x[i]), Math.round(pool.y[i]));
  }
  return { k, b };
}

/** The complete tag→armed map (undefined when no tagged lane stands). The
 *  FULL map ships — trapworks toggles run both ways, so a lane flipped back
 *  to its authored state must still converge on the client. */
function laneArmOf(world: World): Record<string, 0 | 1> | undefined {
  let out: Record<string, 0 | 1> | undefined;
  for (const tr of world.tracks) {
    if (!tr.spec.tag) continue;
    (out ??= {})[tr.spec.tag] = tr.armed ? 1 : 0;   // tags flip in lockstep (setTracksArmed)
  }
  return out;
}

/** Every live once-lane spec (undefined when none — the common case). */
function laneOnceOf(world: World): TrackSpec[] | undefined {
  let out: TrackSpec[] | undefined;
  for (const tr of world.tracks) {
    if (tr.spec.mode === 'once') (out ??= []).push(tr.spec);
  }
  return out;
}

/** Live pooled lightwells (undefined when none stand — the common case). */
function wellsOf(world: World): WellW[] | undefined {
  let out: WellW[] | undefined;
  for (const d of world.lightwellDoodads()) {
    if (!d.well) continue;
    (out ??= []).push({
      i: d.well.id, k: d.kind, x: Math.round(d.pos.x), y: Math.round(d.pos.y),
      r: Math.round(d.radius * 10) / 10,
      pf: Math.round((d.well.max > 0 ? d.well.power / d.well.max : 0) * 1000) / 1000,
    });
  }
  return out;
}

/** Live structure-door states (id → state), or undefined when every door in the
 *  zone is still pristine (the common case ships zero bytes). */
function doorStatesOf(world: World): Record<string, 'open' | 'broken'> | undefined {
  let out: Record<string, 'open' | 'broken'> | undefined;
  for (const d of world.doodads) {
    if (!d.door || (!d.door.open && !d.door.broken)) continue;
    (out ??= {})[d.door.id] = d.door.broken ? 'broken' : 'open';
  }
  return out;
}

function seatW(s: Seat, world: World): SeatW {
  const a = s.actor;
  const seq = world.lastInputSeq.get(s.id);
  const surv = survivalOf(a);
  return {
    pos: v2(a.pos),
    life: Math.max(0, Math.round(a.life)), maxLife: Math.round(a.maxLife()),
    mana: Math.max(0, Math.round(a.mana)), maxMana: Math.round(a.maxMana()),
    es: Math.round(a.es), maxEs: Math.round(a.maxEs()),
    dead: a.dead, downed: a.downed,
    ...(seq !== undefined ? { seq } : {}),
    ...(world.movementLocked(a) ? { rooted: true } : {}),
    ...(a.sheet.get('traction') < 0.999 ? { slippery: true } : {}),
    ...(surv ? { survival: surv } : {}),
  };
}

/** Below-max survival rows (undefined when none — full meters ship nothing). */
function survivalOf(a: Actor): Record<string, number> | undefined {
  if (!a.survival) return undefined;
  let out: Record<string, number> | undefined;
  for (const [res, v] of a.survival) {
    (out ??= {})[res] = Math.round(v * 10) / 10;
  }
  return out;
}

// ----------------------------------------------------------- apply (client) --
// Pool reconstructed actors by id across frames to limit GC churn.
const POOL = new Map<number, Actor>();
/** A shared stand-in owner so reconstructed minions report isMinion()===true. */
let MINION_OWNER: Actor | null = null;

/** Shortest-arc angle interpolation (facing wraps around ±π). */
function angLerp(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** CLIENT-SIDE drying ledger (the evap wire): position key → the LOCAL doodad
 *  mid-dry, per render-only guest world. Wire-scoped state, so it lives here
 *  rather than on World: a row's first arrival marks the piece TRACKED (adopt
 *  the standing doodad on the key, else mint it), and a tracked key's
 *  disappearance is the retire signal — the host's sweep spliced it dry (evap
 *  is never cancelled: the one `delete d.evap` in the engine is the terminal
 *  splice). Only ever touches pieces it saw drying, so an evap-less doodad
 *  can never be retired by absence. Keyed to the applied zone: a hop drops
 *  the ledger whole (stale keys can never retire a fresh zone's ground). */
const EVAP_LEDGER = new WeakMap<World, { zone: string | null; byKey: Map<string, Doodad> }>();

/** Converge the client's drying ground on the host's rows (the wells idiom —
 *  mint/restate/retire; idempotent, self-healing at 20 Hz). A free function,
 *  not a World method: everything it needs is public (doodads,
 *  markDoodadsChanged, rebuildClientTerrain), and the sweep itself stays
 *  host-only — no client doodad ever wears `evap`, so even a ticking guest
 *  world has an empty evaporation membership by construction. */
function applyNetEvap(world: World, rows: readonly EvapW[] | undefined): void {
  let led = EVAP_LEDGER.get(world);
  if (led && led.zone !== world.appliedZoneId) led = undefined; // zone hopped — old ledger is dead
  if (!led && !rows?.length) return;                            // nothing drying, nothing tracked
  if (!led) {
    led = { zone: world.appliedZoneId, byKey: new Map() };
    EVAP_LEDGER.set(world, led);
  }
  const key = (x: number, y: number): string => `${Math.round(x)},${Math.round(y)}`;
  const listed = new Set<string>();
  let membership = false;
  for (const row of rows ?? []) {
    const kk = key(row.x, row.y);
    listed.add(kk);
    let d = led.byKey.get(kk);
    if (!d) {
      // First sight: adopt the standing doodad on the key (a zone-listed
      // piece handed to evap — weather dress, a shipped pool), else MINT it
      // (planted after this client's join: rubble, a creep wake).
      d = world.doodads.find(x => !x.well && x.kind === row.k
        && Math.abs(x.pos.x - row.x) < 1.5 && Math.abs(x.pos.y - row.y) < 1.5);
      if (!d) {
        d = { pos: { x: row.x, y: row.y }, radius: row.r, kind: row.k as Doodad['kind'], ...(row.s ? { shallow: true } : {}) };
        world.doodads.push(d);
        membership = true;
      }
      led.byKey.set(kk, d);
    }
    if (d.radius !== row.r) {
      d.radius = row.r;
      world.markDoodadsChanged(d); // in-place radius edit — only this piece's families re-derive
    }
  }
  // The retire half: a TRACKED key gone from the wire means the host's sweep
  // spliced the piece dry — splice it here too (ground lists re-derive below).
  for (const [kk, d] of led.byKey) {
    if (listed.has(kk)) continue;
    led.byKey.delete(kk);
    const di = world.doodads.indexOf(d);
    if (di !== -1) { world.doodads.splice(di, 1); membership = true; }
  }
  // Membership moved (a mint or a splice): the bridge/ground collision lists
  // are derived from the doodad list — re-derive so a minted pool wades and a
  // retired one stops (the applyZone precedent; family caches ride the
  // length key and need nothing).
  if (membership) world.rebuildClientTerrain();
}

/** Apply a host snapshot onto a render-only client World (no sim runs). Rebuilds
 *  the entity arrays the renderer iterates; re-installs the StatSheet bases the
 *  renderer reads so maxLife()/invisible/detectability/casting work unchanged.
 *  When `prev` + `alpha` (0..1) are given, actor POSITIONS/facing are interpolated
 *  prev→snap for smooth motion between 20 Hz snapshots (everything else uses snap). */
export function applySnapshot(world: World, snap: StateSnapshot, prev?: StateSnapshot | null, alpha = 1): void {
  if (!world.appliedZoneId || snap.zoneId === world.appliedZoneId) {
    world.syncedGrantedPockets = Object.fromEntries((snap.grantedPockets ?? []).map(r => [r.owner, r.pockets]));
  }
  // The shared clock interpolates exactly like actor positions do: every
  // time-driven read on the client — painter sway, projectile form phase,
  // TRACK RIDER POSES (trackPose is a pure function of this clock) — glides
  // at render rate instead of stepping at the 20 Hz wire. Monotonic: alpha
  // walks prev.time → snap.time, and snapshots only move forward.
  world.time = prev && alpha < 1 ? prev.time + (snap.time - prev.time) * alpha : snap.time;
  world.arena.w = snap.arena.w;
  world.arena.h = snap.arena.h;

  // Structure doors: converge on the host's states through the SAME gate the
  // host used (client-side collision flip + grid repaint). Idempotent, so the
  // 20 Hz repeat is free; a missed packet heals on the next. Guarded on zone
  // identity: in the frames between applyZone(B) and the first zone-B
  // snapshot, a stale zone-A snapshot must not flip zone B's same-id doors.
  if (snap.doors && (!world.appliedZoneId || snap.zoneId === world.appliedZoneId)) {
    for (const [id, st] of Object.entries(snap.doors)) {
      world.setDoorState(id, st, { silent: true });
    }
  }
  // Secret hollows converge the same way (same zone-identity guard): the
  // client re-carves through the shared openHollow path in bare mode —
  // idempotent, so the 20 Hz repeat is free and a missed packet self-heals.
  if (snap.hollows && (!world.appliedZoneId || snap.zoneId === world.appliedZoneId)) {
    for (const id of snap.hollows) {
      world.openHollow(id, null, { silent: true, bare: true });
    }
  }
  // Revealed ANNEX pieces converge the same way (idempotent, zone-guarded):
  // the client's union — prediction clamp, nav, drawn face — joins the piece
  // the moment the row lands, however many packets it missed. BARE mode (the
  // openHollow law): carve + face dress only — furnish contents arrive on
  // the host's own doodad/actor streams.
  if (snap.annexes && (!world.appliedZoneId || snap.zoneId === world.appliedZoneId)) {
    for (const id of snap.annexes) world.annexReveal(id, { silent: true, bare: true });
  }
  // Runtime LANE state (trapworks levers): reconcile tagged arm flips + live
  // once-lanes every snapshot (undefined laneOnce truly means none stand —
  // the cull half of the wells idiom). Same zone-identity guard.
  if (!world.appliedZoneId || snap.zoneId === world.appliedZoneId) {
    world.setNetLaneState(snap.laneArm, snap.laneOnce);
    world.setNetTrapState(snap.trapState);
  }
  // Live pooled LIGHTWELLS + the zone's gloom (the Gloaming): converge the
  // local doodad list on the host's wells (upsert by id, absent = gone) and
  // hand the eased gloom scalar to the render inputs. Same zone guard.
  if (!world.appliedZoneId || snap.zoneId === world.appliedZoneId) {
    world.applyNetWells(snap.wells ?? []);
    world.titans.applyNet(snap.titans);
    world.setNetGloom(snap.gloom ?? 0);
    // THE RAMPAGE FABRIC's felled set — same idiom, same guard: the guest's
    // ground crushes and regrows exactly where the host's does.
    world.applyNetFell(snap.fell);
    // THE EVAPORATING GROUND — same idiom, same guard: the guest's drying
    // pieces shrink and retire exactly where (and as fast as) the host's do.
    applyNetEvap(world, snap.ev);
    // THE ENTRY FREEZE's mid-visit wire — same guard: while the host's front
    // holds this zone (dwf), run the SAME registry swap the host ran over our
    // own replicated doodads, so a guest standing in a zone the marching
    // front just swallowed walks (and predicts) ice, not water. On a true
    // conversion the wading lists re-derive (the applyNetEvap membership
    // precedent). Absence reverts nothing — the thaw arrives as the next
    // zone apply's ordinary re-mint, exactly as it does for the host.
    if (snap.dwf && world.freezeStandingWater()) world.rebuildClientTerrain();
  }
  // THE LITE TIER's draw list (engine/lite.ts): the client renders the
  // host's pool verbatim off this mirror — absent truly means empty (the
  // wells idiom; a dropped packet self-heals at the next reconcile).
  world.liteWire = snap.lt ?? null;

  if (!MINION_OWNER) MINION_OWNER = new Actor('owner', 'player', { x: 0, y: 0 });
  const lerping = !!prev && alpha < 1;
  const prevById = lerping ? new Map(prev!.actors.map(a => [a.id, a])) : null;

  const seen = new Set<number>();
  const actors: Actor[] = [];
  const partyByseat = new Map<string, Actor>();
  for (const aw of snap.actors) {
    let a = POOL.get(aw.id);
    if (!a) { a = new Actor(aw.name, aw.team, { x: aw.p[0], y: aw.p[1] }); POOL.set(aw.id, a); }
    // Interpolate position + facing from the previous snapshot for smooth motion.
    const pa = prevById?.get(aw.id);
    if (pa) {
      a.pos.x = pa.p[0] + (aw.p[0] - pa.p[0]) * alpha;
      a.pos.y = pa.p[1] + (aw.p[1] - pa.p[1]) * alpha;
      a.facing = angLerp(pa.f, aw.f, alpha);
    } else {
      a.pos.x = aw.p[0]; a.pos.y = aw.p[1]; a.facing = aw.f;
    }
    a.radius = aw.r; a.color = aw.c; a.shape = aw.sh;
    a.cosmeticLoadout = aw.cosmeticLoadout ? sanitizeCosmeticLoadout(aw.cosmeticLoadout) : EMPTY_COSMETIC_LOADOUT;
    a.cosmeticKind = aw.cosmeticKind === 'wisp' ? 'wisp' : undefined;
    a.team = aw.team; a.name = aw.name;
    a.life = aw.life; a.es = aw.es; a.absorbLayers.clear(); a.absorb = aw.ab ?? 0;
    a.hitFlash = aw.hf; a.downed = aw.downed; a.dead = aw.dead;
    a.passive = aw.passive; a.untargetable = aw.ut;
    a.summonReform = aw.summonReform ? { remaining: aw.summonReform[0], duration: aw.summonReform[1], invulnerable: false, untargetable: false } : undefined;
    a.movementTether = aw.movementTether ? { ...aw.movementTether,
      point: { ...aw.movementTether.point }, safe: { ...aw.movementTether.safe } } : undefined;
    a.throngUnits = aw.thu; a.throngEgg = aw.the; a.throngRosterHud = aw.thr; a.hivecallHud = aw.hive; a.assaultHud = aw.assault; a.assaultOrbit = !!aw.assaultOrbit; a.assaultAura = !!aw.assaultAura;
    for (const inst of a.skills) if (inst?.def.throng) (inst.state ??= {}).throngEvolutionGauge = aw.thg?.[inst.def.id] ?? 0;
    a.throngWild = aw.tw; // husk kind → the client's own sight gate reads it
    a.grabHud = aw.gb;    // held meter mirror (cleared when absent — freed)
    a.plies = aw.pl ?? 0; a.pliesMax = aw.plm ?? 0; // ply pips (render-only)
    a.tier = aw.tr ?? 0; // tier layer (host-authoritative — draw/veil gate)
    // Player bar readouts (own hero + party): runes verbatim, combo chips
    // as host-computed rows the renderer prefers over local derivation.
    a.runes = aw.rn ?? [];
    // THE PRIMED POUR mirror (render-only): ids rebuild the hotbar
    // glints; chargesSpent never crosses — the release is host law.
    if (aw.pp?.length) a.primedPours = aw.pp.map(id => ({ skillId: id, chargesSpent: 0 }));
    else if (a.primedPours.length) a.primedPours = [];
    if (aw.seat) restoreFlaskChargeBanks(a, aw.fq, true);
    a.comboHud = aw.cb?.map(([id, lit, len, glow]) => ({ id, lit, len, glow })) ?? [];
    // Mimic bank mirror (render/UI only — capture clocks stay host-side,
    // so mirrored entries carry at:0 and the client never prunes them).
    a.mimicBank = aw.mk ? aw.mk.map(([sid, src]) => ({ sid, src, at: 0 })) : null;
    a.mimicSel = aw.ms ?? null;
    a.aims = aw.aims !== false; // absent = aims (older hosts, ordinary bodies)
    a.wane = aw.wn ?? 0;
    a.owner = aw.mn ? MINION_OWNER : undefined;
    a.summonShell = aw.ss;
    a.shellGuard = aw.sg ? { ...aw.sg, breathe: aw.sg.breathe ? { ...aw.sg.breathe } : undefined } : undefined;
    a.poiseBroken = aw.pb === true;
    a.kind = aw.seat ? 'player' : undefined;
    a.adorn = aw.adorn;
    a.material = aw.mat;
    a.look = aw.lk;
    a.extraParts = aw.ep;
    // THE TELL FABRIC (engine/tells.ts): the client rebuilds the binding
    // list from its OWN registry (def + wired variant roll) and adopts the
    // host's derived scalars. Change-guarded both ways so the render dress
    // cache stays warm across snapshots that moved nothing.
    if (a.defId !== aw.defId || a.brainVariant !== aw.bv) {
      a.brainVariant = aw.bv;
      a.tellSpecs = aw.defId ? tellSpecsOf(MONSTERS[aw.defId], aw.bv) : undefined;
      a.tellRev++;
      // THE WATCH FABRIC: the posture comes from the client's OWN registry
      // (the tellSpecs law) — only derived scalars ride the wire.
      a.watch = aw.defId ? MONSTERS[aw.defId]?.watch : undefined;
    }
    // THE WATCH FABRIC's stamped sense + ladder (drawn == wired): adopt the
    // host's exact scan scalars; the ladder value banks at the local clock
    // (watchValueOf holds it through the grace, the next snapshot re-syncs
    // long before honest decay would diverge).
    if (aw.wp) {
      a.senseDetect = aw.wp[0];
      a.senseArcHalf = aw.wp[1];
      a.senseRearMul = aw.wp[2];
      a.senseAlerted = aw.wp[3] === 1;
      a.watchS = aw.wp[4];
      a.watchFedAt = world.time;
      a.watchRung = watchRungOf(aw.wp[4]);
    } else if (a.senseDetect !== 0) {
      a.senseDetect = 0;
      a.watchS = 0;
      a.watchRung = 0;
    }
    {
      const tl = aw.tl;
      const cur = a.tells;
      if (tl) {
        let same = !!cur && cur.length === tl.length;
        if (same && cur) for (let i = 0; i < tl.length; i++) if (cur[i] !== tl[i]) { same = false; break; }
        if (!same) { a.tells = tl.slice(); a.tellRev++; }
      } else if (cur?.some(v => v > 0)) {
        a.tells = undefined; a.tellRev++;
      }
    }
    a.rarity = aw.rarity as Actor['rarity'];
    a.magicPack = aw.magicPack ? { ...aw.magicPack } : undefined;
    a.encounterGroup = aw.encounterGroup ? { ...aw.encounterGroup } : undefined;
    a.encounterCue = aw.encounterCue ? { ...aw.encounterCue } : undefined;
    a.afflictionPressure = aw.afflictionPressure ? { ...aw.afflictionPressure } : undefined;
    a.armedCues = aw.armedCues?.map(cue => ({ ...cue }));
    a.reactiveCue = aw.reactiveCue ? { ...aw.reactiveCue, volatile: aw.reactiveCue.volatile ? { ...aw.reactiveCue.volatile } : undefined } : undefined;
    a.poolCues = aw.poolCues?.map(row => ({ ...row })) ?? [];
    a.selfBankCues = aw.selfBankCues?.map(row => ({ ...row })) ?? [];
    a.presenceBadge = aw.presenceBadge ? { ...aw.presenceBadge } : undefined;
    a.payloadCues = aw.payloadCues?.map(row => ({ ...row, points: row.points?.map(p => ({ ...p })) })) ?? [];
    a.procCues = aw.procCues?.map(row => ({ ...row })) ?? [];
    a.anatomyCues = aw.anatomyCues ? cloneAnatomyCues(aw.anatomyCues) : { weakpoints: [], parts: [], segments: [] };
    a.feedingCues = aw.feedingCues ? cloneFeedingCues(aw.feedingCues) : { gains: [] };
    a.companionCues = aw.companionCues ? cloneCompanionCues(aw.companionCues) : { links: [], marks: [] };
    a.wardCueProfile = aw.wardCue?.profile;
    a.encounterOrder = aw.encounterOrder ? { ...aw.encounterOrder } : undefined;
    a.magicPackPower = aw.magicPackPower ?? 0;
    a.magicPackRole = aw.magicPackRole;
    a.magicPackDonors = aw.magicPackDonors ?? 0;
    a.magicPackPending = aw.magicPackPending ?? 0;
    a.defId = aw.defId;
    a.cosmeticSourceSkill = aw.cosmeticSourceSkill; // absent fields clear a previous cosmeticSummonSkill
    a.faction = aw.faction;
    // Host-computed boss-bar row (cleared when absent — pooled actors never
    // wear a stale marquee).
    a.netBossBar = aw.bb ? { pips: aw.bb[0], lit: aw.bb[1], hl: !!aw.bb[2] } : undefined;
    // The renderer reads maxLife()/maxEs() + invisible/detectability off the sheet.
    // EXCEPT the OWN hero's life/es maxes — those are owned by recalcSeat (from the
    // replicated meta), so setBase-ing the host's final value here would double it.
    if (aw.seat !== world.clientSeatId) {
      a.sheet.setBase('life', aw.maxLife);
      a.sheet.setBase('energyShield', aw.maxEs);
    }
    a.sheet.setBase('invisible', aw.inv ?? 0);
    a.sheet.setBase('detectability', aw.det ?? 1);
    a.sheet.setBase('concealment', aw.concealment ?? 0);
    a.concealmentExposedUntil = aw.concealmentExposedUntil ?? 0;
    // Reconstruct the FX sub-objects the renderer draws (stand-in nested objects
    // so renderer.ts stays untouched). Absent → cleared → that FX simply skips.
    a.bodyActionPose = aw.bodyActionPose ? { ...aw.bodyActionPose } : null;
    a.bodyWalkPose = aw.bodyWalkPose ? { ...aw.bodyWalkPose } : null;
    a.statuses.length = 0;
    if (aw.st) for (const s of aw.st) a.statuses.push({ id: s.id, remaining: Number.isFinite(s.rem) ? s.rem! : 99, remainingKnown: Number.isFinite(s.rem), statusDuration: s.statusDuration, stacks: s.stacks, dps: 0, screenDot: s.dot ? true : undefined, sourceName: '', bankFrac: s.bk });
    a.casting = aw.cast ? ({
      // THE VENT-RIDE's broil: the client's cast stub carries the column
      // radius as a leap delivery with a vent, so the roil layer reads one
      // shape on both sides of the wire.
      inst: { hostSkillId: aw.cast.sk, def: { id: aw.cast.sk ?? '', name: aw.cast.sk ? SKILLS[aw.cast.sk]?.name ?? '' : '', color: aw.cast.c, guard: aw.cast.guardArc !== undefined ? { arcDeg: aw.cast.guardArc } : undefined,
        delivery: aw.cast.vent !== undefined ? { type: 'leap', vent: { columnR: aw.cast.vent } } : undefined } },
      mode: aw.cast.mode, total: aw.cast.total, elapsed: aw.cast.elapsed,
      resolvedGuardArc: aw.cast.guardArc === undefined ? undefined : aw.cast.guardArc * Math.PI / 180,
      resolvedMeleeReach: aw.cast.meleeReach ? { ...aw.cast.meleeReach } : null,
      foresight: foresightOfRow(aw.cast.fg, aw.cast.c),
      castingCompletion: aw.cast.castingCompletion,
      castingCue: aw.cast.castingCue ? { ...aw.cast.castingCue } : undefined,
      focusBroken: aw.cast.focusBroken,
      pulseTimer: aw.cast.pulseTimer, shield: aw.cast.shield, maxShield: aw.cast.maxShield,
      guardReleaseCue: aw.cast.guardReleaseCue ? { ...aw.cast.guardReleaseCue } : undefined,
      parryCue: aw.cast.parryCue, indicatorAt: aw.cast.indicatorAt, presses: aw.cast.presses, channelTime: aw.cast.channelTime,
      bashAt: aw.cast.bashAt, bashLow: aw.cast.bashLow, bashArmAt: aw.cast.bashArmAt,
      aim: { x: a.pos.x, y: a.pos.y }, held: false, baseMult: 1,
    } as unknown as CastingState) : null;
    a.activeAuras.clear();
    if (aw.auras) aw.auras.forEach((au, i) => a!.activeAuras.set('a' + i, ({ inst: { def: { id: au.skillId ?? '', color: au.c } }, radius: au.r, shape: au.sh } as unknown as ActiveAura)));
    a.construct = aw.con ? ({ kind: aw.con.kind, domeRadius: aw.con.domeRadius } as unknown as ConstructState) : undefined;
    a.fuse = aw.fuse;
    a.leap = aw.leap
      ? ({ timer: aw.leap.timer, total: aw.leap.total,
        vent: aw.leap.vent !== undefined ? { columnR: aw.leap.vent } : undefined } as unknown as LeapState)
      : undefined;
    if (aw.worm) {
      // Interpolate the trailing segments the same way the head (a.pos) is lerped,
      // so the body tracks the smoothly-gliding head instead of stepping at 20Hz.
      const paw = pa?.worm;
      const seg = aw.worm.seg.map((s, i) => {
        const ps = paw?.seg[i];
        return ps && lerping ? { x: ps[0] + (s[0] - ps[0]) * alpha, y: ps[1] + (s[1] - ps[1]) * alpha } : { x: s[0], y: s[1] };
      });
      // SEGMENT FABRIC: torn bitmask → wounded[], flash countdowns, and the
      // kit-part looks re-resolved from the def registry (defId ships; the
      // strings never ride the wire) — the client draws the same solid
      // plated chain the host tested, tears and all.
      const wounded = aw.worm.wd !== undefined
        ? seg.map((_, i) => (aw.worm!.wd! & (1 << i)) !== 0)
        : undefined;
      const looks = aw.worm.ht && aw.defId ? MONSTERS[aw.defId]?.worm?.looks : undefined;
      a.worm = ({
        segments: seg, taper: aw.worm.taper, length: aw.worm.seg.length, spacing: 0,
        ...(aw.worm.ht ? { hittable: true } : {}),
        ...(wounded ? { wounded } : {}),
        ...(aw.worm.sf ? { flash: aw.worm.sf } : {}),
        ...(looks ? { looks } : {}),
      } as unknown as WormBody);
    } else {
      a.worm = undefined;
    }
    actors.push(a);
    seen.add(aw.id);
    if (aw.seat) partyByseat.set(aw.seat, a);
  }
  for (const id of POOL.keys()) if (!seen.has(id)) POOL.delete(id);
  // THE PACK LAYER's drawn bonds (engine/pack.ts): re-point each warded body
  // at its holder AFTER the whole roster exists — a holder may be serialized
  // after the bodies it empowers, and a one-frame-late line is a line that
  // flickers. Resolution goes through the same POOL the snapshot keys on, so
  // the client's own Actor.id (pooled and local) never enters it. Absent
  // `bl` CLEARS the pair: a pooled shell must never wear a stale court.
  for (let i = 0; i < snap.actors.length; i++) {
    const aw = snap.actors[i];
    const a = actors[i];
    const held = aw.bl !== undefined;
    a.bondHeld = held;
    a.bondFrom = held ? POOL.get(aw.bl!) : undefined;
    a.magicPackFrom = aw.magicPackFrom !== undefined ? POOL.get(aw.magicPackFrom) : undefined;
    a.wardCueSources = aw.wardCue?.sources.map(id => POOL.get(id)).filter((x): x is Actor => !!x);
    // companionCue endpoints follow the client's interpolated actors, not host IDs.
    if (a.companionCues) for (const link of a.companionCues.links) link.to.id = POOL.get(link.to.id)?.id ?? -1;
  }
  world.actors = actors;
  world.emergences = (snap.recoveryCues ?? []).flatMap(row => {
    const actor = POOL.get(row.actorId);
    return actor && actors.includes(actor) ? [{ ...cloneRecoveryCue(row), actorId: actor.id, held: false }] : [];
  });

  // Lightweight entities — plain render structs the renderer reads positionally.
  world.remoteSkillFields = (snap.skillFields ?? []).map(cloneSkillFieldVisual);
  world.projectiles = snap.projectiles.map(p => ({ skillVisualId: p.skillId, reflectedCue: p.reflectedCue,
    orbPaint: p.orbPaint ? { ...p.orbPaint } : undefined,
    pos: { x: p.p[0], y: p.p[1] }, dir: p.d, radius: p.r, color: p.c, shape: p.sh, age: p.a ?? 0, cosmeticMotif: p.cosmeticMotif,
    cosmeticProjectile: cosmeticStyle(COSMETIC_PROJECTILES, p.cosmeticProjectile) ? p.cosmeticProjectile : undefined,
  })) as unknown as World['projectiles'];
  world.tethers = []; // Replica links are paint, never reconstructed damage bands.
  world.remoteSkillTethers = (snap.tethers ?? []).map(t => ({
    ax: t.ax, ay: t.ay, bx: t.bx, by: t.by, color: t.c, width: t.w,
    voice: t.voice, skillId: t.skillId, age: t.age ?? 1, fade: t.fade ?? 1, fromTier: t.fromTier, toTier: t.toTier,
  }));
  world.townPortalClientViews = (snap.townPortalViews ?? []).map(p => ({ ...p,
    cosmeticLoadout: sanitizeCosmeticLoadout(p.cosmeticLoadout) }));
  world.drops = snap.drops.map(d => ({
    pos: { x: d.p[0], y: d.p[1] }, bob: d.bob,
    item: d.kind === 'support'
      ? { kind: 'support', gem: { def: { color: d.color, name: d.name ?? '?' }, level: 1 } }
      : d.kind === 'gear'
        // Render-shell gear: base identity resolves the shared inventory glyph.
        ? { kind: 'gear', item: { name: d.name ?? '?', rarity: (d.rarity ?? 'common'), baseId: d.baseId ?? '' } }
        : d.kind === 'vestige'
          ? { kind: 'vestige', id: d.vid ?? '', count: 1 }
          : d.kind === 'essence'
            ? { kind: 'essence', essence: d.eid ?? 'coarse', count: d.cnt ?? 1 }
            : d.kind === 'abilityEssence'
              ? { kind: 'abilityEssence', tier: d.tid ?? 1, count: d.cnt ?? 1 }
              : { kind: 'skill', inst: { def: { color: d.color, name: d.name ?? '?' }, rarity: d.rarity ?? 'common' } },
  })) as unknown as World['drops'];
  world.magicPackEffects = (snap.magicPackEffects ?? []).map(v => ({ ...v }));
  world.satellites.visuals = (snap.satellites ?? []).map(v => ({ ...v }));
  world.guardArts.visuals = (snap.guardArts ?? []).map(v => ({ ...v }));
  world.auroras.visuals = (snap.auroras ?? []).map(v => ({ ...v }));
  world.guardians.visuals = (snap.guardians ?? []).map(v => ({ ...v }));
  world.creepers.visuals = (snap.creepers ?? []).map(v => ({ ...v, trail: v.trail.map(p => ({ ...p })) }));
  world.satellites.flights.visuals = (snap.satelliteFlights ?? []).map(v => ({ ...v, from: { ...v.from }, to: { ...v.to } }));
  world.orbs = snap.orbs.map(o => ({ pos: { x: o.p[0], y: o.p[1] }, bob: o.bob, life: o.life, kind: o.kind, amount: 0,
    tier: o.tier, flowTo: o.flowTo ? { x: o.flowTo[0], y: o.flowTo[1] } : undefined, flowTier: o.flowTier, flowFromTier: o.flowFromTier }));
  world.texts = snap.texts.map(t => ({ pos: { x: t.p[0], y: t.p[1] }, life: t.life, maxLife: t.maxLife, size: t.size, color: t.color, text: t.text, kind: t.k })) as unknown as World['texts'];
  world.notices = (snap.no ?? []).map(n => ({ text: n.text, color: n.color, size: n.size, channel: n.ch, bornAt: n.born }));
  world.pickupFeed = (snap.pfd ?? []).map(e => ({ seatId: e.s, label: e.l, color: e.c, count: e.n, bornAt: e.born }));
  world.flashes = snap.flashes.map(f => ({ combatCue: f.combatCue ? { ...f.combatCue } : undefined, pos: { x: f.p[0], y: f.p[1] }, radius: f.radius, color: f.color, life: f.life, maxLife: f.maxLife,
    feedingCue: f.feedingCue ? { ...f.feedingCue, to: { ...f.feedingCue.to } } : undefined,
    companionCue: f.companionCue ? { ...f.companionCue, from: f.companionCue.from && { ...f.companionCue.from } } : undefined,
    recoveryCueTier: f.recoveryCueTier,
    defenseCue: f.defenseCue ? { ...f.defenseCue } : undefined, fx: f.fx, onGround: f.onGround?.slice(), cosmeticMotif: f.cosmeticMotif, departure: f.departure, bolt: f.bolt, meteor: f.meteor,
    shape: f.shape, facing: f.facing, arcRad: f.arcRad, lightning: cloneLightningTrace(f.lightning), movement: cloneMovementTrail(f.movement), edgeFrac: f.edgeFrac, arc: f.arc && { ...f.arc }, beam: f.beam })) as unknown as World['flashes'];
  // THE EYECATCH — re-stamped against the CLIENT's own raw clock (elapsed →
  // local t0); an absent row clears the pane with the host's (engine/ultimates.ts).
  world.eyecatch = snap.ec ? {
    casterId: snap.ec.ci, skillId: snap.ec.sk, style: snap.ec.st,
    title: snap.ec.ti, sub: snap.ec.sb, tint: snap.ec.tn, side: snap.ec.sd,
    t0: world.timeflow.age - snap.ec.el, paneSec: snap.ec.ps,
    avatarDefId: snap.ec.av,
  } : null;
  // Render-only telegraph: the client draws these but never advances them (no updateDeathBursts
  // runs client-side). Only the fields drawDeathBursts touches are carried; sim fields are inert.
  // `team` rides tm (THE SPARED RING's read): absent on an old host's wire it stays undefined,
  // which compares unequal to every hero team — the full-strength fallback by construction.
  world.deathBursts = (snap.deathBursts ?? []).map(b => ({
    pos: { x: b.p[0], y: b.p[1] }, phase: b.ph === 0 ? 'gather' : 'orb', radius: b.r, color: b.c,
    arming: b.arm === 1, t: b.t, coalesce: b.co, trail: b.trail.map(tp => ({ x: tp[0], y: tp[1] })),
    team: b.tm,
  })) as unknown as World['deathBursts'];
  // Mirror the host's authoritative vendor stock so the smith panel renders the
  // real wares and a buyVendor index resolves against the SAME list host-side.
  if (snap.vendor) {
    const locks: { entry: VendorEntry; idx: number; commission?: boolean }[] = [];
    world.vendorStock = snap.vendor
      .map((w, i) => {
        const e = rehydrateVendor(w);
        if (e && w.lk) locks.push({ entry: e, idx: i, ...(w.lk === 2 ? { commission: true } : {}) });
        return e;
      })
      .filter((e): e is VendorEntry => !!e);
    // Re-anchor after the null-filter so lock seats match the drawn list.
    for (const r of locks) r.idx = world.vendorStock.indexOf(r.entry);
    // A PROJECTION hold (host-authoritative flags, self-healing at 20 Hz):
    // the panel's one read path (vendorEntryHold) now answers identically
    // on host and client. The client never resolves or persists it.
    world.vendorHolds['brandt'] = { locks, watchedSec: 0 };
    world.vendorRestockAt = snap.vendorRestockAt;
    world.netVendorCap = snap.vendorCap;
    world.netMemoryAccess = snap.memoryAccess;
    world.netVendorTradeOpen = snap.vendorTradeOpen;
    world.netVendorGemsOpen = snap.vendorGemsOpen;
    world.netBagBoard = snap.bagBoard;
    // Absent whole = an older host with no side boards: none exist here.
    world.netContainerBoards = snap.containerBoards ?? {};
  }

  // The client's OWN hero arrives as a POOLED actor (in world.actors). Make
  // world.player (the camera/HUD anchor AND the renderer's "no overhead bar"
  // identity) BE that same object, so the own hero draws ONCE with no floating
  // bar — matching host/SP. Then patch the per-seat HUD values (mana/maxMana
  // aren't on ActorW, so they must come from SeatW).
  const own = partyByseat.get(world.clientSeatId);
  if (own) world.localSeat.actor = own;
  // LAYER 2 — apply the replicated OWN-seat build FIRST (when it changed), so the
  // char-sheet / skill-book / tree read correct values and recalcSeat owns the
  // resource maxes + derived stats before the per-frame patch runs.
  const myMeta = snap.seatMeta?.[world.clientSeatId];
  if (myMeta) applySeatMeta(world, world.localSeat, myMeta);
  // Local preparation uses the replicated build, after this packet's metadata.
  // Remote actors and unknown/old-host casts retain their render-only stubs.
  const ownCastId = snap.actors.find(row => row.seat === world.clientSeatId)?.cast?.sk;
  const ownCastInst = ownCastId ? world.localSeat.meta.knownSkills.get(ownCastId) : undefined;
  if (own?.casting && ownCastInst) own.casting.inst = ownCastInst;
  const me = snap.seats[world.clientSeatId];
  if (me) {
    const p = world.player;
    // When the own hero is a pooled actor its pos was already interpolated above;
    // only the shell needs a position (lerped from the prev seat sample).
    if (!own) {
      const pme = prev?.seats[world.clientSeatId];
      p.pos.x = lerping && pme ? pme.pos[0] + (me.pos[0] - pme.pos[0]) * alpha : me.pos[0];
      p.pos.y = lerping && pme ? pme.pos[1] + (me.pos[1] - pme.pos[1]) * alpha : me.pos[1];
    }
    // CURRENT resources come from the per-tick SeatW; the MAXES come from
    // recalcSeat (the replicated meta) — so we never setBase them here (that would
    // double-count against recalcSeat's sources).
    p.life = me.life; p.mana = me.mana; p.es = me.es;
    p.dead = me.dead; p.downed = me.downed;
    // Environmental-survival meters: rebuild the own hero's map from the wire
    // so the registry-driven HUD bars (breath, light) draw exactly as on the
    // host. Absent on the wire = every meter full = no map (bars hidden).
    if (me.survival) {
      p.survival ??= new Map();
      for (const k of [...p.survival.keys()]) if (!(k in me.survival)) p.survival.delete(k);
      for (const [k, v] of Object.entries(me.survival)) p.survival.set(k, v);
    } else if (p.survival?.size) {
      p.survival.clear();
    }
  }

  // Rebuild the party strip from seat-tagged actors (events don't fire on a client).
  world.party.members.length = 0;
  for (const [seat, actor] of partyByseat) {
    world.party.members.push({ actor, seat, local: seat === world.clientSeatId });
  }
}

// ----------------------------------------------------- zone terrain (P5) -----
// Shipped ONCE per host loadZone (not per tick), so the client renders the host's
// actual terrain. MVP scope: the in-zone view (floor theme, doodads, exits,
// waypoint). Interactive furniture (shrines/altars/chests/fonts) + the minimap
// graph stay client-local — they don't render-block and aren't worth the bytes.

export interface DoodadW {
  p: Vec2W; r: number; kind: string; dir?: number; shallow?: boolean; rot?: number; adorn?: string;
  /** Per-stamp FALL-ABLE override (the pitfall fabric — Doodad.fall): the
   *  client's predicted pit confine must grasp/arrest exactly as the host's
   *  does. Kind-level pits (DoodadRule.fall) need no wire — this ships only
   *  the stamps that overrode their rule. */
  fall?: boolean;
  /** OVERGROWN way disc (clearway fabric): the client's groundAt must skip the
   *  worn-pace claim exactly as the host's does — a swallowed stretch may not
   *  boost a guest it slows for the host. */
  wild?: boolean;
  /** Door state (kind 'door'): id + open/broken + cell rect, so the client's
   *  predicted collision + render + grid repaint mirror the host's doors. */
  door?: DoodadDoor;
  /** The hollow this seam seals (hollows fabric) — ids match ZoneMsg.hollows. */
  hollow?: string;
  /** The annex this face seals (the growing zone) — ids match the arena's
   *  pieces + ZoneMsg.annexSpecs; the client's pop prediction never fires
   *  (brittle authority is host-side), but the tell must draw. */
  annex?: string;
  /** The true collision surface (hit-surface fabric) — shipped so the
   *  client's predicted clampPos squeezes a doorway exactly as the host's
   *  does (boundR is re-derived client-side at index rebuild). */
  hitbox?: HitShape;
}
export interface ExitW {
  p: Vec2W; r: number; to: string; label: string;
  /** Boundary-gate treatment id (data/boundaryGates.ts) — crosses like the
   *  label so client portals wear the enclave's accent/glyph/ring. */
  b?: string;
}
export interface ZoneMsg {
  zoneId: string; name: string; level: number;
  /** Baked regional identity for the current locale, optional on old peers. */
  journey?: CourseJourney;
  locale?: ZoneDef['locale'];
  complex?: ZoneDef['complex'];
  destination?: ZoneDef['destination'];
  /** Host-resolved geographic context; never sample the client's world field. */
  geo?: ZoneDef['geo'];
  /** The zone's DIMENSION ('surface' omitted) — the client's map tab, dimension
   *  seals, and any dimension-scoped rendering read the same plane the host is
   *  in (a client in hell must not paint surface weather over it). */
  dimension?: string;
  /** Arena box + THE COMPOSITE BOUND's pieces (geometry + open state at zone
   *  send — the client's prediction clamp and drawn face read the same union
   *  the host tests; mid-play reveals converge via StateSnapshot.annexes).
   *  Seeds stay host-side (the annex mint is the host's business). */
  arena: {
    w: number; h: number; shape: ZoneShape;
    pieces?: { id: string; x: number; y: number; w: number; h: number; shape?: ZoneShape; active?: boolean }[];
  };
  theme: ZoneTheme;
  doodads: DoodadW[];
  exits: ExitW[];
  waypoint: Vec2W | null;
  /** A non-convex zone's walkability grid (Phase 2/3), packed (region kinds, mask
   *  derived); null for convex zones. Shipped so a co-op client's movement
   *  PREDICTION (clampPos) keeps the hero on the same walkable ground the host does. */
  walk: PackedWalk | null;
  /** Plan structures (rects/roofs/doors/slots) — the client's roof-reveal pass
   *  and door rendering read the same record the host does. */
  structures?: PlacedStructure[];
  /** SECRET HOLLOWS (the hollows fabric): the zone's specs, so a client can
   *  carve a mid-play reveal (StateSnapshot.hollows) exactly where the host
   *  did. The shipped walk grid already arrives pre-carved for anything
   *  opened before the client stepped in. */
  hollows?: HollowSpec[];
  /** SEALED ANNEX FACES (the growing zone): the zone's reveal records, so a
   *  client can carve + dress a mid-play reveal (StateSnapshot.annexes)
   *  exactly where the host did — seedless like the pieces themselves (the
   *  furnish stream is host business; contents ride the doodad/actor
   *  channels). The shipped walk grid arrives pre-carved for anything
   *  opened before the client stepped in. */
  annexSpecs?: AnnexSpec[];
  /** MOVING-HAZARD LANES (the track fabric): the host's placed specs,
   *  verbatim. Geometry is the WHOLE wire — rider poses derive from the
   *  synced clock on both sides (trackPose is pure), so lanes cost zero
   *  steady-state bytes and can never desync mid-zone. */
  tracks?: TrackSpec[];
  /** TRAPWORK MECHANISMS (the trapworks fabric): the host's placed specs —
   *  the client renders tells/rakes and replays sprung mirrors; all
   *  authority (sweeps, springs, credit) stays host-side. */
  trapworks?: TrapworkSpec[];
}

export function serializeZone(world: World): ZoneMsg {
  return {
    zoneId: world.zone.id, name: world.zone.name, level: world.zone.level,
    ...(world.zone.locale ? { locale: structuredClone(world.zone.locale) } : {}),
    ...(world.zone.complex ? { complex: structuredClone(world.zone.complex) } : {}),
    ...(world.zone.destination ? { destination: structuredClone(world.zone.destination) } : {}),
    ...(world.zone.journey ? { journey: { ...world.zone.journey } } : {}),
    ...(world.zone.geo ? { geo: structuredClone(world.zone.geo) } : {}),
    dimension: world.zone.dimension,
    arena: {
      w: world.arena.w, h: world.arena.h, shape: world.arena.shape,
      ...(world.arena.pieces?.length ? {
        pieces: world.arena.pieces.map(pc => ({
          id: pc.id, x: pc.x, y: pc.y, w: pc.w, h: pc.h,
          ...(pc.shape ? { shape: pc.shape } : {}),
          ...(pc.active ? { active: true } : {}),
        })),
      } : {}),
    },
    theme: world.zone.theme,
    // Pooled LIGHTWELLS are excluded on purpose: they ride the per-tick
    // wells channel EXCLUSIVELY (a copy here would arrive stateless and
    // duplicate the reconciled one).
    doodads: world.doodads.filter(d => !d.well && !world.titans.owns(d)).map(d => ({ p: v2(d.pos), r: d.radius, kind: d.kind, dir: d.dir, shallow: d.shallow, rot: d.rot, adorn: d.adorn, door: d.door, hitbox: d.hitbox, hollow: d.hollow, annex: d.annex, wild: d.wild, fall: d.fall })),
    exits: world.exits.map(e => ({ p: v2(e.pos), r: e.radius, to: e.to, label: e.label, b: e.boundary })),
    waypoint: world.waypointPos ? v2(world.waypointPos) : null,
    walk: world.walk instanceof GridWalkField ? world.walk.pack() : null,
    structures: world.structures.length ? world.structures : undefined,
    hollows: world.zoneHollows.length ? world.zoneHollows : undefined,
    annexSpecs: world.zoneAnnexSpecs.length ? world.zoneAnnexSpecs : undefined,
    tracks: world.tracks.length ? world.tracks.map(t => t.spec) : undefined,
    trapworks: world.trapworks.length ? world.trapworks.map(t => t.spec) : undefined,
  };
}

/** Client: rebuild the render terrain from a host zone message. */
export function applyZone(world: World, msg: ZoneMsg): void {
  world.remoteSkillTethers = [];
  world.remoteSkillFields = []; // discard the previous room's telegraphs immediately
  world.arena.w = msg.arena.w; world.arena.h = msg.arena.h; world.arena.shape = msg.arena.shape;
  // THE COMPOSITE BOUND: adopt the host's pieces whole (fresh objects), then
  // let the hull + revealed set follow — the client's predicted clampPos and
  // the drawn face read the same union the host tests.
  if (msg.arena.pieces?.length) {
    world.arena.pieces = msg.arena.pieces.map(pc => ({ ...pc }));
  } else {
    delete world.arena.pieces;
  }
  world.arenaHull = hullOf(world.arena);
  world.annexOpen = new Set(
    (msg.arena.pieces ?? []).filter(pc => pc.active).map(pc => pc.id));
  // Patch the client's render zone so drawFloor reads the host's theme/name/level.
  world.zone.theme = msg.theme;
  world.zone.name = msg.name;
  world.zone.level = msg.level;
  if (msg.locale) world.zone.locale = structuredClone(msg.locale);
  else delete world.zone.locale;
  if (msg.complex) world.zone.complex = structuredClone(msg.complex);
  else delete world.zone.complex;
  if (msg.destination) world.zone.destination = structuredClone(msg.destination);
  else delete world.zone.destination;
  if (msg.journey) world.zone.journey = { ...msg.journey };
  else delete world.zone.journey; // leaving a route clears the previous stage
  if (msg.geo) world.zone.geo = structuredClone(msg.geo);
  else delete world.zone.geo; // old peers and plain zones clear stale atlas context
  world.zone.dimension = msg.dimension;
  world.doodads = msg.doodads.map(d => ({
    pos: { x: d.p[0], y: d.p[1] }, radius: d.r, kind: d.kind, dir: d.dir, shallow: d.shallow, rot: d.rot, adorn: d.adorn, door: d.door, hitbox: d.hitbox, hollow: d.hollow, annex: d.annex, wild: d.wild, fall: d.fall,
  })) as Doodad[];
  world.structures = msg.structures ?? [];
  // SECRET HOLLOWS: adopt the host's specs fresh (the shipped walk grid is
  // already carved for anything opened before this message); the per-frame
  // snapshot converges any reveal that lands mid-play.
  world.zoneHollows = msg.hollows ?? [];
  world.openedHollows = new Set();
  // SEALED ANNEX FACES: same law — specs fresh, grid pre-carved, the 20 Hz
  // annexes row converges mid-play reveals (bare: carve + dress only).
  world.zoneAnnexSpecs = msg.annexSpecs ?? [];
  // The zone the CLIENT's terrain currently mirrors — the guard that keeps a
  // stale old-zone snapshot from ratcheting same-id doors open in the new zone
  // (do NOT write msg.zoneId into world.zone.id: world.zone aliases a node in
  // the client's own zone graph).
  world.appliedZoneId = msg.zoneId;
  // Rebuild the bridge/ground collision lists from the replicated doodads so the
  // client's PREDICTED movement matches the host across bridges (else rubber-band).
  world.rebuildClientTerrain();
  // Non-convex walkability: rebuild from the shipped packed grid (or clear it).
  world.walk = msg.walk ? GridWalkField.unpack(msg.walk) : null;
  world.exits = msg.exits.map(e => ({
    pos: { x: e.p[0], y: e.p[1] }, radius: e.r, to: e.to, label: e.label, defIndex: 0,
    // Boundary-gate treatment crosses like the label (accent/glyph/ring on
    // the client read the same data row the host resolved).
    boundary: e.b,
  }));
  world.waypointPos = msg.waypoint ? { x: msg.waypoint[0], y: msg.waypoint[1] } : null;
  // MOVING-HAZARD LANES: adopt the host's placed specs — the client's track
  // layer poses riders off the synced clock from here on (zero per-tick wire).
  world.setNetTracks(msg.tracks ?? []);
  // TRAPWORK MECHANISMS: adopt the host's specs (tells already ride the
  // doodad list above); states converge via StateSnapshot.trapState.
  world.setNetTrapworks(msg.trapworks ?? []);
}
