import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {buildCombatContent} from './compile-combat-content.mjs';
import {installSharedCombat} from '../adapters/embedded/combat-shared-services.mjs';
import {installCombatCasting} from '../adapters/embedded/combat-casting-services.mjs';
import {installCombatRecovery} from '../adapters/embedded/combat-recovery-services.mjs';
import {installCombatExecution} from '../adapters/embedded/combat-execution-services.mjs';
import {CombatServiceBindings} from '../adapters/embedded/combat-service-bindings.mjs';
import {installCombatHostServices} from '../adapters/embedded/combat-host-services.mjs';
import {installCombatBodies} from '../adapters/embedded/combat-body-services.mjs';
import {installCombatAuras} from '../adapters/embedded/combat-aura-services.mjs';
import {installCombatConstructs} from '../adapters/embedded/combat-construct-services.mjs';
import {installCombatTethers} from '../adapters/embedded/combat-tether-services.mjs';
import {installCombatFields} from '../adapters/embedded/combat-field-services.mjs';
import {installCombatBirths} from '../adapters/embedded/combat-birth-services.mjs';
import {inspectCombatOwner} from './combat-owner-closure.mjs';
import {installCombatControls} from '../adapters/embedded/combat-control-services.mjs';
import {installCombatOrders} from '../adapters/embedded/combat-order-services.mjs';
import {installCombatCaster} from '../adapters/embedded/combat-caster-services.mjs';
import {installCombatProjectiles} from '../adapters/embedded/combat-projectile-services.mjs';
import {installCombatCarried} from '../adapters/embedded/combat-carried-services.mjs';
import {installCombatMovement} from '../adapters/embedded/combat-movement-services.mjs';
import {installCombatDeath} from '../adapters/embedded/combat-death-services.mjs';
import {installCombatLifetimes} from '../adapters/embedded/combat-lifetime-services.mjs';
import {installCombatPopulation} from '../adapters/embedded/combat-population-services.mjs';

// Development diagnostic only: an incomplete assembly never admits a command.
const parent = fs.realpathSync('.artifacts');
const work = fs.mkdtempSync(path.join(parent, 'm3-assembly-audit-owned-'));
try {
  await buildCombatContent(path.join(work, 'content'));
  const {combatContent: content} = await import(pathToFileURL(path.join(work, 'content/content.mjs')));
  const unused = () => assert.fail('Setup audit cannot execute spatial queries');
  const space = Object.fromEntries(['clamp', 'layerAt', 'lineOfFire', 'lineOfSight', 'clipShot', 'nearestBody', 'inAoeBody', 'noteBodyHit', 'reachTo', 'strikeSurfaces', 'frontSplash', 'bodyWhere', 'freeSpot', 'emergenceGround'].map(key => [key, unused]));
  space.arena = () => ({w: 1000, h: 1000});
  const w = {host: {space}, observers: {}, time: 0, nextActorId: 1, nextItemId: 1, actors: [], seats: [], flashes: [], signals: [],
    corpses: [], pendingSteps: [], pendingRepeats: [], remnants: [], zones: [], projectiles: [], tethers: [], lite: {liveCount: 0},
    summonQueues: {summons: [], respawns: []}, strikeReleaseBodies: new Map(), deathBursts: [], emergences: []};
  const shared = installSharedCombat(w, content);
  installCombatHostServices(w, content);
  installCombatPopulation(w, content);
  installCombatLifetimes(w, content);
  installCombatCasting(w, content);
  const recovery = installCombatRecovery(w, content, shared);
  const link = new CombatServiceBindings(w, {...content.queries, ...content.hitQueries});
  installCombatBodies(w, content, shared);
  const auras = installCombatAuras(w, content, shared);
  const constructs = installCombatConstructs(w, content, link);
  installCombatTethers(w, content);
  const fields = installCombatFields(w, content, link);
  const births = installCombatBirths(w, content);
  const controls = installCombatControls(w, content);
  const orders = installCombatOrders(w, content);
  const caster = installCombatCaster(w, content, recovery, fields, controls, orders);
  installCombatCarried(w, content);
  installCombatDeath(w, content, births);
  const projectiles = installCombatProjectiles(w, content, link);
  const movement = installCombatMovement(w, content);
  installCombatExecution(w, content, link, recovery, {...constructs, ...movement, projectile: projectiles.projectile, auras: auras.activation}, caster);
  const missing = link.missing();
  assert(missing.length > 0, 'Update this development diagnostic when the complete owner is installed');
  assert.throws(() => link.finish(), /Incomplete combat assembly/);
  const result = {completeOwner: false, missingExecutionPorts: missing,
    missingOwnerCalls: inspectCombatOwner(process.cwd(), w)};
  fs.writeFileSync(path.join(parent, 'm3-combat-assembly.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(result);
} finally {
  assert.equal(path.dirname(fs.realpathSync(work)), parent);
  fs.rmSync(work, {recursive: true, maxRetries: 3});
}
