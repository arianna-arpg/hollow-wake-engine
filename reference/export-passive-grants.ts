// Original-game observation only. The same exporter later verifies the installed game adapter.
import fs from 'node:fs';
import path from 'node:path';
import { makeSimWorld } from '../src/sim/arena';
import { CLASSES } from '../src/data/classes';
import { PASSIVE_NODES, classStartNode } from '../src/data/passives';
import { CHOICE_GROUPS, graftSourcesOf } from '../src/data/passiveChoices';
import { ATTRIBUTES, ATTRIBUTE_IDS, STAT_DEFS, type Attributes } from '../src/engine/stats';
import { SUPPORTS } from '../src/data/supports';
import { PROC_RIDER_LIST, procRiderStat } from '../src/data/procs';
import { SKILLS } from '../src/data/skills';
import { makeSkillInstance, hostSockets } from '../src/engine/skills';
import { compileItemMods, forgeItem } from '../src/engine/itemgen';
import { EQUIP_SLOTS } from '../src/engine/items';
import { mulberry32 } from '../src/sim/rng';
const w = makeSimWorld('magician', 47291), p = w.player, m = w.meta;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const payload = (g: any) => ({ attributes: g.attributes, attributesPct: g.attributesPct, mods: g.mods, conduit: g.conduit, graft: g.graft });
const pack = clone({ schemaVersion: 1, capability: 'passive-grants/v1', contentId: 'original-passive-grants/v1',
  attributes: ATTRIBUTE_IDS.map(id => ({ id, perPoint: ATTRIBUTES[id].perPoint })),
  statIds: [...new Set([...Object.keys(STAT_DEFS), ...PROC_RIDER_LIST.map(r => procRiderStat(r.id))])], supportIds: Object.keys(SUPPORTS),
  nodes: Object.values(PASSIVE_NODES).map(n => ({ id: n.id, name: n.name, description: n.description, choiceGroup: n.choice?.group, ...payload(n) })),
  groups: Object.values(CHOICE_GROUPS).map(g => ({ id: g.id, options: g.options.map(o => ({ id: o.id, name: o.name, description: o.description, ...payload(o) })) })),
});
const known = makeSkillInstance(SKILLS.cleave, 5, 0); m.knownSkills = new Map([['cleave', known]]); p.skills = [known];
const rows: any[] = [];
function observe(label: string, allocated: string[], choices: Record<string, string[]> = {}, base: Attributes = CLASSES[1].attributes) {
  m.baseAttrs = { ...base }; m.allocated = new Set(allocated); m.choices = clone(choices);
  const graftSources = graftSourcesOf(m.allocated, m.choices, PASSIVE_NODES);
  m.grafts = Object.fromEntries(graftSources.map(g => [g.key, 'cleave']));
  w.recalcPlayer();
  const sources = p.sheet.sourceNames().map(id => ({ id, mods: clone(p.sheet.getSourceMods(id)!) }));
  const mods = sources.flatMap(s => s.mods);
  const statIds = [...new Set(['life','mana','damage','accuracy', ...mods.flatMap(g => g.fromStat ? [g.stat, g.fromStat] : [g.stat])])];
  const conditions = [...new Set(mods.flatMap(g => g.when ? [g.when] : []))];
  const gauges = [...new Set(mods.flatMap(g => g.gauge ? [g.gauge] : []))].map(id => [id, .75] as [string, number]);
  const tags = [...new Set(mods.flatMap(g => g.tags ?? []))];
  const reads = [false, true].map(active => {
    p.sheet.setConditions(active ? conditions : []); p.sheet.setGauges(active ? gauges : []);
    return { conditions: active ? conditions : [], gauges: active ? gauges : [], tags: active ? tags : [],
      values: Object.fromEntries(statIds.map(id => [id, p.sheet.get(id, active ? new Set(tags) : undefined)])) };
  });
  p.sheet.setConditions([]); p.sheet.setGauges([]);
  const itemSources = EQUIP_SLOTS.filter(slot => m.equipped[slot.id]).map(slot => ({ id: `gear:${slot.id}`, mods: compileItemMods(m.equipped[slot.id]!) }));
  rows.push(clone({ label, input: { baseAttributes: m.baseAttrs, allocated, choices, itemSources }, expected: {
    attributes: m.attrs, passiveModifiers: p.sheet.getSourceMods('passives'), attributeModifiers: p.sheet.getSourceMods('attributes'),
    conduits: p.wornConduits ?? [], graftSources, sources, reads,
    hostSupports: hostSockets(known).map(s => ({ id: s.def.id, level: s.level })),
  } }));
}
const start = classStartNode('magician');
for (const node of Object.values(PASSIVE_NODES)) {
  observe(`node:${node.id}`, [...new Set([start, node.id])]);
  if (node.choice) for (const option of CHOICE_GROUPS[node.choice.group].options) observe(`choice:${node.id}:${option.id}`, [...new Set([start, node.id])], { [node.id]: [option.id] });
}
// Class spreads and mixed sequential grants, including real equipment lines, share the same calculation.
const selected = Object.values(PASSIVE_NODES).filter(n => n.attributesPct || n.attributes || n.choice).slice(0, 80).map(n => n.id);
for (const [i, c] of CLASSES.entries()) {
  m.equipped.ring1 = forgeItem({ baseId: 'ring_lapis', ilvl: 35, rarity: 'rare', quality: .6, affixes: [{ id: 'attr_intelligence' }], rng: mulberry32(i + 77) })!;
  const allocated = [...new Set([c.startNode, ...selected.slice(i % 9, 35 + i % 9)])];
  const choices = Object.fromEntries(allocated.filter(id => PASSIVE_NODES[id].choice).map(id => [id, [CHOICE_GROUPS[PASSIVE_NODES[id].choice!.group].options[i % CHOICE_GROUPS[PASSIVE_NODES[id].choice!.group].options.length].id]]));
  observe(`class-and-equipment:${c.id}`, allocated, choices, c.attributes);
}
delete m.equipped.ring1;
observe('retired-selection', [start,'missing-node'], { [start]: ['missing-option'] });
fs.mkdirSync(process.argv[2], { recursive: true });
fs.writeFileSync(path.join(process.argv[2], 'passive-grants.json'), JSON.stringify({ schemaVersion: 1, pack, rows }) + '\n');
console.log(`Observed ${rows.length} complete original World rebuilds across every passive node and choice option.`);
