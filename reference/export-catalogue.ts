// Independent source observation: execute only in the frozen game's balance directory.
import fs from 'node:fs';
import path from 'node:path';
import { bootSimEngine } from '../src/sim/arena';
import { STAT_DEFS, ATTRIBUTES, STAT_TRADES, DAMAGE_TYPES } from '../src/engine/stats';
import { STATUS_DEFS } from '../src/engine/status';
import { EQUIP_SLOTS, ITEM_CFG, ITEM_RARITIES, DEFENSE_KINDS } from '../src/engine/items';
import { CLASSES, PROGRESSION } from '../src/data/classes';
import { SKILLS } from '../src/data/skills';
import { SUPPORTS } from '../src/data/supports';
import { PASSIVE_NODES } from '../src/data/passives';
import { CHOICE_GROUPS } from '../src/data/passiveChoices';
import { PASSIVE_REALMS } from '../src/data/passiveRealms';
import { VOCATIONS } from '../src/data/vocations';
import { ITEM_BASES } from '../src/data/itembases';
import { ITEM_AFFIXES } from '../src/data/itemaffixes';
import { UNIQUES } from '../src/data/uniques';
import { VESTIGES, EPITAPHS } from '../src/data/vestiges';
import { CONTAINER_DEFS } from '../src/data/containers';

bootSimEngine();
const keyed = (rows: readonly { id: string }[]) => Object.fromEntries(rows.map(row => [row.id, row]));
const registries: Record<string, object> = {
  stats: STAT_DEFS, attributes: ATTRIBUTES, statuses: STATUS_DEFS,
  classes: keyed(CLASSES), skills: SKILLS, supports: SUPPORTS,
  passives: PASSIVE_NODES, passiveChoices: CHOICE_GROUPS, passiveRealms: PASSIVE_REALMS,
  vocations: VOCATIONS, itemBases: ITEM_BASES, affixes: ITEM_AFFIXES, uniques: UNIQUES,
  vestiges: VESTIGES, epitaphs: EPITAPHS, containers: keyed(CONTAINER_DEFS),
  equipSlots: keyed(EQUIP_SLOTS), itemRarities: ITEM_RARITIES, defenseKinds: DEFENSE_KINDS,
  rules: { item: ITEM_CFG, progression: PROGRESSION, statTrades: STAT_TRADES, damageTypes: DAMAGE_TYPES },
};
const omissions: { path: string; reason: string }[] = [];
const sourceRules: { path: string; source: string }[] = [];
// Lookup rows may be sorted for tooling; weighted selection and modifier folds
// can depend on the original insertion order. Preserve that independent contract.
const registryOrder = Object.fromEntries(Object.entries(registries).map(([name, rows]) => [name, Object.keys(rows)]));
function data(value: any, at: string, parents = new Set<object>()): any {
  if (value === undefined) { omissions.push({ path: at, reason: 'undefined-property' }); return undefined; }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'function') {
    sourceRules.push({ path: at, source: String(value) });
    return { $sourceRule: at }; // Evidence only. No evaluation in the SDK.
  }
  if (typeof value !== 'object') throw new Error(`Nonportable content at ${at}: ${typeof value}`);
  if (parents.has(value)) throw new Error(`Cyclic content at ${at}`);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`Nonplain content at ${at}`);
  parents.add(value);
  let result: any;
  if (Array.isArray(value)) result = value.map((child, i) => {
    if (child === undefined || !(i in value)) throw new Error(`Sparse content at ${at}/${i}`);
    return data(child, `${at}/${i}`, parents);
  });
  else result = Object.fromEntries(Object.entries(value)
    .map(([key, child]) => [key, data(child, `${at}/${key}`, parents)]).filter(([, child]) => child !== undefined));
  parents.delete(value);
  return result;
}
const tables = Object.fromEntries(Object.entries(registries).map(([table, rows]) => [table,
  Object.entries(rows).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([id, value]) => ({ id, value: data(value, `${table}/${id}`) }))]));
const out = process.argv[2];
if (!out) throw new Error('Output directory required');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'catalogue.json'), JSON.stringify({ schemaVersion: 1,
  kind: 'authored-catalogue', source: 'hollow-wake-frozen-baseline', tables, registryOrder, omissions, sourceRules }, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]))));
