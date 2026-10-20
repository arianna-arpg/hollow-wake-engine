// Executed only in the frozen original. Original World methods own all expected transitions.
// Host callbacks are observed stubs: stat rebuilding, minions, UI and service geography are outside this policy trace.
import fs from 'node:fs';
import path from 'node:path';
import { bootSimEngine } from '../src/sim/arena';
import { World } from '../src/engine/world';
import { CLASSES } from '../src/data/classes';
import { PASSIVE_NODES, PASSIVE_ADJACENCY, classStartNode, vocationGateNodeId } from '../src/data/passives';
import { CHOICE_GROUPS, PASSIVE_CHOICE_CFG, choiceLockReason, registerChoiceGroup } from '../src/data/passiveChoices';
import { PASSIVE_REALMS, registerPassiveRealm } from '../src/data/passiveRealms';
import { VOCATIONS, VOCATION_CFG, vocationRootId } from '../src/data/vocations';
import { passiveRefund } from '../src/engine/passiveRefund';
import { DEV } from '../src/config';
import { mulberry32 } from '../src/sim/rng';
bootSimEngine();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const projection = () => clone({ schemaVersion: 1, capability: 'passive-policy/v1', contentId: 'hollow-wake-passive-reference/v1',
  ...PASSIVE_CHOICE_CFG, requireVocationGate: VOCATION_CFG.requireGateNode,
  nodes: Object.values(PASSIVE_NODES).map(n => ({ id: n.id, name: n.name, realm: n.realm, vocation: n.vocation, choice: n.choice, graft: n.graft })),
  adjacency: PASSIVE_ADJACENCY,
  groups: Object.values(CHOICE_GROUPS).map(g => ({ id: g.id, pick: g.pick, unique: g.unique, deal: g.deal, options: g.options.map(o => ({ id: o.id, graft: o.graft })) })),
  realms: Object.values(PASSIVE_REALMS).map(r => ({ id: r.id, roots: r.roots, adjacency: r.adjacency, currency: r.currency, unlockLedger: r.unlockLedger })),
  classes: CLASSES.map(c => ({ id: c.id, startNode: classStartNode(c.id) })),
  vocations: Object.keys(VOCATIONS).map(id => ({ id, root: vocationRootId(id), gate: vocationGateNodeId(id) })),
});
const authored = projection();
type Command = { type: string; [key: string]: any };
function rig(classId: string, overrides: Record<string, any> = {}) {
  const w: any = Object.create(World.prototype);
  const m: any = { classDef: CLASSES.find(c => c.id === classId), allocated: new Set([classStartNode(classId)]), choices: {}, grafts: {},
    vocations: [], passivePoints: 500, vocationPoints: 500, realmPoints: {}, knownSkills: new Map(), ...overrides };
  w.localSeat = { meta: m, actor: {} }; w.ledger = {}; w.actors = []; w.charDirty = false;
  let events: string[] = [], serviceRefusal: string | null = null;
  w.recalcSeat = () => events.push('recalc'); w.refreshPassiveCompany = () => events.push('company');
  w.markMetaDirty = () => events.push('dirty'); w.resyncMinionSupports = () => events.push('supports');
  w.passiveRefundRefusal = () => serviceRefusal; w.failNote = (_a: any, _key: any, why: string) => events.push(`refused:${why}`);
  const snapshot = () => clone({ classId, allocated: [...m.allocated], choices: m.choices, grafts: m.grafts, vocations: m.vocations,
    passivePoints: m.passivePoints, vocationPoints: m.vocationPoints, realmPoints: m.realmPoints });
  const initial = snapshot(), steps: any[] = [];
  const step = (command: Command) => {
    events = []; const before = new Set(m.allocated); let result: any;
    const previousDev = DEV.showAllRealms;
    try {
      DEV.showAllRealms = command.openAllRealms ?? false;
      w.ledger = command.ledger ?? {};
      if (command.type === 'allocate') result = w.allocateNode(command.id, undefined, command.option);
      else if (command.type === 'quote') result = passiveRefund(m, command.id);
      else if (command.type === 'refund') {
        serviceRefusal = command.serviceRefusal ?? null;
        const quote = passiveRefund(m, command.id);
        const accepted = w.refundPassiveNode(command.id);
        result = { accepted, quote, refusal: serviceRefusal ?? quote.refusal };
      } else if (command.type === 'roots') w.ensureOpenRealmRoots();
      else if (command.type === 'grant') w.grantRealmPoints(command.currency, command.amount);
      else if (command.type === 'bind') {
        m.knownSkills = new Map(command.knownSkills.map((key: string) => [key, {}]));
        result = w.bindGraft(command.key, command.skillId);
      } else if (command.type === 'choice') result = choiceLockReason(PASSIVE_NODES[command.id], command.option, m.choices, PASSIVE_NODES);
      else throw new Error('Unknown command');
    } finally { DEV.showAllRealms = previousDev; }
    steps.push(clone({ command, result, events, rootsAdded: [...m.allocated].filter(id => !before.has(id) && id !== command.id), expected: snapshot() }));
  };
  return { m, initial, steps, step };
}
const scenarios: any[] = [];
for (const c of CLASSES) {
  const r = rig(c.id), rng = mulberry32(81293 + scenarios.length);
  for (let i = 0; i < 240; i++) {
    const owned = [...r.m.allocated] as string[];
    if (i % 5 === 0) r.step({ type: 'refund', id: owned[Math.floor(rng() * owned.length)] });
    else {
      const candidates = [...new Set(owned.flatMap(id => PASSIVE_ADJACENCY[id] ?? []))];
      const key = candidates[Math.floor(rng() * candidates.length)], n = PASSIVE_NODES[key], g = n.choice && CHOICE_GROUPS[n.choice.group];
      r.step({ type: 'allocate', id: key, option: g && i % 7 ? g.options[Math.floor(rng() * g.options.length)].id : undefined });
    }
  }
  scenarios.push({ name: `authored-${c.id}`, ...r, m: undefined, step: undefined });
}
// Synthetic registered content exercises policies that shipped content may not currently reach.
const start = classStartNode(CLASSES[0].id);
const plant = (id: string, links: string[], extra: any = {}) => {
  PASSIVE_NODES[id] = { id, name: id, description: '', kind: 'small', x: 0, y: 0, links, ...extra };
  PASSIVE_ADJACENCY[id] = [...links]; for (const to of links) (PASSIVE_ADJACENCY[to] ??= []).push(id);
};
for (const [id, settings] of Object.entries({ each: {}, multi: { pick: 2 }, unique: { unique: 'character' }, sole: { deal: 'sole', pick: 2 }, first: { deal: 'first' } })) {
  registerChoiceGroup({ id: `sdk_${id}`, name: id, ...settings, options: [
    { id: 'a', name: 'A', description: '', graft: { support: 'added_fire' } }, { id: 'b', name: 'B', description: '' }, { id: 'c', name: 'C', description: '' },
  ] } as any);
  plant(`sdk_${id}_1`, [start], { choice: { group: `sdk_${id}` }, graft: { support: 'added_fire' } });
  plant(`sdk_${id}_2`, [start], { choice: { group: `sdk_${id}` } });
}
plant('sdk_bridge', [start]); plant('sdk_leaf', ['sdk_bridge']); plant('sdk_route', [start, 'sdk_leaf']);
plant('sdk_cycle_a', ['sdk_bridge']); plant('sdk_cycle_b', ['sdk_cycle_a']); plant('sdk_cycle_c', ['sdk_cycle_a', 'sdk_cycle_b']);
registerPassiveRealm({ id: 'sdk_realm', label: 'Test', roots: ['sdk_root'], currency: 'sdk_points', unlockLedger: 'sdk_open' });
plant('sdk_root', [], { realm: 'sdk_realm' }); plant('sdk_realm_leaf', ['sdk_root'], { realm: 'sdk_realm' });
plant('sdk_cross_domain', ['sdk_leaf'], { realm: 'sdk_realm' });
registerPassiveRealm({ id: 'sdk_free', label: 'Free', adjacency: 'free', currency: 'sdk_free_points' });
plant('sdk_free_node', [], { realm: 'sdk_free' });
const synthetic = rig(CLASSES[0].id);
const commands: Command[] = [
  ...['__proto__','constructor','missing', start].map(id => ({ type: 'allocate', id })),
  { type: 'allocate', id: 'sdk_leaf' }, { type: 'allocate', id: 'sdk_bridge' }, { type: 'allocate', id: 'sdk_leaf' },
  { type: 'refund', id: 'sdk_bridge' }, { type: 'allocate', id: 'sdk_route' }, { type: 'refund', id: 'sdk_bridge' },
  { type: 'refund', id: 'sdk_route' }, { type: 'refund', id: 'sdk_leaf' }, { type: 'refund', id: 'sdk_route' },
  ...['sdk_bridge','sdk_cycle_a','sdk_cycle_b','sdk_cycle_c'].map(id => ({ type: 'allocate', id })),
  { type: 'refund', id: 'sdk_bridge' }, ...['sdk_cycle_c','sdk_cycle_b','sdk_cycle_a','sdk_bridge'].map(id => ({ type: 'refund', id })),
];
for (const g of ['each','multi','unique','sole','first']) commands.push(
  { type: 'allocate', id: `sdk_${g}_1` }, { type: 'allocate', id: `sdk_${g}_1`, option: 'missing' },
  { type: 'allocate', id: `sdk_${g}_1`, option: 'a' }, { type: 'allocate', id: `sdk_${g}_1`, option: 'a' },
  { type: 'allocate', id: `sdk_${g}_1`, option: 'b' }, { type: 'allocate', id: `sdk_${g}_1`, option: 'c' },
  { type: 'choice', id: `sdk_${g}_2`, option: 'a' }, { type: 'allocate', id: `sdk_${g}_2`, option: 'a' },
  { type: 'allocate', id: `sdk_${g}_2`, option: 'b' }, { type: 'allocate', id: `sdk_${g}_2` },
  { type: 'bind', key: `sdk_${g}_1`, skillId: 'cleave', knownSkills: ['cleave'] },
  { type: 'bind', key: `sdk_${g}_1:a`, skillId: 'cleave', knownSkills: ['cleave'] },
  { type: 'bind', key: `sdk_${g}_1:a`, skillId: 'unknown', knownSkills: ['cleave'] },
  { type: 'quote', id: `sdk_${g}_1` }, { type: 'refund', id: `sdk_${g}_1`, serviceRefusal: 'Host service unavailable.' },
  { type: 'refund', id: `sdk_${g}_1` }, { type: 'refund', id: `sdk_${g}_2` }, { type: 'refund', id: `sdk_${g}_1` },
);
commands.push(
  { type: 'allocate', id: 'sdk_realm_leaf' }, { type: 'allocate', id: 'sdk_realm_leaf', ledger: { sdk_open: 1 } },
  { type: 'grant', currency: 'sdk_points', amount: 3.6 }, { type: 'allocate', id: 'sdk_realm_leaf', ledger: { sdk_open: 1 } },
  { type: 'refund', id: 'sdk_root' }, { type: 'refund', id: 'sdk_realm_leaf' },
  { type: 'grant', currency: 'sdk_points', amount: -8.4 }, { type: 'grant', currency: 'passive', amount: 4 },
  { type: 'grant', currency: 'sdk_free_points', amount: 1 }, { type: 'allocate', id: 'sdk_free_node' }, { type: 'refund', id: 'sdk_free_node' },
  { type: 'roots', openAllRealms: true }, { type: 'roots', openAllRealms: true },
);
commands.forEach(synthetic.step); scenarios.push({ name: 'registered-policy-cases', policy: projection(), initial: synthetic.initial, steps: synthetic.steps });
// Every vocation gets its own gate, root, spend and refund observations.
for (const v of Object.values(VOCATIONS)) {
  const gate = vocationGateNodeId(v.id)!, root = vocationRootId(v.id), leaf = PASSIVE_ADJACENCY[root]?.[0];
  if (!leaf) throw new Error(`Vocation has no testable leaf: ${v.id}`);
  const r = rig(CLASSES[0].id, { vocations: [v.id], allocated: new Set([start, root]) });
  r.step({ type: 'allocate', id: leaf });
  if (gate !== start) { PASSIVE_ADJACENCY[start].push(gate); PASSIVE_ADJACENCY[gate].push(start); r.step({ type: 'allocate', id: gate }); }
  const g = PASSIVE_NODES[leaf].choice && CHOICE_GROUPS[PASSIVE_NODES[leaf].choice!.group];
  r.step({ type: 'allocate', id: leaf, option: g?.options[0].id }); r.step({ type: 'refund', id: gate });
  r.step({ type: 'refund', id: root }); r.step({ type: 'refund', id: leaf }); r.step({ type: 'refund', id: gate });
  // Keep the precise graph at the time this scenario ran: later test registrations can add edges.
  scenarios.push({ name: `vocation-${v.id}`, policy: projection(), initial: r.initial, steps: r.steps });
}
const output = process.argv[2]; fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'passives.json'), JSON.stringify({ schemaVersion: 1, authored, synthetic: projection(), scenarios }) + '\n');
console.log(`Recorded ${scenarios.length} passive scenarios and ${scenarios.reduce((n, s) => n + s.steps.length, 0)} original transitions.`);
