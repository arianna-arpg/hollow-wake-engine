// Executes only beside the pinned prototype source. No SDK imports.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import './__sdk_parity_catalogue';
import {MONSTERS} from '../src/data/monsters';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {STAT_DEFS, ATTRIBUTES, ATTRIBUTE_IDS} from '../src/engine/stats';
import {STATUS_DEFS} from '../src/engine/status';
import {ATTRIBUTE_BEQUESTS, ATTRIBUTE_BEQUEST_IDS} from '../src/engine/bequests';
import {STATUS_RELAYS, STATUS_RELAY_IDS} from '../src/engine/reception';
import {WORN_THRONGS} from '../src/engine/throng';
import {PROCS, PROC_LIST, PROC_RIDER_LIST, procRiderStat} from '../src/data/procs';
import {SATELLITES, SATELLITE_IDS, SATELLITE_CFG} from '../src/engine/satelliteSpec';
import {AURORAS, AURORA_IDS, AURORA_CFG} from '../src/engine/auroraSpec';
import {GUARDIANS, GUARDIAN_IDS, GUARDIAN_CFG} from '../src/engine/guardianSpec';
import {CREEPERS, CREEPER_IDS, CREEPER_CFG} from '../src/engine/creeperSpec';
import {PASSIVE_NODES, PASSIVE_ADJACENCY, classStartNode, vocationGateNodeId} from '../src/data/passives';
import {CHOICE_GROUPS, PASSIVE_CHOICE_CFG} from '../src/data/passiveChoices';
import {PASSIVE_REALMS} from '../src/data/passiveRealms';
import {CLASSES} from '../src/data/classes';
import {VOCATIONS, VOCATION_CFG, vocationRootId} from '../src/data/vocations';
import {SKILL_LEVEL_BANDS, MAX_SUPPORT_LEVEL, skillMaxLevel, supportMaxLevel} from '../src/engine/skills';
import {TREE_LAYOUT_CFG} from '../src/engine/skilltree';
import {ABILITY_ESSENCE_CFG, ABILITY_ESSENCES, FONT_CFG} from '../src/data/essences';
import {SKILL_EMPOWERMENT} from '../src/data/skillEmpowerment';
import {SUMMON_PACTS, SUMMON_PACT_SUPPORT_GRANTS} from '../src/data/summonPacts';
import {BATTLE_DOCTRINES, MINION_TRANSMUTATIONS} from '../src/data/battleDoctrines';

function plain(value: unknown, at: string): void {
  if (value === undefined || value === null || ['string','boolean'].includes(typeof value)) return;
  if (typeof value === 'number') {assert(Number.isFinite(value), at); return;}
  assert(typeof value === 'object', 'Executable registry value at ' + at);
  assert(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, at);
  for (const [key, child] of Object.entries(value)) plain(child, at + '/' + key);
}
const carried = {
  satellites: {definitions: SATELLITES, ids: SATELLITE_IDS, config: SATELLITE_CFG},
  auroras: {definitions: AURORAS, ids: AURORA_IDS, config: AURORA_CFG},
  guardians: {definitions: GUARDIANS, ids: GUARDIAN_IDS, config: GUARDIAN_CFG},
  creepers: {definitions: CREEPERS, ids: CREEPER_IDS, config: CREEPER_CFG},
};
const registries = {monsters: MONSTERS, skills: SKILLS, supports: SUPPORTS, stats: STAT_DEFS, statuses: STATUS_DEFS,
  passiveChoices: CHOICE_GROUPS, bequests: ATTRIBUTE_BEQUESTS, bequestIds: ATTRIBUTE_BEQUEST_IDS,
  relays: STATUS_RELAYS, relayIds: STATUS_RELAY_IDS, wornThrongs: WORN_THRONGS,
  procs: PROCS, procIds: PROC_LIST.map(p => p.id), procRiders: PROC_RIDER_LIST,
  ...Object.fromEntries(Object.entries(carried).flatMap(([key, value]) => [[key, value.definitions], [key + 'Ids', value.ids]]))};
const payload = (grant: any) => ({attributes: grant.attributes, attributesPct: grant.attributesPct, mods: grant.mods, conduit: grant.conduit, graft: grant.graft});
const passiveGrants = {schemaVersion: 1, capability: 'passive-grants/v1',
  attributes: ATTRIBUTE_IDS.map(id => ({id, perPoint: ATTRIBUTES[id].perPoint})),
  statIds: [...new Set([...Object.keys(STAT_DEFS), ...PROC_RIDER_LIST.map(r => procRiderStat(r.id))])], supportIds: Object.keys(SUPPORTS),
  nodes: Object.values(PASSIVE_NODES).map(n => ({id:n.id, name:n.name, description:n.description, choiceGroup:n.choice?.group, ...payload(n)})),
  groups: Object.values(CHOICE_GROUPS).map(g => ({id:g.id, options:g.options.map(o => ({id:o.id, name:o.name, description:o.description, ...payload(o)}))}))};
const passivePolicy = {schemaVersion:1, capability:'passive-policy/v1', ...PASSIVE_CHOICE_CFG, requireVocationGate:VOCATION_CFG.requireGateNode,
  nodes:Object.values(PASSIVE_NODES).map(n=>({id:n.id,name:n.name,realm:n.realm,vocation:n.vocation,choice:n.choice,graft:n.graft})),
  adjacency:PASSIVE_ADJACENCY, groups:Object.values(CHOICE_GROUPS).map(g=>({id:g.id,pick:g.pick,unique:g.unique,deal:g.deal,options:g.options.map(o=>({id:o.id,graft:o.graft}))})),
  realms:Object.values(PASSIVE_REALMS).map(r=>({id:r.id,roots:r.roots,adjacency:r.adjacency,currency:r.currency,unlockLedger:r.unlockLedger})),
  classes:CLASSES.map(c=>({id:c.id,startNode:classStartNode(c.id)})),
  vocations:Object.keys(VOCATIONS).map(id=>({id,root:vocationRootId(id),gate:vocationGateNodeId(id)}))};
const progression = {schemaVersion:1, capability:'skill-progression/v1',
  tuning:{bands:SKILL_LEVEL_BANDS,supportMaxLevel:MAX_SUPPORT_LEVEL,cost:ABILITY_ESSENCE_CFG.cost,empowerment:{reward:SKILL_EMPOWERMENT.reward}},
  layout:TREE_LAYOUT_CFG, services:{essences:ABILITY_ESSENCES,font:FONT_CFG,empowerment:SKILL_EMPOWERMENT},
  skills:Object.values(SKILLS).map(d=>({id:d.id,name:d.name,maxLevel:skillMaxLevel(d),color:d.color,delivery:{type:d.delivery.type},
    ...(d.tree ? {tree:d.tree,effects:d.effects,channel:d.channel,castCycle:d.castCycle} : {})})),
  supports:Object.values(SUPPORTS).map(d=>({id:d.id,name:d.name,maxLevel:supportMaxLevel(d)}))};
const runtime = {originalOnly:true, registries, carried, passiveGrants, passivePolicy, progression,
  vocationLimit:VOCATION_CFG.maxPerCharacter, summonPacts:SUMMON_PACTS, summonPactSupportGrants:SUMMON_PACT_SUPPORT_GRANTS,
  battleDoctrines:BATTLE_DOCTRINES, minionTransmutations:MINION_TRANSMUTATIONS};
plain(runtime, 'runtime');
fs.writeFileSync(path.join(process.argv[2], 'runtime.json'), JSON.stringify(runtime) + '\n', {flag:'wx'});
console.log(JSON.stringify({skills:Object.keys(SKILLS).length, supports:Object.keys(SUPPORTS).length, monsters:Object.keys(MONSTERS).length,
  passiveNodes:passiveGrants.nodes.length, skillTrees:progression.skills.filter(s=>'tree' in s).length}));
