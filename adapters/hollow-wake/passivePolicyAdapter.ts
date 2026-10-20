import { PassivePolicy, type PassiveHost, type PassiveLiveState } from '@hollow-wake/engine/passives';
import { CLASSES } from '../data/classes';
import { PASSIVE_NODES, PASSIVE_ADJACENCY, classStartNode, vocationGateNodeId } from '../data/passives';
import { CHOICE_GROUPS, PASSIVE_CHOICE_CFG } from '../data/passiveChoices';
import { PASSIVE_REALMS } from '../data/passiveRealms';
import { VOCATIONS, VOCATION_CFG, vocationRootId } from '../data/vocations';
import { DEV } from '../config';
import { refreshSdkPassiveGrants } from './passiveGrantAdapter';
import type { PlayerMeta } from './world';
type RefundMeta = Pick<PlayerMeta, 'classDef' | 'allocated' | 'choices' | 'vocations'>;
let cached: PassivePolicy | undefined, revision = 0;
const sessions = new WeakMap<RefundMeta, { policy: PassivePolicy; host: PassiveHost }>();
/** Authoring changes invalidate both projections; live character state is never cached or copied. */
export function refreshSdkPassivePolicy(): void { cached = undefined; revision++; refreshSdkPassiveGrants(); }
function content(): PassivePolicy {
  if (cached) return cached;
  const nodes = Object.values(PASSIVE_NODES), vocations = [...new Set([...Object.keys(VOCATIONS), ...nodes.flatMap(n => n.vocation ? [n.vocation] : [])])];
  cached = new PassivePolicy({ schemaVersion: 1, capability: 'passive-policy/v1', contentId: `hollow-wake-live-policy:${revision}`,
    ...PASSIVE_CHOICE_CFG, requireVocationGate: VOCATION_CFG.requireGateNode,
    nodes: nodes.map(n => ({ id: n.id, name: n.name, realm: n.realm, vocation: n.vocation, choice: n.choice, graft: n.graft })),
    adjacency: PASSIVE_ADJACENCY,
    groups: Object.values(CHOICE_GROUPS).map(g => ({ id: g.id, pick: g.pick, unique: g.unique, deal: g.deal, options: g.options.map(o => ({ id: o.id, graft: o.graft })) })),
    realms: Object.values(PASSIVE_REALMS).map(r => ({ id: r.id, roots: r.roots, adjacency: r.adjacency, currency: r.currency, unlockLedger: r.unlockLedger })),
    classes: CLASSES.map(c => ({ id: c.id, startNode: classStartNode(c.id) })),
    vocations: vocations.map(id => ({ id, root: vocationRootId(id), gate: vocationGateNodeId(id) })),
  }, { references: 'live' });
  return cached;
}
export function sdkPassiveHost(meta: RefundMeta): PassiveHost {
  const policy = content(), old = sessions.get(meta);
  if (old?.policy === policy) return old.host;
  // Refund previews receive only these four fields. Mutation callers always provide full PlayerMeta.
  const full = meta as PlayerMeta, emptyGrafts = {}, emptyWallets = {};
  const view: PassiveLiveState = {
    get classId() { return CLASSES.some(c => c.id === meta.classDef.id) ? meta.classDef.id : CLASSES.find(c => c.startNode === 'str_start')!.id; },
    get allocated() { return meta.allocated; }, get choices() { return meta.choices; },
    get vocations() { return meta.vocations; }, get grafts() { return full.grafts ?? emptyGrafts; },
    get passivePoints() { return full.passivePoints ?? 0; }, set passivePoints(value) { full.passivePoints = value; },
    get vocationPoints() { return full.vocationPoints ?? 0; }, set vocationPoints(value) { full.vocationPoints = value; },
    get realmPoints() { return full.realmPoints ?? emptyWallets; },
  };
  const host = policy.attach(view); sessions.set(meta, { policy, host }); return host;
}
export function sdkPassiveAccess(ledger: Readonly<Record<string, number>>) { return { ledger, openAllRealms: !!DEV.showAllRealms }; }
