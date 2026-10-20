import { sanitizeCosmeticLoadout } from './meta/cosmetics';
// ---------------------------------------------------------------------------
// Entry point: boots the world, runs the loop, and routes player input into
// the same skill pipeline the AI uses.
// Also home of THE CRASH TRAP's game half (the early half is inline in
// index.html): uncaught errors ring-buffer, the first FATAL raises the crash
// overlay and stands the save writers down (meta/persistence.ts). `?crashtest`
// is the dev-only negative control — a deliberate throw from inside the rAF
// loop one second after boot, to drill the whole path.
// ---------------------------------------------------------------------------

import { saveResetNotice } from './meta/saveCompatibility';
import { DEATH_PRESENTATION } from './data/deathPresentation';
import { deathPresentationPose } from './engine/deathPresentation';
import { Input } from './core/input';
import { LoadingScreen, type LoadingLease } from './ui/loadingScreen';
import { PAD_CFG, PadState, connectedPadIndices, padIdAt, synthEscape, type FakePad, type PadTuning } from './core/gamepad';
import { COUCH_CFG } from './data/couch';
import { CouchClaimSession, findRebindSlot, PadSeatInput } from './net/couch';
import { CouchJoinOverlay, type CouchJoinChoice, type CouchJoinView } from './ui/couchJoin';
import { applyCursor } from './core/cursor';
import { assistAim, AIM_ASSIST } from './engine/aimassist';
import { PadPointer } from './ui/padpointer';
import { DialogueUI, type DialogueActionContext } from './ui/dialogue';
import { DIALOGUE_CFG } from './data/dialogue';
import { NpcConversationUI, conversationHasRewards, conversationHasVocations } from './ui/npcConversation';
import { DialogueActions } from './engine/dialogueActions';
import { applyUiScale, installUiScaleStyles } from './ui/uiScale';
import { installUiStack } from './ui/zorder';
import { escapeModeOf } from './ui/escapeConfig';
import { rollSeed } from './core/rng';
import { validateContent } from './data/validate';
import './data/clusters'; // side-effect: registers the data-driven cluster stamps
import './data/formations'; // side-effect: registers the patterned formation stamps
import './engine/landmarkBuilders'; // side-effect: registers the landmark shape builders
import './data/landmarks'; // side-effect: registers the geographic landmark recipes
import './data/lairs'; // side-effect: the true natives claim their ground (the lair fabric)
import './engine/layoutRecipes'; // side-effect: registers the composed layout recipes
import './engine/interiorGen'; // side-effect: registers the interior layouts (dungeon/labyrinth/edifice) + room roles
import './data/massifs'; // side-effect: registers the massif mass kinds (+ the 'massif' recipe via engine/massif)
import './data/watchposts'; // side-effect: registers the 'watch_post' ring tenant (the posted-watcher court)
import './data/occurrences'; // side-effect: registers the 'occurrence' ring tenant + the occurrence shelf (court tables name it)
import './data/settled'; // side-effect: the settled-belt kit (+ the 'fields'/'district' recipes via engine/settled)
import './data/garden'; // side-effect: the Garden country kit (kinds, formations, compositions, the nest role pool)
import './data/catacombs'; // side-effect: the second under-country kit (the crypts lane, the lych way's span row)
import './data/merelake'; // side-effect: the moonlit mere kit (the meadow's grotto lane, the mere court)
import './data/cistern'; // side-effect: the cistern kit (the scald lake's grotto lane, the crone's court)
import './data/lonecrypt'; // side-effect: the lone crypt kit (the exhumation's door, the resident pool, the unquiet yard)
import './data/grove'; // side-effect: the Grove country kit (lantern flora, the hollow way down)
import './data/theater'; // side-effect: THE THEATER FABRIC's default kinds+rows (siege/patrol re-founded — BEFORE warfront so kind priority stays sieges-first, as ever)
import './data/warfront'; // side-effect: the Warfront country kit (siege furniture, the war column)
import './data/scald'; // side-effect: the Scald Basin country kit (pool rows, mineral furniture, the meld, the basin's weather)
import './data/greatgeyser'; // side-effect: THE GREAT GEYSER den lane (the mouth, the lair seat, the Geysermaw's ledger)
import './data/scaldkit'; // side-effect: THE SCALD KIT K1 (the steam bank, the lacksStatus condition, the kit census)
import './data/pilgrimage'; // side-effect: THE TERRACE PILGRIMAGE theater kind + rows (after data/theater — kind priority is registration order)
import './data/compositions'; // side-effect: registers the whole-zone composition bundles
import './data/fog'; // side-effect: registers the living fog bank kinds
import './data/creeps'; // side-effect: registers the living creep kinds
import './data/traversals'; // side-effect: registers the vertical-crossing kinds (sky launch/fall)
import './data/glyphParts'; // side-effect: registers the shipped hand-drawn part kinds (the glyph roster)
import './data/commanders'; // side-effect: the tutorial factions (the Fathers) + the prologue's resolve seam
import './data/locales';
import './data/authoredMaps'; // side-effect: THE AUTHORED-MAP FABRIC's shipped maps (+ the 'authored' layout via engine/authoredMaps)
import './data/bountyJourneys';
import './data/bountyPassages';
import './data/bountyExpeditions'; // side-effect: the bounty board's 'expedition' kind (an authored map minted at the take)
import { updateAI } from './engine/ai';
import { World, type Seat } from './engine/world';
import { applyLab, ULT_QA } from './engine/ultimates'; // THE LAB LEVER — the dev panel's Lab tab; __game.ultqa is its console twin
import { sceneBegin, sceneCardAck, sceneDue, muTakeClassRequest, muOfferOf } from './engine/scenes';
import { MU_CFG, MU_SCENE_ID } from './data/mu';
import { buildManifest, reconcileManifest, type ExpeditionManifest } from './packages/manifest';
import { bumpLedger, mergeLedger } from './packages/ledger';
import { registerAllPackageFactions } from './packages/factionGen';
import { Renderer } from './render/renderer';
import { RENDER_SCALE_CFG, nextNotch } from './render/renderScale';
import { UI } from './ui/panels';
import { installSkillShowcases } from './showcase/host';
import { errorOverlayShown, showErrorOverlay, type CrashEntry } from './ui/errorOverlay';
import { LocalTransport } from './net/local';
import { ScriptedInput, LocalCoopInput } from './net/scripted';
import type { PlayerInput, MetaAction, PlayerInputSource } from './net/intent';
import { Director } from './director/director';
import { wireSeed } from './net/transport';
import type { NetTransport, StateSnapshot, PeerInfo, SessionMsg, ZoneMsg } from './net/transport';
import { serializeSnapshot, applySnapshot, serializeZone, applyZone } from './net/snapshot';
import { RemoteInput } from './net/remote';
import { WebRtcTransport } from './net/webrtc';
import { openCoopLobby } from './ui/lobby';
import { CLASSES, type ClassDef } from './data/classes';
import { SKILLS as CLIP_SKILLS } from './data/skills';
import { makeSkillGem as clipSkillGem } from './engine/skills';
import { DEV, GAME_TITLE } from './config';
import { mountDevPanel } from './dev/panel';
import { mountPassiveEditor } from './dev/passiveEditor';
import { mountEntityForge } from './dev/entityForge';
import { mountGlyphForge } from './dev/glyphForge';
import { mountMapForge } from './dev/mapForge';
import { loadWorkshopSync, reconcileWorkshopFromDisk } from './meta/workshop';
import { loadAtlasSync, reconcileAtlasFromDisk } from './meta/atlas';
import { perfSweep, type PerfSweepOpts, type PerfSweepReport } from './dev/perf';
import {
  applyCredits, isClassUnlocked, LEDGER_ACCOUNT_DEATHS, META_CURRENCY_LABEL,
  RUN_RECORD_SCHEMA,
  recordRun, renownForRun, runStanding, type Account, type RunRecord,
} from './meta/account';
// THE OBJECTIVE WEB (meta/unlocks.ts): the run's end settles any class a
// merged deed now claims; THE OPENING (meta/classkit.ts): the class card's
// kit picks resolve against the account HERE, never trusted from the card.
import { settleClassUnlocks, reconcileClassBundleGems } from './meta/unlocks';
import { rememberKitPicks, resolveClassKit } from './meta/classkit';
import {
  loadAccount, loadAccountAsync, loadSettings, loadSettingsAsync,
  saveAccount, saveAccountDurable, saveSettings, resetAccount,
  saveSuppressed, suppressSaves,
} from './meta/persistence';
import {
  applySavedCharacter, clearCharacter, loadCharacter, loadCharacterAsync,
  loadRosterSave, persistRun, persistRunDurable,
  rebuildSavedMeta, saveCouchGuest,
  type CharacterSave,
} from './meta/character';
import { resolveResumeSpawn } from './meta/worldstate';
import { DEFAULT_MODE_ID, freeRosterSlot, mintCharId, modeById, rosterCapacity, type RosterEntry } from './meta/modes';
import { healMercEngagements, releaseMercsOf } from './meta/mercs';
import type { Settings } from './meta/settings';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const input = new Input(canvas);
const loadingScreen = new LoadingScreen(() => { input.clearForLoading(); barPress = null; });

// ---------------------------------------------------------------------------
// THE CRASH TRAP (game half — the early half is inline in index.html and owns
// everything before this module evaluates). Installed FIRST, before the boot
// work below, so a throw anywhere later still lands in the full trap. Every
// uncaught error / unhandled rejection appends to the SAME ring the early
// trap seeded (window.__bootErrors, cap 20); the FIRST fatal:
//  1. stands the saves down (meta/persistence.ts suppressSaves — baseline,
//     autosave, menu-exit, quit flush, durable wipes all refuse, so a crash
//     mid-corruption can never overwrite the last good save),
//  2. raises THE CRASH OVERLAY (ui/errorOverlay.ts — no auto-dismiss), and
//  3. ends the rAF pump (frame() stops re-arming — a crashed sim is not
//     ticked onward beneath the overlay; only a restart resumes).
// DOCTRINE (start simple): EVERYTHING uncaught is fatal. If real noise ever
// surfaces — say a transport's benign rejection — the refinement is to route
// it to crashPush (ring-only, no latch) here, not to grow a taxonomy.
// ---------------------------------------------------------------------------
const crashRing: CrashEntry[] = (window.__bootErrors ??= []);
let crashFatal: CrashEntry | null = null;
function crashPush(kind: string, msg: string, stack?: string): CrashEntry {
  const entry: CrashEntry = { t: Date.now(), kind, msg, stack };
  if (crashRing.length >= 20) crashRing.shift();
  crashRing.push(entry);
  return entry;
}
function reportFatal(err: unknown, kind: string): void {
  const e = err instanceof Error ? err : null;
  const entry = crashPush(kind, e?.message ?? String(err ?? 'unknown error'), e?.stack);
  if (crashFatal) return;   // the first fatal owns the screen; later ones just ring
  crashFatal = entry;
  loadingScreen.close();
  console.error('[crash] fatal —', err);
  suppressSaves(`fatal ${kind}: ${entry.msg}`);
  try { showErrorOverlay(entry, crashRing); }
  catch (overlayErr) { console.error('[crash] the overlay itself failed to raise', overlayErr); }
}
window.__gameBooted = true;   // the early trap's boot-failure fallback stands down
if (window.__bootTrapTimer !== undefined) clearTimeout(window.__bootTrapTimer);
window.onerror = (msg, _src, _line, _col, err): void => { reportFatal(err ?? msg, 'uncaught error'); };
window.onunhandledrejection = (ev): void => { reportFatal(ev.reason, 'unhandled rejection'); };

// The ACCOUNT and the keybind SETTINGS are loaded ONCE here and live in module
// scope — they outlive every character death and World recreation. World, UI,
// and the renderer hold the SAME references; they are never re-loaded mid-run.
const account: Account = loadAccount();
reconcileClassBundleGems(account);
const settings: Settings = loadSettings();

// THE UI SCALE DIAL (ui/uiScale.ts): install the fabric stylesheet once, then
// stamp the saved scale — panels, tooltips, and the canvas HUD all wake at the
// player's size, not at 100% until they visit Options.
installUiScaleStyles();
applyUiScale(settings.uiScale);
// THE UI STACK LAW (ui/zorder.ts): seat every selector-delivered surface on
// its rung before anything shows — activatable panels above every canvas.
installUiStack();

const renderer = new Renderer(canvas, () => settings);
// The thematic cursor identity (style + tint) — applied at boot; the options
// view re-applies on change. The pad reticle shares the same tint.
applyCursor(settings.cursor);

// CONTROLLER: polled once at the top of each frame. Buttons ride the padBinds
// settings map; sticks feed movement/aim as axes. Feel numbers resolve here —
// PAD_CFG engine defaults overlaid by the player's persisted Settings.pad.
const padTuning = (): PadTuning => ({
  deadzone: settings.pad.deadzone,
  stickCurve: PAD_CFG.stickCurve,
  // The player's aim-sensitivity dial, resolved across the engine's exponent
  // span — 0.5 lands exactly on stickCurve (the classic feel).
  aimCurve: PAD_CFG.aimCurve.relaxed
    + (PAD_CFG.aimCurve.twitchy - PAD_CFG.aimCurve.relaxed) * settings.pad.aimSensitivity,
  triggerThreshold: PAD_CFG.triggerThreshold,
  aimMinRadius: PAD_CFG.aim.minRadius,
  aimMaxRadius: settings.pad.aimRadius,
  pointerSpeed: settings.pad.pointerSpeed,
  swapSticks: settings.pad.swapSticks,
});
const pad = new PadState(padTuning);
const padPointer = new PadPointer(pad, padTuning);
// AIM ARBITRATION: the last device to speak owns the reticle. Any right-stick
// deflection hands it to the pad instantly; the mouse must accumulate a
// DELIBERATE bit of travel (PAD_CFG.mouseReclaimPx) to take it back, so an
// idle arrow nudged by a desk bump can't yank targeting across the screen.
let aimSource: 'mouse' | 'pad' = 'mouse';
const lastMouse = { x: -1, y: -1 };
let mouseReclaim = 0;
// The game's visible aim: the assisted reticle point + the soft-lock target,
// refreshed by readLocalInput and fed to the renderer each frame.
let padLock: number | null = null;
let padAimView: { x: number; y: number; lockId: number | null } | null = null;
// MOUSE HANDOFF (PAD_CFG.mouseHandoff): when the mouse reclaims aim from the
// pad, this screen-space offset carries the reticle's position into the
// mouse's aim — aim = arrow + offset — so targeting continues from where the
// reticle truly was instead of flipping to wherever the arrow sat parked. It
// melts with mouse travel until arrow and aim are one and the arrow returns.
let mouseHandoff: { x: number; y: number } | null = null;
// THE PRESSABLE BAR (renderer.hudSlotRects — drawn == tested): a mouse press
// that lands on the hero's own bar slot becomes THAT slot's press for as long
// as the button stays down (held casts channel, guards hold), and the LMB's
// own slot-0 contribution is withheld for the press — pressing a button must
// never also swing the primary. The press AIMS where the hero faces, at the
// pad's mid reach, bent by the aim assist at full strength (the stick's own
// aim law: the cursor is on the bar, not on the battlefield). A touch rides
// the same seam — a tap is a press — so the bar is the first HUD surface a
// thumb can work (docs/design/mobile-touch.md).
let barPress: { slot: number; lock: number | null; meta?: boolean } | null = null;
/** The LOCAL hero's bar slot under a CSS-pixel point, or null. */
function hudSlotAt(cssX: number, cssY: number): number | null {
  for (const r of renderer.hudSlotRects) {
    if (r.seatId !== world.localSeat.id) continue;
    if (cssX >= r.x && cssX < r.x + r.w && cssY >= r.y && cssY < r.y + r.h) return r.slot;
  }
  return null;
}
/** THE PRESSABLE META (renderer.hudMetaRects — drawn == tested): the LOCAL
 *  hero's slot whose META mini-button sits under a CSS-pixel point, or
 *  null. A plain click there IS that slot's meta press — no modifier, no
 *  primary swing — the stance shift's clickable door and every other
 *  meta's (Detonate, Recall, Thrust) alike. */
function hudMetaSlotAt(cssX: number, cssY: number): number | null {
  for (const r of renderer.hudMetaRects) {
    if (r.seatId !== world.localSeat.id) continue;
    if (cssX >= r.x && cssX < r.x + r.w && cssY >= r.y && cssY < r.y + r.h) return r.slot;
  }
  return null;
}

/** The one gate for drawing the in-world game reticle (and hiding the OS
 *  arrow): live play, no menus/pointer, a hero who can act. Both the renderer
 *  feed and the handoff's honesty rule (below) key off this. */
function reticleAllowed(): boolean {
  return running && !ui.uiBlocking() && !padPointer.active
    && !world.player.dead && !world.player.downed;
}

let speechPointerOnCanvas = false;
canvas.addEventListener('mousemove', () => { speechPointerOnCanvas = true; });
canvas.addEventListener('mouseleave', () => { speechPointerOnCanvas = false; });
window.addEventListener('blur', () => { speechPointerOnCanvas = false; });

/** Feed the renderer this frame's aim view: the HUD mouse plus — while the
 *  PAD owns the reticle in live play, or a mouse HANDOFF is still carrying
 *  the pad's aim — the aim point (and soft-lock target) the in-world reticle
 *  draws at. The canvas hides the OS arrow whenever the reticle is the
 *  cursor; once the handoff melts (or a menu needs the arrow) it returns. */
function feedRendererAim(): void {
  renderer.hudMouse = input.mouse;
  const allowed = reticleAllowed();
  // HONESTY RULE: the moment the OS arrow must be visible (menus, pointer
  // mode, death), its position is truth again — a hidden handoff offset
  // would mean clicking one place and aiming another. Drop it.
  if (mouseHandoff && !allowed) mouseHandoff = null;
  const padOwns = aimSource === 'pad' && allowed;
  const handoffOwns = aimSource === 'mouse' && mouseHandoff !== null && allowed;
  const speechMouse = { x: input.mouse.x / input.pointerScale, y: input.mouse.y / input.pointerScale };
  renderer.speechPointerEnabled = allowed && aimSource === 'mouse' && !handoffOwns && speechPointerOnCanvas
    && !renderer.hudClusterRects.some(r => speechMouse.x >= r.x && speechMouse.x <= r.x + r.w
      && speechMouse.y >= r.y && speechMouse.y <= r.y + r.h);
  renderer.padAim = (padOwns || handoffOwns) ? padAimView : null;
  const wantCursor = (padOwns || handoffOwns) ? 'none' : '';
  if (canvas.style.cursor !== wantCursor) canvas.style.cursor = wantCursor;
}

// Networking transport. LocalTransport runs single-player + local co-op (host
// with one machine); a WebRtcTransport (same NetTransport contract) swaps in for
// a real over-the-wire session. `let` so the lobby can replace it. `?coop` spawns
// a local stand-in ally so the multi-seat path plays/verifies with no networking.
let net: NetTransport = new LocalTransport();
const COOP_PARAMS = new URLSearchParams(location.search);
/** `?coophuman` = a second LOCAL HUMAN seat (arrow keys); `?coop` = a scripted one. */
const COOP_HUMAN = COOP_PARAMS.has('coophuman');
const COOP_ALLY = COOP_PARAMS.has('coop') || COOP_HUMAN;
/** `?crashtest` — THE NEGATIVE CONTROL for the crash trap (dev-only, the
 *  `?prologue` idiom): one second after boot, tick() throws deliberately so
 *  the whole capture → overlay → save-stand-down path can be drilled and the
 *  refusals observed live. OFF (param absent) this is one always-false
 *  compare per frame — zero behavior change. */
let crashTestAt = COOP_PARAMS.has('crashtest') ? performance.now() + 1000 : Infinity;

// Host→client snapshot broadcast at a FIXED wire rate (decoupled from the host's
// render FPS), only ever while real peers are connected — single-player/local-only
// never builds one, so SP stays byte-identical.
const STATE_HZ = 20;
const SNAP_INTERVAL = 1 / STATE_HZ;   // seconds between host snapshots (interp basis)
let stateTimer = 0;
let snapTick = 0;
/** Latest + previous snapshots from the host (client only). The client renders
 *  entity positions interpolated PREV→LATEST over one snapshot interval, so motion
 *  is smooth ~60fps instead of stepping at the 20Hz wire rate. */
let latestSnapshot: StateSnapshot | null = null;
let prevSnapshot: StateSnapshot | null = null;
/** Seconds since the latest snapshot arrived — drives the interpolation alpha. */
let snapAccum = 0;
/** CLIENT: set when a newly-arrived snapshot carried OUR replicated seat meta, so
 *  the client re-renders its open build panels (skill book / tree / char sheet)
 *  exactly when the data changes — the HUD is always live via the renderer. */
let clientMetaDirty = false;
/** CLIENT: false while the latest snapshot's seatMeta delta hasn't been applied by
 *  a frame yet — so if a NEWER snapshot arrives first (coalescing), it carries the
 *  un-applied delta forward instead of dropping it. Set true once a frame applies. */
let metaApplied = true;
/** CLIENT: JSON of the last OWN-seat meta we triggered a panel re-render for — so
 *  the 1.5s heartbeat (which re-ships IDENTICAL meta) doesn't perpetually re-render
 *  the open build panels (which would yank a scrolled list back to the top). */
let lastMetaJson = '';
/** HOST: re-dirty every seat this often (s) as a self-healing safety net for a
 *  delta-replicated meta snapshot that was dropped (congested channel) or coalesced. */
const META_HEARTBEAT = 1.5;
let metaHeartbeat = 0;
/** CLIENT movement PREDICTION (Layer 3): a monotonic input seq + a ring of recent
 *  {seq,dx,dy,dt}. Each frame the own hero is anchored to the host's last-acked
 *  authoritative position and our UNACKED inputs are replayed forward — so the
 *  local player moves with ~zero input latency instead of waiting on the 20Hz
 *  snapshot round-trip. Reset per client session so seq realigns with the host. */
let inputSeq = 0;
const predictHistory: Array<{ seq: number; dx: number; dy: number; dt: number }> = [];
const PREDICT_BUFFER = 240;        // ~4s @ 60fps — caps replay cost + runaway
let predZoneId = '';               // zone change → discard stale (old-zone) inputs
/** Disposers for the client's onState / onZone subscriptions. */
let snapshotDispose: (() => void) | null = null;
let zoneDispose: (() => void) | null = null;
/** Host: the last zone id whose terrain we broadcast (resend on change). */
let lastSentZone = '';
/** Run-lifecycle (co-op) plumbing. sessionDispose tears down the onSession
 *  subscription on leave. HOST: pendingRejoins = peers who chose a class for the
 *  next run while the host wasn't yet in one (reseated when it starts). CLIENT:
 *  pendingRejoinClass = the class WE chose at the run-end screen (used when the
 *  host re-seats us via newRun). */
let sessionDispose: (() => void) | null = null;
/** CLIENT: tears down the onHostLost subscription on leave — and, because it is
 *  dropped BEFORE net.leave() closes the channels, keeps our own teardown from
 *  calling back into the host-gone landing. */
let hostLostDispose: (() => void) | null = null;
const pendingRejoins = new Map<string, string>();
let pendingRejoinClass: ClassDef | null = null;
/** HOST: meta intents (point-spends, gem ops, drops) received from clients this
 *  frame, tagged with the sender's seat. Drained + applied just before world.update
 *  (so the change replicates in the SAME tick's snapshot). */
const pendingActions: Array<{ seat: string; action: MetaAction }> = [];

/** A LIVE over-the-wire co-op session with at least one connected peer. Gates the
 *  run-end broadcast + the keep-the-transport-alive restart path. */
function coopActive(): boolean {
  return net instanceof WebRtcTransport && net.peers().length > 1;
}

/** Stand a fresh World up with its SHELL POLICIES wired — the seam where the
 *  transport layer (which the engine can't see) parameterizes engine fabrics.
 *  Today: the timeflow's menu-hold gate — menus hard-pause the sim only when
 *  this machine owns the one real sim AND no live peer shares it (a co-op
 *  world is never one player's to stop; a client render-shell never holds). */
function adoptWorld(w: World): World {
  // (Couch guests count as live players too — a shared screen is never one
  // player's to stop, so a seated guest waives the menu hold like a peer.)
  w.timeflow.allowHold = () => net.isHost && !coopActive() && !w.couchActive();
  return w;
}

// Graft every content package's factions into the shared data registries BEFORE
// any World is built or the content validator runs (mutates FACTIONS/traits/…).
registerAllPackageFactions();

// A placeholder world until a run begins (the start menu is shown first); it is
// replaced wholesale by startGame / resumeGame with the run's frozen manifest.
let world = adoptWorld(new World(account, Object.freeze(buildManifest(account, rollSeed()))));
// THE SKILL SHOWCASE (src/showcase/host.ts): any surface's data-skill-showcase
// element becomes a live showcase of that skill, wherever it is shown.
installSkillShowcases(document.body);
const ui = new UI(
  () => world, () => account, () => saveAccount(account),
  () => settings, () => saveSettings(settings),
  () => !net.isHost,        // a network co-op CLIENT (world is a render shell)
  () => leaveCoop(),        // tear down a co-op session → back to the menu
);
// The rebind view captures pad buttons through these (panels never touch the
// device layer directly — same altitude as its getSettings/saveSettings deps).
ui.armPadCapture = (cb) => pad.armCapture(cb);
ui.disarmPadCapture = () => pad.disarmCapture();
// DEVICE OF THE MOMENT: bind hints, '{bind:…}' prompt tokens, and slot labels
// all follow whichever device spoke last (the pad's recency window —
// PAD_CFG.activeWindow). One arbiter, injected at the same altitude as the
// settings getters: neither surface ever touches the device layer directly.
const padActiveNow = (): boolean => pad.activeRecently(performance.now() / 1000);
renderer.getPadActive = padActiveNow;
ui.getPadActive = padActiveNow;
// THE MENU BAR's 'bar' anchor seats off the hero's DRAWN HUD cluster — the
// rect the renderer published this frame (drawn == seated).
ui.onCosmeticsChanged = () => {
  if (!net.isHost) net.sendSession({ t: 'cosmetics', loadout: account.cosmetics.loadout });
};
ui.hudCluster = () => renderer.hudClusterRects.find(c => c.seatId === world.localSeat.id) ?? null;
// Tab is the menu's default bind: keep the browser's focus walk from riding
// the same press (a text field keeps its own Tab).
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const t = document.activeElement;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
  e.preventDefault();
});
// THE HERO'S ADDRESS: '{name}' tokens in world-authored talk resolve against
// the live hero at the same display seam as '{bind:…}' (Renderer.resolveText
// → resolveNameTokens) — the closure reads the CURRENT world, so a new run's
// hero re-addresses every line the moment it seats. THE RENOWN GATE
// (World.heroKnown — run-scope; the Odyssey's first arm will stamp it): an
// UNKNOWN hero feeds the BLANK name, so every token site current and future
// degrades to the resolver's own 'Traveller' fallback through this one seam
// — no per-line churn, and no future line can leak a name the world has not
// yet learned.
renderer.getPlayerName = () => world.heroKnown() ? world.meta.name : '';
// THE OBSTRUCTION CENSUS: the open DOM panes' rects, handed to the speech
// fabric's PLACEMENT LAW (drawSpeeches → dodgeSpeechBox) so a talk bubble
// slides out from under an open inventory instead of being swallowed.
renderer.uiObstructions = () => ui.obstructionRects();

let running = false;
// Local navigation only. Future progression actions register validated engine
// commands here; the reader never writes quest, reward or alignment state.
const dialogueActions = new DialogueActions<DialogueActionContext>();
dialogueActions.register('menu', {
  refusal: (context, action) => context.world === world ? ui.dialogueMenuRefusal(action.target) : 'This conversation has ended.',
  run: (_context, action) => ui.activateDialogueMenu(action.target),
});
const dialogue: DialogueUI = new DialogueUI({
  settings: () => settings, padActive: padActiveNow,
  hudTop: () => ui.hudCluster?.()?.y,
  resolveText: text => renderer.resolveText(text),
  actions: dialogueActions,
  available: () => renderer.npcDialogueAvailable(),
  createWorkspace: (root, changed) => new NpcConversationUI(root, {
    world: () => world,
    available: () => renderer.npcDialogueAvailable() && dialogue.open,
    inventory: () => { if (!ui.inventoryOpen) ui.toggleInventory(); },
    shopAvailable: id => ui.conversationShopAvailable(id),
    shop: id => ui.openConversationShop(id),
    changed: () => ui.refreshInventory(),
  }, changed),
});
ui.enrollConversation(dialogue);
renderer.npcDialogueOwner = () => dialogue.session.reading?.offer.speakerId ?? null;
renderer.npcDialogueAvailable = () => running && !world.player?.dead && !world.player?.downed && ui.dialogueContext().available;
renderer.onNpcDialogue = (w, line, focusId) => {
  dialogue.setAvailable(renderer.npcDialogueAvailable());
  dialogue.sync(w, line, focusId);
  ui.syncConversation();
};
// A consumed dialogue button stays out of gameplay until physically released,
// including the frame in which Finish closes the reader.
const dialoguePadHeld = new Set<string>();
let deathShown = false;
let uiRefreshTimer = 0;
let autosaveTimer = 0;

/** Legacy crossing for non-death conclusions; actual deaths use the shared
 *  deathPresentation timeline. Co-op and deliberate forfeits stay immediate. */
const RUN_END_FADE = { outSec: 1.15 };
/** The booked epilogue; revealing it never re-books the death. */
let pendingDeathScreen: { open: (revealSec?: number) => void; opened?: boolean } | null = null;

function startGame(
  classDef: ClassDef, manifest?: ExpeditionManifest, modeId?: string, name?: string,
  graftSkillId?: string | null, kitPicks?: Record<string, string>,
): void {
  couchReset(); // a new world seats no ghosts — guests re-join from the menu
  // THE PROLOGUE GATE (engine/scenes.ts), read FIRST — before a roster mode
  // pushes its vessel and muddies the virgin-account test: an account that
  // has never played walks the one-time opening scene; everyone else starts
  // at the bedside as always. `?prologue` re-runs it deliberately for this
  // page load (the ?couchpads lever precedent) — a veteran re-watching the
  // opening, or a dev testing it, without touching the account gate.
  const prologueDue = sceneDue(account, 'prologue')
    || new URLSearchParams(location.search).has('prologue');
  // The LIFE-CONTRACT (meta/modes.ts): class select passes the sworn mode.
  // A roster mode binds an account VESSEL at creation — the character saves
  // cross-session into its own slot from its first breath.
  const mode = modeById(modeId);
  // THE NAME (Naming/Nemesis): player-given, else named for its class — the
  // thread the world's memory follows across runs.
  const charName = name?.trim() || classDef.name;
  // EVERY character gets an identity — mercenary engagements (and any future
  // cross-character bookkeeping) key off it, mortal or vessel alike.
  const charId = mintCharId();
  if (mode.save === 'roster') {
    const slot = freeRosterSlot(account, mode);
    if (slot == null) { toStartMenu(); return; } // picker greys full modes; this is the belt
    account.roster.push({
      charId, modeId: mode.id, slot, classId: classDef.id, name: charName,
      level: 1, stage: 0, savedAt: Date.now(),
    });
    saveAccount(account);
  }
  // A run-slot start OVERWRITES the previous run save — release any merc
  // contract that run held (its patron ceases to exist right here, not at
  // the next boot's self-heal).
  if (mode.save !== 'roster') {
    const prev = loadCharacter();
    if (prev?.charId && releaseMercsOf(account, prev.charId) > 0) saveAccount(account);
  }
  // The manifest is the run-LOCKED package config. Phase 4's Expedition screen
  // passes a configured one; otherwise build it from the account's saved prefs.
  const m = manifest ?? buildManifest(account, rollSeed());
  world = adoptWorld(new World(account, Object.freeze(m)));
  // THE OPENING (meta/classkit.ts): the card's picks — remembered on the
  // account for the next waking — resolve here against what the account
  // actually OWNS (an unowned alternate falls back to its base; owned
  // Master grants seat themselves): the engine wakes the resolved bar.
  if (kitPicks) { rememberKitPicks(account, classDef, kitPicks); saveAccount(account); }
  // A GRADUATED account (Mireille's flask lesson lived once, any character)
  // skips the re-walk: the flasks arrive learned, barred, and brimming at
  // first breath. No-op until that first graduation — and placed BEFORE
  // persistRun so the baseline snapshot already carries them.
  world.createPlayer(classDef, { modeId: mode.id, charId, name: charName, kit: resolveClassKit(account, classDef, kitPicks) });
  // THE LAB KIT (ULT_QA.grantArts — engine/ultimates.ts): iteration builds
  // deal the ultimate + gauge debuts into the fresh bag, unlearned.
  world.dealLabArts();
  // THE SKILL GRAFT (meta/unlocks.ts kind 'graft'): the armed charge spends
  // HERE — where the run truly begins — before the baseline save, so the
  // snapshot carries the grafted gem from the first breath. A pick without
  // a charge (or a charge without a pick) is a no-op by construction.
  if (graftSkillId && account.skillGraft && world.applySkillGraft(graftSkillId)) {
    account.skillGraft = false;
    saveAccount(account);
  }
  lastSentZone = '';        // force a fresh terrain broadcast for (re)joining clients
  if (COOP_ALLY) spawnCoopAlly();
  // The baseline snapshot — EXCEPT under a due scene: the tutorial is not a
  // run, so nothing persists until its 'home' stage writes the true first
  // save at the bedside wake (a mid-tutorial quit = start a new game).
  if (!prologueDue) persistRun(account, world); // baseline so a fresh run is resumable
  // A roster character never touches the shared run slot — the mortal
  // Continue stays valid beside it (the vessels are additional lives).
  if (mode.save !== 'roster') ui.setContinueSave(null);
  ui.resetRunView();        // a new world must not inherit the old run's map zoom/tabs/pin
  deathShown = false;
  pendingDeathScreen = null; // a torn-down run's fade never fires over a fresh world
  // THE PROLOGUE (after the baseline save, so the snapshot is a clean
  // bedside start): the scene stamps its ledger key the moment it begins —
  // played once, ever — and its staging ground lives off-graph, so even a
  // mid-scene autosave resumes at the ordinary wake.
  if (prologueDue) sceneBegin(world, 'prologue');
  running = true;
}

/** Loading cancellation returns to the current save without writing the toy. */
function cancelLoadingToMenu(): void {
  toStartMenu('The crossing was cancelled.');
  ui.setContinueSave(loadCharacter());
}

/** Main retains its existing world/save owners. Paint around their bounded
 * stages; the shared loading lease guards every asynchronous publication seam.
 * Synchronous construction still needs cooperative work or workers to animate. */
async function withLoadingScreen(work: (loading: LoadingLease) => void | Promise<void>, label = 'Taking form'): Promise<boolean> {
  const loading = loadingScreen.begin({ kind: 'entry', label, loadout: account.cosmetics.loadout, cancel: cancelLoadingToMenu });
  try {
    await loading.paint(); await diskHydrated;
    if (!loading.current) return false;
    await work(loading);
    if (!loading.current || !running) return false;
    loading.update({ label: 'Opening the world' });
    await loading.paint(); if (!loading.current) return false;
    renderer.render(world);
    return true;
  } catch (error) { if (loading.current) reportFatal(error, 'world loading'); return false; }
  finally { loading.finish(); }
}

/** Class-select adapter: the picker hands back (class, sworn mode, name);
 *  startGame wants (class, manifest, mode, name). One arrow so no call site
 *  can transpose them. THE SKILL GRAFT detour: an armed charge offers its
 *  pick between the class choice and the world's first breath — the
 *  deliberate selection rides into startGame and spends there; declining
 *  keeps the charge armed for a later run. */
const startPicked = (d: ClassDef, modeId?: string, name?: string, kitPicks?: Record<string, string>): void => {
  if (account.skillGraft) {
    ui.showSkillGraftPick(pick => { void withLoadingScreen(() => startGame(d, undefined, modeId, name, pick, kitPicks)); });
    return;
  }
  void withLoadingScreen(() => startGame(d, undefined, modeId, name, undefined, kitPicks));
};

/** THE MU BOOT (data/mu.ts): stand a PROVISIONAL world up and drift into the
 *  hub between lives — a transient scene on off-graph ground, so no run save
 *  ever exists for it (the scene stand-down covers every chokepoint) and no
 *  roster vessel is minted. The wisp strips the provisional class to nothing;
 *  taking a vessel calls startPicked, which discards this world wholesale. */
function startMu(): void {
  couchReset();
  world = adoptWorld(new World(account, Object.freeze(buildManifest(account, rollSeed()))));
  const cls = CLASSES.find(c => c.id === MU_CFG.provisionalClass) ?? CLASSES[0];
  world.createPlayer(cls, { modeId: DEFAULT_MODE_ID, startingCompanions: false, startingFlasks: false });
  lastSentZone = '';
  ui.resetRunView();
  deathShown = false;
  pendingDeathScreen = null; // the dead run's fade is over — Mu owns the screen now
  sceneBegin(world, MU_SCENE_ID);
  running = true;
}

/** THE BEGIN PRESS (the start menu's one primary button): a virgin account —
 *  or a deliberate ?prologue — walks the tutorial as the Warrior with no
 *  class screen at all; everyone else drifts into Mu, where the class roster
 *  stands IN the world. The legacy class screen remains beneath (co-op
 *  rejoin offers still call it directly). */
function beginPressed(): void {
  const prologueDue = sceneDue(account, 'prologue')
    || new URLSearchParams(location.search).has('prologue');
  if (prologueDue) {
    startPicked(CLASSES.find(c => c.id === MU_CFG.provisionalClass) ?? CLASSES[0]);
    return;
  }
  startMu();
}
ui.onBeginRun = beginPressed;

/** THE WAKEFUL WORLD: stand the saved world back up around a freshly-resumed
 *  character — adopt the save's world section (zone graph, discovery, clock,
 *  quests, zone memory, overlay snapshots), then wake per the resolved policy
 *  (mode pin ▷ player setting ▷ engine default). A save with NO adoptable
 *  world resumes fresh exactly as before worldstate existed — with its
 *  generated objective keys scrubbed, so a re-rolled world can't wake
 *  pre-cleared ground. Shared by both resume paths (run slot + roster). */
function restoreWorldState(world: World, save: CharacterSave): void {
  if (!save.world || !world.adoptWorldState(save.world)) {
    world.scrubStaleObjectives(); // fresh reroll — createPlayer already stood us in town
    return;
  }
  // THE SEALED SHORES reconcile: restored rivers rebuild their exits to the
  // dealt landings only and re-stamp their berths (an older save's
  // accumulated discovery roads rewire to the nearest port and heal away).
  world.reconcileSoulrivers();
  // …and the SURFACE waters: port zones rebuild to notarized deeds, hold
  // anchors re-seal their causeway locks, and the DRY-ROAD heal drops any
  // saved road that walks across the sea (the voyage is the only crossing).
  world.reconcileSeaPorts();
  // …and THE WEB LAWS: a pre-budget save's Field expanses stamp their map
  // berths and shed hub spokes past the biome road budget (the degree trim
  // precedent, applied to the land's own hubs).
  world.reconcileWebLaws();
  const mode = modeById(world.meta.modeId);
  world.resumeSpawn(resolveResumeSpawn(mode.resume, settings.resumeSpawn), save.world.player);
}

/** Resume an account-roster character (an Immortal vessel) from its own slot.
 *  Async (disk-first load); a missing/corrupt slot just returns to the menu —
 *  the entry stays listed, deletion is only ever the player's deliberate call. */
function resumeRosterChar(entry: RosterEntry): void {
  // THE FALLEN LOCK (the resurrection covenant): a fallen vessel cannot be
  // played — the menu row already refuses, this is the belt behind it (and
  // behind any stale handler holding an old card).
  if (entry.fallen) {
    ui.showStartMenu(startPicked, resumeGame, openLobby, resumeRosterChar,
      `${entry.name} lies fallen — resurrect them in the Vault (${entry.fallen.fee} ${META_CURRENCY_LABEL}).`);
    return;
  }
  void withLoadingScreen(async loading => {
    const save = await loadRosterSave(entry.slot);
    // A cancelled or superseded disk read cannot replace the current world.
    if (!loading.current) return;
    const card = account.roster.find(r => r.slot === entry.slot && r.charId === entry.charId && r.modeId === entry.modeId && !r.fallen);
    if (!card) { toStartMenu('The selected vessel changed during Continue.'); return; }
    couchReset();
    const classDef = save && CLASSES.find(c => c.id === save.classId);
    if (!save || !classDef) {
      ui.showStartMenu(startPicked, resumeGame, openLobby, resumeRosterChar);
      return;
    }
    const manifest = reconcileManifest(save.expedition, account, rollSeed());
    world = adoptWorld(new World(account, Object.freeze(manifest)));
    world.createPlayer(classDef, { modeId: entry.modeId, charId: entry.charId, startingCompanions: false, startingFlasks: false });
    if (!applySavedCharacter(world, save)) {
      ui.showStartMenu(startPicked, resumeGame, openLobby, resumeRosterChar);
      return;
    }
    // Identity drift heal: the save is the authority on mode/stage, the roster
    // card on charId — an old save missing its id re-adopts the card's.
    if (!world.meta.charId) world.meta.charId = entry.charId;
    restoreWorldState(world, save); // the vessel's world wakes with it
    lastSentZone = '';
    if (COOP_ALLY) spawnCoopAlly();
    ui.resetRunView();
    deathShown = false;
    running = true;
    ui.hideAll();
  }, 'Recalling your vessel');
}

/** Resume the saved in-progress character, or fall back to the start menu.
 *  `preloaded` is the disk/local save fetched at boot; without it we read sync. */
function resumeGame(preloaded?: CharacterSave | null): void {
  void withLoadingScreen(() => resumeGameNow(preloaded), 'Recalling your vessel');
}

/** The existing synchronous restore owner, called only by the current loading lease. */
function resumeGameNow(preloaded?: CharacterSave | null): void {
  couchReset();
  const save = preloaded ?? loadCharacter();
  const classDef = save && CLASSES.find(c => c.id === save.classId);
  // A saved character is always resumable — resume must NOT depend on the
  // (now random, slot-based) class-select roll. Only a missing/invalid save bails.
  if (!save || !classDef) {
    clearCharacter();
    ui.showStartMenu(startPicked, resumeGame, openLobby, resumeRosterChar);
    return;
  }
  // Rebuild the run-locked manifest from the save (tolerant of removed packages);
  // its stored seed makes the resumed world deterministic.
  const manifest = reconcileManifest(save.expedition, account, rollSeed());
  world = adoptWorld(new World(account, Object.freeze(manifest)));
  world.createPlayer(classDef, { startingCompanions: false, startingFlasks: false });          // builds a valid skeleton in town…
  if (!applySavedCharacter(world, save)) { // …then the save overwrites the build
    clearCharacter();
    ui.showStartMenu(startPicked, resumeGame, openLobby, resumeRosterChar);
    return;
  }
  restoreWorldState(world, save);        // …and the world wakes around it
  if (COOP_ALLY) spawnCoopAlly();
  ui.resetRunView();        // same rule as startGame: fresh World, fresh view state
  deathShown = false;
  running = true;
}

// Dev/debug handle (also keeps headless testing possible when rAF is paused).
declare global {
  interface Window {
    /** THE CRASH TRAP's shared error ring — seeded by index.html's early trap. */
    __bootErrors?: CrashEntry[];
    /** The early trap's boot-failure fallback timer (cleared once we boot). */
    __bootTrapTimer?: number;
    /** Set the moment this module evaluates — the early fallback's stand-down. */
    __gameBooted?: boolean;
    __game?: {
      world: () => World; ui: UI; ai: typeof updateAI; renderer: Renderer;
      account: () => Account; saveAccount: () => void; save: () => void;
      settings: () => Settings; saveSettings: () => void;
      addAlly: () => void;
      net: () => NetTransport;
      snapshot: () => StateSnapshot;
      applySnap: (s: StateSnapshot, prev?: StateSnapshot | null, alpha?: number) => void;
      subscribeToHost: () => void;
      unsubscribeFromHost: () => void;
      fakeJoin: (classId?: string) => string;
      fakeLeave: (id: string) => void;
      zoneMsg: () => ZoneMsg;
      applyZoneMsg: (z: ZoneMsg) => void;
      openLobby: () => void;
      leaveCoop: () => void;
      resetAccount: () => void;
      /** THE LAB LEVER (ULT_QA): flip the ultimate iteration tune live. */
      ultqa: (on?: boolean) => boolean;
      pad: () => PadState;
      padPointer: () => PadPointer;
      fakePad: (p: FakePad | null) => void;
      step: (frames?: number, dtMs?: number) => void;
      /** THE AGENT SEAT: drive the local hero from a PlayerInputSource (null = keyboard/mouse). */
      pilot: (src: PlayerInputSource | null) => void;
      /** Hold the rAF pump: only step() advances the game while held. */
      hold: (on: boolean) => void;
      /** THE DIRECTOR (src/director/): staged, frame-stepped captures of real play. */
      director: () => Director;
      loading: LoadingScreen;
      devStartLoadingRun: (classId?: string) => Promise<void>;
      devStartRun: (classId?: string) => string;
      devGrantSkill: (skillId: string, level?: number, slot?: number) => number;
      hydrated: () => Promise<void>;
      perfFrames: (reset?: boolean) => {
        gap: number[]; sim: number[]; ren: number[];
        /** Pushes since last reset — pushed > gap.length = the ring wrapped. */
        pushed: number;
        /** THE PHASE LEDGER's window-worst slab (name over pre/head/sim/ren/tail). */
        phase: { name: string; ms: number };
      };
      /** Size the frame rings to a sweep window (frames; clamped, resets). */
      perfRingSize: (frames: number) => number;
      /** performance.now() at the CURRENT frame's tick-callback entry — the
       *  sweep's fine own-task anchor (vs the coarse vsync-anchored mark). */
      perfTickT0: () => number;
      perfSweep: (opts?: PerfSweepOpts) => Promise<PerfSweepReport>;
      devPanel: () => void;
      crash: () => {
        fatal: CrashEntry | null; suppressed: string | null;
        overlay: boolean; errors: CrashEntry[];
      };
    };
  }
}
document.title = GAME_TITLE; // the one constant names every surface

window.__game = {
  world: () => world, ui, ai: updateAI, renderer,
  account: () => account, saveAccount: () => saveAccount(account),
  save: () => persistRun(account, world),
  settings: () => settings, saveSettings: () => saveSettings(settings),
  addAlly: () => spawnCoopAlly(),
  net: () => net,
  snapshot: () => serializeSnapshot(world, 0),
  applySnap: (s: StateSnapshot, prev?: StateSnapshot | null, alpha = 1) => applySnapshot(world, s, prev, alpha),
  subscribeToHost, unsubscribeFromHost,
  fakeJoin: (classId) => {
    const id = 'p' + world.seats.length;
    onRemoteJoin({ id, name: 'Remote', classId: classId ?? CLASSES[0].id, isHost: false });
    return id;
  },
  fakeLeave: (id) => onRemoteLeave(id),
  zoneMsg: () => serializeZone(world),
  applyZoneMsg: (z: ZoneMsg) => applyZone(world, z),
  openLobby, leaveCoop,
  resetAccount: () => { resetAccount(); location.reload(); },
  // THE LAB LEVER's console twin (the dev panel's Lab tab is the door).
  ultqa: (on = true) => { applyLab({ active: on }); return ULT_QA.active; },
  // Controller state + the hardware stand-in (tests: __game.fakePad({axes,buttons})).
  pad: () => pad, padPointer: () => padPointer,
  fakePad: (p) => { window.__fakePad = p; },
  // Drive N frames synchronously — the antidote to rAF freezing in hidden
  // tabs; the ONLY way input polling (incl. the pad) runs under a harness.
  // NOT sim-only: while a run is live the tick also RENDERS. Don't call
  // renderer.render on top of step() in a QA cell — each frame then draws
  // twice, so per-render probes read 2× (the sight veil's update runs once
  // per pass; a doubled drive double-steps its frame counter and snaps
  // stale actorShade fades early).
  step: (frames = 1, dtMs = 16.7) => { for (let i = 0; i < frames; i++) tick(last + dtMs); },
  pilot: (src) => { localPilot = src; },
  hold: (on) => { directorHold = on; },
  director: () => director ??= new Director({
    world: () => world,
    renderer,
    startRun: (classId) => {
      const cls = CLASSES.find(c => c.id === classId) ?? CLASSES[0];
      document.getElementById('start-menu')?.classList.add('hidden');
      document.getElementById('class-select')?.classList.add('hidden');
      startGame(cls);
    },
    step: (dtMs) => tick(last + dtMs),
    setPilot: (src) => { localPilot = src; },
    hold: (on) => { directorHold = on; },
    ledger: () => account.ledger,
    ui: () => ui,
  }),
  // DEV/QA: start a run headlessly (the perf harness's ignition) — the real
  // startGame path under the first (or named) class, menus dismissed.
  loading: loadingScreen,
  devStartLoadingRun: async (classId?: string) => { if (await withLoadingScreen(() => startGame(CLASSES.find(c => c.id === classId) ?? CLASSES[0]))) ui.hideAll(); },
  devStartRun: (classId?: string) => {
    const cls = CLASSES.find(c => c.id === classId) ?? CLASSES[0];
    document.getElementById('start-menu')?.classList.add('hidden');
    document.getElementById('class-select')?.classList.add('hidden');
    startGame(cls);
    return cls.id;
  },
  // DEV/QA: seat any catalog skill by id straight onto a bar slot as THE DEV
  // GIFT (devThrongGrant's shape: past the learn gate, transient, never
  // saved), replacing whatever sat there, so a harness can walk the whole
  // catalog without filling the pack (balance/skill-showcase-ui.cjs mints its
  // bag gems from it). Returns the slot, or -1.
  devGrantSkill: (skillId: string, level = 1, slot = 2) => {
    const def = CLIP_SKILLS[skillId];
    const p = world.player, known = world.localSeat.meta.knownSkills;
    if (!def || slot < 0 || slot >= p.skills.length) return -1;
    const prev = p.skills[slot];
    if (prev) known.delete(prev.def.id);
    const inst = clipSkillGem(def, level, 'rare');
    inst.granted = true;
    inst.devGift = true;
    known.set(skillId, inst);
    p.skills[slot] = inst;
    world.charDirty = true;
    world.recalcPlayer();
    return slot;
  },
  // Resolves once the boot's disk reconcile below has landed: a harness
  // starts its run after it, or the reconcile re-seats the account under it.
  hydrated: () => diskHydrated,
  // FRAME TELEMETRY readout: the ring buffers as plain arrays, oldest-first
  // (rAF gap = true pacing, sim ms, render ms). reset=true also clears —
  // how the perf sweep separates a zone's entry burst from its steady state.
  perfFrames: (reset = false) => {
    const n = perfCount, start = (perfIdx - n + perfRingN) % perfRingN;
    const out = {
      gap: new Array<number>(n), sim: new Array<number>(n), ren: new Array<number>(n),
      // Pushes since the last reset: pushed > gap.length means the ring
      // WRAPPED and the window's oldest frames are gone (perfRingSize doc).
      pushed: perfPushed,
      // THE PHASE LEDGER's window-worst slab rides the same reset boundary
      // as the rings, so a sweep window's slab is that window's alone.
      phase: { name: phaseWorstName, ms: phaseWorstMs },
    };
    for (let i = 0; i < n; i++) {
      const k = (start + i) % perfRingN;
      out.gap[i] = perfGap[k]; out.sim[i] = perfSim[k]; out.ren[i] = perfRen[k];
    }
    if (reset) { perfIdx = 0; perfCount = 0; perfPushed = 0; phaseWorstName = ''; phaseWorstMs = 0; }
    return out;
  },
  perfRingSize,
  perfTickT0: () => perfTickT0,
  perfSweep: (opts?: PerfSweepOpts) => perfSweep(opts),
  devPanel: () => mountDevPanel(() => world),
  // CRASH TRAP state — the ?crashtest negative control's probe surface (is the
  // latch flipped, why are saves refusing, did the overlay rise, the ring).
  crash: () => ({
    fatal: crashFatal, suppressed: saveSuppressed(),
    overlay: errorOverlayShown(), errors: [...crashRing],
  }),
};

// THE WORKSHOP (meta/workshop.ts): graft dev-authored entities from the
// localStorage mirror into the live registries BEFORE the content sweep, so
// a custom def answers to the exact same boot lint as shipped content.
loadWorkshopSync();
// THE ATLAS (meta/atlas.ts): the Map Forge's authored maps, grafted the same
// way — before the sweep, so a custom map answers to the same boot lint.
loadAtlasSync();
// Cross-check the data files; authoring mistakes warn instead of failing silently.
validateContent();

// DEV: the tabbed dev panel (config.ts DEV.panel). Off (0) = no-op. Runtime
// opt-ins beside the source flag — `?dev` on the URL or localStorage
// 'dev_panel'='1' — so QA can raise the panel on any dev serve without a
// source edit (and __game.devPanel() mounts it live in a RUNNING session,
// no reload: mountDevPanel is idempotent).
const devPanelOptIn = ((): boolean => {
  try {
    return new URLSearchParams(location.search).has('dev')
      || localStorage.getItem('dev_panel') === '1';
  } catch { return false; }
})();
if (DEV.panel || devPanelOptIn) mountDevPanel(() => world);
// DEV: the passive-tree editor (config.ts DEV.passiveTreeEditor). Off (0) = no-op.
if (DEV.passiveTreeEditor) mountPassiveEditor(ui);
// DEV: the Entity Forge (config.ts DEV.entityForge) — start-menu button +
// full-screen editor; the dev panel's Forge tab rides it too. Off (0) = no-op.
// The Glyph Forge (draw kit-parts + doodad kinds) mounts SECOND so its
// start-menu hook chains behind the Entity Forge's.
if (DEV.entityForge) {
  mountEntityForge(ui, () => world);
  mountGlyphForge(ui, () => world);
}
// DEV: the Map Forge (config.ts DEV.mapForge) — start-menu button + full-screen
// map editor; the dev panel's Maps tab rides it too. Mounts THIRD so its
// start-menu hook chains behind the forges'. The `?dev` opt-in raises it as
// well: the panel's Maps tab is its in-game door (the lab-tab ruling — the
// tooling lives inside the dev panel, never behind a URL param of its own).
if (DEV.mapForge || devPanelOptIn) mountMapForge(ui, () => world);

// Boot: show the start menu immediately (built from the synchronous localStorage
// loaders so it appears instantly), THEN reconcile against the disk files in the
// background — the authoritative cross-session save. The disk loads warm the
// shared account/settings refs and enable Continue if a disk character exists.
ui.showStartMenu(startPicked, resumeGame, openLobby, resumeRosterChar);
ui.setContinueSave(loadCharacter());          // instant: localStorage cache
const diskHydrated = (async (): Promise<void> => {
  const [a, s, c] = await Promise.all([loadAccountAsync(), loadSettingsAsync(), loadCharacterAsync()]);
  Object.assign(account, a);                  // mutate-in-place: shared refs stay valid
  reconcileClassBundleGems(account);
  Object.assign(settings, s);
  applyUiScale(settings.uiScale);             // the disk save may carry a different dial
  ui.setContinueSave(c);                       // disk save wins (re-renders the menu)
  ui.setStartMenuNotice(saveResetNotice());
  // Workshop disk reconcile: the save file is the cross-session authority
  // (another machine, a cleared browser profile). When it changed anything,
  // re-run the content sweep so the adopted defs get linted too (rare — the
  // mirror matches the disk in steady state, so no double warnings normally).
  if (await reconcileWorkshopFromDisk()) validateContent();
  if (await reconcileAtlasFromDisk()) validateContent();
  // SELF-HEAL: release merc engagements whose patron no longer exists anywhere
  // (a run save wiped without its death flow ever running).
  if (healMercEngagements(account, [c?.charId, ...account.roster.map(r => r.charId)]) > 0) {
    saveAccount(account);
  }
})();

/** Read the OS into the LOCAL seat's intent for this frame (or null when there's
 *  nothing to drive — dead/downed, or the pause menu is up). Pure input capture;
 *  it no longer touches the world directly — World.applyInputs does that, for
 *  every seat uniformly. `aim` is converted to WORLD space here so it's
 *  camera-independent (the one value that must survive the wire). */
function readLocalInput(dt: number): PlayerInput | null {
  if (loadingScreen.active || loadingScreen.padQuarantined) return null;
  const p = world.player;
  if (p.dead || p.downed) return null;
  // The pause menu AND the couch join ceremony both take the hero's hands
  // out of play (the world holds under either, solo — the timeflow law).
  if (ui.escapeMenuOpen || ui.couchJoinOpen) return null;

  const kb = settings.keybinds;
  const pb = settings.padBinds;
  // While the menu pointer owns the pad, its buttons/sticks are UI gestures,
  // not gameplay intent (Ⓐ under an inventory must never also swing a sword).
  // The keyboard/mouse half keeps flowing either way.
  const padLive = !padPointer.active;
  const dialoguePadDown = (code: string): boolean => !dialoguePadHeld.has(code) && pad.isDown(code);
  const dialoguePadPressed = (code: string): boolean => !dialoguePadHeld.has(code) && pad.justPressed(code);
  // THE PRESSABLE BAR's press: armed on the mouse's down edge over a slot,
  // released with the button. (CSS px = buffer px ÷ the render-scale seam.)
  let barEdge = false;
  if (input.lmbPressed) {
    const cx = input.mouse.x / input.pointerScale, cy = input.mouse.y / input.pointerScale;
    // THE PRESSABLE META first: the mini-button rides ABOVE its slot, so the
    // two rects never overlap; a click there is an EDGE on the meta for the
    // button's hold (withheld from the primary exactly like a slot press).
    const metaHit = hudMetaSlotAt(cx, cy);
    if (metaHit !== null) { barPress = { slot: metaHit, lock: null, meta: true }; barEdge = true; }
    else {
      const slotHit = hudSlotAt(cx, cy);
      if (slotHit !== null) { barPress = { slot: slotHit, lock: null }; barEdge = true; }
    }
  }
  if (barPress && !input.lmb) barPress = null;
  let dx = 0, dy = 0;
  if (input.keys.has(kb.moveUp) || (padLive && dialoguePadDown(pb.moveUp))) dy -= 1;
  if (input.keys.has(kb.moveDown) || (padLive && dialoguePadDown(pb.moveDown))) dy += 1;
  if (input.keys.has(kb.moveLeft) || (padLive && dialoguePadDown(pb.moveLeft))) dx -= 1;
  if (input.keys.has(kb.moveRight) || (padLive && dialoguePadDown(pb.moveRight))) dx += 1;
  // The move stick adds its ANALOG vector — deflection rides straight into
  // moveActor, so half-tilt is a slow stalk without any new movement path.
  if (padLive) { dx += pad.move.x; dy += pad.move.y; }
  // INVERTED MOVEMENT (Settings.invertMove): the player's own standard,
  // applied at the DEVICE layer — one flip for keys and stick alike,
  // before intent enters the wire (southpaw swaps WHICH stick moves; this
  // flips WHICH WAY movement goes). The widdershins hex flips again at the
  // engine's one mover, so a by-choice inverted hero who is hexed plays
  // STANDARD for the duration — two turns make a true; the XOR is the
  // design, not an accident.
  if (settings.invertMove) { dx = -dx; dy = -dy; }

  // Aim: the mouse cursor — unless the pad owns the reticle (last device to
  // speak wins). Pad aim is the stick's direction at deflection-scaled reach
  // from the hero, STICKY on release so the reticle holds where you left it,
  // then bent by the soft aim assist (engine/aimassist.ts) toward the held
  // target. The assisted point IS the reticle the renderer draws — what you
  // see is exactly what every castAtCursor skill receives.
  let aim = renderer.toWorld(input.mouse);
  if (aimSource === 'mouse' && mouseHandoff) {
    // A live HANDOFF: the pad's reticle handed the mouse this offset — aim
    // rides arrow+offset (melting in tick's motion block) so the switch
    // never flips facing toward a stale, parked arrow.
    aim = renderer.toWorld({
      x: input.mouse.x + mouseHandoff.x,
      y: input.mouse.y + mouseHandoff.y,
    });
    padAimView = { x: aim.x, y: aim.y, lockId: null };
  }
  if (aimSource === 'pad' && padLive) {
    const t = padTuning();
    const reach = pad.aimReach(pad.aimMag > 0 ? pad.aimMag : pad.lastAimMag, t);
    const raw = { x: p.pos.x + pad.lastAimDir.x * reach, y: p.pos.y + pad.lastAimDir.y * reach };
    // A zero-length frame (timer-resolution twins) must not re-run the
    // assist: the corrected glide strength would be exactly 0, and a
    // 0-strength assist reads as "free aim" — wiping the held lock and
    // flickering the view to raw for one frame. Deliver last frame's point
    // (buttons and movement below still read normally).
    if (dt <= 0 && padAimView) {
      aim = { x: padAimView.x, y: padAimView.y };
    } else {
      // Delivery mode (AIM_ASSIST_MODES; a held skill's def may someday
      // override this per skill). In 'cursor' mode with the stick at rest
      // the write-back below COMPOUNDS frame over frame — correct the blend
      // so the settle/track rate matches strength-per-frame at glideRefHz on
      // any monitor. A live stick frame is absolute (no compounding).
      const mode = settings.pad.assistMode;
      const sBase = settings.pad.aimAssist;
      const strength = (mode === 'cursor' && pad.aimMag === 0 && sBase < 1)
        ? 1 - Math.pow(1 - sBase, dt * AIM_ASSIST.glideRefHz)
        : sBase;
      const assisted = assistAim(world, p, raw, padLock, strength);
      padLock = assisted.targetId;
      aim = { x: assisted.x, y: assisted.y };
      if (mode === 'cursor' && padLock !== null) {
        // THE ASSIST MOVES THE CURSOR: fold the assisted point back into the
        // pad's sticky aim, so a broken lock (death, dash, wall) or a device
        // switch continues from where the reticle visibly is — never a snap
        // back to the pre-assist raw point. Hero-relative dir + reach is the
        // sticky aim's native space; reach inversion clamps to the player's
        // envelope (a target hugging the hero parks the cursor at min reach
        // in its direction — direction, and so facing, is always preserved).
        const dx = aim.x - p.pos.x, dy = aim.y - p.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-3) {
          const mag = (dist - t.aimMinRadius) / Math.max(1, t.aimMaxRadius - t.aimMinRadius);
          pad.setStickyAim({ x: dx / dist, y: dy / dist }, mag);
        }
      }
      padAimView = { x: aim.x, y: aim.y, lockId: padLock };
    }
  }

  // THE PRESSABLE BAR's aim: the cursor sits on the bar, so the press aims
  // where the hero FACES at the pad's mid reach, bent by the assist at full
  // strength (the held lock persists across the press, the pad's own law).
  if (barPress && !(aimSource === 'pad' && padLive)) {
    const t = padTuning();
    const reach = pad.aimReach(0.5, t);
    const raw = { x: p.pos.x + Math.cos(p.facing) * reach, y: p.pos.y + Math.sin(p.facing) * reach };
    const assisted = assistAim(world, p, raw, barPress.lock, 1);
    barPress.lock = assisted.targetId;
    aim = { x: assisted.x, y: assisted.y };
  }

  // Slots 0/1 are LMB/RMB (fixed) — on a pad they're ordinary binds; slots
  // 2–7 merge the rebindable keys with their pad buttons. Keyboard OR pad,
  // per slot, per frame — the intent downstream can't tell which spoke.
  const slotActs = [
    'skillSlot0', 'skillSlot1', 'skillSlot2', 'skillSlot3',
    'skillSlot4', 'skillSlot5', 'skillSlot6', 'skillSlot7',
  ] as const;
  const skillKeys = [kb.skillSlot2, kb.skillSlot3, kb.skillSlot4, kb.skillSlot5, kb.skillSlot6, kb.skillSlot7];
  const held = [
    (input.lmb && !barPress) || (padLive && dialoguePadDown(pb.skillSlot0)),
    input.rmb || (padLive && dialoguePadDown(pb.skillSlot1)),
    ...skillKeys.map((k, i) => input.keys.has(k) || (padLive && dialoguePadDown(pb[slotActs[i + 2]]))),
  ];
  const edge = [
    (input.lmbPressed && !barPress) || (padLive && dialoguePadPressed(pb.skillSlot0)),
    input.rmbPressed || (padLive && dialoguePadPressed(pb.skillSlot1)),
    ...skillKeys.map((k, i) => {
      const fromKey = input.justPressed(k);
      const fromPad = padLive && dialoguePadPressed(pb[slotActs[i + 2]]);
      return fromKey || fromPad;
    }),
  ];
  // THE PRESSABLE BAR lands on its slot: held for the button's whole hold,
  // an edge on the frame it went down (the same shape a key delivers).
  let metaClick: number | null = null;
  if (barPress && barPress.slot < held.length) {
    if (barPress.meta) {
      // A meta click is an EDGE on the mini-button: no hold, no primary.
      if (barEdge) metaClick = barPress.slot;
    } else {
      held[barPress.slot] = true;
      if (barEdge) edge[barPress.slot] = true;
    }
  }
  // THE UNARMED-FLOOR opt-out (Settings.improvisedStrike): declined, an
  // EMPTY slot's press never leaves this client — the world's floor rule
  // (World.applyInputs' null-slot branch) stays universal; the refusal is
  // local input-shaping, exactly like a keybind. Each co-op peer's setting
  // shapes only their own hands.
  if (!settings.improvisedStrike) {
    for (let i = 0; i < held.length; i++) {
      if (!p.skills[i]) { held[i] = false; edge[i] = false; }
    }
  }
  // THE PRESSABLE META's landing: the clicked mini-button fires its slot's
  // meta as an edge — the modifier lane's exact shape, no modifier needed.
  if (metaClick !== null) {
    const metaEdge = edge.map(() => false);
    metaEdge[metaClick] = true;
    return { dx, dy, aim, held, edge: edge.map(() => false), metaEdge };
  }
  // The META layer (rebindable; shift by default): modifier+slot fires the
  // slot skill's META-ACTION (Detonate / Enrage / Thrust!) INSTEAD of a new
  // press. HELD states survive the modifier — a raised guard or a running
  // channel must NOT drop because you reached for the meta button (the
  // shield-bash-on-shift bug); only fresh EDGES reroute.
  const metaKey = kb.metaModifier ?? 'shift';
  const metaEdgePressed = input.justPressed(metaKey)
    || (padLive && dialoguePadPressed(pb.metaModifier));
  if (input.keys.has(metaKey) || (padLive && dialoguePadDown(pb.metaModifier))) {
    const metaEdge = edge.map(() => false);
    for (let i = 0; i < edge.length; i++) if (edge[i]) metaEdge[i] = true;
    // HELD-CAST META (Phalanx while Shield Up): you can't re-press a
    // button you're already HOLDING — so during a held cast (guard /
    // channel / charge / overcharge), pressing the MODIFIER ALONE fires
    // the HELD skill's meta. Scoped to exactly that slot: three channel
    // skills on the bar never fire three metas — only the one in hand.
    if (metaEdgePressed && p.casting
      && ['guard', 'channel', 'charge', 'overcharge', 'concentration'].includes(p.casting.mode)) {
      const ci = p.skills.findIndex(s => s === p.casting!.inst);
      if (ci >= 0) metaEdge[ci] = true;
    }
    return { dx, dy, aim, held, edge: edge.map(() => false), metaEdge };
  }
  return { dx, dy, aim, held, edge };
}

/** LOCAL-only UI input (the pause menu + panel toggles). Kept out of the intent
 *  pipeline — these are this client's screen, never gameplay sent to the host. */
function handleLocalPanels(): void {
  // Dead/downed suppresses ALL local UI input, exactly as the old single input
  // handler did (`if (p.dead) return`) — so escape/panels can't pop over the
  // death screen. (A downed local hero in co-op likewise can't toggle panels.)
  if (world.player.dead || world.player.downed) return;
  const kb = settings.keybinds;
  if (dialogue.open && !padPointer.active) {
    const next = settings.padBinds.dialogueAdvance, back = PAD_CFG.pointer.cancel;
    const cancel = next !== back && pad.justPressed(back);
    const advance = pad.justPressed(next);
    if (cancel) dialoguePadHeld.add(back);
    if (advance) dialoguePadHeld.add(next);
    if (cancel) dialogue.close();
    else if (advance) dialogue.advance();
  }
  // Escape toggles the pause/menu (hardwired — never rebindable). While it's up,
  // gameplay intent is suppressed (readLocalInput returns null). An open DWELL
  // dialog (caravan / toll / sail) is dismissed FIRST and the press stops there —
  // Esc on a dialog means "close this", not "pause the game on top of it".
  // ESCAPE is a strict, predictable CASCADE — every press does exactly ONE
  // legible thing, in order of how "modal" the thing is:
  //   0. a running crafting minigame owns the screen (Esc waits it out),
  //   1. the pause menu closes,
  //   2. an open DWELL dialog dismisses (their closes carry semantics —
  //      closing the vocation offer DECLINES it; one dialog per press),
  //   3. ordinary windows (sheet/map/inventory with its pages) all clear —
  //      Esc here means "give me my screen back", NEVER "pause on top",
  //   4. a clear screen: NOW Esc is the pause menu.
  // THE ESCAPE POLICY (ui/escapeConfig.ts, Settings.escapeCloses) may fold
  // steps 2–3 into ONE sweep; the modal steps above them never change.
  if (input.justPressed('escape')) {
    if (ui.minigameRunning()) return;
    // THE FORGE's step-away (the steady hand): a tracing hand's Esc cancels
    // the trace — the writ endures — before any menu opens over the bench.
    if (world.traceActive(world.localSeat.id)) { world.requestMeta({ t: 'forgeCancel' }); return; }
    if (ui.escapeMenuOpen) { ui.hideEscapeMenu(); return; }
    // The couch join overlay dismisses like any dialog — one press, gone.
    if (ui.couchJoinOpen) { closeCouchJoin(); return; }
    if (dialogue.open && dialogue.close()) return;
    if (ui.closeNpcFront()) return;
    // COUCH: the hero's Esc walks ITS OWN cascade — a guest's open panels
    // are the guest's business (their Ⓑ walks theirs). Solo falls through
    // to the classic global cascade below, byte-identically.
    // THE MENU BAR's tray folds first — it is the topmost, lightest surface.
    if (ui.menuTrayClose()) return;
    if (couchActive()) {
      if (!ui.escCascadeFor(world.localSeat.id)) ui.showEscapeMenu();
      return;
    }
    if (ui.cancelSalvageMode(world.localSeat.id)) return;
    // THE ESCAPE POLICY (ui/escapeConfig.ts): a sweep mode clears the whole
    // screen in one press — every book through its leaves' own closes, the
    // dialog belt, the ordinary panels (a kept page last) — and pauses only
    // a clear screen; 'step' walks the classic cascade below.
    const escMode = escapeModeOf(settings.escapeCloses);
    if (escMode.id !== 'step') {
      if (ui.escapeSweep(world.localSeat.id, escMode.keep)) return;
      ui.hideAll();
      ui.showEscapeMenu();
      return;
    }
    // THE FOLIO (ui/folio.ts): a book closes its FRONT leaf first — the one
    // on screen — through that leaf's own close; the fixed list below stays
    // as the belt for any dialog not enrolled.
    if (ui.folioCloseFront()) return;
    if (ui.caravanOpen) { ui.closeCaravan(); return; }
    if (ui.vendorOpen) { ui.closeVendor(); return; }
    if (ui.salvageOpen) { ui.closeSalvage(); return; }
    if (ui.fontOpen) { ui.closeFont(); return; }
    if (ui.oracleOpen) { ui.closeOracle(); return; }
    if (ui.bestiaryOpen) { ui.closeBestiary(); return; }
    if (ui.sailOpen) { ui.closeSail(); return; }
    if (ui.bountiesOpen) { ui.closeBounties(); return; }
    if (ui.mercOpen) { ui.closeMercMenu(); return; }
    if (ui.boroughOpen) { ui.closeBorough(); return; }
    // The vocation choice menu closes through its OWN close (not hideAll):
    // closeVocationMenu also DECLINES the offer, else the dwell re-pops the
    // menu the instant the pause menu comes down.
    if (ui.vocationOpen) { ui.closeVocationMenu(); return; }
    if (ui.anyPanelOpen()) { ui.hideAll(); return; }
    ui.hideAll();
    ui.showEscapeMenu();
    return;
  }
  if (ui.escapeMenuOpen) return;
  if (!ui.blockingFor(world.localSeat.id) && (input.justPressed(kb.townPortal) || (!padPointer.active && pad.justPressed(settings.padBinds.townPortal)))) {
    world.requestMeta({ t: 'townPortal' });
  }
  // THE COMPANION STANCE (engine/companionStances.ts): one press walks every
  // bonded beast's conduct on the bar — host-judged like every meta intent.
  if (!ui.blockingFor(world.localSeat.id) && (input.justPressed(kb.companionStance)
    || (!padPointer.active && pad.justPressed(settings.padBinds.companionStance)))) {
    world.requestMeta({ t: 'companionStance' });
  }
  // Panel toggles answer to key OR pad bind — and the pad ones deliberately
  // stay live in pointer mode (the D-pad flips panels while browsing them).
  const pb = settings.padBinds;
  if (input.justPressed(kb.panelChar) || pad.justPressed(pb.panelChar)) ui.toggleCharSheet();
  if (input.justPressed(kb.panelTree) || pad.justPressed(pb.panelTree)) ui.toggleTree();
  if (input.justPressed(kb.panelSkills) || pad.justPressed(pb.panelSkills)) ui.toggleBuildPanel();
  if (input.justPressed(kb.panelMap) || pad.justPressed(pb.panelMap)) ui.toggleMap();
  if (input.justPressed(kb.panelInv) || pad.justPressed(pb.panelInv)) ui.toggleInventory();
  // THE MENU BAR's tray (ui/menubar.ts): the bind fans the pages. Its
  // default key is Tab, which THE FOLIO also walks while a book of two or
  // more leaves stands — the walk wins then (folioWalkArmed).
  if ((input.justPressed(kb.panelMenu) || pad.justPressed(pb.panelMenu)) && !ui.folioWalkArmed()) ui.toggleMenu();
  // GEAR pickup — a META intent (host-validated, co-op-replicated), not raw
  // world poking; the open bag re-renders so the grab appears instantly.
  if (input.justPressed(kb.pickup) || pad.justPressed(pb.pickup)) {
    world.requestMeta({ t: 'pickupItem' });
    if (ui.inventoryOpen) ui.refreshInventory();
  }
}

/** Spawn a local stand-in ally (scripted: follow + auto-attack) to exercise the
 *  multi-seat co-op path without networking. Dev-only, gated by `?coop` or the
 *  `__game.addAlly()` console hook. Picks a class different from the local hero. */
function spawnCoopAlly(): void {
  if (world.seats.length >= 5) return;
  const own = world.localSeat.meta.classDef;
  const cls = CLASSES.find(c => c !== own) ?? own;
  const id = 'p' + world.seats.length;
  if (net instanceof LocalTransport) net.addLocalSeat({ id, name: cls.name, classId: cls.id });
  // `?coophuman` makes the second seat a LOCAL HUMAN on the arrow keys (test co-op
  // move/cast in one tab); otherwise it's a scripted follow-and-fight ally.
  world.addSeat(id, cls, COOP_HUMAN ? new LocalCoopInput(input.keys) : new ScriptedInput());
}

// ---------------------------------------------------------------------------
// THE COUCH SESSION (data/couch.ts) — a second LOCAL player on this screen.
// A guest is an ordinary Seat: its intent is a PadSeatInput on a claimed pad,
// its panels dock to its flank, its vessel (immortal lane) persists to its
// own roster slot. Everything here short-circuits to nothing with no guests
// seated — the solo invariant. main.ts owns the session (the world owns only
// the seats), exactly as it owns the net transport.
// ---------------------------------------------------------------------------
interface CouchGuestCtx {
  seatId: string;
  /** The claimed pad slot; -1 while the device is LOST (identity sweep). */
  padIdx: number;
  /** Device identity captured at claim — the re-bind's match key. */
  padId: string | null;
  /** Census snapshot from the frame the bound pad vanished: slots already
   *  standing then may never be adopted (findRebindSlot's newcomer rule).
   *  Undefined while the pad is alive. */
  lostSeen?: Set<number>;
  gpad: PadState;
  source: PadSeatInput;
  pointer: PadPointer;
  /** Immortal-lane vessel context: the roster slot + the join-time save
   *  (its dormant menagerie rides back out verbatim at persist). */
  vessel?: { slot: number; save: CharacterSave };
}
const couchGuests = new Map<string, CouchGuestCtx>();
const couchPadSet = new Set<number>();
const couchClaim = new CouchClaimSession(pad);
const couchOverlay = new CouchJoinOverlay();
let couchClaimPad: number | null = null;
let couchSeatSerial = 0;
/** Last frame's connected-pad census — the pause menu's couch row re-renders
 *  the moment it moves (a controller is invisible to the browser until its
 *  first button press; the row asks for that press, so it must reward it). */
let couchPadCensus = -1;

function couchActive(): boolean { return couchGuests.size > 0; }

// The hero's merged pad read skips claimed guest pads (null = byte-identical
// classic read while no guest is seated).
pad.padExclude = () => (couchPadSet.size ? couchPadSet : null);

/** A guest's gameplay parks while a global surface is up or its own pointer
 *  owns its pad (its panels are open) — the guest twin of P1's padLive gate. */
function couchGuestSuspended(id: string): boolean {
  const g = couchGuests.get(id);
  return !g || ui.escapeMenuOpen || ui.couchJoinOpen || g.pointer.active;
}

/** THE IDENTITY RE-BIND (per guest, per frame): a claimed pad that vanishes
 *  (Bluetooth sleep, Steam Input device churn) releases its slot back to the
 *  hero's pool and parks the seat — the flank HUD says so — and when a pad
 *  wearing the SAME device id arrives at a NEWCOMER slot, the seat follows
 *  it there by itself (net/couch.ts findRebindSlot owns the match law). */
function couchGuestPadSweep(g: CouchGuestCtx): void {
  const atBound = g.padIdx >= 0 ? padIdAt(g.padIdx) : null;
  if (atBound !== null && (g.padId === null || atBound === g.padId)) {
    g.lostSeen = undefined; // the claimed device stands where we left it
    return;
  }
  if (g.padIdx >= 0) {
    // First frame of loss — or a STRANGER at the bound slot (that slot may
    // be P1's own controller returning; the hero's roam must be free to
    // take it). Release the claim and snapshot the census: only a slot
    // appearing AFTER this moment may re-bind.
    couchPadSet.delete(g.padIdx);
    g.padIdx = -1;
    g.gpad.padIndex = -1; // a bound read at -1 reads nothing — the seat parks
    const seat = world.seats.find(s => s.id === g.seatId);
    if (seat?.couch) seat.couch.pad = -1;
    g.lostSeen = new Set(connectedPadIndices());
  }
  const slot = findRebindSlot(g.padId, g.lostSeen ?? new Set(), couchPadSet);
  if (slot !== null) {
    g.padIdx = slot;
    g.gpad.padIndex = slot;
    couchPadSet.add(slot);
    const seat = world.seats.find(s => s.id === g.seatId);
    if (seat?.couch) seat.couch.pad = slot;
    g.lostSeen = undefined;
  }
}

/** THE LANE LAW: the guest joins the run's OWN lane — an immortal run seats
 *  another vessel from this account's roster (a second immortal slot must be
 *  unlocked); a mortal run seats a fresh, disposable hero (the net join's
 *  Tier-0 idiom). */
function couchLaneImmortal(): boolean { return modeById(world.meta.modeId).save === 'roster'; }

function couchChoices(): CouchJoinChoice[] {
  if (!couchLaneImmortal()) {
    return CLASSES.filter(c => isClassUnlocked(account, c.id)).map(c => ({
      key: 'class:' + c.id, title: c.name, sub: c.description, color: c.color,
    }));
  }
  const mode = modeById(world.meta.modeId);
  if (rosterCapacity(account, mode) < COUCH_CFG.join.immortalSlotsNeeded) {
    return [{
      key: 'none', title: 'A second Immortal slot is required', color: '#8a8678', sub: '',
      disabled: 'Unlock another Immortal vessel slot in the Vault to bring a second vessel to the couch.',
    }];
  }
  // THE FALLEN LOCK: a fallen vessel cannot couch-join — the covenant gates
  // every entry into play, not just the solo resume.
  const rows = account.roster.filter(r =>
    r.modeId === mode.id && r.charId !== world.meta.charId && !r.fallen);
  if (!rows.length) {
    const fallenOnly = account.roster.some(r =>
      r.modeId === mode.id && r.charId !== world.meta.charId && r.fallen);
    return [{
      key: 'none', color: '#8a8678', sub: '',
      title: fallenOnly ? 'Every other vessel lies fallen' : 'No second vessel sworn',
      disabled: fallenOnly
        ? 'Resurrect a vessel in the Vault first — a fallen Immortal cannot take the couch.'
        : 'Swear another Immortal from the start menu first — the couch seats an existing vessel.',
    }];
  }
  return rows.map(r => ({
    key: 'vessel:' + r.charId,
    title: `${r.name} — Level ${r.level}`,
    sub: `${CLASSES.find(c => c.id === r.classId)?.name ?? r.classId} · ${mode.name}`,
    color: mode.color,
  }));
}

function couchJoinView(): CouchJoinView {
  const lane = couchLaneImmortal()
    ? 'Immortal run — a second VESSEL from this account joins.'
    : 'Mortal run — a fresh hero joins for this run (the run is the character).';
  return couchClaimPad === null
    ? {
      phase: 'claim', lane,
      message: 'Press Ⓐ on the JOINING controller to claim it.',
      choices: [], onPick: () => { /* no choices yet */ }, onCancel: closeCouchJoin,
    }
    : {
      phase: 'pick', lane,
      message: `Controller ${couchClaimPad + 1} claimed — choose who joins.`,
      choices: couchChoices(), onPick: couchJoin, onCancel: closeCouchJoin,
    };
}

function openCouchJoin(): void {
  if (!running || !net.isHost || !(net instanceof LocalTransport)) return;
  if (world.couchSeats().length >= COUCH_CFG.join.maxLocal - 1) return;
  couchClaimPad = null;
  // Freeze the hero's roaming read where it stands: the claim scan and the
  // roam must never race for the joining pad's first press (the Deck bug —
  // the roam adopted the press and the scan then excluded it, forever).
  couchClaim.arm(couchPadSet);
  ui.couchJoinOpen = true;
  // The ceremony is a menu: solo holds the world (the allowHold policy — a
  // live couch keeps running, exactly like the pause law).
  world.timeflow.holdSurface('menu:couchJoin');
  couchOverlay.show(couchJoinView());
}

function closeCouchJoin(): void {
  ui.couchJoinOpen = false;
  couchClaimPad = null;
  couchClaim.release();
  world.timeflow.release('menu:couchJoin');
  couchOverlay.hide();
}

/** Mint the guest seat: transport peer + PadState bound to the claimed pad +
 *  the PadSeatInput source + a pointer of its own, flank-tagged. */
function mintCouchSeat(padIdx: number, cls: ClassDef, vessel?: CouchGuestCtx['vessel']): Seat | null {
  if (!(net instanceof LocalTransport)) return null;
  const id = 'c' + (++couchSeatSerial);
  net.addLocalSeat({ id, name: vessel?.save.name ?? cls.name, classId: cls.id });
  const gpad = new PadState(padTuning);
  gpad.padIndex = padIdx;
  const source = new PadSeatInput(gpad, {
    tuning: padTuning,
    binds: () => settings.padBinds,
    assist: () => ({ mode: settings.pad.assistMode, strength: settings.pad.aimAssist }),
    improvisedStrike: () => settings.improvisedStrike,
    invertMove: () => settings.invertMove,
    suspended: () => couchGuestSuspended(id),
  });
  const seat = world.addSeat(id, cls, source, { startingCompanions: !vessel, startingFlasks: !vessel });
  const side = COUCH_CFG.join.sides[
    Math.min(COUCH_CFG.join.sides.length - 1, world.couchSeats().length + 1)] ?? 'right';
  seat.couch = { pad: padIdx, side };
  const pointer = new PadPointer(gpad, padTuning);
  pointer.onCancel = () => couchGuestCancel(id);
  couchGuests.set(id, { seatId: id, padIdx, padId: padIdAt(padIdx), gpad, source, pointer, vessel });
  couchPadSet.add(padIdx);
  return seat;
}

/** The pick handler: 'class:<id>' seats a fresh mortal-lane hero; 'vessel:
 *  <charId>' loads + grafts the roster vessel (async disk-first read). */
function couchJoin(pick: string): void {
  if (couchClaimPad === null) return;
  const padIdx = couchClaimPad;
  if (pick.startsWith('class:')) {
    const cls = CLASSES.find(c => c.id === pick.slice('class:'.length));
    if (cls) mintCouchSeat(padIdx, cls);
    closeCouchJoin();
    return;
  }
  if (!pick.startsWith('vessel:')) return;
  const charId = pick.slice('vessel:'.length);
  const entry = account.roster.find(r => r.charId === charId);
  if (!entry) { closeCouchJoin(); return; }
  void (async (): Promise<void> => {
    const save = await loadRosterSave(entry.slot);
    const built = save && rebuildSavedMeta(save);
    const cls = save && CLASSES.find(c => c.id === save.classId);
    if (!save || !built || !cls) { closeCouchJoin(); return; }
    const seat = mintCouchSeat(padIdx, cls, { slot: entry.slot, save });
    if (seat) {
      world.adoptSeatMeta(seat, built.meta, save.bar, save.level);
      seat.couchDeaths = built.deaths;
      if (!seat.meta.charId) seat.meta.charId = entry.charId;
      seat.couch!.charId = seat.meta.charId;
      seat.couch!.rosterSlot = entry.slot;
    }
    closeCouchJoin();
  })();
}

/** Persist every seated guest VESSEL to its own roster slot (the persistRun
 *  sibling; disposable mortal-lane guests carry nothing to save). */
function persistCouchGuests(durable = false): void {
  for (const g of couchGuests.values()) {
    if (!g.vessel) continue;
    const seat = world.seats.find(s => s.id === g.seatId);
    if (!seat) continue;
    saveCouchGuest(account, world, seat, g.vessel.slot, g.vessel.save, durable);
  }
}

/** A guest leaves mid-run (the escape row): vessel saved, seat removed, pad
 *  released — the frame narrows back to the hero on its own smoothing. */
function couchLeave(id: string): void {
  const g = couchGuests.get(id);
  if (!g) return;
  persistCouchGuests();
  world.removeSeat(id);
  if (net instanceof LocalTransport) net.removeLocalSeat(id);
  g.pointer.dispose();
  couchGuests.delete(id);
  couchPadSet.delete(g.padIdx);
  renderer.couchAims = [];
  renderer.couchPadLost = [];
}

/** Tear the whole couch session down (run end / menu). Persistence is the
 *  CALLER's duty first — this only drops the session machinery. */
function couchReset(): void {
  for (const g of couchGuests.values()) g.pointer.dispose();
  couchGuests.clear();
  couchPadSet.clear();
  renderer.couchAims = [];
  renderer.couchPadLost = [];
  if (ui.couchJoinOpen) closeCouchJoin();
}

/** The guest's Ⓑ/cancel cascade — their panels first, then the shared pause. */
function couchGuestCancel(id: string): void {
  if (ui.couchJoinOpen) { closeCouchJoin(); return; }
  if (ui.escCascadeFor(id)) return;
  synthEscape();
}

/** Per-frame couch work, right after the hero's own device poll: guest pads
 *  poll on the same wall clock, guest pointers wake on THEIR OWN blocking
 *  surfaces, the join overlay runs its claim scan, and the renderer gets the
 *  guests' reticles in their class tints. No guests = nothing. */
function couchTick(dt: number, nowSec: number): void {
  for (const g of couchGuests.values()) {
    couchGuestPadSweep(g);
    g.gpad.poll(nowSec);
    g.pointer.update(dt, ui.blockingFor(g.seatId) || !running, nowSec);
    // Guest START = the shared pause (either player may pause the couch).
    if (g.gpad.justPressed(PAD_CFG.escapeButton)) synthEscape();
  }
  // The pause menu's couch row gates on the pad census — re-render it live
  // as controllers announce themselves (a pad is invisible to the browser
  // until its first button press; the disabled row asks for exactly that
  // press, so the press must enable the row while the menu still shows).
  const census = connectedPadIndices().length;
  if (census !== couchPadCensus) {
    couchPadCensus = census;
    if (ui.escapeMenuOpen) ui.refreshEscapeCouchRow();
  }
  if (ui.couchJoinOpen) {
    if (couchClaimPad === null) {
      const hit = couchClaim.scan(COUCH_CFG.join.claimButton, couchPadSet);
      if (hit !== null) couchClaimPad = hit;
    }
    couchOverlay.update(couchJoinView());
  }
  if (couchGuests.size) {
    // The flank banner: seats whose CONTROLLER left (identity sweep above).
    renderer.couchPadLost = [...couchGuests.values()]
      .filter(g => g.padIdx < 0).map(g => g.seatId);
    renderer.couchAims = [...couchGuests.values()].flatMap(g => {
      const seat = world.seats.find(s => s.id === g.seatId);
      const a = g.source.aimView();
      return seat && a && !seat.actor.dead && !seat.actor.downed
        ? [{ x: a.x, y: a.y, lockId: a.lockId, color: seat.meta.classDef.color }] : [];
    });
  }
}

/** Guest panel toggles + pickup, off the guest's OWN pad binds — the couch
 *  twin of handleLocalPanels (host branch only; guests exist only there). */
function handleCouchPanels(): void {
  if (ui.escapeMenuOpen || ui.couchJoinOpen) return;
  const pb = settings.padBinds;
  for (const g of couchGuests.values()) {
    const seat = world.seats.find(s => s.id === g.seatId);
    if (!seat || seat.actor.dead || seat.actor.downed) continue;
    if (!g.pointer.active && g.gpad.justPressed(pb.townPortal)) world.applyAction(seat, { t: 'townPortal' });
    if (!g.pointer.active && g.gpad.justPressed(pb.companionStance)) world.applyAction(seat, { t: 'companionStance' });
    if (g.gpad.justPressed(pb.panelChar)) ui.toggleCharSheet(g.seatId);
    if (g.gpad.justPressed(pb.panelTree)) ui.toggleTree(g.seatId);
    if (g.gpad.justPressed(pb.panelSkills)) ui.toggleBuildPanel(g.seatId);
    if (g.gpad.justPressed(pb.panelMap)) ui.toggleMap();
    if (g.gpad.justPressed(pb.panelInv)) ui.toggleInventory(g.seatId);
    if (g.gpad.justPressed(pb.pickup)) {
      world.applyAction(seat, { t: 'pickupItem' });
      if (ui.inventoryOpen) ui.refreshInventory();
    }
  }
}

// --- THE CARAVAN's three seams (engine/world.ts updateCaravan) ---------------
// The dwell is seat-scoped and the travel is host-authoritative, so every road
// out of the Caravanner ends in the SAME caravanTo intent — the host mints the
// route and loads the party, whoever asked.

/** Ask the escort for band N (0 = home) for whichever LOCAL seat lingered.
 *  ALWAYS the intent lane, never startCaravan directly: on a co-op CLIENT
 *  requestMeta forwards caravanTo and applies nothing locally (a render shell
 *  never mints or loads a zone), and host-side a couch guest's ask must land on
 *  the GUEST's seat — startCaravan re-checks proximity per seat, so routing a
 *  guest's dwell through the distant hero would simply refuse. Solo the dwell
 *  seat IS the local seat: one requestMeta, exactly as before. */
function caravanTo(band: number): void {
  const seat = world.seats.find(s => s.id === world.caravanDwellSeatId);
  if (seat?.couch) world.applyAction(seat, { t: 'caravanTo', band });
  else world.requestMeta({ t: 'caravanTo', band });
}

/** The Caravanner's TOWN answer: open the band menu on the seat that lingered. */
function pollCaravanMenu(): void {
  if (world.caravanDwellRequested && !ui.escapeMenuOpen) {
    world.caravanDwellRequested = false;
    if (!ui.caravanOpen) ui.showCaravan(world.caravanDwellSeatId);
  }
}

/** The Caravanner's WILDS answer: port straight home, no menu (so nothing pops
 *  up mid-combat) — through the intent, so a client's return works too. */
function pollCaravanReturn(): void {
  if (world.caravanReturnRequested) {
    world.caravanReturnRequested = false;
    caravanTo(0);
  }
}

// The pause-menu row (panels.ts gates it on pads + a free guest seat).
ui.onCouchJoin = openCouchJoin;
ui.onCouchLeave = () => {
  for (const id of [...couchGuests.keys()]) couchLeave(id);
};

// --- FRAME TELEMETRY (always on; read via __game.perfFrames) -----------------
// Three fixed ring buffers of per-frame wall-clock samples: the rAF GAP (true
// frame pacing — the jitter a player feels, compositor included), the SIM
// milliseconds (input + AI + world.update), and the RENDER milliseconds. Cost
// is two performance.now() calls and three float writes per frame — nothing.
// The perf harness (npm run perf → src/dev/perf.ts) reduces these to
// percentiles/hitch counts per zone; a future in-game FPS readout reads the
// same rings.
const PERF_RING = 2048;
// THE RING FIT (2026-08-02): the rings were a constant 2048 slots, and a
// 240Hz display fills that in ~8.5s — a --seconds=12 sweep window WRAPPED,
// silently dropping the window's OLDEST frames (exactly where bakes cluster),
// so h40/gapMax undercounted while the sampler-side off40 kept counting
// (gloamwood base2 2026-08-02: off40 5 vs h40 0 at frames=2048 exact). The
// perf sweep now sizes the rings to its own window via perfRingSize
// (requested seconds × measured refresh + margin); PERF_RING stays the floor
// and the play-mode default — normal play never resizes. perfPushed counts
// every push since the last reset: pushed > stored frames is the wrap
// detector no sizing mistake can silently defeat.
let perfRingN = PERF_RING;
let perfGap = new Float32Array(perfRingN);
let perfSim = new Float32Array(perfRingN);
let perfRen = new Float32Array(perfRingN);
let perfIdx = 0, perfCount = 0, perfPushed = 0;
/** The sampler's fine own-task anchor (__game.perfTickT0): performance.now()
 *  at the CURRENT frame's tick-callback entry. The coarse taskMax anchors on
 *  the vsync timestamp, so a foreign task overhanging the tick wears the
 *  frame's name — this mark lets the sweep separate the frame's OWN work
 *  from that overhang (src/dev/perf.ts walkPhase). */
let perfTickT0 = 0;
/** Resize the frame rings — the perf harness's one-per-sweep call (normal
 *  play keeps the default). Clamped to [PERF_RING, 1<<17]; resets the rings. */
function perfRingSize(frames: number): number {
  const want = Math.max(PERF_RING, Math.min(1 << 17, Math.ceil(frames) || 0));
  if (want !== perfRingN) {
    perfRingN = want;
    perfGap = new Float32Array(want);
    perfSim = new Float32Array(want);
    perfRen = new Float32Array(want);
  }
  perfIdx = 0; perfCount = 0; perfPushed = 0;
  return perfRingN;
}
function perfPush(gap: number, sim: number, ren: number): void {
  perfGap[perfIdx] = gap; perfSim[perfIdx] = sim; perfRen[perfIdx] = ren;
  perfIdx = (perfIdx + 1) % perfRingN;
  if (perfCount < perfRingN) perfCount++;
  perfPushed++;
  phaseMark('sim', sim); phaseMark('ren', ren); // the bracketed slabs join the ledger
}

// THE PHASE LEDGER (perf attribution, 2026-08-02): coarse wall-clock marks
// around the frame's major slabs, folded to ONE window-worst (name, ms) that
// perfFrames ships beside the rings — so a perf-sweep row whose gapMax ≈
// taskMx with sim99/ren99 both tiny (the 2026-08-01 verdict sweep's
// metropolis 367ms task, sim 8 / ren 6: a giant slab inside the frame task
// but outside BOTH engine brackets) SELF-ATTRIBUTES instead of needing a
// hand bisect. The slabs and their anchors:
//   'pre'  — rAF timestamp → tick-callback entry. The ONLY mark anchored on
//            the vsync timestamp (deliberately the same anchor as the
//            sampler's coarse taskMax): a foreign task (GC, timer, idle
//            autosave) overhanging the tick delays the whole callback batch
//            and wears the frame's name in taskMax — this mark measures
//            exactly that overhang, disambiguating the coarse-anchor trap.
//            (step()-driven synthetic frames mint a bogus 'pre'; the ledger
//            is only read by the perf sweep, which drives real rAF.)
//   'head' — tick entry → the sim bracket (pad poll, pointer, couch tick).
//   'sim'/'ren' — the standing brackets, folded at perfPush (same frame).
//   'tail' — post-perfPush → end of the host branch (net broadcast +
//            hostTail). A tail slab CANNOT flush before its own frame's
//            perfPush by position (hostTail runs after it), so it CARRIES
//            to the NEXT tick's fold — ≤1 frame late, and a window's last
//            tail lands in the gap after it closes. Coarse by design.
// Cost: three performance.now() calls + compares per frame; always on, like
// the rings themselves.
let phaseWorstName = '', phaseWorstMs = 0, phasePendTail = 0;
function phaseMark(name: string, ms: number): void {
  if (ms > phaseWorstMs) { phaseWorstName = name; phaseWorstMs = ms; }
}

// --- THE RENDER-SCALE GOVERNOR (render/renderScale.ts; Settings.renderScale) --
// 'auto' watches the SAME gap ring the Pulse tab and the perf harness read
// and walks the notch ladder — down readily while sustained p95 sits past
// the 30fps knee, up patiently once frames hold (the pure nextNotch law).
// A manual number pins the scale. Runs every frame, judges every evalSec.
let rsNotch = 0, rsHotSec = 0, rsCoolSec = 0, rsNextEvalAt = 0;
function renderScaleTick(nowMs: number): void {
  const want = settings.renderScale;
  if (want !== 'auto') {
    renderer.setRenderScale(typeof want === 'number' ? want : 1);
    rsNotch = 0; rsHotSec = 0; rsCoolSec = 0;
    return;
  }
  if (nowMs < rsNextEvalAt) return;
  const g = RENDER_SCALE_CFG.governor;
  rsNextEvalAt = nowMs + g.evalSec * 1000;
  const n = Math.min(perfCount, 300);
  if (n < 60) return; // not enough frames to judge yet
  const start = (perfIdx - n + perfRingN) % perfRingN;
  const gaps: number[] = new Array(n);
  for (let i = 0; i < n; i++) gaps[i] = perfGap[(start + i) % perfRingN];
  gaps.sort((a, b) => a - b);
  const p95 = gaps[Math.floor(n * 0.95)];
  if (p95 > g.stepDownP95Ms) { rsHotSec += g.evalSec; rsCoolSec = 0; }
  else if (p95 < g.stepUpP95Ms) { rsCoolSec += g.evalSec; rsHotSec = 0; }
  else { rsHotSec = 0; rsCoolSec = 0; }
  const next = nextNotch(rsNotch, rsHotSec, rsCoolSec);
  if (next !== rsNotch) { rsNotch = next; rsHotSec = 0; rsCoolSec = 0; }
  renderer.setRenderScale(RENDER_SCALE_CFG.notches[rsNotch]);
}

let last = performance.now();
// THE AGENT SEAT + THE DIRECTOR (src/agent/, src/director/): a capture rig or
// a playtest bot may drive the local seat through the same artery the
// keyboard does (the pilot replaces readLocalInput on the host), and HOLD the
// rAF pump so only __game.step() advances the game (deterministic takes).
// Both are null/false in ordinary play — the classic loop, byte for byte.
let localPilot: PlayerInputSource | null = null;
let directorHold = false;
let director: Director | null = null;
/** The rAF pump: one tick, then re-arm. All work lives in tick() so tests can
 *  drive frames SYNCHRONOUSLY via __game.step() — a hidden tab freezes rAF
 *  entirely (the tab-throttle gotcha), which would otherwise freeze input
 *  polling, the pad, and the sim under any headless/backgrounded harness.
 *  A throw out of tick() is a FATAL (the crash trap above): before this
 *  catch existed it silently KILLED the pump — the classic wedged canvas —
 *  and after a fatal the pump stands down deliberately (no re-arm): a
 *  crashed sim is not ticked onward beneath the overlay. */
function frame(now: number): void {
  if (crashFatal) return;
  try { if (!directorHold) tick(now); } catch (e) { reportFatal(e, 'game loop'); }
  if (!crashFatal) requestAnimationFrame(frame);
}
function tick(now: number): void {
  // ?crashtest — the negative control's deliberate throw, from INSIDE the
  // live loop (see the const by COOP_PARAMS; Infinity while the param is off).
  if (now >= crashTestAt) {
    crashTestAt = Infinity;
    throw new Error('?crashtest — deliberate crash-trap drill from the rAF loop');
  }
  const frameGapMs = now - last; // true frame pacing, BEFORE the dt clamp
  const tickT0 = performance.now(); // PHASE LEDGER anchor: callback start
  perfTickT0 = tickT0; // the sampler's fine own-task anchor (__game.perfTickT0)
  phaseMark('pre', tickT0 - now); // vsync→callback overhang (a foreign task)
  phaseMark('tail', phasePendTail); phasePendTail = 0; // last frame's tail, carried
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Loading owns simulation, rendering and input while its independent toy runs.
  if (loadingScreen.active) { input.clearForLoading(); pad.poll(now / 1000); pad.endFrame(); net.drainInputs(); return; }

  // THE RENDER SCALE: apply the dial/governor, and keep the pointer seam
  // synced (CSS events map into buffer pixels through Input.pointerScale).
  renderScaleTick(now);
  input.pointerScale = renderer.pixelScale;

  // CONTROLLER, before anything reads input: poll the device, settle who owns
  // the reticle, run the menu pointer (it consumes Ⓐ/Ⓑ while active), and fire
  // the pad's hardwired Escape — a synthetic keystroke, so the entire close-
  // cascade stays single-sourced in handleLocalPanels.
  const nowSec = now / 1000;
  pad.poll(nowSec);
  if (loadingScreen.padQuarantined) {
    pad.move.x = pad.move.y = pad.aimStick.x = pad.aimStick.y = 0;
    pad.moveMag = pad.aimMag = 0; pad.down.clear(); pad.pressed.clear();
  }
  for (const code of dialoguePadHeld) if (!pad.isDown(code)) dialoguePadHeld.delete(code);
  if (!running || world.player?.dead || world.player?.downed) dialogue.reset();
  dialogue.setAvailable(renderer.npcDialogueAvailable());
  if (input.mouse.x !== lastMouse.x || input.mouse.y !== lastMouse.y) {
    // The mouse reclaims aim only through DELIBERATE travel: motion
    // accumulates while the pad holds the reticle, and only past the
    // threshold does the arrow take over (then it owns aim on any motion).
    const moved = Math.hypot(input.mouse.x - lastMouse.x, input.mouse.y - lastMouse.y);
    lastMouse.x = input.mouse.x; lastMouse.y = input.mouse.y;
    if (aimSource === 'pad') {
      mouseReclaim += moved;
      if (mouseReclaim >= PAD_CFG.mouseReclaimPx) {
        aimSource = 'mouse'; mouseReclaim = 0;
        // THE RETICLE HANDS THE MOUSE THE CURSOR: the switch starts aiming
        // exactly where the reticle was (assist and all), not wherever the
        // arrow sat parked — the offset melts with travel (block below).
        // Only while the reticle was truly the cursor (live play): if the
        // arrow was visible (menus etc.), its own position is the truth.
        if (padAimView && reticleAllowed()) {
          const rs = renderer.toScreen(padAimView);
          mouseHandoff = { x: rs.x - input.mouse.x, y: rs.y - input.mouse.y };
        }
      }
    } else if (mouseHandoff) {
      // MELT the handoff with deliberate travel — each px of motion scales
      // the offset by (1 − px/mergePx); once it's within doneEps of zero,
      // arrow and aim are one and the honest OS arrow returns.
      const h = PAD_CFG.mouseHandoff;
      const k = Math.max(0, 1 - moved / h.mergePx);
      mouseHandoff.x *= k; mouseHandoff.y *= k;
      if (Math.hypot(mouseHandoff.x, mouseHandoff.y) < h.doneEps) mouseHandoff = null;
    }
  }
  // Any live aim-stick deflection reclaims the reticle for the pad (and ends
  // any mouse handoff — the pad's sticky cursor is absolute again).
  if (pad.aimMag > 0) { aimSource = 'pad'; mouseReclaim = 0; mouseHandoff = null; }
  // COUCH: the hero's pointer wakes only on surfaces that block THE HERO'S
  // hands (a guest's open bag must not flip P1 into menu mode); solo keeps
  // the classic any-surface gate byte-identically.
  // THE FOLIO (ui/folio.ts): reconcile the books to every dialog's own open
  // flag — whatever path opened or closed it — and seat the thumb indexes.
  ui.folioSync();
  dialogue.setAvailable(renderer.npcDialogueAvailable());
  dialogue.syncLayout(); // only the reader; serviceWorkspace owns service geometry
  // THE MENU BAR (ui/menubar.ts): shown for a live run — never over the
  // flow screens, never under the Mu hub's HUD veil.
  // THE MENU BUTTON IS THE SHELL'S DOOR (2026-09-11, her ask): it stands
  // whenever the game runs, HUD veil or not — in Mu the pages read SEALED
  // (THE PANEL SEAL) and the pause page stays one click away, so the main
  // menu never depends on a remembered keybind. The veil hides the run HUD
  // cluster; this button was never part of it.
  ui.menuBarSync(dt, running);
  padPointer.update(dt,
    (couchActive() ? ui.blockingFor(world.localSeat.id) : ui.uiBlocking()) || dialogue.choosing || !running, nowSec);
  couchTick(dt, nowSec);
  const lockPad = [...couchGuests.values()].find(g => g.pointer.active && g.gpad.isDown(settings.padBinds.itemLock));
  const boundLockPad = settings.padBinds.itemLock !== PAD_CFG.pointer.confirm;
  ui.itemLockInput(running && (input.keys.has(settings.keybinds.itemLock)
    || (boundLockPad && (padPointer.active && pad.isDown(settings.padBinds.itemLock) || !!lockPad))),
    lockPad?.pointer.position() ?? (padPointer.active ? padPointer.position() : undefined));
  if (pad.justPressed(PAD_CFG.escapeButton)) synthEscape();

  if (running) {
    if (net.isHost) {
      // ---- HOST (and single-player / local co-op): run the one real sim. ----
      const perfSimT0 = performance.now();
      phaseMark('head', perfSimT0 - tickT0); // input/pad/pointer/couch slab
      // 1. Local UI (pause menu, panels) — never gameplay intent. The couch
      //    guests' panel toggles ride their own pads right behind.
      handleLocalPanels();
      handleCouchPanels();
      // 2. Gather this frame's per-seat intent into the transport. The local seat
      //    reads the OS; other LOCAL seats (the scripted ally) poll their source.
      //    A REMOTE seat's intent arrives through the transport's own pump.
      const li = localPilot && world.player ? localPilot.poll(world.player, world, dt) : readLocalInput(dt);
      if (li) net.sendInput(net.self, li);
      for (const seat of world.seats) {
        if (seat.id === net.self) continue;
        const intent = seat.input.poll(seat.actor, world, dt);
        if (intent) net.sendInput(seat.id, intent);
      }
      // 3. Apply all seat intents (single path for every player-kind hero).
      world.applyInputs(net.drainInputs(), dt);
      // 3.5. Apply clients' META intents (point-spends, gem ops, drops) to their
      //      OWN seats BEFORE the sim ticks — so the change lands in this tick's
      //      drops/orbs pass and re-replicates in the same broadcast.
      drainMetaActions();

      // The deathPresentation keeps ambience alive, but the settled run must
      // never gain a late AI kill, cast, or reward behind its epilogue.
      if (!world.gameOver) for (const a of world.actors) updateAI(a, world, dt);
      // Mirror the gear-pickup feel preference onto the sim (Settings is a
      // UI concern the World can't import; a boolean crosses the seam).
      world.gearVacuum = settings.gearPickup !== 'key';
      world.update(dt);
      // DWELL → MENU polls. The world keeps simulating under the pause menu,
      // so a dwell can fire while it's up — HOLD the request (don't clear)
      // until the pause menu closes, else a station menu pops OVER the pause
      // screen and Escape starts fighting through stacked surprises.
      // The Caravanner dwell (in TOWN) asks to open the band-travel menu.
      pollCaravanMenu();
      // The salvage-bench dwell asks to open the break/craft menu.
      if (world.salvageDwellRequested && !ui.escapeMenuOpen) {
        world.salvageDwellRequested = false;
        if (!ui.salvageOpen) ui.showSalvage(world.salvageDwellSeatId);
      }
      // A Sacrificial Font dwell asks to open the Font screen (Merge /
      // Convert / Reset — skill-mode trees M1).
      if (world.fontDwellRequested && !ui.escapeMenuOpen) {
        world.fontDwellRequested = false;
        if (!ui.fontOpen) ui.showFont(world.fontDwellSeatId);
      }
      // A banked Ability point's popup, offered at the disciplined calm the
      // world's own sweep found (never mid-combat).
      if (world.treePopupRequested && !ui.escapeMenuOpen) {
        world.treePopupRequested = false;
        ui.showTreePopup(world.treePopupSeatId, world.treePopupSkillId);
      }
      // The HARBOR BOARD dwell (a port's notice board) asks to open the
      // harbor menu — hearsay, passage down the lanes, charts. (The dock
      // itself still casts off directly; the board is the harbor's EARS.)
      if (world.harborDwellRequested && !ui.escapeMenuOpen) {
        world.harborDwellRequested = false;
        if (!ui.sailOpen) ui.showSail();
      }
      // THE BOUNTY BOARD dwell (Lastlight's posting board) asks to open the
      // postings panel — the beat's slate, the taken hand, the turn-in.
      if (world.bountyDwellRequested && !ui.escapeMenuOpen) {
        world.bountyDwellRequested = false;
        if (!ui.bountiesOpen) ui.showBounties(world.bountyDwellSeatId, world.bountyDwellBoardId);
      }
      // The MUSTER HORN dwell (a harborhold's gate post) asks to open the
      // hold panel — the town's standing, the muster, the restoration.
      if (world.holdDwellRequested && !ui.escapeMenuOpen) {
        world.holdDwellRequested = false;
        if (!ui.holdOpen) ui.showHold();
      }
      // The Oracle-stone dwell asks to open the communion menu.
      if (world.oracleDwellRequested && !ui.escapeMenuOpen) {
        world.oracleDwellRequested = false;
        if (!ui.oracleOpen) ui.showOracle(world.oracleDwellSeatId);
      }
      // The Tracker's-fire dwell asks to open the Bestiary.
      if (world.trackerDwellRequested && !ui.escapeMenuOpen) {
        world.trackerDwellRequested = false;
        if (!ui.bestiaryOpen) ui.showBestiary(world.trackerDwellSeatId);
      }
      // A stocked vendor counter's dwell asks to open the Vendor screen.
      if (world.vendorDwellRequested && !ui.escapeMenuOpen) {
        world.vendorDwellRequested = false;
        ui.openVendorOnDwell(world.vendorDwellSeatId);
      }
      // The quartermaster dwell with FRESH vocation chains on offer asks to open
      // the CHOICE menu (a subclass pick is deliberate — never auto-accepted).
      if (world.vocationOfferRequested && !ui.escapeMenuOpen) {
        world.vocationOfferRequested = false;
        if (!ui.vocationOpen && (DIALOGUE_CFG.presentation !== 'dialogue' || !conversationHasVocations(world))) ui.showVocationMenu();
      }
      if (world.questRewardRequested && !ui.escapeMenuOpen) {
        world.questRewardRequested = false;
        if (DIALOGUE_CFG.presentation !== 'dialogue' || !conversationHasRewards(world)) ui.showQuestReward();
      }
      // The mercenary outpost's calm parley asks to open the hire/retire menu.
      if (world.mercOutpostRequested && !ui.escapeMenuOpen) {
        world.mercOutpostRequested = false;
        if (!ui.mercOpen) ui.showMercMenu();
      }
      // A borough villager's arming dwell asks to open the arming panel.
      if (world.boroughArmRequested && !ui.escapeMenuOpen) {
        world.boroughArmRequested = false;
        if (!ui.boroughOpen) ui.showBorough(world.boroughArmFolkId);
      }
      // The run wrote an ACCOUNT-scoped unlock (a vocation grant) — persist it
      // now, so closing the game without dying can't lose it.
      if (world.accountDirty) {
        world.accountDirty = false;
        saveAccount(account);
      }
      // THE STORY CARD (engine/scenes.ts): the DOM shows whatever card the
      // scene director holds pending, and the continue ACKS back into the
      // engine — the DOM is a window on engine state, never the state.
      if (world.scene?.card && !ui.storyCardOpen()) {
        ui.showStoryCard(world.scene.card, () => sceneCardAck(world));
      } else if (!world.scene?.card && ui.storyCardOpen()) {
        ui.hideStoryCard();
      }
      // THE MU HUB (data/mu.ts): a still linger at an awake vessel posts a
      // class request — take it only when the card can actually open (the
      // pause menu's hold law), and let the pick start the run proper.
      if (!ui.escapeMenuOpen && !ui.muCardOpen) {
        const muReq = muTakeClassRequest(world);
        // THE OFFERED CONTRACT (engine/muDeal.ts): the card opens pre-sworn
        // to whatever contract the waking rolled onto this vessel (muOfferOf
        // — the same seated row whose red ember the body wears), or plain.
        if (muReq) ui.showMuClassCard(muReq, startPicked, muOfferOf(world, muReq));
      }
      // Dwelling by the return-Caravanner IN THE WILDS ports straight home — no menu.
      pollCaravanReturn();
      // (The dock dwell now CASTS OFF into the sailing mode directly — handled
      // inside world.updateSail; the Sail menu panel stays dormant.)
      // (The Holdfast toll pays directly on the keeper dwell — an essence price
      // needs no bargain menu; the prompt over the keeper advertises the ask.)
      feedRendererAim();
      const perfRenT0 = performance.now();
      renderer.render(world);
      perfPush(frameGapMs, perfRenT0 - perfSimT0, performance.now() - perfRenT0);
      const perfTailT0 = performance.now(); // PHASE LEDGER: the tail starts here

      // Broadcast to connected clients. Gated on a REAL wire (never LocalTransport),
      // so single-player AND local co-op (a stand-in ally is a LocalTransport peer)
      // never serialize anything — byte-identical SP / no wasted work.
      if (!(net instanceof LocalTransport) && net.peers().length > 1) {
        // Terrain: ship the (heavier) zone message ONCE per zone change.
        if (world.zone.id !== lastSentZone) {
          lastSentZone = world.zone.id;
          net.sendZone(serializeZone(world));
        }
        // META HEARTBEAT: seatMeta is delta-replicated (shipped once per change,
        // then cleared). If that one snapshot is ever dropped — a congested
        // channel skipped by fanOut, or coalesced past on the client — the delta
        // is lost with no retry. Periodically re-dirty every seat so any missed
        // build change self-heals within META_HEARTBEAT seconds.
        metaHeartbeat -= dt;
        if (metaHeartbeat <= 0) {
          metaHeartbeat = META_HEARTBEAT;
          for (const s of world.seats) world.markMetaDirty(s);
        }
        // State: the per-tick render snapshot at the fixed wire rate.
        stateTimer -= dt;
        if (stateTimer <= 0) {
          stateTimer = 1 / STATE_HZ;
          broadcastSnapshot();
        }
      }

      hostTail(dt);
      phasePendTail = performance.now() - perfTailT0; // flushes at the NEXT tick's fold
    } else {
      // ---- CLIENT: run NO sim. Send local input, render the host's snapshot. ----
      handleLocalPanels();
      const li = readLocalInput(dt);
      if (li) {
        // Stamp + buffer the input for prediction, THEN send it. The host echoes
        // the last-applied seq; predictOwnHero replays everything newer locally.
        li.seq = ++inputSeq;
        predictHistory.push({ seq: li.seq, dx: li.dx, dy: li.dy, dt });
        if (predictHistory.length > PREDICT_BUFFER) predictHistory.shift();
        net.sendInput(net.self, li);
      }
      clientApplyAndRender(dt);
    }
  }

  input.endFrame();
  pad.endFrame();
}

/** The 20s autosave beat, deferred into genuine idle slack when the runtime
 *  offers it (requestIdleCallback — always, on the Chromium we ship). hostTail
 *  runs AFTER perfPush, so work here lands in the NEXT frame's rAF gap,
 *  invisible to the sim/render brackets — the beat's serialize+write block
 *  (~7ms at a 415-zone chart, growing with the world) was a standing
 *  once-per-20s hitch by position. The deferral changes WHEN the snapshot is
 *  captured (a few idle ms later, timeout-capped), never what is written: the
 *  callback serializes synchronously through the same persistRun writer, and
 *  re-checks the beat's own preconditions plus run identity so a menu exit,
 *  death, or fresh run between schedule and fire is never clobbered by a
 *  stale capture (their own deliberate writes have landed by then — and a
 *  post-wipe resurrection is exactly what the gameOver guard refuses).
 *  Runtimes without rIC keep the synchronous beat byte-for-byte; probes and
 *  the sim harness drive persistRun directly and never see this seam. */
let idleSavePending = false;
function idleAutosave(): void {
  if (typeof window.requestIdleCallback !== 'function') {
    persistRun(account, world);
    persistCouchGuests();
    return;
  }
  if (idleSavePending) return;
  idleSavePending = true;
  const w = world;
  window.requestIdleCallback(() => {
    idleSavePending = false;
    if (!running || world !== w || world.gameOver || world.scene) return;
    persistRun(account, world);
    persistCouchGuests();
  }, { timeout: 500 });
}

/** Host-only end-of-frame work: live panels, autosave, and the permadeath/death
 *  screen flow. NONE of this runs on a client (no character to save/wipe). */
function hostTail(dt: number): void {
  // The pendingDeathScreen owns presentation after the epilogue is booked.
  // The body timeline reveals it over the dispersing shards; other endings
  // retain their dark crossing. Starters also clear this pending callback.
  if (pendingDeathScreen && world.gameOver) {
    if (world.deathPresentation) {
      const pose = deathPresentationPose(world.deathPresentation.elapsed);
      world.screenFade = pose.fade;
      if (pose.reveal && !pendingDeathScreen.opened) {
        pendingDeathScreen.opened = true;
        pendingDeathScreen.open(DEATH_PRESENTATION.revealSec);
      }
      if (pose.complete) { pendingDeathScreen = null; running = false; }
      return;
    }
    world.screenFade = Math.min(1, world.screenFade + dt / RUN_END_FADE.outSec);
    if (world.screenFade >= 1) {
      const open = pendingDeathScreen.open;
      pendingDeathScreen = null;
      open();
      running = false;
    }
    return;
  }
  // Keep open panels live (resource/stat values move constantly).
  uiRefreshTimer -= dt;
  if (uiRefreshTimer <= 0) {
    uiRefreshTimer = 0.5;
    ui.refreshCharSheet();
    ui.refreshInventory(true);
    ui.refreshMap();
  }

  // Autosave the in-progress character periodically (cheap; survives a crash
  // or an abrupt close). Skipped once dead (the run save is wiped on death).
  // persistRun routes the write to the character's slot (run vs roster vessel)
  // and keeps the roster index card fresh alongside it.
  // …and never while a SCENE plays (engine/scenes.ts): the tutorial is not
  // a run — its ground never serializes and its abort must leave no save.
  // The run's first write lands at the scene's 'home' stage via charDirty.
  if (!world.gameOver && !world.scene) {
    autosaveTimer -= dt;
    if (autosaveTimer <= 0) { autosaveTimer = 20; idleAutosave(); }
  }

  // The sim mutated character save-state OUTSIDE the autosave cadence — a mode
  // respawn banked a death (corpse/stage/strip), an own-ring corpse was
  // reclaimed. Persist immediately: the same promptness accountDirty gets.
  if (world.charDirty) {
    world.charDirty = false;
    persistRun(account, world);
  }
  // A couch guest's vessel banked something (the guest covenant on a wipe,
  // a meta mutation) — persist it with charDirty's promptness.
  if (world.couchDirty) {
    world.couchDirty = false;
    persistCouchGuests();
  }

  // A roster-saved character chose Save & Main Menu (their "End Run" — the
  // vessel persists; only a deliberate roster deletion ever discards it).
  if (world.menuExitRequested) {
    world.menuExitRequested = false;
    // A mid-scene exit is an ABANDON, not a save-and-quit: nothing persists,
    // and the next New Game re-launches the scene from its first card.
    if (!world.scene) { persistRun(account, world); persistCouchGuests(); }
    toStartMenu();
  }

  if (world.gameOver && !deathShown) {
    deathShown = true;
    // CO-OP: tell connected clients the run ended so they leave their (now-frozen)
    // render shell and offer a fresh class pick — no reload, the session lives on.
    if (coopActive()) net.sendSession({ t: 'runEnd' });
    // COUCH: guest vessels ride home before the world is torn down (mortal-
    // lane guests carry nothing); the session machinery drops with the run.
    persistCouchGuests();
    couchReset();
    ui.hideAll();
    // THE RECKONING MINT: the run's carried essence — the local hero plus
    // every couch vessel (one account, one harvest; mercs and remote guests
    // never fold) — appraised WHOLE at the strict mortal exchange
    // (data/essences.ts mortalWorth) × the dying stage's payout rate.
    // Nothing is scored for distance any more: what the run still HOLDS is
    // what the reckoning mints, and what it spent along the way was the
    // price of getting there. Read before the wipe below; the wallets die
    // with the run either way.
    const stage = world.modeStageDef();
    // THE FALL (runEndReason 'fall' — the resurrection covenant): the wallet
    // was already stripped by the in-world banking, so the epilogue reads
    // the appraisal beginModeFall stashed PRE-strip (rows honest, minted at
    // the stage's own rate) instead of re-reckoning empty seats.
    const fell = world.runEndReason === 'fall' && !!world.fallReckoning;
    const reck = fell ? world.fallReckoning! : world.reckonRunEssence();
    applyCredits(account, reck.minted);
    // THE CHRONICLE: every meta-progressing conclusion is a row on the
    // account's own leaderboard — the mint on one axis, the journey score
    // (renownForRun — the old distance formula, kept as pure renown) on the
    // other. A sealed stage's conclusion stays off the board exactly as it
    // stays out of the ledger.
    const renown = renownForRun(world.player.level, world.visited.size, world.kills);
    let record: RunRecord | null = null;
    if (stage.metaProgression) {
      record = {
        schema: RUN_RECORD_SCHEMA, at: Date.now(),
        name: world.meta.name, classId: world.meta.classDef.id, level: world.player.level,
        zones: world.visited.size, kills: world.kills,
        reason: world.runEndReason, essence: reck.minted, renown,
      };
      recordRun(account, record);
    }
    // PERMANENT progression: fold this run's trigger counters (crowned_killed,
    // …) into the account ledger so package unlocks stick like credits do —
    // unless the dying stage is sealed outside the account loop (mode policy).
    if (stage.metaProgression) mergeLedger(account.ledger, world.ledger);
    // THE OBJECTIVE WEB's belt: the live sweep claims mid-run, but a deed
    // whose last count merged only now (a play milestone stamped this run)
    // lands here — before the reckoning's Vault renders it Owned.
    if (stage.metaProgression) settleClassUnlocks(account);
    // CORPSE RUN + the lifetime death tally: only an actual death (not a
    // forfeit) records a corpse or counts toward death-gated unlocks — both
    // captured BEFORE clearCharacter wipes the gems. A FALL already banked
    // its corpse in-world (beginModeFall — pre-strip, own ring); only the
    // tally arm applies here, stage-honest (moot for the sealed Undying).
    if (world.runEndReason === 'death') {
      world.recordDeath();
      if (stage.countsAccountDeath) bumpLedger(account.ledger, LEDGER_ACCOUNT_DEATHS);
    } else if (world.runEndReason === 'fall' && stage.countsAccountDeath) {
      bumpLedger(account.ledger, LEDGER_ACCOUNT_DEATHS);
    }
    // ANY conclusion — death, forfeit, retirement — ends the merc contract:
    // the veteran returns to the pool, waiting on some future outpost.
    releaseMercsOf(account, world.meta.charId);
    // Durable write (sendBeacon) so the death record survives a tab-close on
    // the death screen, matching clearCharacter's durable wipe.
    saveAccountDurable(account);
    // THE VESSEL KEEPS (roster-saved modes): a fall ends the run but never
    // the character — persist the sanctuary-standing vessel to its OWN slot
    // (the fallen card beside it) and leave the shared Continue slot alone:
    // it belongs to whatever mortal run is suspended there. Mortal
    // conclusions keep the historical wipe.
    if (modeById(world.meta.modeId).save === 'roster') {
      persistRun(account, world);
    } else {
      clearCharacter();
      ui.setContinueSave(null); // the run is wiped — no Continue after death
    }
    ui.resetClassRoster();      // the next run deals a fresh class hand
    // THE RUN'S EPILOGUE: the death screen reads the appraisal, then leads
    // STRAIGHT into the reckoning (the Vault as the run's closing prompt) —
    // the seal there is what finally lands on the main menu. Co-op host
    // KEEPS the live session (onDeathDismiss re-seats clients in the next
    // run); single-player resets the transport back to local.
    const openDeath = (revealSec = 0): void => ui.showDeath({
      rows: reck.rows, carried: reck.carried, mult: reck.mult, minted: reck.minted,
      renown, standing: record ? runStanding(account, record) : null,
      ...(fell ? { zoneName: world.fallReckoning!.zoneName } : {}),
    }, onDeathDismiss, revealSec);
    if (coopActive() || world.runEndReason === 'forfeit') {
      // Immediate lanes: a menu act owes no theater, and a shared session's
      // clients are already being re-seated.
      openDeath();
      // PAUSE the host loop — the run is over, so it must stop ticking +
      // broadcasting the dead world. startGame / startAsClient re-enable it.
      running = false;
    } else {
      // The pendingDeathScreen is presentation only: everything above is
      // already durable before the body performance or legacy dark crossing.
      if (world.runEndReason === 'death' && !world.deathPresentation) {
        openDeath(); // deathPresentation's disabled switch
        running = false;
      } else {
        world.screenFade = world.deathPresentation ? 0 : Math.max(world.screenFade, 0.001);
        pendingDeathScreen = { open: openDeath };
      }
    }
  }
}

/** Host: serialize the world and broadcast it to every connected client. */
function broadcastSnapshot(): void {
  net.sendState(serializeSnapshot(world, ++snapTick));
  // Per-seat META rides the snapshot only when its dirty flag is set; once a
  // snapshot carries it, the change is on the wire — clear so we don't re-ship it.
  world.metaDirty.clear();
}

/** Client: apply the latest host snapshot — INTERPOLATED prev→latest over one
 *  snapshot interval — to the render-shell world and draw it (no sim runs here;
 *  the host owns the simulation). Actor POSITIONS + facing are smoothed via the
 *  prev→latest lerp; renderer effects keyed on performance.now() (aura/dome/font
 *  pulses, spins) advance locally; everything else sampled from the snapshot
 *  (cast-bar fill, item/orb bobs) steps at the 20Hz wire rate — acceptable for MVP. */
function clientApplyAndRender(dt: number): void {
  snapAccum += dt;
  const alpha = Math.min(1, snapAccum / SNAP_INTERVAL);
  if (latestSnapshot) applySnapshot(world, latestSnapshot, prevSnapshot, alpha);
  // PREDICTION: override the own hero's interpolated position with the locally
  // predicted one (anchor to the host's ack + replay unacked input) for responsive
  // movement. Other actors keep snapshot interpolation.
  predictOwnHero();
  // The latest snapshot's seatMeta delta (if any) is now applied — let the next
  // arriving snapshot stop carrying it forward (coalescing guard in onState).
  metaApplied = true;
  // Our replicated build changed (point spend, learn, drop, level-up) → re-render
  // any OPEN build panels now (they're not live like the HUD). refresh* methods
  // no-op when their panel is closed, so this is cheap.
  if (clientMetaDirty) {
    clientMetaDirty = false;
    ui.refreshCharSheet(); ui.refreshInventory(true); ui.refreshSkillTree(); ui.refreshTree();
  }
  // Resource/stat values on the char sheet + map drift every frame even with no
  // meta change — keep them live on the same 0.5s throttle the host uses.
  uiRefreshTimer -= dt;
  if (uiRefreshTimer <= 0) { uiRefreshTimer = 0.5; ui.refreshCharSheet(); ui.refreshInventory(true); ui.refreshMap(); }
  // THE CLIENT'S CARAVANNER: a render shell runs no sim, so the engine's dwell
  // gates never tick here — drive the ONE whose answer is a pure INTENT the host
  // performs (the escort is a client's only road between level bands, and the
  // return-Caravanner its only way home). Positions are this frame's, applied
  // just above, and the dwell clock is honest by construction: prediction
  // replays our own moves through moveActor, which stamps the seat exactly as
  // the host's own hands do — walking past still never pops the menu.
  world.updateCaravan(dt);
  pollCaravanMenu();
  pollCaravanReturn();
  feedRendererAim();
  renderer.render(world);
}

/** CLIENT: position the OWN hero by PREDICTION instead of snapshot interpolation —
 *  anchor to the host's last-acked authoritative position, then REPLAY every input
 *  the host hasn't applied yet (moveActor, the SAME integrator + collision the host
 *  runs). The local player then moves with ~zero input latency; the reconciliation
 *  happens every frame, so a misprediction self-corrects on the next snapshot. The
 *  `rooted` flag (host says we're stun/cast/dash-locked) stops forward replay so the
 *  hero doesn't drift ahead while actually held in place. Other actors + ally seats
 *  keep snapshot interpolation. No-op for the host / single-player (never called). */
function predictOwnHero(): void {
  if (!latestSnapshot) return;
  const me = latestSnapshot.seats[world.clientSeatId];
  if (!me) return;
  const p = world.player;
  if (p.dead || p.downed) return;     // downed → the interpolated snapshot pos stands
  // A zone change teleports us; the buffered inputs are from the old zone → drop them.
  if (latestSnapshot.zoneId !== predZoneId) { predZoneId = latestSnapshot.zoneId; predictHistory.length = 0; }
  // Forget inputs the host has already applied.
  const ack = me.seq ?? 0;
  while (predictHistory.length && predictHistory[0].seq <= ack) predictHistory.shift();
  // Anchor to the authoritative position, then replay our unacked inputs forward.
  // Skip the replay while ROOTED (stun/cast/dash) or on SLIPPERY ground (ice momentum
  // the client can't reproduce) — anchor-only there avoids a prediction rubber-band.
  p.pos.x = me.pos[0]; p.pos.y = me.pos[1];
  if (!me.rooted && !me.slippery) {
    for (const h of predictHistory) world.moveActor(p, h.dx, h.dy, h.dt);
  }
}

/** Client: start applying the host's broadcasts (set up at join, torn down on Leave). */
function subscribeToHost(): void {
  snapshotDispose = net.onState(s => {
    // COALESCING GUARD: seatMeta is a delta shipped once. If an earlier snapshot's
    // delta hasn't been applied by a frame yet and a newer snapshot arrives first
    // (rAF slower than the 20Hz wire, GC hitch, backgrounded tab), carry the
    // un-applied delta forward onto this one so it isn't silently dropped.
    if (latestSnapshot?.seatMeta && !metaApplied) {
      s.seatMeta = { ...latestSnapshot.seatMeta, ...(s.seatMeta ?? {}) };
    }
    if (s.seatMeta) metaApplied = false;
    // Re-render the open build panels ONLY when our meta actually CHANGED — not on
    // the periodic heartbeat re-send of identical meta (which would churn the panel
    // and reset any scroll). Compare the serialized own-seat meta to the last one.
    const myMeta = s.seatMeta?.[world.clientSeatId];
    if (myMeta) {
      const json = JSON.stringify(myMeta);
      if (json !== lastMetaJson) { lastMetaJson = json; clientMetaDirty = true; }
    }
    prevSnapshot = latestSnapshot ?? s; latestSnapshot = s; snapAccum = 0;
  });
  zoneDispose = net.onZone(z => { applyZone(world, z); });
}
/** Client: stop applying broadcasts. */
function unsubscribeFromHost(): void {
  if (snapshotDispose) { snapshotDispose(); snapshotDispose = null; }
  if (zoneDispose) { zoneDispose(); zoneDispose = null; }
  latestSnapshot = null; prevSnapshot = null; snapAccum = 0; metaApplied = true; lastMetaJson = '';
}

/** HOST: a peer joined — spawn a wire-fed seat for them (their class, a
 *  RemoteInput drained from the transport). Idempotent on the seat id. */
function onRemoteJoin(peer: PeerInfo): void {
  if (world.seats.some(s => s.id === peer.id)) return;
  // A peer arriving ends any solo menu-pause mid-hold: the shared world is
  // never one player's to stop (the allowHold policy refuses NEW holds in
  // co-op; this sweeps one already standing when the session became live).
  world.timeflow.releaseKind('menu');
  const cls = CLASSES.find(c => c.id === peer.classId) ?? CLASSES[0];
  const cosmeticSeat = world.addSeat(peer.id, cls, new RemoteInput(peer.id));
  cosmeticSeat.actor.cosmeticLoadout = sanitizeCosmeticLoadout(peer.cosmeticLoadout);
  // The joiner needs the current terrain immediately (not just on the next zone
  // change); re-broadcast it (harmless re-apply for existing peers).
  net.sendZone(serializeZone(world));
}

/** HOST: a peer left — despawn their seat (and its minions). */
function onRemoteLeave(id: string): void {
  world.removeSeat(id);
}

/** Wire the run-lifecycle channel onto the current (WebRTC) transport — done once
 *  when a co-op session is established (host or client); torn down on leave. */
function wireSession(): void {
  sessionDispose?.();
  sessionDispose = net.onSession(onSessionMsg);
  // The OTHER road to the same ending: a host that vanishes without a goodbye.
  // Wired for host and client alike (a host's transport never fires it) so the
  // two subscriptions live and die together.
  hostLostDispose?.();
  hostLostDispose = net.onHostLost(() => onHostGone('Connection to the host was lost.'));
}

/** Dispatch a run-lifecycle message. HOST handles `rejoin`; CLIENT handles
 *  `runEnd` + `newRun`. */
function onSessionMsg(msg: SessionMsg, from: string): void {
  if (net.isHost) {
    if (msg.t === 'rejoin') {
      // A client chose its class for the next run. Seat them now if we're already
      // mid-run, else queue until our new run begins (flushRejoins).
      if (running && !world.gameOver) reseatPeer(from, msg.classId);
      else pendingRejoins.set(from, msg.classId);
    } else if (msg.t === 'cosmetics') {
      const cosmeticLoadout = sanitizeCosmeticLoadout(msg.loadout);
      const peer = net.peers().find(p => p.id === from);
      if (peer) peer.cosmeticLoadout = cosmeticLoadout;
      const seat = world.seats.find(s => s.id === from);
      if (seat) (seat.home ?? seat.actor).cosmeticLoadout = cosmeticLoadout;
    } else if (msg.t === 'action') {
      // A client's meta intent for its OWN seat — queue for this frame's drain
      // (applyAction runs host-side with the channel-bound `from` seat, so a
      // client can only ever mutate its own build).
      pendingActions.push({ seat: from, action: msg.action });
    }
  } else if (msg.t === 'runEnd') {
    onClientRunEnd();
  } else if (msg.t === 'newRun') {
    onClientNewRun(msg.seat, msg.seed);
  } else if (msg.t === 'hostLeft') {
    onHostGone('The host left the session.');
  }
}

/** HOST: apply this frame's queued client meta intents to their OWN seats. A seat
 *  that has since left is simply skipped. applyAction validates + re-replicates. */
function drainMetaActions(): void {
  if (!pendingActions.length) return;
  for (const { seat: seatId, action } of pendingActions) {
    const seat = world.seats.find(s => s.id === seatId);
    if (!seat) continue;
    // A client controls the action payload entirely — a malformed/hostile one
    // (bad index, prototype-chain key) must NEVER throw out of the frame loop
    // (that would permanently halt the host sim + freeze every client). One bad
    // action just no-ops. world.applyAction also validates before dispatch.
    try { world.applyAction(seat, action); }
    catch (e) { console.warn('[coop] dropped malformed meta action', action, e); }
  }
  pendingActions.length = 0;
}

/** HOST: (re)seat an already-connected peer into the CURRENT run and tell them to
 *  spin up their render shell for it (`newRun`) + ship the terrain. */
function reseatPeer(peerId: string, classId: string): void {
  const cls = CLASSES.find(c => c.id === classId) ?? CLASSES[0];
  if (!world.seats.some(s => s.id === peerId)) {
    const cosmeticSeat = world.addSeat(peerId, cls, new RemoteInput(peerId));
    cosmeticSeat.actor.cosmeticLoadout = sanitizeCosmeticLoadout(net.peers().find(p => p.id === peerId)?.cosmeticLoadout);
  }
  // THE SEED THREAD: newRun carries the seed of the run we are seating them
  // INTO — deliberately not the one their welcome carried. This is our NEXT run
  // with a freshly rolled manifest, so a client re-using the join-time seed
  // would build the PREVIOUS run's map; the seed rides every seating message.
  net.sendSession({ t: 'newRun', seat: peerId, seed: world.manifest.seed }, peerId);
  net.sendZone(serializeZone(world));
}

/** HOST: after a fresh co-op run begins, seat every peer that already picked a
 *  class at the run-end screen (queued while the host was choosing its own). */
function flushRejoins(): void {
  for (const [peerId, classId] of pendingRejoins) reseatPeer(peerId, classId);
  pendingRejoins.clear();
}

/** CLIENT: the host's run ended — leave the (now-stale) render shell and offer a
 *  fresh class pick; choosing one asks the host to re-seat us in its next run. */
function onClientRunEnd(): void {
  running = false;          // stop rendering the dead run
  unsubscribeFromHost();    // drop the dead run's snapshot/zone subs + stale interp state
  pendingRejoinClass = null;
  ui.resetClassRoster();    // deal a fresh class hand for the rejoin pick
  ui.showClassSelect(cls => {
    pendingRejoinClass = cls;
    net.sendSession({ t: 'rejoin', classId: cls.id });
    ui.hideAll();           // the class pick is sent; wait for the host's newRun
  });
}

/** CLIENT: the host re-seated us in its new run — rebuild our render shell and
 *  re-subscribe to the host's broadcasts with a clean snapshot state. */
function onClientNewRun(seat: string, seed: number): void {
  startAsClient(pendingRejoinClass ?? CLASSES[0], seat, seed);
  subscribeToHost();        // fresh onState/onZone for the new run (torn down at runEnd)
}

/** Where the death screen's "Rise Again" leads: a live co-op host KEEPS the
 *  session + deals a fresh class hand for the next run (re-seating clients via
 *  flushRejoins); single-player returns to the start menu. */
function onDeathDismiss(): void {
  if (coopActive()) {
    ui.showClassSelect(cls => { void withLoadingScreen(() => startGame(cls)).then(started => { if (started) flushRejoins(); }); });
  } else {
    // THE LOOP CLOSES IN MU (data/mu.ts): a solo run's end drifts the player
    // back into the hub between lives — the next vessel is a walk, not a
    // menu. The main menu stays one Esc away from inside Mu.
    startMu();
  }
}

/** Open the co-op lobby (copy-paste WebRTC signaling). HOST keeps running the sim
 *  and accepts joiners; a JOINER becomes a render-only client of the host. */
function openLobby(): void {
  // Class choice is restricted to what THIS player has unlocked in their own
  // Vault (the host gates by the host's account, each joiner by their own) — a
  // real gameplay choice, not a free pick of every class.
  const unlocked = CLASSES.filter(c => isClassUnlocked(account, c.id));
  openCoopLobby({
    classes: (unlocked.length ? unlocked : CLASSES).map(c => ({ id: c.id, name: c.name, color: c.color, description: c.description })),
    host: async (classId) => {
      const rtc = new WebRtcTransport();
      try {
        rtc.onPeerJoin(onRemoteJoin);
        rtc.onPeerLeave(onRemoteLeave);
        // THE SEED THREAD: a joiner is welcomed into our CURRENT run, so hand the
        // transport a live READ of the manifest seed rather than a snapshot of
        // it — "Rise Again" mints a fresh manifest, and a joiner arriving after
        // that must be seated in the run actually being played.
        rtc.setSeedSource(() => world.manifest.seed);
        await rtc.host({ name: 'Host', classId });
        const invite = await rtc.createInvite();   // fallible WebRTC work FIRST
        net = rtc;                                 // commit globals only on success
        wireSession();                             // run-lifecycle channel (runEnd/rejoin/newRun)
        if (!await withLoadingScreen(() => startGame(CLASSES.find(c => c.id === classId) ?? CLASSES[0])))
          throw Error('World entry cancelled'); // loading cancellation cannot return a stale invite
        // newInvite mints a FRESH offer for the NEXT joiner (star topology — each
        // peer gets its own RTCPeerConnection), so >2-player co-op actually works.
        return { invite, accept: (resp: string) => rtc.acceptAnswer(resp), newInvite: () => rtc.createInvite() };
      } catch (e) { rtc.leave(); throw e; }        // net + world stay untouched on failure
    },
    join: async (offer, classId) => {
      const rtc = new WebRtcTransport();
      const cls = CLASSES.find(c => c.id === classId) ?? CLASSES[0];
      try {
        net = rtc;
        subscribeToHost();
        wireSession();                             // run-lifecycle channel (runEnd/newRun)
        const { answer, joined } = await rtc.createAnswer(offer, { name: 'Joiner', classId, cosmeticLoadout: account.cosmetics.loadout });
        const connected = joined.then(({ self, seed }) => startAsClient(cls, self, seed));
        return { answer, connected };
      } catch (e) { resetToLocal(); throw e; }     // a bad paste must revert net to LocalTransport
    },
    onClose: () => { /* host keeps playing; a non-started joiner just closes */ },
  });
}

/** Become a render-only CLIENT of a host: a shell World backs the camera/HUD/
 *  getters, but it never simulates — the frame loop's client branch applies the
 *  host's snapshots and renders. clientSeatId anchors the camera on OUR hero. */
function startAsClient(classDef: ClassDef, selfSeat: string, hostSeed: number): void {
  couchReset(); // a render shell hosts no couch — the pads are free again
  // THE SEED THREAD: build the shell from the HOST's run seed, never a local
  // roll — manifest.seed drives randomizeStarterWeb and every `manifest.seed ^ …`
  // mint derivation, so our own seed would put us on a different map from frame
  // one (the shell's zone graph, gate seeds and vendor shelves would all
  // disagree with the authority we render). wireSeed normalizes the untrusted
  // wire value; ONE seam covers both seating roads (welcome and newRun).
  world = adoptWorld(new World(account, Object.freeze(buildManifest(account, wireSeed(hostSeed, rollSeed())))));
  world.createPlayer(classDef, { startingCompanions: false, startingFlasks: false });   // a local shell (getters/camera/HUD) — not the authority
  world.clientSeatId = selfSeat;
  // META mutations on a client are INTENTS: ship them to the host (which owns every
  // mutation) instead of applying to the throwaway render shell. requestMeta routes
  // through this; the host applies it to our seat and replicates the result back.
  world.clientActionHook = (action) => net.sendSession({ t: 'action', action });
  // Reset movement-prediction state so our input seq realigns with the host's fresh
  // per-seat ack (a new run = a fresh World on the host = an empty lastInputSeq).
  inputSeq = 0; predictHistory.length = 0; predZoneId = '';
  ui.resetRunView();        // the client's shell world is new too — reset the view state
  deathShown = false;
  running = true;
  ui.hideAll();
}

/** Drop any co-op transport back to a fresh LocalTransport, so the NEXT run is
 *  plain single-player (never serializes). Idempotent. */
function resetToLocal(): void {
  unsubscribeFromHost();
  sessionDispose?.(); sessionDispose = null;
  // Dropped BEFORE net.leave() below: closing our own channels fires the client
  // handlers, and a teardown we chose is not a host that vanished.
  hostLostDispose?.(); hostLostDispose = null;
  pendingRejoins.clear(); pendingRejoinClass = null;
  pendingActions.length = 0;
  net.leave();
  net = new LocalTransport();
  lastSentZone = '';
}

/** Return to the start menu, always resetting the transport to local first — so
 *  a co-op host's death or a client's Leave can't strand a stale WebRtcTransport.
 *  `notice` is the reason we landed here, shown on the menu (a session that ended
 *  under the player must say so — an unexplained menu reads as a crash). */
function toStartMenu(notice?: string): void {
  loadingScreen.close();
  // A HOST SAYS GOODBYE FIRST — and says it HERE rather than in leaveCoop, so
  // that every road to the menu carries it (the Leave button, "Save & Main
  // Menu", any future exit), never just the one that remembered. The ordering is
  // load-bearing: resetToLocal closes the datachannels synchronously, so a
  // hostLeft sent after it is dropped on the floor. If the flush is lost anyway,
  // those closing channels still land every client in the same place through
  // onHostLost — the two roads deliberately back each other up.
  if (net.isHost && coopActive()) net.sendSession({ t: 'hostLeft' });
  resetToLocal();
  couchReset(); // guest seats die with the world; the pads are free again
  running = false;
  pendingDeathScreen = null; // the menu is the screen now — no fade owes a debt
  ui.showStartMenu(startPicked, resumeGame, openLobby, resumeRosterChar, notice);
}

/** Leave a co-op session and return to the menu (client or host). The host's
 *  goodbye rides toStartMenu, which every exit road already shares. */
function leaveCoop(): void { toStartMenu(); }

/** CLIENT: the session is OVER — the host said goodbye (`hostLeft`) or its
 *  connection died silently (onHostLost). There is no host migration, so the one
 *  answer to either is to drop back to a plain local transport and land at the
 *  start menu wearing the reason. Deliberately NOT onClientRunEnd's shape: that
 *  offers a class pick because the host is starting another run, and there is no
 *  longer a host to ask. Idempotent — a goodbye followed by the channel closing
 *  arrives twice, and resetToLocal has already made us our own host by then. */
function onHostGone(reason: string): void {
  if (net.isHost) return;   // a host has no host to lose — and after the first
                            // call resetToLocal has made us one, so this is also
                            // the idempotence guard for the second arrival.
  toStartMenu(reason);      // stops the loop, drops the shell, states the reason
}

// THE QUIT FLUSH: Alt-F4, the window ✕, a tab close — one last DURABLE save
// (sendBeacon, the same machinery the permadeath wipe trusts to survive a
// closing tab) so the worldstate captures the CLOSING MOMENT, not the last
// 20s autosave tick. This is what makes the 'exact' resume honest: quitting
// out of a bad fight relaunches into that same bad fight, position, wounds
// and all. Host-only (a co-op client owns no save); a dead run never flushes
// (its slot was durably wiped by the death flow — a late write would
// resurrect the corpse). pagehide AND beforeunload both fire on some paths,
// so a short debounce keeps it to one beacon.
let lastQuitFlush = -Infinity;
function quitFlush(): void {
  // A quit mid-SCENE writes nothing: the tutorial is not a run (the account's
  // begun-key already re-arms it; a stale pre-scene save must not be minted).
  if (!running || world.gameOver || !net.isHost || world.scene) return;
  const now = performance.now();
  if (now - lastQuitFlush < 1000) return;
  lastQuitFlush = now;
  persistRunDurable(account, world);
  persistCouchGuests(true); // guest vessels ride the same closing beacon
}
window.addEventListener('pagehide', quitFlush);
window.addEventListener('beforeunload', quitFlush);
requestAnimationFrame(frame);

// Explicit loading art/feel preview. It creates no run or save, and never delays a real load.
const loadingPreview = new URLSearchParams(location.search).get('loadingPreview');
if (loadingPreview === 'down' || loadingPreview === 'left' || loadingPreview === 'right') {
  void diskHydrated.then(() => {
    if (running || loadingScreen.active) return;
    const loading = loadingScreen.begin({ kind: 'entry', direction: loadingPreview,
      label: 'Loading screen preview', loadout: account.cosmetics.loadout, cancel: () => loading.finish() });
  });
}
