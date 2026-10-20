// ---------------------------------------------------------------------------
// THE BOUNTY BOARD — generated, player-selected quest POSTINGS on a beat
// (docs/design/bounty-board.md, M0 "the board stands").
//
// A POSTING is a small persisted instance (kind row id + claimed target +
// pay + provenance) minted by the board at its beat's seeded arm; ACCEPTING
// one derives an ordinary QuestDef (postingQuestDef — the quest fabric's own
// header: "Bounty boards are the same primitive with a different giver") so
// the journal, map markers, field-clear hook and payout site all serve it
// through World.questDefOf. Pay resolves at THE TURN-IN back at the board
// (walk-1's collect ruling — the QuestTurnIn withhold lane is the default).
//
// KINDS are an open registry (registerBountyKind — the puzzle-kinds idiom):
// each row rolls its own target off the live world through the seat fabric,
// answers done()/failed()/annulled() as pure READS (the predicate is the
// law; hooks are UX), and speaks its card copy in the precision register.
// M0 ships ONE kind — THE CHARGE ("complete the objective of the place");
// the M1 spread (errand/cull) and M2's live-census answers join as rows.
//
// THE PER-BOARD LAW (walk 1, unhardcoded by ruling): every posting records
// its issuing boardId and the one-hand cap FOLDS per board — today's single
// Lastlight board collapses the fold to the global cap of 1, and regional
// boards (the writ kinship, post-M4) become a dial's turn, never a rewrite.
// ---------------------------------------------------------------------------

import type { Rng } from '../core/rng';
import { baseComplexityOf, levelReqForTier, tierForIlvl, type ItemCategory } from '../engine/items';
import type { MemoryKind } from '../engine/memories';
import { SKILL_RARITIES, skillRarityFloor, type SkillRarity } from '../engine/skills';
import type { World } from '../engine/world';
import type { QuestDef } from '../quests/types';
import { QUEST_CATEGORY_COLORS } from '../quests/types';
import { registerAttentionSource } from '../world/attention';
import { registerOmenSource } from '../world/omens';
import type { OverlayView } from '../world/overlay';
import { pickSeat, type SeatTuning } from '../world/seats';
import { ESSENCES, essenceUnitsForValue, type EssenceCost, type EssenceId } from './essences';
import { harvestRowsFor } from './harvest';
import { ITEM_BASES } from './itembases';
import { SKILLS } from './skills';
import { UNIQUE_LIST } from './uniques';
import { OBJECTIVE_READS, type ZoneDef } from './zones';

/** ⚠ EVERY number here is UNBLESSED (2026-08-24) — the charter's open dials;
 *  her walks retune them. The offer count is HER walk-1 number (five). */
export const BOUNTY_BOARD_CFG = {
  /** Introductory interaction cue: the same violet family as .tut-glow. */
  boardIntroduction: { receipt: 'bounty_board_introduced', color: '#c8a8ff', radius: 48, alpha: 0.22, pulse: 0.10, hz: 3, glyph: '!', label: 'Bounty Board' },
  /** THE BEAT — the board's OWN clock (never the vendor restock quantum:
   *  a Rush Order rung must not silently re-pace the board). Future board
   *  rush rungs fold into World.bountyBeatSeconds, floored here. */
  beatSec: 1200,
  minBeatSec: 120,
  /** Offers per slate (walk 1: opens at FIVE; ONE dial, retuned at walks).
   *  M0 fields one kind, so no per-kind diversity guarantee is enforced
   *  yet — that law arrives with the M1 spread. */
  offers: 5,
  /** Approach budgets include every road from the issuing board. A manageable
   * target is at most the hero's level and no more than two levels behind.
   * Harder seats deliberately include targets up to +3; transit up to +4.
   * Repair adds seats without replacing a held or pinned player choice. */
  routes: {
    appropriateBelow: 2, manageableSeats: 2,
    manageableKinds: ['charge', 'errand', 'gather', 'cull', 'passage'] as readonly string[],
    manageable: { above: 0, steps: 6, distance: 650 },
    demanding: { above: 4, steps: 12, distance: 1500 },
    challengeAbove: 3,
    fallbackMarks: 2,
  },
  /** The board's dwell (the salvage-bench register). */
  dwell: { radius: 120, sec: 0.9 },
  /** THE COUNTER LAWS (her ruling 2026-09-05 — the board as a NOTICE BOARD,
   *  not a menu): THE TEAR-OFF — accepting a posting CLOSES the board (the
   *  writ is ripped from the slate and the reader turns for the road; a
   *  refused take leaves the board open, the struck card repainted); THE
   *  RETURN — dwelling at a board with a RESOLVED hand (done or failed)
   *  TURNS IT IN FIRST (pay lands, the failed posting is handed back) and
   *  only then re-opens the board, so the same linger collects and offers
   *  the next work — one trip, the collect ruling made bodily; THE RECEIPT —
   *  the re-opened board prints what the last turn-in paid for `receiptSec`
   *  so the pay is READ, never only heard. Each a dial. */
  counter: { closeOnAccept: true, dwellTurnIn: true, receiptSec: 30 },
  /** The Lastlight board's id — postings record their issuing board (THE
   *  PER-BOARD LAW). Regional boards mint their own ids (the kinship). */
  boardId: 'lastlight',
  /** The board's accent IS the reserved bounty category badge — one truth. */
  accent: QUEST_CATEGORY_COLORS.bounty,
  /** THE CHARGE kind's dials. */
  charge: {
    /** Seat envelope over the live map (the seat fabric's data half):
     *  standing ground near the hero's reach, a thumb on veiled country
     *  (a charge on a veiled zone LIFTS the veil at accept — ruled). */
    seat: { range: { min: 1, max: 480 }, knownMul: 1, unknownMul: 1.2, veiledMul: 1.35, prefer: 'flat' } as SeatTuning,
    /** Level band around the hero (target zone level within [-below,+above]). */
    band: { below: 6, above: 3 },
    /** Objective kinds a charge can never honestly ask (no completion route
     *  through completeObjective: 'escape' never routes there, 'none' asks
     *  nothing; 'safe' + event-quiet ground are already floored out by the
     *  seat fabric's eventTargetable). */
    refuse: ['none', 'escape'] as readonly string[],
  },
  /** R1 pay — the essence fold: value = base + perLevel × zone level (in
   *  Mortal-Essence worth), minted as ONE tint chosen by the zone's level
   *  (the harvest fabric's tierAt idiom, index-aligned with ESSENCE_IDS). */
  pay: { base: 6, perLevel: 1.6, tierAt: [0, 8, 16, 26] as readonly number[] },
  /** THE ERRAND kind (M1) — "reach the place". Target: standing UNVISITED
   *  ground, a heavy thumb on the veiled frontier (the exploration ask);
   *  entry is the deed. THE VEIL is per-posting flavor (walk-1 card 4):
   *  the default face keeps discovery the ask (an aging OMEN, no lift);
   *  `liftShare` of postings roll the deed-lift face instead. */
  errand: {
    seat: { range: { min: 140, max: 720 }, knownMul: 0.4, unknownMul: 2, veiledMul: 3, prefer: 'flat' } as SeatTuning,
    band: { below: 5, above: 5 },
    liftShare: 0.25,
  },
  /** THE CULL kind (M1) — "kill the named": the writ grammar sent remote.
   *  On first entry with the hand held, the board posts `count` writ marks
   *  through the standing promote-and-name path; done = all claimed
   *  (credited on the posting itself, so the read works from anywhere and
   *  survives wipes — a re-entry re-posts the remainder, self-healing).
   *  Targets never overlap the writ fabric's own boards: zones whose
   *  OBJECTIVE is 'bounty' and harborhold ground are excluded, so every
   *  mark in a cull zone belongs to the posting (the mixed-lane guard). */
  cull: {
    seat: { range: { min: 1, max: 520 }, knownMul: 1.2, unknownMul: 1, veiledMul: 0.6, prefer: 'flat' } as SeatTuning,
    band: { below: 6, above: 3 },
    count: [3, 5] as [number, number],
  },
  /** THE PAY LANES (M1 — her reward-targeting agency): each posting rolls
   *  ONE lane at the arm, weights below; the card prints the exact pay
   *  (the visible price law). Unique lane: unseen uniques POST (ruled) and
   *  R2 is split named/category (her amendment — "a unique ring"). */
  lanes: {
    weights: { essence: 0.4, pouch: 0.18, lot: 0.12, unique: 0.1, craft: 0.2 },
    unique: {
      namedShare: 0.5,
      /** Category-face pool (filtered at arm to categories that actually
       *  hold a unique at the target's level — never a hollow card). */
      categories: ['ring', 'amulet', 'belt', 'boots', 'gloves', 'helmet', 'chest', 'weapon', 'offhand'] as readonly ItemCategory[],
      /** Named pool reaches this many levels above the target zone. */
      reachAbove: 0,
    },
    lot: {
      count: [2, 3] as [number, number],
      rarityWeights: { common: 0, magic: 45, rare: 55, unique: 0 },
      categories: ['weapon', 'chest', 'helmet', 'gloves', 'boots', 'belt', 'ring', 'amulet', 'offhand'] as readonly ItemCategory[],
    },
    pouch: { roughCount: [3, 5] as [number, number] },
    /** The gem face rides the pouch lane's weight: this share of pouch-lane
     *  rolls names a TRUE skill Memory from the account's own drop pool at
     *  the target's level (THE MINT LAW stamps it at pay). */
    gemShare: 0.35,
    /** THE OFFERED GRADE (2026-09-12, her ruling): a board-named skill
     *  Memory is a stated reward, so it cuts richer than a wild find —
     *  never below MAGIC (weight 0 on common), a real chance at RARE, and a
     *  fairly low chance at LEGENDARY (the lot lane's rarityWeights idiom,
     *  rolled through rollSkillRarityWeighted at pay; the card prints the
     *  floor — the visible price law). Compare the drop ladder 54/30/14/2.
     *  DIALS, unblessed. */
    gem: { rarityWeights: { common: 0, magic: 55, rare: 38, legendary: 7 } as Partial<Record<SkillRarity, number>> },
    /** R5 THE SMITH'S WRIT (the steady hand): the craft credit's tier
     *  ladder — the target zone's level buys the tier (the pay fold's own
     *  tierAt idiom); the tier buys the trace's band (TRACE_CFG). The
     *  category pool is the outline library's own gamut. */
    craft: {
      /** The gamut is the categories that STAND bases today — weapon and
       *  offhand are reserved shapes with no bases anywhere in the game
       *  yet (the roller's pool is empty for them; the M1 audit's own
       *  observation), and the roll below re-filters against the live
       *  registry regardless (never a hollow card). */
      categories: ['helmet', 'chest', 'gloves', 'boots', 'legs', 'belt', 'ring', 'amulet'] as readonly ItemCategory[],
      /** The level ladder UNLOCKING the classes (index = class − 1): a
       *  deeper target may deal a more intricate writ — the class itself
       *  stays horizontal (walk 2's word). */
      complexityAt: [0, 10, 22] as readonly number[],
      /** THE VERDICT FOLD (walk card 1 — the hybrid): the mint always
       *  lands; accuracy buys the quality — rare weight = accuracy×100,
       *  magic floored, plus an accuracy-scaled ilvl bonus. The high-
       *  complexity slip cap lives in TRACE_CFG (hybridAtComplexity). */
      forge: { magicFloor: 10, ilvlBonusMax: 2 },
    },
  },
  /** THE ANSWER kind (M2) — "resolve what stands": targets drawn from the
   *  live census (BOUNTY_SOURCES — worldboss decrees, the fracture, the
   *  revealed hunt, a besieged harborhold's muster). Events are the world's
   *  own scale, so the band opens wider than the minted-ground kinds. */
  answer: {
    band: { below: 8, above: 6 },
  },
  /** THE GATHER kind (first-writ W2) — "bring in the land's yield": target
   *  ground whose country stands gatherable kinds (the harvest fabric's
   *  own row read); the writ PLANTS what the ground lacks at arrival
   *  (World.seedGatherNodes — the cull's remote-writ law), so a chance-
   *  missed ambient stand can never strand the ask. Known-leaning seat:
   *  gathering is a walk-back activity, not an exploration. */
  gather: {
    seat: { range: { min: 1, max: 480 }, knownMul: 1.2, unknownMul: 1, veiledMul: 0.5, prefer: 'flat' } as SeatTuning,
    band: { below: 6, above: 3 },
    count: [2, 3] as [number, number],
  },
  /** THE SUMMONS kind (M3 K5) — "the board plants the ask": a summonable
   *  source's directed ignite, called at the ACCEPT. ADDITIVE by design
   *  (independent of ambient event counts — her event-density lever) but
   *  capped at `cap` standing summons per source across slate + hands;
   *  the package's own headroom refuses at the roll. Known-leaning seat
   *  (the ask tears open ground you can reach). */
  summons: {
    cap: 1,
    seat: { range: { min: 1, max: 480 }, knownMul: 1.2, unknownMul: 1, veiledMul: 0.4, prefer: 'flat' } as SeatTuning,
    band: { below: 6, above: 3 },
  },
  /** The errand's omen (the findability guarantee without the veil lift):
   *  whispered near, revealed close, aging wider — the omen fabric's own
   *  dials. */
  omen: { whisper: 150, reveal: 70, widenPerMin: 8 },
  /** Slate composition: no kind may take more than this many of the
   *  slate's seats (the diversity guarantee, card 6's shape). */
  slate: { maxPerKind: 2 },
  /** THE GROWTH RUNGS (M4 — the gatework's board chain): BROADER POSTINGS
   *  widen the standing slate (+offers per rung), FARTHER POSTINGS stretch
   *  every kind's seat reach (range.max × the fold). unlocks.ts DERIVES
   *  the catalog rows from these ladders (the broader-wares doctrine —
   *  append a rung HERE and the catalog + the arm's fold grow together);
   *  rung 1 of each gates on the first bounty ever turned in (the board
   *  must be a habit before width means anything), later rungs chain.
   *  The starter band's own offers override outranks BROADER while it
   *  lives — young boards stay small by law. */
  growth: {
    broader: [
      { flag: 'bounty_broader_1', cost: 90, add: 1 },
      { flag: 'bounty_broader_2', cost: 180, add: 1 },
    ] as readonly { flag: string; cost: number; add: number }[],
    farther: [
      { flag: 'bounty_farther_1', cost: 80, mul: 1.35 },
      { flag: 'bounty_farther_2', cost: 160, mul: 1.35 },
    ] as readonly { flag: string; cost: number; mul: number }[],
  },
  /** THE CHEVRON PATRON (M4 — charter §8): the active GATHER hand's
   *  unspent nodes point through the standing attention fold in the
   *  board's own accent; the glyph is a DIAL for her walk. Culls keep
   *  the writ's ☠ (the marks ARE writs — drawn == meant); charges,
   *  answers and summonses ride their own fixtures' standing pointers —
   *  the board adds a source, never the policy rework. */
  chevron: { glyph: '✦' },
  /** THE POSTING PIN (her adjustment, 2026-08-26 — the Patron's Hold
   *  brought to the board): a Vault ladder of reserve pins. A PINNED
   *  offer rides every re-deal — the beat's turn and the turn-in refresh
   *  alike — until accepted, released, or struck by the world's own
   *  reconcile (the pin holds a SEAT, never the truth: a dead ask still
   *  strikes). Capacity = owned rungs; unlocks.ts derives the catalog
   *  rows (Reserved Postings — the Reserved Wares kinship). */
  lock: {
    ladder: [
      { flag: 'bounty_lock_1', cost: 100 },
      { flag: 'bounty_lock_2', cost: 200 },
    ] as readonly { flag: string; cost: number }[],
  },
  /** THE KINSHIP (walk 2, her rulings — 2026-08-26): regional boards on
   *  the shared registry. Boards ALWAYS localize (seats measure from the
   *  board's own home — the exploration + regional-flavor ruling); ONE
   *  hand per board (the M0 per-board fold turned live — stockpiling
   *  across boards rewards the traveler); ONE shared beat lattice for
   *  every board (legibility — the turn-in refresh re-deals a board's
   *  slate and NEVER moves the clock); and THE JUICING LEAN — a zone
   *  already holding another board's postings weighs `overlapLean` in
   *  fresh seats (different kinds stack; bounties ADD, so overlap JUICES
   *  the ground — her turbocharge seed). The harborhold residence is the
   *  quay's own `bounty_board` service row (data/harborholds.ts, at
   *  prosperity 1 — the rung is that row's dial). */
  kinship: {
    overlapLean: 1.5,
  },
  /** THE STARTER BAND's dials (docs/design/bounty-first-writ.md §4, walk
   *  cards 1+2 coupled): the young board's whole lever surface. `offers`
   *  is her one-to-three; `youngBelow` is how many bounties turned in
   *  (run + account) before the tutorial pinning relaxes to the one
   *  perpetual anchor; `kinds` are the band's weight overrides (0 = off
   *  the young slate — no decrees, no errands until the board is met). */
  starter: {
    offers: 2,
    anchorZone: 'crossroads',
    youngLedger: 'bounty_done',
    youngBelow: 3,
    /** The gather joins the band wherever the ground fits — the Crossroads
     *  itself carries no harvest rows today, so the young pinned face
     *  honestly refuses there and the anchor retry deals charge/cull (an
     *  observation for her walk, not a hack). Young boards never summon
     *  or decree — the world's own events wait for the full grammar. */
    kinds: { charge: 1, cull: 1, gather: 1, errand: 0, answer: 0, summons: 0, survey: 0, trail: 0, puzzle: 0 } as Record<string, number>,
    lanes: { essence: 0.65, pouch: 0, lot: 0, unique: 0, craft: 0.35 },
  },
} as const;

/** ONE pay lane per posting (the visible price law: the card prints the
 *  exact pay). `essence` is R1; `unique` is R2's two faces (named by id, or
 *  a category — "a unique ring", her amendment); `lot` is R3 (a seeded
 *  assortment); `pouch`/`gem` are R4's two faces (Memory units, or a named
 *  TRUE skill Memory under THE MINT LAW). Multiple fields may be set; every component is owed. */
export interface BountyPay {
  /** Frozen reward budget; never reread the hero or a changing target at pay. */
  level?: number;
  /** Frozen allocation and recipe for audits; every component below pays. */
  budget?: { value: number; recipe: string };
  xp?: number;
  essence?: EssenceCost[];
  /** R5 — THE SMITH'S WRIT (the steady hand, walk 2): a craft credit,
   *  minted as a 1×1 writ item at the turn-in; redeemed at Brandt by
   *  tracing the piece. COMPLEXITY is the named axis (her horizontal
   *  ruling — intricacy, never strength): the CARD prints it, choosing
   *  the bounty IS choosing the class, and the writ narrows the bench to
   *  bases OF that class (card 2c) — the shape is more complex because
   *  the item is. */
  craft?: { category: ItemCategory; complexity: number };
  unique?: { id?: string; category?: ItemCategory; random?: boolean; focused?: boolean; essenceValue?: number };
  lot?: { count: number; category: ItemCategory };
  pouch?: { kind: MemoryKind; count: number };
  gem?: { id: string };
}

/** One generated posting — the persisted instance (pure JSON; the derived
 *  QuestDef is rebuilt from this + the registries at read time, the
 *  live-registry mandate). `failed` is THE FAIL LANE's latch (horizon open
 *  — walk 1): it resolves at the board like a turn-in, paying nothing.
 *  `face` is the errand's veil flavor ('omen' default / 'lift' minority);
 *  `acceptAt` feeds the omen's aging; `cull` is the cull kind's own claim
 *  ledger (credited at the kill chokepoint — readable from anywhere,
 *  wipe-proof: re-entry re-posts the remainder). */
export interface BountyPosting {
  id: string;
  kind: string;
  boardId: string;
  zoneId: string;
  beat: number;
  pay: BountyPay;
  /** Explicit commissioned quarry level on already-existing ground. Ambient
   * levels never follow the player. Fixed at offer, saved through turn-in. */
  challengeLevel?: number;
  failed?: boolean;
  face?: 'omen' | 'lift';
  acceptAt?: number;
  cull?: { count: number; claimed: number };
  /** THE POSTING PIN (her adjustment): a pinned OFFER rides every re-deal
   *  until accepted, released, or struck by the world (persisted — the
   *  vendor-hold law: the same posting, not a re-roll). */
  locked?: boolean;
  /** THE GATHER's claim ledger (first-writ W2 — the cull's shape on the
   *  harvest fabric): credited at World.harvestSettle, readable anywhere,
   *  wipe-proof; re-entry re-plants the remainder (seedGatherNodes). */
  gather?: { count: number; claimed: number };
  survey?: { count: number; zones: string[]; minLevel: number };
  trail?: { path: string[]; crossed: number; peak: number };
  /** THE EXPEDITION's claim (data/bountyExpeditions.ts — the authored-map
   *  fabric): the hand-made map this posting charters, the charted anchor
   *  it is minted beside AT THE TAKE (the zone named by `zoneId` does not
   *  exist until accept), the mint seed and the level the ground wears.
   *  Persisted with the posting (the derived QuestDef reads the minted def). */
  expedition?: { map: string; anchor: string; seed: number; level: number };
  /** THE ANSWER's claim (M2 K4): the source row + the target's stable key,
   *  with the card copy frozen at the arm (the census churns; the card must
   *  still read after the target moves or leaves) and `base` = the source's
   *  resolution-ledger count AT THE ARM. The delta law: a later bump past
   *  the baseline reads as resolved — and because the reconcile strikes any
   *  offer whose ask dies before it is taken, the arm baseline IS the
   *  at-accept baseline by construction. Sources with a standing-state read
   *  (the harborhold's 'open') omit `ledger`. */
  answer?: { source: string; key: string; name: string; ask: string; title?: string; ledger?: string; base: number };
}

/** Deep-copy a posting (save writes; slate snapshots). */
export function clonePosting(p: BountyPosting): BountyPosting {
  return {
    id: p.id, kind: p.kind, boardId: p.boardId, zoneId: p.zoneId, beat: p.beat,
    pay: {
      ...(p.pay.level !== undefined ? { level: p.pay.level } : {}),
      ...(p.pay.budget ? { budget: { ...p.pay.budget } } : {}),
      ...(p.pay.xp !== undefined ? { xp: p.pay.xp } : {}),
      ...(p.pay.essence ? { essence: p.pay.essence.map(c => ({ ...c })) } : {}),
      ...(p.pay.unique ? { unique: { ...p.pay.unique } } : {}),
      ...(p.pay.lot ? { lot: { ...p.pay.lot } } : {}),
      ...(p.pay.pouch ? { pouch: { ...p.pay.pouch } } : {}),
      ...(p.pay.gem ? { gem: { ...p.pay.gem } } : {}),
      ...(p.pay.craft ? { craft: { ...p.pay.craft } } : {}),
    },
    ...(p.failed ? { failed: true } : {}),
    ...(p.face ? { face: p.face } : {}),
    ...(p.locked ? { locked: true } : {}),
    ...(p.acceptAt !== undefined ? { acceptAt: p.acceptAt } : {}),
    ...(p.cull ? { cull: { ...p.cull } } : {}),
    ...(p.gather ? { gather: { ...p.gather } } : {}),
    ...(p.survey ? { survey: { ...p.survey, zones: [...p.survey.zones] } } : {}),
    ...(p.trail ? { trail: { ...p.trail, path: [...p.trail.path] } } : {}),
    ...(p.answer ? { answer: { ...p.answer } } : {}),
    ...(p.expedition ? { expedition: { ...p.expedition } } : {}),
    ...(p.challengeLevel !== undefined ? { challengeLevel: p.challengeLevel } : {}),
  };
}

// ---------------------------------------------------------------------------
// THE SOURCE REGISTRY (M2 — charter §7, the live-world reader): the
// world-grain sibling of registerPackageAsk. A source row publishes a live
// CENSUS of answerable asks; THE COMPOUNDING LAW is the whole point — the
// board never hardcodes a package list. Every fabric that registers a row
// becomes board content the day it ships (rows live in the fabric's own
// module, registered on import — the registerMarkerSource contract; zero
// edits here), and every future fabric is one row from being a posting.
// ---------------------------------------------------------------------------

/** One answerable ask, read from the live world at census time. */
export interface BountyTargetRef {
  /** Stable instance key within the source ('wb:<id>', 'hold:<zoneId>') —
   *  the posting's claim; a ref gone from the census reads as departed. */
  key: string;
  /** Where the ask stands (the posting's zone: markers, band, pay fold). */
  zoneId: string;
  /** The target's noun, precision register (card + courtesy notices). */
  name: string;
  /** The ask spoken plainly — one line, no captions. */
  ask: string;
  /** Card title override (the worldboss lane speaks as THE DECREE); absent
   *  = "The Answer: <name>". */
  title?: string;
  /** Run-ledger key whose count baselines at the arm — a later bump past
   *  the baseline reads as resolved (the delta law). Sources resolved by a
   *  standing-state read (the harborhold) omit it and answer resolved(). */
  ledger?: string;
}

/** One live-census source — registered from the owning fabric's module. */
export interface BountySourceRow {
  id: string;
  /** The live census: every answerable ask this source stands behind right
   *  now. A pure read (never ignites, never mutates); empty when the
   *  package is absent or quiet. */
  census(world: World): BountyTargetRef[];
  /** The standing-state resolution read, for sources without a resolution
   *  ledger (the harborhold's `state === 'open'`). Refs that carry `ledger`
   *  never consult this — the kind's own delta law answers first. */
  resolved?(world: World, p: BountyPosting): boolean;
  /** The fail read (the hold FELL) — resolves at the board like a turn-in,
   *  no pay, per walk-1's fail ruling. A live read, never a latch. */
  failed?(world: World, p: BountyPosting): boolean;
  /** THE SUMMONS face (M3 K5 — "the board plants the ask"): declaring this
   *  block makes the source SUMMONABLE. `ignite` is the directed verb
   *  (devIgnite promoted to the registry — the board's accept calls it);
   *  `headroom` is the package's own room to breathe (false = refused at
   *  the roll AND struck at the reconcile — a package absent from the run
   *  reads no room, so package-less worlds never deal a dead card);
   *  `fit` is the seat predicate (the package's own targetability);
   *  `name`/`ask` speak the precision register; `ledger` is the
   *  resolution stamp, baselined at the ACCEPT — the instance is born
   *  there, so only seals the summons could have caused count. */
  summons?: {
    name: string;
    ask(zoneName: string, level: number): string;
    ledger: string;
    headroom(world: World): boolean;
    /** The seat predicate — the package's own targetability (zone-pure). */
    fit?(def: ZoneDef): boolean;
    ignite(world: World, zoneId: string): boolean;
  };
}

export const BOUNTY_SOURCES: Record<string, BountySourceRow> = {};

export function registerBountySource(row: BountySourceRow): void {
  BOUNTY_SOURCES[row.id] = row; // HMR-safe: replace by id
}

// ---------------------------------------------------------------------------
// THE BANDS (docs/design/bounty-first-writ.md §4 — the slate's lever
// surface): a band row is a live predicate plus overrides, folded over the
// standing dials at the arm. The FIRST live row wins; no band live = the
// standing config, byte-identical. The debut STARTER band is walk cards 1+2
// coupled: per run while the Crossroads stands uncleared (her caveat
// recorded — an aggregated walk may re-rule the predicate to account-young;
// that re-rule is this one `while` line), the slate deals small and pays
// cash and crafting writs, with THE ANCHOR pinning the Crossroads — every seat while
// the account is YOUNG (the tutorial phase), ONE seat in perpetuity after
// ("so that it isn't the only option available", her words).
// ---------------------------------------------------------------------------

export interface BountyBandRow {
  id: string;
  /** The board this band governs (absent = every board). The starter
   *  band is Lastlight's own — a quay board across the sea must never
   *  pin the Crossroads (the kinship's board scope). */
  board?: string;
  /** The live predicate — a pure read over the run's world; first live
   *  row wins the arm. */
  while(world: World): boolean;
  /** Slate-size override (absent = BOUNTY_BOARD_CFG.offers). */
  offers?: number;
  /** Kind-weight overrides (0 = off this band's slate; an absent kind
   *  keeps its registry weight). */
  kinds?: Record<string, number>;
  /** Pay-lane weight overrides (the rollBountyPay fold). */
  lanes?: { essence: number; pouch: number; lot: number; unique: number; craft: number };
  /** THE ANCHOR: pin the FIRST seat's target to this zone in perpetuity —
   *  and while the account reads YOUNG (run + account ledger under the
   *  threshold), pin EVERY seat. Pinned seats trade the one-posting-per-
   *  zone law for one-KIND-per-zone (distinct faces on the same ground
   *  are distinct asks) and bypass the level band (the pin names the
   *  ground on purpose); every structural honesty check stands. */
  anchor?: { zoneId: string; youngLedger: string; youngBelow: number };
}

export const BOUNTY_BANDS: BountyBandRow[] = [
  {
    id: 'starter',
    board: 'lastlight',
    while: w => !w.objectiveDoneAt(BOUNTY_BOARD_CFG.starter.anchorZone),
    offers: BOUNTY_BOARD_CFG.starter.offers,
    kinds: BOUNTY_BOARD_CFG.starter.kinds,
    lanes: BOUNTY_BOARD_CFG.starter.lanes,
    anchor: {
      zoneId: BOUNTY_BOARD_CFG.starter.anchorZone,
      youngLedger: BOUNTY_BOARD_CFG.starter.youngLedger,
      youngBelow: BOUNTY_BOARD_CFG.starter.youngBelow,
    },
  },
];

/** The arm's band resolve — first live row FOR THIS BOARD wins, none =
 *  the standing config. A pure read (bands never write). */
export function liveBountyBand(world: World, boardId: string = BOUNTY_BOARD_CFG.boardId): BountyBandRow | null {
  for (const b of BOUNTY_BANDS) {
    if (b.board !== undefined && b.board !== boardId) continue;
    if (b.while(world)) return b;
  }
  return null;
}

/** Rows in registration-independent order (sorted by id — the
 *  registerPackageAsk determinism law: the census pool, and so the seeded
 *  slate, never depends on import order). */
export function bountySourceRows(): BountySourceRow[] {
  return Object.values(BOUNTY_SOURCES).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** What a kind's roll may read — a narrow host so rolls stay pure over the
 *  seeded rng (World assembles it at the arm; probes can too). */
export interface BountyRollHost {
  routes?: ReadonlyMap<string, import('../world/travelRoutes').TravelRoute>;
  /** Actual usable approach, supplied by the board; optional for standalone rolls. */
  routeFits?(zoneId: string): boolean;
  view: OverlayView;
  zoneMap: Record<string, ZoneDef>;
  /** Zone ids whose objective is already complete (a charge never posts
   *  finished work). */
  objectiveDone(zoneId: string): boolean;
  /** Ground the player's feet have walked (the errand's exclusion — an
   *  entered zone can never be an exploration ask). */
  visited(zoneId: string): boolean;
  /** Name a TRUE skill Memory from the account's own drop pool at this
   *  level (the R4 gem face — the pool law stays in one place, World's).
   *  Null when the pool is empty. */
  pickGemId(level: number, rng: Rng): string | null;
  /** THE ANSWER pool (M2 K4): every source's live census, gathered in
   *  sorted-row order with each ref's resolution-ledger baseline already
   *  read (World assembles it at the arm — the roll stays a pure fold
   *  over the host). */
  answers(): { source: string; ref: BountyTargetRef; base: number }[];
  /** THE PIN (the starter band's anchor — W1): when set, the roll must
   *  target exactly this zone or return null. A pinned roll bypasses the
   *  level band (the pin names the ground on purpose) but keeps every
   *  structural honesty check — a kind that cannot honestly ask here
   *  refuses, and the arm tries the next kind. */
  pin?: string;
  /** THE FARTHER fold (M4): the owned growth rungs' reach multiplier —
   *  every kind's seat range.max stretches by it (1 = the standing reach). */
  reach: number;
  /** THE KINSHIP's localization ref (her ruling: boards ALWAYS localize):
   *  the arming board's own home zone — every seat measures from here,
   *  never from the hero. */
  boardZoneId: string;
  /** THE JUICING LEAN: the weight multiplier for a zone already holding
   *  another board's postings (her turbocharge seed — different kinds ADD
   *  features to one zone). 1 for unclaimed ground. */
  lean(zoneId: string): number;
  /** THE CROSS-BOARD DEDUPE: is this exact (kind, zone) already posted or
   *  in hand ANYWHERE? Different kinds may stack one zone (the juice);
   *  the same ask must never pay twice for one deed. */
  kindClaimed(kind: string, zoneId: string): boolean;
  /** THE SUMMONABLE roster (M3 K5): source ids whose summons face stands
   *  with room to breathe RIGHT NOW (headroom read at the arm). */
  igniteReady(): string[];
  /** Standing summons count for a source across THIS slate's dealt offers
   *  + the taken hands (the cap law's read — live over the arm's build). */
  summonsStanding(source: string): number;
  playerLevel: number;
  boardId: string;
  beat: number;
  /** THE SLATE KEY (id derivation): the beat, plus the turn-in refresh's
   *  limb when one has fired this beat ('3' or '3r2') — a refreshed deal
   *  can never re-mint an id a standing hand already wears. */
  slateKey: string;
  /** Posting index within this slate (id derivation — ids stay unique). */
  seq: number;
}

/** One posting kind — the open registry row. done/failed/annulled are pure
 *  READS (never writes): the predicate is the law, hooks are UX. */
export interface BountyKindRow {
  id: string;
  /** Slate-roll share (M0's single kind makes this moot; the law stands). */
  weight: number;
  /** STRUCTURAL availability (M4): a kind with nothing to say (an empty
   *  census, a bare summonable roster) leaves the DRAW entirely instead of
   *  wasting the seat — the slate stays as full as the world is honest.
   *  Absent = always in the draw (seat-search misses still run short). */
  available?(host: BountyRollHost): boolean;
  /** Local progression commissions get a seat before optional repeatable work. */
  bountyPriority?(host: BountyRollHost): boolean;
  roll(host: BountyRollHost, rng: Rng, taken: Set<string>): BountyPosting | null;
  /** THE WORLD ACT at the take (M3 — the summons' ignition): runs BEFORE
   *  the hand seats; a returned reason REFUSES the accept and strikes the
   *  posting with its courtesy (the stale-offer race law). May mutate the
   *  posting (the summons stamps its born key + at-accept baseline). */
  accept?(world: World, p: BountyPosting): string | null;
  /** Optional travel contract: null means the player chooses the destination. */
  target?(world: World, p: BountyPosting): string | null;
  route?(world: World, p: BountyPosting): string;
  arrival?(world: World, p: BountyPosting, zone: ZoneDef, firstVisit: boolean, from?: string): void;
  /** Successful turn-in only; never called for abandon, failure or mere completion. */
  collectBounty?(world: World, p: BountyPosting): void;
  done(world: World, p: BountyPosting): boolean;
  failed?(world: World, p: BountyPosting): boolean;
  /** A reason string ANNULS the posting (the world moved on — the reconcile's
   *  honesty read); null = the ask still stands. */
  annulled?(world: World, p: BountyPosting): string | null;
  /** Card copy — the precision register (names, reads; never captions). */
  copy(world: World, p: BountyPosting): { title: string; ask: string };
}

export const BOUNTY_KINDS: Record<string, BountyKindRow> = {};

export function registerBountyKind(row: BountyKindRow): void {
  BOUNTY_KINDS[row.id] = row; // HMR-safe: replace by id
}

/** The R1 essence fold: one tint (by the zone's level band) covering the
 *  ask's Mortal-Essence worth. */
export function bountyChargePay(zoneLevel: number): EssenceCost[] {
  const cfg = BOUNTY_BOARD_CFG.pay;
  const value = Math.max(1, Math.round(cfg.base + cfg.perLevel * Math.max(1, zoneLevel)));
  const ids = Object.keys(ESSENCES) as EssenceId[];
  let tier = 0;
  for (let t = 0; t < ids.length && t < cfg.tierAt.length; t++) {
    if (zoneLevel >= cfg.tierAt[t]) tier = t;
  }
  const id = ids[tier];
  return [{ essence: id, count: essenceUnitsForValue(id, value) }];
}

/** The named-unique pool at a target level (arm-time selection; unseen
 *  uniques POST — ruled). */
export function bountyUniquePool(level: number): { id: string; name: string; weight: number }[] {
  const reach = level + BOUNTY_BOARD_CFG.lanes.unique.reachAbove;
  return UNIQUE_LIST.filter(u => (u.minIlvl ?? 0) <= reach && !!ITEM_BASES[u.baseId] && (u.weight ?? 100) > 0)
    .map(u => ({ id: u.id, name: u.name, weight: u.weight ?? 100 }));
}

/** Category-face pool at a target level — only categories that actually
 *  hold a rollable unique there (never a hollow card). */
export function bountyUniqueCategories(level: number): ItemCategory[] {
  const reach = level + BOUNTY_BOARD_CFG.lanes.unique.reachAbove;
  return BOUNTY_BOARD_CFG.lanes.unique.categories.filter(cat =>
    UNIQUE_LIST.some(u => (u.minIlvl ?? 0) <= reach && (u.weight ?? 100) > 0
      && ITEM_BASES[u.baseId]?.category === cat));
}

/** Roll ONE pay lane for a posting (seeded — part of the foreordained
 *  arm). Falls back down the ladder to essence whenever a richer lane's
 *  pool is empty at this level, so a card never prints a hollow pay.
 *  `weights` overrides the standing lane weights (the band fold — the
 *  starter band's cash-and-writ slate rides this one parameter). */
export function rollBountyPay(
  host: Pick<BountyRollHost, 'pickGemId'>, rng: Rng, level: number,
  weights?: { essence: number; pouch: number; lot: number; unique: number; craft: number },
): BountyPay {
  const L = BOUNTY_BOARD_CFG.lanes;
  const w = weights ?? L.weights;
  const total = w.essence + w.pouch + w.lot + w.unique + (w.craft ?? 0);
  let r = rng.next() * Math.max(0.0001, total);
  let lane: 'essence' | 'pouch' | 'lot' | 'unique' | 'craft' = 'essence';
  for (const [k, wv] of [['essence', w.essence], ['pouch', w.pouch], ['lot', w.lot], ['unique', w.unique], ['craft', w.craft ?? 0]] as const) {
    r -= wv;
    if (r <= 0) { lane = k; break; }
  }
  if (lane === 'craft') {
    // R5 THE SMITH'S WRIT: a seeded category off the outline gamut + the
    // tier off the target's level (the tierAt ladder) — the card prints
    // both (the visible price law), and the trace's band derives from the
    // tier at the bench (TRACE_CFG.tierBands).
    const C = L.craft;
    let maxC = 1;
    for (let t = 0; t < C.complexityAt.length; t++) if (level >= C.complexityAt[t]) maxC = t + 1;
    // Never a hollow card: only (category, complexity) pairs with a
    // STANDING base may post — the class derives from what each base IS
    // (baseComplexityOf), so the ornate class opens the day her exotic
    // bases land, by data.
    const pairs: { category: ItemCategory; complexity: number }[] = [];
    for (const c of C.categories) {
      for (let k = 1; k <= maxC; k++) {
        if (Object.values(ITEM_BASES).some(b => b.category === c && baseComplexityOf(b) === k && (b.minIlvl ?? 0) <= level)) {
          pairs.push({ category: c, complexity: k });
        }
      }
    }
    if (!pairs.length) return { essence: bountyChargePay(level) };
    return { craft: { ...pairs[rng.int(0, pairs.length - 1)] } };
  }
  if (lane === 'unique') {
    const named = rng.next() < L.unique.namedShare;
    if (named) {
      const pool = bountyUniquePool(level);
      if (pool.length) {
        let t = 0;
        for (const u of pool) t += u.weight;
        let x = rng.next() * t;
        let pick = pool[pool.length - 1];
        for (const u of pool) { x -= u.weight; if (x <= 0) { pick = u; break; } }
        return { unique: { id: pick.id } };
      }
    }
    const cats = bountyUniqueCategories(level);
    if (cats.length) return { unique: { category: cats[rng.int(0, cats.length - 1)] } };
    lane = 'lot'; // no unique stands at this level — fall down the ladder
  }
  if (lane === 'lot') {
    const cats = L.lot.categories.filter(cat => Object.values(ITEM_BASES)
      .some(b => b.category === cat && b.dropWeight > 0 && (b.minIlvl ?? 0) <= level));
    if (!cats.length) return { essence: bountyChargePay(level) };
    return {
      lot: {
        count: rng.int(L.lot.count[0], L.lot.count[1]),
        category: cats[rng.int(0, cats.length - 1)],
      },
    };
  }
  if (lane === 'pouch') {
    if (rng.next() < L.gemShare) {
      const id = host.pickGemId(level, rng);
      if (id) return { gem: { id } };
    }
    return { pouch: { kind: 'rough', count: rng.int(L.pouch.roughCount[0], L.pouch.roughCount[1]) } };
  }
  return { essence: bountyChargePay(level) };
}

/** One line describing a pay spec (card faces + notices — the visible
 *  price law: the exact pay, printed). */
export function describeBountyPay(pay: BountyPay): string {
  const budget = pay.level === undefined || !(pay.unique || pay.lot || pay.craft) ? '' : ` · item Lv ${pay.level}`
    + (pay.unique || pay.lot ? ` · requires Lv ${levelReqForTier(tierForIlvl(pay.level))}` : '');
  return [...(['craft', 'unique', 'lot', 'gem', 'pouch'] as const).map(k => describeBountyLane({ [k]: pay[k] })),
    ...(pay.essence ?? []).map(c => `${c.count} ${ESSENCES[c.essence]?.label ?? c.essence}`),
    pay.xp ? `${pay.xp} XP` : ''].filter(Boolean).join(' + ') + budget;
}

function describeBountyLane(pay: BountyPay): string {
  if (pay.craft) return `Smith's Writ: ${pay.craft.category} (${['low', 'medium', 'high'][pay.craft.complexity - 1] ?? 'low'} complexity)`;
  if (pay.unique) {
    if (pay.unique.random) return pay.unique.focused ? 'Random Unique (rarer odds)' : 'Random Unique';
    if (pay.unique.id) return `Unique: ${UNIQUE_LIST.find(u => u.id === pay.unique!.id)?.name ?? pay.unique.id}`;
    return `Unique ${pay.unique.category}`;
  }
  if (pay.lot) return `${pay.lot.count} ${pay.lot.category} items (Magic/Rare)`;
  if (pay.gem) {
    // THE OFFERED GRADE's words: the card prints the floor its ladder can
    // never fall beneath ("Magic or finer") — the visible price law.
    const floor = skillRarityFloor(BOUNTY_BOARD_CFG.lanes.gem.rarityWeights);
    const grade = floor && floor !== 'common' ? ` (${SKILL_RARITIES[floor].label} or finer)` : '';
    return `${SKILLS[pay.gem.id]?.name ?? pay.gem.id} Memory${grade}`;
  }
  if (pay.pouch) return `${pay.pouch.count} ${pay.pouch.kind === 'preformed' ? 'Preformed' : 'Rough'} Memory units`;
  return '';
}

// --- K2 · THE CHARGE — "complete the objective of the place" ---------------
registerBountyKind({
  id: 'charge',
  weight: 1,
  roll(host, rng, taken) {
    const cfg = BOUNTY_BOARD_CFG.charge;
    // The structural honesty checks (a pinned roll keeps these; only the
    // level band and the seat search belong to the unpinned path).
    const ok = (zz: ZoneDef): boolean => !host.objectiveDone(zz.id)
      && !cfg.refuse.includes(zz.objective.kind)
      && !(zz.objective.kind === 'puzzle' && host.kindClaimed('puzzle', zz.id))
      && !host.kindClaimed('charge', zz.id);
    const z = host.pin
      ? (host.zoneMap[host.pin] && ok(host.zoneMap[host.pin]) && (host.routeFits?.(host.pin) ?? true) ? host.zoneMap[host.pin] : null)
      : pickSeat(host.view, {
        event: 'bountyboard',
        ...cfg.seat,
        // THE FARTHER fold (M4): owned reach rungs stretch the writ's range.
        range: { min: cfg.seat.range!.min, max: Math.round(cfg.seat.range!.max! * host.reach) },
        // THE KINSHIP (her rulings): every board LOCALIZES — distances
        // measure from the board's own home, never the hero — and THE
        // JUICING LEAN weighs ground other boards' postings already hold
        // (different kinds ADD features to one zone; same kinds dedupe).
        from: host.boardZoneId,
        weigh: zz => host.lean(zz.id),
        filter: zz => !taken.has(zz.id) && ok(zz) && (host.routeFits?.(zz.id) ?? true)
          && zz.level >= host.playerLevel - cfg.band.below
          && zz.level <= host.playerLevel + cfg.band.above,
      }, rng);
    if (!z) return null;
    return {
      id: `bounty_${host.slateKey}_${host.seq}`, kind: 'charge', boardId: host.boardId,
      zoneId: z.id, beat: host.beat, pay: {},
    };
  },
  done: (world, p) => world.objectiveDoneAt(p.zoneId),
  // No failed() read here: a charge's ground re-arms on revisit, so no
  // PERMANENT failure case exists at this grain today — the lane stands
  // structurally (BountyPosting.failed + the board's acknowledgment) per
  // walk 1's horizon-open ruling, waiting for a kind that can truly fail.
  annulled: (world, p) => world.zoneMap[p.zoneId] ? null : 'the ground is gone from every chart',
  copy(world, p) {
    const z = world.zoneMap[p.zoneId];
    if (!z) return { title: 'The Charge', ask: 'the ground is gone' };
    const read = OBJECTIVE_READS[z.objective.kind]?.read ?? 'meet the ground\'s ask';
    return {
      title: `Objective: ${z.name}`,
      ask: `${read.charAt(0).toUpperCase()}${read.slice(1)}.`,
    };
  },
});

// --- K1 · THE ERRAND — "reach the place" (M1) ------------------------------
registerBountyKind({
  id: 'errand',
  weight: 1,
  roll(host, rng, taken) {
    const cfg = BOUNTY_BOARD_CFG.errand;
    // An errand's unwalked-ground ask is structural: a pinned errand on
    // walked ground honestly refuses (the pin passes to the next kind).
    const z = host.pin
      ? (host.zoneMap[host.pin] && !host.visited(host.pin) && !host.kindClaimed('errand', host.pin)
        && (host.routeFits?.(host.pin) ?? true) ? host.zoneMap[host.pin] : null)
      : pickSeat(host.view, {
        event: 'bountyboard',
        ...cfg.seat,
        // THE FARTHER fold (M4): owned reach rungs stretch the writ's range.
        range: { min: cfg.seat.range!.min, max: Math.round(cfg.seat.range!.max! * host.reach) },
        // THE KINSHIP (her rulings): every board LOCALIZES — distances
        // measure from the board's own home, never the hero — and THE
        // JUICING LEAN weighs ground other boards' postings already hold
        // (different kinds ADD features to one zone; same kinds dedupe).
        from: host.boardZoneId,
        weigh: zz => host.lean(zz.id),
        filter: zz => !taken.has(zz.id) && (host.routeFits?.(zz.id) ?? true)
          && !host.visited(zz.id)
          && !host.kindClaimed('errand', zz.id)
          && zz.level >= host.playerLevel - cfg.band.below
          && zz.level <= host.playerLevel + cfg.band.above,
      }, rng);
    if (!z) return null;
    return {
      id: `bounty_${host.slateKey}_${host.seq}`, kind: 'errand', boardId: host.boardId,
      zoneId: z.id, beat: host.beat, pay: {},
      // THE VEIL is per-posting flavor (card 4, ruled): default = the omen
      // face, discovery stays the ask; a minority rolls the deed-lift.
      face: rng.next() < cfg.liftShare ? 'lift' : 'omen',
    };
  },
  done: (world, p) => world.visited.has(p.zoneId),
  annulled: (world, p) => world.zoneMap[p.zoneId] ? null : 'the ground is gone from every chart',
  copy(world, p) {
    const z = world.zoneMap[p.zoneId];
    if (!z) return { title: 'The Errand', ask: 'the ground is gone' };
    return {
      title: `Explore: ${z.name}`,
      ask: 'Enter the zone.',
    };
  },
});

// --- K3 · THE CULL — "kill the named" (M1: the writ grammar sent remote) ---
registerBountyKind({
  id: 'cull',
  weight: 1,
  roll(host, rng, taken) {
    const cfg = BOUNTY_BOARD_CFG.cull;
    // THE MIXED-LANE GUARD is structural (a pinned cull keeps it): never a
    // zone whose own objective posts writs, never harborhold ground — every
    // mark in a cull zone then belongs to the posting, and bountyView's
    // per-zone lane inference stays honest without a per-mark stamp.
    const ok = (zz: ZoneDef): boolean => zz.objective.kind !== 'bounty'
      && !zz.harborhold && !zz.holdAnchor
      && !!zz.packs?.table?.length
      && !host.kindClaimed('cull', zz.id);
    const z = host.pin
      ? (host.zoneMap[host.pin] && ok(host.zoneMap[host.pin]) && (host.routeFits?.(host.pin) ?? true) ? host.zoneMap[host.pin] : null)
      : pickSeat(host.view, {
        event: 'bountyboard',
        ...cfg.seat,
        // THE FARTHER fold (M4): owned reach rungs stretch the writ's range.
        range: { min: cfg.seat.range!.min, max: Math.round(cfg.seat.range!.max! * host.reach) },
        // THE KINSHIP (her rulings): every board LOCALIZES — distances
        // measure from the board's own home, never the hero — and THE
        // JUICING LEAN weighs ground other boards' postings already hold
        // (different kinds ADD features to one zone; same kinds dedupe).
        from: host.boardZoneId,
        weigh: zz => host.lean(zz.id),
        filter: zz => !taken.has(zz.id) && ok(zz) && (host.routeFits?.(zz.id) ?? true)
          && zz.level >= host.playerLevel - cfg.band.below
          && zz.level <= host.playerLevel + cfg.band.above,
      }, rng);
    if (!z) return null;
    return {
      id: `bounty_${host.slateKey}_${host.seq}`, kind: 'cull', boardId: host.boardId,
      zoneId: z.id, beat: host.beat, pay: {},
      cull: { count: rng.int(cfg.count[0], cfg.count[1]), claimed: 0 },
    };
  },
  done: (_world, p) => !!p.cull && p.cull.claimed >= p.cull.count,
  annulled: (world, p) => world.zoneMap[p.zoneId] ? null : 'the ground is gone from every chart',
  copy(world, p) {
    const z = world.zoneMap[p.zoneId];
    const n = p.cull?.count ?? 0;
    const left = Math.max(0, n - (p.cull?.claimed ?? 0));
    if (!z) return { title: 'The Cull', ask: 'the ground is gone' };
    return {
      title: `Hunt: ${z.name}`,
      ask: `Slay ${n} empowered marks · ${n - left}/${n}`,
    };
  },
});

// --- K6 · THE GATHER — "bring in the land's yield" (first-writ W2) ---------
registerBountyKind({
  id: 'gather',
  weight: 1,
  roll(host, rng, taken) {
    const cfg = BOUNTY_BOARD_CFG.gather;
    // The fit is the harvest fabric's own row read (the lair predicate
    // idiom): only ground whose country stands gatherable KINDS may be
    // asked — the writ then plants what the ground lacks at arrival
    // (World.seedGatherNodes, the cull's remote-writ law), so a chance-
    // missed ambient stand can never strand the ask. Safe and spoils-
    // sealed ground never harvests (bootHarvest's own refusals).
    const ok = (zz: ZoneDef): boolean => zz.objective.kind !== 'safe'
      && zz.spoils !== 'none'
      && harvestRowsFor(zz.biome, zz.tileset).length > 0
      && !host.kindClaimed('gather', zz.id);
    const z = host.pin
      ? (host.zoneMap[host.pin] && ok(host.zoneMap[host.pin]) && (host.routeFits?.(host.pin) ?? true) ? host.zoneMap[host.pin] : null)
      : pickSeat(host.view, {
        event: 'bountyboard',
        ...cfg.seat,
        // THE FARTHER fold (M4): owned reach rungs stretch the writ's range.
        range: { min: cfg.seat.range!.min, max: Math.round(cfg.seat.range!.max! * host.reach) },
        // THE KINSHIP (her rulings): every board LOCALIZES — distances
        // measure from the board's own home, never the hero — and THE
        // JUICING LEAN weighs ground other boards' postings already hold
        // (different kinds ADD features to one zone; same kinds dedupe).
        from: host.boardZoneId,
        weigh: zz => host.lean(zz.id),
        filter: zz => !taken.has(zz.id) && ok(zz) && (host.routeFits?.(zz.id) ?? true)
          && zz.level >= host.playerLevel - cfg.band.below
          && zz.level <= host.playerLevel + cfg.band.above,
      }, rng);
    if (!z) return null;
    return {
      id: `bounty_${host.slateKey}_${host.seq}`, kind: 'gather', boardId: host.boardId,
      zoneId: z.id, beat: host.beat, pay: {},
      gather: { count: rng.int(cfg.count[0], cfg.count[1]), claimed: 0 },
    };
  },
  done: (_world, p) => !!p.gather && p.gather.claimed >= p.gather.count,
  annulled: (world, p) => world.zoneMap[p.zoneId] ? null : 'the ground is gone from every chart',
  copy(world, p) {
    const z = world.zoneMap[p.zoneId];
    const n = p.gather?.count ?? 0;
    const left = Math.max(0, n - (p.gather?.claimed ?? 0));
    if (!z) return { title: 'The Gather', ask: 'the ground is gone' };
    return {
      title: `Gather: ${z.name}`,
      ask: `Harvest ${n} resource nodes · ${n - left}/${n}`,
    };
  },
});

// --- K5 · THE SUMMONS — "the board plants the ask" (M3) ---------------------
registerBountyKind({
  id: 'summons',
  weight: 1,
  available: host => host.igniteReady()
    .some(s => host.summonsStanding(s) < BOUNTY_BOARD_CFG.summons.cap),
  roll(host, rng, taken) {
    const cfg = BOUNTY_BOARD_CFG.summons;
    // A summonable source with room to breathe, under the cap (slate +
    // hands). ADDITIVE by design: ambient event counts never gate this —
    // only the package's own headroom and the board's own cap do.
    const srcs = host.igniteReady().filter(s => host.summonsStanding(s) < cfg.cap);
    if (!srcs.length) return null;
    const source = srcs[rng.int(0, srcs.length - 1)];
    const face = BOUNTY_SOURCES[source]?.summons;
    if (!face) return null;
    const ok = (zz: ZoneDef): boolean => (face.fit?.(zz) ?? true) && !host.kindClaimed('summons', zz.id);
    const z = host.pin
      ? (host.zoneMap[host.pin] && ok(host.zoneMap[host.pin]) && (host.routeFits?.(host.pin) ?? true) ? host.zoneMap[host.pin] : null)
      : pickSeat(host.view, {
        event: 'bountyboard',
        ...cfg.seat,
        // THE FARTHER fold (M4): owned reach rungs stretch the writ's range.
        range: { min: cfg.seat.range!.min, max: Math.round(cfg.seat.range!.max! * host.reach) },
        // THE KINSHIP (her rulings): every board LOCALIZES — distances
        // measure from the board's own home, never the hero — and THE
        // JUICING LEAN weighs ground other boards' postings already hold
        // (different kinds ADD features to one zone; same kinds dedupe).
        from: host.boardZoneId,
        weigh: zz => host.lean(zz.id),
        filter: zz => !taken.has(zz.id) && ok(zz) && (host.routeFits?.(zz.id) ?? true)
          && zz.level >= host.playerLevel - cfg.band.below
          && zz.level <= host.playerLevel + cfg.band.above,
      }, rng);
    if (!z) return null;
    return {
      id: `bounty_${host.slateKey}_${host.seq}`, kind: 'summons', boardId: host.boardId,
      zoneId: z.id, beat: host.beat, pay: {},
      answer: {
        source, key: '', name: face.name,
        ask: face.ask(z.name, z.level), ledger: face.ledger, base: 0,
      },
    };
  },
  // THE IGNITION (the world act at the take): the source's directed verb
  // fires BEFORE the hand seats; a refusal (the room filled between the
  // arm and the take) strikes the posting instead. On success the BORN
  // instance's census key is captured (the K4 annul law then applies
  // verbatim) and the resolution ledger baselines AT THE ACCEPT — only
  // seals the summons could have caused count toward done.
  accept(world, p) {
    const a = p.answer;
    const src = a ? BOUNTY_SOURCES[a.source] : undefined;
    const face = src?.summons;
    if (!a || !src || !face) return 'the posting no longer reads';
    if (!face.headroom(world)) return 'the world has no room for the summons';
    const before = new Set(src.census(world).map(r => r.key));
    if (!face.ignite(world, p.zoneId)) return 'the summons failed to take';
    const born = src.census(world).find(r => !before.has(r.key));
    a.key = born?.key ?? '';
    a.base = world.ledger[a.ledger!] ?? 0;
    return null;
  },
  // Pre-accept a summons is never done (nothing is born yet — acceptAt is
  // the accepted marker); after, the K4 delta law verbatim.
  done(world, p) {
    const a = p.answer;
    if (!a || !a.ledger || p.acceptAt === undefined) return false;
    return (world.ledger[a.ledger] ?? 0) > a.base;
  },
  annulled(world, p) {
    const a = p.answer;
    if (!a) return 'the posting no longer reads';
    const src = BOUNTY_SOURCES[a.source];
    const face = src?.summons;
    if (!src || !face) return 'its source is gone from the world';
    if (p.acceptAt === undefined) {
      // An OFFER: struck when the room filled meanwhile (an ambient
      // instance took the package's breath) — honestly said, no penalty.
      return face.headroom(world) ? null : 'the world has no room for the summons';
    }
    if (BOUNTY_KINDS.summons.done(world, p)) return null;
    // A born key that left the census unresolved annuls (the K4 law); a
    // keyless ignite (census-blind source) resolves by the delta alone.
    if (a.key && !src.census(world).some(r => r.key === a.key)) {
      return 'the summoned ask is gone — the world moved on';
    }
    return null;
  },
  copy(world, p) {
    const a = p.answer;
    if (!a) return { title: 'The Summons', ask: 'the posting no longer reads' };
    // THE LIVE CARD (the K4 law): once born, the census's own line follows
    // the instance (a diverted fracture's card moves with it).
    const live = a.key ? BOUNTY_SOURCES[a.source]?.census(world).find(r => r.key === a.key) : undefined;
    return { title: `The Summons: ${a.name}`, ask: live?.ask ?? a.ask };
  },
});

// --- K4 · THE ANSWER — "resolve what stands" (M2: the live census) ---------
registerBountyKind({
  id: 'answer',
  weight: 1,
  available: host => host.answers().length > 0,
  roll(host, rng, taken) {
    const cfg = BOUNTY_BOARD_CFG.answer;
    // The pool is the census itself (no seat search — the world already
    // placed these asks); the band keeps absurd decrees off a young slate.
    // A pinned roll narrows to asks standing ON the pin, band bypassed.
    const pool = host.answers().filter(a => {
      const z = host.zoneMap[a.ref.zoneId];
      if (!z || !(host.routeFits?.(z.id) ?? true)) return false;
      if (host.kindClaimed('answer', a.ref.zoneId)) return false;
      if (host.pin) return a.ref.zoneId === host.pin;
      if (taken.has(a.ref.zoneId)) return false;
      return z.level >= host.playerLevel - cfg.band.below
        && z.level <= host.playerLevel + cfg.band.above;
    });
    if (!pool.length) return null;
    const a = pool[rng.int(0, pool.length - 1)];
    return {
      id: `bounty_${host.slateKey}_${host.seq}`, kind: 'answer', boardId: host.boardId,
      zoneId: a.ref.zoneId, beat: host.beat, pay: {},
      answer: {
        source: a.source, key: a.ref.key, name: a.ref.name, ask: a.ref.ask,
        ...(a.ref.title ? { title: a.ref.title } : {}),
        ...(a.ref.ledger ? { ledger: a.ref.ledger } : {}),
        base: a.base,
      },
    };
  },
  // THE DELTA LAW: a ref carrying a resolution ledger reads done when the
  // count moves past the arm baseline (worldboss_slain_<def>,
  // fractures_sealed, hunt_beasts_slain — whoever in the party lands it);
  // ledgerless refs ask their source's standing-state read (the hold open).
  done(world, p) {
    const a = p.answer;
    if (!a) return false;
    const src = BOUNTY_SOURCES[a.source];
    if (!src) return false;
    if (a.ledger) return (world.ledger[a.ledger] ?? 0) > a.base;
    return src.resolved?.(world, p) ?? false;
  },
  failed(world, p) {
    const a = p.answer;
    const src = a ? BOUNTY_SOURCES[a.source] : undefined;
    return src?.failed?.(world, p) ?? false;
  },
  // Departed-unresolved ANNULS (the apparition's stay ran out, the hunt
  // waned): the courtesy in the field, the hand freed, no penalty. A
  // resolved ask never annuls (it pays), and a FAILED one never annuls
  // either — the fail lane resolves at the board (walk-1's ruling), even
  // while its census entry is gone.
  annulled(world, p) {
    const a = p.answer;
    if (!a) return 'the posting no longer reads';
    const src = BOUNTY_SOURCES[a.source];
    if (!src) return 'its source is gone from the world';
    if (BOUNTY_KINDS.answer.done(world, p)) return null;
    if (src.failed?.(world, p)) return null;
    if (!src.census(world).some(r => r.key === a.key)) {
      return `${a.name} is gone — the world moved on`;
    }
    return null;
  },
  // THE LIVE CARD: while the target still stands, the census's own line
  // speaks (a diverted fracture's card follows it to fresh ground); once
  // gone, the arm's frozen copy still reads while the reconcile settles.
  copy(world, p) {
    const a = p.answer;
    if (!a) return { title: 'The Answer', ask: 'the posting no longer reads' };
    const live = BOUNTY_SOURCES[a.source]?.census(world).find(r => r.key === a.key);
    const title = live?.title ?? a.title ?? `The Answer: ${live?.name ?? a.name}`;
    return { title, ask: live?.ask ?? a.ask };
  },
});

// THE ERRAND'S OMEN (the findability guarantee without the veil lift): every
// omen-face errand in hand whispers its bearing and finally reveals its seat
// — the omen fabric verbatim, aging from the accept.
registerOmenSource((world: World) => world.bountyOmens());

// THE CHEVRON PATRON (M4 — charter §8's coupling): the board's own edge
// pointers in the target zone, through the standing attention fold. Today
// that is the gather's unspent nodes — the one ask with no standing pointer
// of its own; every other kind's target already speaks (writ ☠ by law,
// event fabrics' own chevrons, the objective's guidance).
registerAttentionSource((world: World) => world.bountyAttention());
registerAttentionSource((world: World) => world.boardIntroduction().map(b => ({
  id: `board-introduction:${b.id}`, pos: b.pos,
  color: BOUNTY_BOARD_CFG.boardIntroduction.color, glyph: BOUNTY_BOARD_CFG.boardIntroduction.glyph,
  label: BOUNTY_BOARD_CFG.boardIntroduction.label, z: 2,
})));

/** The board-giver sentinel: no NPC carries this id, so the standing
 *  quest-giver dwell can never offer or pay a posting — the board's own
 *  panel is the whole counter. */
export const BOUNTY_BOARD_GIVER = 'bounty_board';

/** Derive the accepted posting's QuestDef — the resolver seam's product
 *  (World.questDefOf = QUESTS[id] ?? this). Zone-spec fields are benign
 *  honest values off the CLAIMED zone (the mint lane never runs for a
 *  claim-lane posting; the fields exist to satisfy the standing type). */
export function postingQuestDef(p: BountyPosting, world: World): QuestDef {
  const z = world.zoneMap[p.zoneId] as ZoneDef | undefined;
  const c = BOUNTY_KINDS[p.kind]?.copy(world, p) ?? { title: p.id, ask: '' };
  return {
    id: p.id,
    giver: BOUNTY_BOARD_GIVER,
    offerLabel: c.title,
    category: 'bounty',
    offerAtLevel: 0,
    zone: {
      tileset: z?.tileset ?? 'field', direction: 'e',
      level: z?.level ?? 1, objective: z?.objective ?? { kind: 'clear' },
    },
    // The essence lane pays through the standing QuestReward field; every
    // richer lane (unique/lot/pouch/gem) pays through the payout site's
    // bounty branch (World.payBountyLanes) — never both.
    reward: { ...(p.pay.essence ? { essence: p.pay.essence } : {}), ...(p.pay.xp ? { xp: p.pay.xp } : {}) },
    turnIn: {
      giver: BOUNTY_BOARD_GIVER,
      prompt: 'Bounty complete. Return to the board.',
    },
  };
}
