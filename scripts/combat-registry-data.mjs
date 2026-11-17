import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {root, sha256} from './reference-utils.mjs';
import {readCatalogue} from './catalogue-tools.mjs';

export function acceptedCombatData(name) {
  assert(/^[a-z][a-z-]*$/.test(name));
  const base = path.join(root, 'baseline', name);
  const accepted = JSON.parse(fs.readFileSync(path.join(base, 'acceptance.json')));
  const archive = fs.readFileSync(path.join(base, 'observations.json.gz'));
  assert.equal(sha256(archive), accepted.compressedSha256);
  const bytes = gunzipSync(archive);
  assert.equal(sha256(bytes), accepted.sha256);
  assert.equal(sha256(fs.readFileSync(path.join(root, accepted.observerFile))), accepted.observerSha256);
  assert.equal(sha256(fs.readFileSync(path.join(root, 'baseline/source-lock.json'))), accepted.sourceLockSha256);
  const data = JSON.parse(bytes); assert(data.originalOnly);
  return data;
}

export function combatRegistryData(profile) {
  if (profile) {
    const registries = {...profile.runtime.registries,
      summonPacts: profile.runtime.summonPacts, summonPactSupportGrants: profile.runtime.summonPactSupportGrants,
      battleDoctrines: profile.runtime.battleDoctrines, minionTransmutations: profile.runtime.minionTransmutations};
    assert(!JSON.stringify(registries).includes('"$sourceRule"'));
    return {registries, sha256: sha256(JSON.stringify(registries))};
  }
  const {registries} = acceptedCombatData('combat-authored-registry');
  registries.wornThrongs = acceptedCombatData('combat-throng-registry').wornThrongs;
  Object.assign(registries,acceptedCombatData('combat-proc-registry').registries);
  const carried = acceptedCombatData('carried-effects').rules;
  for (const [family, rows] of Object.entries(carried)) {
    registries[family] = rows.definitions;
    registries[family + 'Ids'] = rows.ids;
  }
  const catalogue = readCatalogue();
  for (const table of ['skills', 'supports', 'stats', 'statuses', 'passiveChoices']) {
    const byId = new Map(catalogue.tables[table].map(row => [row.id, row.value]));
    registries[table] = Object.fromEntries(catalogue.registryOrder[table].map(id => [id, byId.get(id)]));
  }
  assert(!JSON.stringify(registries).includes('"$sourceRule"'), 'Uncompiled executable combat registry value');
  return {registries, sha256: sha256(JSON.stringify(registries))};
}

/** Initialization data from the original boot, with no boot behavior. Every
 * consumer initializes the same registry order before making derived lists. */
export function registryInitialization(names, variable = 'registryData') {
  const rows = {MONSTERS: 'monsters', SKILLS: 'skills', SUPPORTS: 'supports', STAT_DEFS: 'stats', STATUS_DEFS:'statuses', CHOICE_GROUPS:'passiveChoices', PROCS:'procs', PROC_LIST:'procIds', PROC_RIDER_LIST:'procRiders', ATTRIBUTE_BEQUESTS: 'bequests', ATTRIBUTE_BEQUEST_IDS: 'bequestIds', STATUS_RELAYS: 'relays', STATUS_RELAY_IDS: 'relayIds',
    SATELLITES: 'satellites', SATELLITE_IDS: 'satellitesIds', AURORAS: 'auroras', AURORA_IDS: 'aurorasIds',
    GUARDIANS: 'guardians', GUARDIAN_IDS: 'guardiansIds', CREEPERS: 'creepers', CREEPER_IDS: 'creepersIds', WORN_THRONGS: 'wornThrongs',
    SUMMON_PACTS: 'summonPacts', SUMMON_PACT_SUPPORT_GRANTS: 'summonPactSupportGrants',
    BATTLE_DOCTRINES: 'battleDoctrines', MINION_TRANSMUTATIONS: 'minionTransmutations'};
  return Object.entries(rows).filter(([name]) => names.includes(name)).map(([name, field]) =>
    name==='PROC_LIST' ? `${name}.splice(0, ${name}.length, ...${variable}.procIds.map(id=>PROCS[id]));`
      : name==='PROC_RIDER_LIST'||field.endsWith('Ids') ? `${name}.splice(0, ${name}.length, ...${variable}.${field});`
      : `for (const id of Object.keys(${name})) delete ${name}[id]; Object.assign(${name}, ${variable}.${field});`).join('\n');
}
