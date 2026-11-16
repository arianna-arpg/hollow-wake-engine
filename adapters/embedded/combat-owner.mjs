import {Random} from '@hollow-wake/engine';
import {installSharedCombat} from './combat-shared-services.mjs';
import {installCombatCasting} from './combat-casting-services.mjs';
import {installCombatRecovery} from './combat-recovery-services.mjs';
import {installCombatExecution} from './combat-execution-services.mjs';
import {CombatServiceBindings} from './combat-service-bindings.mjs';
import {installCombatHostServices} from './combat-host-services.mjs';
import {installCombatBodies} from './combat-body-services.mjs';
import {installCombatAuras} from './combat-aura-services.mjs';
import {installCombatConstructs} from './combat-construct-services.mjs';
import {installCombatTethers} from './combat-tether-services.mjs';
import {installCombatFields} from './combat-field-services.mjs';
import {installCombatBirths} from './combat-birth-services.mjs';
import {installCombatControls} from './combat-control-services.mjs';
import {installCombatOrders} from './combat-order-services.mjs';
import {installCombatCaster} from './combat-caster-services.mjs';
import {installCombatProjectiles} from './combat-projectile-services.mjs';
import {installCombatCarried} from './combat-carried-services.mjs';
import {installCombatMovement} from './combat-movement-services.mjs';
import {installCombatDeath} from './combat-death-services.mjs';
import {installCombatLifetimes} from './combat-lifetime-services.mjs';
import {installCombatPopulation} from './combat-population-services.mjs';

/** INTERNAL assembly. It is deliberately not exported by the package until
 * public admission, lifetime clocks and complete capability courses pass.
 * The supplied admission function is an SDK service, never a game callback. */
export function createCombatOwner(content, host, {seed = 1, admit, encounterLevel = 1, capacity} = {}) {
  if (typeof admit !== 'function') throw Error('Combat owner requires SDK command admission');
  const rng = new Random(seed);
  const w = {host, observers: host.observers ?? {}, time: 0, nextActorId: 1, nextItemId: 1,
    encounter: {level: encounterLevel}, random: () => rng.next(), bombardMintRev: 0, charDirty: false, shake: 0,
    actors: [], seats: [], flashes: [], signals: [], corpses: [], remnants: [], zones: [], projectiles: [], tethers: [],
    pendingSteps: [], pendingRepeats: [], pendingFollowUps: [], pendingMetas: [], pendingBlinks: [], pendingContagions: [],
    pendingFuses: [], pendingPersists: [], pendingSalvos: [], pendingAmbushes: [], pendingDetonations: [], pendingBursts: [],
    pendingSummons: [], pendingRespawns: [], deathBursts: [], emergences: [], drops: [], orbs: [],
    strikeReleaseBodies: new Map(), dotAccum: new Map(), failNoteAt: new Map(), recallTreeSpears: new Map(),
    lures: new Map(), throngLastKill: new Map(), hivecallHooks: new Set(),
    grantedPocketZone: '', grantedPocketCache: new Map(), grantedTrailMemory: new Map(), currentZoneSeed: seed,
    throngEvolutionActive: new WeakSet(), throngScan: 0, throngRebake: 0, throngClaimed: new Set(), wornThrongInsts: new Map(),
    cScratch: {hit: 'none'},
    separateScratch: [], slamScratch: [], squishScratch: [],
  };
  Object.defineProperty(w, 'player', {get: () => w.localSeat?.actor});
  Object.defineProperty(w, 'arena', {get: () => host.space.arena()});
  w.walk = {isWalkable: (x, y) => host.space.isWalkable(x, y, 0), regionAt: (...args) => host.space.regionAt?.(...args)};
  w.zone = {id: 'combat-arena', tiers: host.space.tiers?.()};
  w.dwellReachable = (...args) => host.space.dwellReachable(...args);
  w.creep = {coverOf: (...args) => host.space.creepCover?.(...args) ?? 0};
  Object.defineProperty(w, 'doodads', {get: () => host.space.doodads?.() ?? []});
  w.pointInSolid = (...args) => host.space.pointInSolid(...args);
  // A host may decline a distant placement. The original throng policy then
  // executes its near-placement fallback; no combat effect is discarded.
  w.farthestStand = (...args) => host.space.farthestStand?.(...args) ?? null;
  w.summonQueues = {get summons() {return w.pendingSummons;}, set summons(rows) {w.pendingSummons = rows;},
    get respawns() {return w.pendingRespawns;}, set respawns(rows) {w.pendingRespawns = rows;}};
  const shared = installSharedCombat(w, content);
  installCombatHostServices(w, content);
  const population = installCombatPopulation(w, content, {capacity});
  const lifetimes = installCombatLifetimes(w, content);
  const casting = installCombatCasting(w, content);
  const recovery = installCombatRecovery(w, content, shared);
  const link = new CombatServiceBindings(w, {...content.queries, ...content.hitQueries});
  const bodies = installCombatBodies(w, content, shared);
  const auras = installCombatAuras(w, content, shared);
  const constructs = installCombatConstructs(w, content, link);
  const tethers = installCombatTethers(w, content);
  const fields = installCombatFields(w, content, link);
  const births = installCombatBirths(w, content);
  const controls = installCombatControls(w, content);
  const orders = installCombatOrders(w, content);
  const caster = installCombatCaster(w, content, recovery, fields, controls, orders);
  const carried = installCombatCarried(w, content);
  const death = installCombatDeath(w, content, births);
  const projectiles = installCombatProjectiles(w, content, link);
  const movement = installCombatMovement(w, content);
  const execution = installCombatExecution(w, content, link, recovery,
    {...constructs, ...movement, projectile: projectiles.projectile, auras: auras.activation}, caster);
  w.useSkill = (actor, skill, aim, seatPress) => {
    if (!admit(w, actor, skill, aim)) return false;
    return casting.dispatch.request(actor, skill, aim, seatPress);
  };
  w.executeSkill = (actor, skill, aim, options) => {
    if (!admit(w, actor, skill, aim)) return false;
    return execution.execution.execute(actor, skill, aim, options);
  };
  // General AI and campaign fixtures observe combat. Their absence does not
  // disable hit, status or death rules; no account/save module is imported.
  w.bumpDrives = (actor, event) => host.intent?.combatEvent?.(actor, event);
  w.rouseOnWound = actor => host.intent?.wounded?.(actor);
  w.knockFixtures = (...args) => host.consequences?.fixtureStruck?.(...args);
  w.bankEssenceSpill = (...args) => host.consequences?.essenceSpill?.(...args);
  w.spawnLightwell = (kind, at, options = {}) => {
    if (typeof host.fields?.lightwell !== 'function') throw Error('Missing combat field service: lightwell');
    // Preserve the original combat-stream radius draw, while leaving the
    // world object's creation, lighting and retirement with the host.
    return host.fields.lightwell(kind, at, {...options,radius:options.radius ?? 14 + 6 * w.random()});
  };
  link.finish();
  return {w, rng, shared, casting, recovery, bodies, auras, constructs, tethers, fields, births,
    controls, orders, caster, carried, death, projectiles, movement, lifetimes, population, execution};
}
