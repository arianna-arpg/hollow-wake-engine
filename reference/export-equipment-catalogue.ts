// Runs inside the immutable original game. No SDK rules or outputs are used.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom, mulberry32} from '../src/sim/rng';
import {forgeItem, compileItemMods, affixPoolsFor} from '../src/engine/itemgen';
import {EQUIP_SLOTS, ITEM_CFG, socketCap} from '../src/engine/items';
import {ITEM_BASES} from '../src/data/itembases';
import {ITEM_AFFIX_LIST} from '../src/data/itemaffixes';
import {UNIQUE_LIST} from '../src/data/uniques';
import {VESTIGE_LIST, EPITAPH_LIST, epitaphFor} from '../src/data/vestiges';
import {SKILLS} from '../src/data/skills';
import {makeSkillInstance, skillCooldownSeconds, effectiveSkillLevel, parseSlotGraftStat} from '../src/engine/skills';
import {skillDamageBands} from '../src/engine/damage';

const clone = (v: any) => JSON.parse(JSON.stringify(v));
const slots = EQUIP_SLOTS.filter(s => s.enabled);
const bases = Object.values(ITEM_BASES).filter(b => slots.some(s => s.accepts.includes(b.category)));
const cases: any[] = [], excluded: any[] = [];
const slotFor = (base: any) => slots.find(s => s.accepts.includes(base.category))!.id;
function add(family: string, id: string, base: any, options: any = {}, extra: any = {}) {
  cases.push({family, id, slot: slotFor(base), options: {baseId: base.id,
    ilvl: Math.max(1, base.minIlvl ?? 1), rarity: 'common', quality: .5, sockets: 0, ...options}, ...extra});
}
for (const base of bases) {
  add('base', base.id, base);
  add('base-high-tier', base.id, base, {ilvl: Math.max(ITEM_CFG.tierBreaks.at(-1)!, base.minIlvl ?? 1), quality: 1, superior: true});
}
for (const affix of ITEM_AFFIX_LIST) {
  const base = bases.find(b => affixPoolsFor(b)[affix.kind].includes(affix));
  if (!base) { excluded.push({family: 'affix', id: affix.id, reason: 'No enabled worn slot admits an eligible base'}); continue; }
  // Explicit tier and known rolls exercise every authored family, not drop odds.
  const tier = affix.tiers.length - 1;
  const graft = affix.lines.map(line => parseSlotGraftStat(line.stat)).find(Boolean);
  add('affix', affix.id, base, {ilvl: Math.max(affix.tiers[tier].ilvl, base.minIlvl ?? 1),
    rarity: 'magic', affixes: [{id: affix.id, tier}]}, {barSlot: graft?.slot ?? 0});
}
for (const unique of UNIQUE_LIST) {
  const base = bases.find(b => b.id === unique.baseId);
  if (!base) { excluded.push({family: 'unique', id: unique.id, reason: 'Its base has no enabled worn slot'}); continue; }
  add('unique', unique.id, base, {uniqueId: unique.id, ilvl: Math.max(unique.minIlvl ?? 1, base.minIlvl ?? 1)});
  for (const group of unique.choices ?? []) for (const option of group.options) {
    add('unique-choice', `${unique.id}:${group.id}:${option.id}`, base,
      {uniqueId: unique.id, ilvl: Math.max(unique.minIlvl ?? 1, base.minIlvl ?? 1)},
      {choice: {group: group.id, id: option.id, rolls: option.lines.map(() => .5)}});
  }
}
for (const category of new Set(bases.map(b => b.category))) {
  if (!socketCap(category)) continue;
  const base = bases.find(b => b.category === category)!;
  for (const vestige of VESTIGE_LIST) add('vestige', `${category}:${vestige.id}`, base, {sockets: 1}, {sockets: [vestige.id]});
}
for (const epitaph of EPITAPH_LIST) for (const category of epitaph.categories) {
  const base = bases.find(b => b.category === category && socketCap(category) >= epitaph.sequence.length);
  if (!base) { excluded.push({family: 'epitaph', id: `${epitaph.id}:${category}`, reason: 'No enabled worn base has the required socket capacity'}); continue; }
  add('epitaph', `${epitaph.id}:${category}`, base, {sockets: epitaph.sequence.length}, {sockets: epitaph.sequence});
}
const baselineStats = ['life', 'mana', 'energyShield', 'poise', 'endurance', 'insight', 'armor', 'evasion',
  'accuracy', 'damage', 'castSpeed', 'attackSpeed', 'critChance', 'critMulti', 'manaCost', 'manaUseCost'];
function instance(inst: any) {
  return {id: inst.def.id, level: inst.level, effectiveLevel: effectiveSkillLevel(inst), bonusLevels: inst.bonusLevels ?? 0,
    sockets: inst.sockets.map((s: any) => s ? {id: s.def.id, level: s.level} : null),
    treeNodes: inst.treeNodes ?? [], grafts: (inst.grafts ?? []).map((s: any) => ({id: s.def.id, level: s.level})),
    grantedHostUid: inst.grantedHostUid ?? null};
}
const rows: any[] = [];
// Diagnostic limits do not produce an acceptable complete baseline.
const limit = process.argv[3] === undefined ? cases.length : Number(process.argv[3]);
assert(Number.isSafeInteger(limit) && limit > 0);
for (const [index, spec] of cases.slice(0, limit).entries()) {
  const restore = seedGlobalRandom(430217);
  try {
    const w = makeSimWorld('magician', 430217), a = w.player, seat = w.localSeat;
    w.walk = null;
    const skill = makeSkillInstance(SKILLS.ruin, 5, 0);
    a.skills.fill(null); a.skills[spec.barSlot ?? 0] = skill;
    seat.meta.knownSkills.clear(); seat.meta.knownSkills.set('ruin', skill);
    seat.meta.items = []; seat.meta.equipped = {}; seat.meta.containers = {};
    w.recalcSeat(seat); a.fillResources(); a.useLock = 0; a.cooldowns.clear(); a.casting = null;
    const item = forgeItem({...spec.options, rng: mulberry32(87123)})!;
    assert(item, spec.id); item.uid = index + 10000;
    if (spec.sockets) item.sockets = [...spec.sockets];
    if (spec.choice) (item.uniqueChoices ??= {})[spec.choice.group] = {id: spec.choice.id, rolls: [...spec.choice.rolls]};
    if (spec.family === 'affix') assert.equal(item.affixes[0]?.id, spec.id, 'Forge omitted requested affix');
    if (spec.family === 'epitaph') assert.equal(epitaphFor(item.rarity, ITEM_BASES[item.baseId].category, item.sockets)?.id,
      spec.id.split(':')[0], 'Socket sequence did not awaken');
    const inputItem = clone(item), mods = clone(compileItemMods(item));
    const statIds = [...new Set([...baselineStats, ...mods.flatMap((m: any) => [m.stat, ...m.fromStat ? [m.fromStat] : []])])];
    const observe = () => ({
      attributes: {...a.attributeValues}, stats: Object.fromEntries(statIds.map(id => [id, a.sheet.get(id)])),
      sources: a.sheet.sourceNames().map(name => [name, clone(a.sheet.getSourceMods(name))]),
      life: a.life, mana: a.mana, maxLife: a.maxLife(), maxMana: a.maxMana(),
      preview: skillDamageBands(a, skill), cost: a.skillCost(skill), cooldown: skillCooldownSeconds(a, skill),
      cast: a.casting ? {mode: a.casting.mode, elapsed: a.casting.elapsed, total: a.casting.total,
        paidCost: clone(a.casting.paidCost), sameSkill: a.casting.inst === skill} : null,
      learned: instance(skill), bar: a.skills.map(s => s ? s.def.id : null),
      granted: [...seat.grantedInsts?.values() ?? []].map(instance),
      wornGrafts: (seat.wornGrafts ?? []).map(row => ({slot: row.slot, id: row.def.id, level: row.level, skillId: row.skillId ?? null, state: row.state})),
      conduits: clone(a.wornConduits ?? [])
    });
    assert(w.useSkill(a, skill, {x: a.pos.x + 100, y: a.pos.y}, true));
    assert(a.casting); const active = a.casting;
    w.updateCasting(a, active.total / 4);
    const before = observe();
    seat.meta.equipped[spec.slot] = item;
    w.recalcSeat(seat);
    assert.equal(a.casting, active, `Rebuild replaced cast: ${spec.id}`);
    const equipped = observe(), storedItem = clone(item);
    seat.meta.equipped = {};
    w.recalcSeat(seat);
    assert.equal(a.casting, active, `Removal replaced cast: ${spec.id}`);
    rows.push({spec, item: inputItem, mods, before, equipped, storedItem, removed: observe()});
    if ((index + 1) % 250 === 0) console.log({observed: index + 1, total: cases.length});
  } finally { restore(); }
}
const result = {schemaVersion: 1,
  scope: 'Original static worn-equipment derivation during an active Ruin cast; no equip authorization, full effect execution, slot combinations, drop-distribution or hardware acceptance',
  complete: rows.length === cases.length, totalCases: cases.length,
  sourceCounts: {bases: Object.keys(ITEM_BASES).length, wearableBases: bases.length, affixes: ITEM_AFFIX_LIST.length,
    uniques: UNIQUE_LIST.length, vestiges: VESTIGE_LIST.length, epitaphs: EPITAPH_LIST.length},
  excluded, rows};
fs.writeFileSync(process.argv[2], JSON.stringify(result) + '\n', {flag: 'wx'});
console.log({passed: true, complete: result.complete, cases: rows.length, excluded: excluded.length});
