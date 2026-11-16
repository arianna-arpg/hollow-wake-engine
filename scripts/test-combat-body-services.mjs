import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {Random} from '@hollow-wake/engine';
import {buildCombatContent} from './compile-combat-content.mjs';
import {sha256} from './reference-utils.mjs';
import {installSharedCombat} from '../adapters/embedded/combat-shared-services.mjs';
import {installCombatBodies} from '../adapters/embedded/combat-body-services.mjs';
import {installCombatAuras} from '../adapters/embedded/combat-aura-services.mjs';

// Reuse the accepted original census; never regenerate expected observations.
// This qualifies construction through the real shared actor and body graph,
// not summon delivery, AI, death or the future public simulation clock.
const directory = 'baseline/body-factory-catalogue';
const accepted = JSON.parse(fs.readFileSync(directory + '/acceptance.json'));
const compressed = fs.readFileSync(directory + '/observations.json.gz');
assert.equal(sha256(compressed), accepted.gzipSha256);
const bytes = gunzipSync(compressed);
assert.equal(sha256(bytes), accepted.sha256);
const original = JSON.parse(bytes);
const fields = ['ambushArmed','adorn','aims','anchored','brain','brainVariant','breathes','carriedGear','cling','color','deathBurst','defId','driven','explodeOnDeath','facing','facingPrev','faction','flying','flyingBase','fromZoneGen','grabbable','habitat','immuneGround','invulnerable','juvenile','kind','level','levitates','look','material','movementTetherSpec','onHitByType','onHitTypeIcd','passive','pathCosts','plies','pliesMax','plySpec','postSpec','radius','refuge','reserveSpecs','rootedSpec','shape','shellGuard','spawnScale','spawnedAt','squish','stationary','tag','tellSpecs','tone','tune','turnSpeed','untargetable','volatile','wake','watch','worm','wornConduits','xpValue'];
const plain = value => JSON.parse(JSON.stringify(value));
const parent = fs.realpathSync('.artifacts'), work = fs.mkdtempSync(path.join(parent, 'm3-body-services-owned-'));
try {
  await buildCombatContent(path.join(work, 'content'));
  const {combatContent: content} = await import(pathToFileURL(path.join(work, 'content/content.mjs')));
  const w = {host: {}, observers: {}, time: 17, nextActorId: 1, nextItemId: 4, actors: [], seats: [], flashes: [],
    pendingFuses: [], projectiles: [], pendingRepeats: [], zones: [], tethers: [],
    summonQueues: {summons: [], respawns: []}, strikeReleaseBodies: new Map(), bombardMintRev: 0, zoneGenTagging: true};
  const shared = installSharedCombat(w, content);
  installCombatBodies(w, content, shared);
  installCombatAuras(w, content, shared);
  const owner = w.allocateActor('factory-census-owner', 'player', {x: 80, y: 80});
  owner.id = original.rows.find(row => row.body.ownerId !== undefined).body.ownerId;
  owner.sheet.setBase('minionDamage', 1.25); owner.sheet.setBase('minionLife', 1.5);
  w.nextActorId = original.rows[0].body.id;
  assert.deepEqual(Object.keys(content.hitQueries.MONSTERS).sort(), original.catalogue);
  let carried = 0;
  for (const row of original.rows) {
    const random = new Random(row.seed); w.random = () => random.next();
    const before = w.bombardMintRev;
    const a = w.createMonster(row.body.fields.defId, row.body.fields.level, row.body.team, row.body.ownerId === undefined ? undefined : owner);
    assert(a.skills.every(s => s?.def), row.label + ': missing authored skill');
    const body = plain({fields: Object.fromEntries(fields.map(key => [key, a[key]])), id: a.id, name: a.name, team: a.team, pos: a.pos, ownerId: a.owner?.id,
      bases: [...a.sheet.baseOverrides], sources: a.sheet.sourceNames().map(name => ({name, mods: a.sheet.getSourceMods(name)})),
      resources: {life: a.life, maxLife: a.maxLife(), mana: a.mana, maxMana: a.maxMana(), es: a.es, maxEs: a.maxEs(), poise: a.poise, maxPoise: a.maxPoise(), insight: a.insight, maxInsight: a.maxInsight(), endurance: a.endurance, maxEndurance: a.maxEndurance()},
      reserves: a.reserves ? [...a.reserves] : undefined, statuses: a.statuses,
      skills: a.skills.map(s => s ? {id: s.def.id, level: s.level, treeNodes: s.treeNodes, sockets: s.sockets.map(x => x ? {id: x.def.id, level: x.level, forwarded: x.forwarded} : null), grafts: s.grafts?.map(x => ({id: x.def.id, level: x.level}))} : null)});
    assert.deepEqual(body, row.body, row.label);
    assert.equal(random.draws, row.draws, row.label + ': random draws');
    assert.equal(w.bombardMintRev - before, row.bombardRevisionDelta);
    assert.equal(a.statusRelay, w.relayStatus);
    assert.equal(w.actors.length, 0, 'Construction must not publish the body');
    if (a.carriedGear) carried++;
  }
  console.log({passed: true, originalBodyConstructions: original.rows.length, carriedItemRolls: carried,
    sharedActorBodyGraph: true, fullSummonLifetimeQualified: false, allCombatFamiliesQualified: false});
} finally {
  assert.equal(path.dirname(fs.realpathSync(work)), parent);
  fs.rmSync(work, {recursive: true, maxRetries: 3});
}
