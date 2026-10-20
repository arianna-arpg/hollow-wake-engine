import { copy, freeze, integer } from './validation.js';

export interface PassiveGraft { support: string; level?: number }
export interface PassiveChoiceRef { group: string; pick?: number; allocatedDefault?: string }
export interface PassivePolicyNode {
  id: string; name: string; realm?: string; vocation?: string;
  choice?: PassiveChoiceRef; graft?: PassiveGraft;
}
export interface PassivePolicyGroup {
  id: string; pick?: number; unique?: 'node' | 'character'; deal?: 'each' | 'sole' | 'first';
  options: { id: string; graft?: PassiveGraft }[];
}
export interface PassivePolicyRealm {
  id: string; roots?: string[]; adjacency?: 'tree' | 'free'; currency?: string; unlockLedger?: string;
}
/** Policy projection only. Modifier, conduit and support execution is not part of this capability. */
export interface PassivePolicyPack {
  schemaVersion: 1; capability: 'passive-policy/v1'; contentId: string;
  defaultPick: number; pickCost: number; requireVocationGate: boolean;
  nodes: PassivePolicyNode[]; adjacency: Record<string, string[]>;
  groups: PassivePolicyGroup[]; realms: PassivePolicyRealm[];
  classes: { id: string; startNode: string }[];
  vocations: { id: string; root: string; gate: string | null }[];
}
export interface PassiveBuildState {
  classId: string; allocated: string[]; choices: Record<string, string[]>; grafts: Record<string, string | null>;
  vocations: string[]; passivePoints: number; vocationPoints: number; realmPoints: Record<string, number>;
}
export interface PassiveSnapshot extends PassiveBuildState {
  schemaVersion: 1; capability: 'passive-policy/v1'; contentId: string;
}
export interface PassiveRefund { points: number; currency: string; refusal: string | null }
export interface PassiveAllocation { accepted: boolean; rootsAdded: string[] }
export interface PassiveAccess { ledger: Readonly<Record<string, number>>; openAllRealms?: boolean }

const reserved = new Set(['__proto__', 'prototype', 'constructor']);
function id(value: string): void {
  if (typeof value !== 'string' || !value || reserved.has(value)) throw new Error('Invalid passive policy identity');
}
function registry<T extends { id: string }>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) { id(row.id); if (out.has(row.id)) throw new Error(`Duplicate passive id: ${row.id}`); out.set(row.id, row); }
  return out;
}
function required<T>(map: ReadonlyMap<string, T>, key: string): T {
  if (!map.has(key)) throw new Error(`Unknown passive reference: ${key}`);
  return map.get(key)!;
}
function plainFields(value: object, allowed: string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unsupported passive policy field: ${key}`);
}

/** Immutable content plus a compact graph. No process-wide registries or per-character scratch here. */
export class PassivePolicy {
  readonly pack: PassivePolicyPack;
  #nodes: Map<string, PassivePolicyNode>;
  #groups: Map<string, PassivePolicyGroup>;
  #realms: Map<string, PassivePolicyRealm>;
  #classes: Map<string, { id: string; startNode: string }>;
  #vocations: Map<string, { id: string; root: string; gate: string | null }>;
  #indices = new Map<string, number>();
  #offsets: Uint32Array;
  #edges: Uint32Array;
  #domains: Uint32Array;

  constructor(input: PassivePolicyPack) {
    const p = copy(input);
    plainFields(p, ['schemaVersion','capability','contentId','defaultPick','pickCost','requireVocationGate','nodes','adjacency','groups','realms','classes','vocations']);
    if (p.schemaVersion !== 1 || p.capability !== 'passive-policy/v1') throw new Error('Unsupported passive policy');
    id(p.contentId); integer(p.defaultPick, 1, 'defaultPick'); integer(p.pickCost, 1, 'pickCost');
    if (typeof p.requireVocationGate !== 'boolean') throw new Error('Invalid vocation gate policy');
    this.pack = p;
    this.#nodes = registry(p.nodes); this.#groups = registry(p.groups); this.#realms = registry(p.realms);
    this.#classes = registry(p.classes); this.#vocations = registry(p.vocations);
    required(this.#realms, 'tree');
    if (!p.nodes.length || p.nodes.length > 1_000_000) throw new Error('Passive graph size is outside supported bounds');
    p.nodes.forEach((n, i) => this.#indices.set(n.id, i));
    const checkGraft = (g: PassiveGraft | undefined): void => {
      if (!g) return; plainFields(g, ['support','level']); id(g.support);
      if (g.level !== undefined) integer(g.level, 1, 'graft level');
    };
    for (const g of p.groups) {
      plainFields(g, ['id','pick','unique','deal','options']); registry(g.options);
      if (g.pick !== undefined) integer(g.pick, 1, 'group pick limit');
      if (!['node','character'].includes(g.unique ?? 'node') || !['each','sole','first'].includes(g.deal ?? 'each')) throw new Error('Invalid choice policy');
      for (const o of g.options) { plainFields(o, ['id','graft']); checkGraft(o.graft); }
    }
    for (const r of p.realms) {
      plainFields(r, ['id','roots','adjacency','currency','unlockLedger']);
      if (!['tree','free'].includes(r.adjacency ?? 'tree')) throw new Error('Invalid realm adjacency');
      if (r.currency !== undefined) id(r.currency); if (r.unlockLedger !== undefined) id(r.unlockLedger);
      for (const root of r.roots ?? []) {
        const n = required(this.#nodes, root);
        if ((n.realm ?? 'tree') !== r.id) throw new Error('Realm root belongs to another realm');
      }
    }
    for (const c of p.classes) { plainFields(c, ['id','startNode']); required(this.#nodes, c.startNode); }
    for (const v of p.vocations) {
      plainFields(v, ['id','root','gate']); required(this.#nodes, v.root);
      if (v.gate !== null) required(this.#nodes, v.gate);
    }
    this.#offsets = new Uint32Array(p.nodes.length + 1); this.#domains = new Uint32Array(p.nodes.length);
    const domains = new Map<string, number>(), edges: number[] = [];
    for (let i = 0; i < p.nodes.length; i++) {
      const n = p.nodes[i];
      plainFields(n, ['id','name','realm','vocation','choice','graft']);
      if (typeof n.name !== 'string') throw new Error('Invalid passive node name');
      required(this.#realms, n.realm ?? 'tree');
      if (n.vocation !== undefined) required(this.#vocations, n.vocation);
      if (n.choice) {
        plainFields(n.choice, ['group','pick','allocatedDefault']); const g = required(this.#groups, n.choice.group);
        if (n.choice.pick !== undefined) integer(n.choice.pick, 1, 'node pick limit');
        if (this.pickLimit(n) > g.options.length) throw new Error('Choice limit exceeds available options');
        if (n.choice.allocatedDefault !== undefined && !g.options.some(o => o.id === n.choice!.allocatedDefault)) throw new Error('Unknown allocated default');
      }
      checkGraft(n.graft);
      const domain = n.vocation !== undefined ? `vocation:${n.vocation}` : `realm:${n.realm ?? 'tree'}`;
      if (!domains.has(domain)) domains.set(domain, domains.size);
      this.#domains[i] = domains.get(domain)!;
      if (!Object.hasOwn(p.adjacency, n.id) || !Array.isArray(p.adjacency[n.id])) throw new Error('Missing passive adjacency row');
      this.#offsets[i] = edges.length;
      for (const next of p.adjacency[n.id]) edges.push(required(this.#indices, next));
    }
    for (const key of Object.keys(p.adjacency)) required(this.#nodes, key);
    this.#offsets[p.nodes.length] = edges.length; this.#edges = Uint32Array.from(edges);
    this.pack = freeze(p);
  }
  node(key: string): PassivePolicyNode | undefined { return this.#nodes.get(key); }
  index(key: string): number | undefined { return this.#indices.get(key); }
  group(n: PassivePolicyNode): PassivePolicyGroup | undefined { return n.choice && this.#groups.get(n.choice.group); }
  realm(n: PassivePolicyNode): PassivePolicyRealm { return this.#realms.get(n.realm ?? 'tree')!; }
  start(classId: string): string { return required(this.#classes, classId).startNode; }
  vocation(key: string): { id: string; root: string; gate: string | null } { return required(this.#vocations, key); }
  pickLimit(n: PassivePolicyNode): number { const g = this.group(n); return g ? Math.max(1, n.choice?.pick ?? g.pick ?? this.pack.defaultPick) : 0; }
  open(r: PassivePolicyRealm, access: PassiveAccess): boolean { return !r.unlockLedger || access.openAllRealms === true || (access.ledger[r.unlockLedger] ?? 0) >= 1; }
  adjacent(index: number, allocated: ReadonlySet<string>): boolean {
    for (let at = this.#offsets[index]; at < this.#offsets[index + 1]; at++) if (allocated.has(this.pack.nodes[this.#edges[at]].id)) return true;
    return false;
  }
  /** Internal graph walk uses caller-owned bounded scratch, with no temporary Set or queue. */
  reach(queue: Uint32Array, seen: Uint8Array, count: number, allocated: ReadonlySet<string>, removed: number): void {
    for (let at = 0; at < count; at++) {
      const current = queue[at];
      for (let e = this.#offsets[current]; e < this.#offsets[current + 1]; e++) {
        const next = this.#edges[e];
        if (next !== removed && !seen[next] && this.#domains[next] === this.#domains[current] && allocated.has(this.pack.nodes[next].id)) {
          seen[next] = 1; queue[count++] = next;
        }
      }
    }
  }
  create(state: PassiveBuildState): PassiveBuild { return new PassiveBuild(this, state); }
  restore(snapshot: PassiveSnapshot): PassiveBuild {
    if (snapshot.schemaVersion !== 1 || snapshot.capability !== this.pack.capability || snapshot.contentId !== this.pack.contentId) throw new Error('Passive snapshot content mismatch');
    return this.create(snapshot);
  }
}

/** An owned build. Hosts authorize grants, vocation awards, ledger access and Font availability. */
export class PassiveBuild {
  #state: PassiveBuildState;
  #allocated: Set<string>;
  #queue: Uint32Array;
  #seen: Uint8Array;
  constructor(readonly policy: PassivePolicy, input: PassiveBuildState) {
    const s = copy(input); policy.start(s.classId);
    for (const key of s.allocated) if (!policy.node(key)) throw new Error(`Unknown allocated node: ${key}`);
    if (new Set(s.allocated).size !== s.allocated.length) throw new Error('Duplicate allocated node');
    if (new Set(s.vocations).size !== s.vocations.length) throw new Error('Duplicate earned vocation');
    for (const key of s.vocations) policy.vocation(key);
    for (const value of [s.passivePoints, s.vocationPoints, ...Object.values(s.realmPoints)]) integer(value, 0, 'passive wallet');
    for (const key of Object.keys(s.realmPoints)) id(key);
    this.#state = s; this.#allocated = new Set(s.allocated);
    // Strict loading is deliberate: legacy repair is a separate, explicit migration boundary.
    const accepted: Record<string, string[]> = {};
    for (const [key, picks] of Object.entries(s.choices)) {
      const n = policy.node(key);
      if (!n || !this.#allocated.has(key) || !Array.isArray(picks)) throw new Error('Invalid saved choice node');
      accepted[key] = [];
      for (const option of picks) {
        if (this.#choiceLock(n, option, accepted) !== null) throw new Error('Invalid saved passive choice');
        accepted[key].push(option);
      }
    }
    for (const [key, value] of Object.entries(s.grafts)) {
      id(key); if (value !== null) id(value);
      if (!this.#graftLive(key)) throw new Error('Invalid saved graft source');
    }
    this.#queue = new Uint32Array(policy.pack.nodes.length); this.#seen = new Uint8Array(policy.pack.nodes.length);
  }
  snapshot(): PassiveSnapshot {
    return { ...copy(this.#state), allocated: [...this.#allocated], schemaVersion: 1, capability: 'passive-policy/v1', contentId: this.policy.pack.contentId };
  }
  #claimant(n: PassivePolicyNode, choices = this.#state.choices): string | null {
    const g = this.policy.group(n);
    if (!g || (g.deal ?? 'each') === 'each') return null;
    for (const key of Object.keys(choices)) if (key !== n.id && choices[key].length && this.policy.node(key)?.choice?.group === g.id) return key;
    return null;
  }
  #choiceLock(n: PassivePolicyNode, option: string, choices = this.#state.choices): string | null {
    const g = this.policy.group(n);
    if (!g) return 'not a choice node';
    if (!g.options.some(o => o.id === option)) return 'no such option';
    const claimant = this.#claimant(n, choices);
    if (claimant !== null) return `${g.deal === 'sole' ? 'cluster claimed' : 'deal spent'} at ${this.policy.node(claimant)!.name}`;
    const picks = Object.hasOwn(choices, n.id) ? choices[n.id] : [];
    if (picks.includes(option)) return 'already chosen here';
    if (picks.length >= this.policy.pickLimit(n)) return 'all picks made';
    if (g.unique === 'character') for (const key of Object.keys(choices)) {
      if (key !== n.id && choices[key].includes(option) && this.policy.node(key)?.choice?.group === g.id) return `taken at ${this.policy.node(key)!.name}`;
    }
    return null;
  }
  choiceLock(nodeId: string, option: string): string | null { const n = this.policy.node(nodeId); return n ? this.#choiceLock(n, option) : 'not a choice node'; }
  #seed(r: PassivePolicyRealm, added: string[]): void {
    for (const key of r.roots ?? []) if (!this.#allocated.has(key)) { this.#allocated.add(key); added.push(key); }
  }
  ensureOpenRoots(access: PassiveAccess): string[] {
    const added: string[] = [];
    for (const r of this.policy.pack.realms) if (this.policy.open(r, access)) this.#seed(r, added);
    return added;
  }
  #gate(vocation: string, removed?: string): boolean {
    const gate = this.policy.vocation(vocation).gate;
    return !this.policy.pack.requireVocationGate || gate === null || (gate !== removed && this.#allocated.has(gate));
  }
  allocate(nodeId: string, access: PassiveAccess, option?: string): PassiveAllocation {
    const result: PassiveAllocation = { accepted: false, rootsAdded: [] }, n = this.policy.node(nodeId);
    if (!n) return result;
    const r = this.policy.realm(n);
    if (!this.policy.open(r, access)) return result;
    this.#seed(r, result.rootsAdded); // Original order: root grants survive a refused purchase.
    const already = this.#allocated.has(nodeId), g = this.policy.group(n);
    let cost = 1;
    if (n.choice && !(g?.deal === 'first' && this.#claimant(n) !== null)) {
      if (option === undefined || this.#choiceLock(n, option) !== null) return result;
      cost = this.policy.pack.pickCost;
    } else if (already || option !== undefined) return result;
    if (!already && r.adjacency !== 'free' && !this.policy.adjacent(this.policy.index(nodeId)!, this.#allocated)) return result;
    const s = this.#state;
    if (n.vocation !== undefined) {
      if (!s.vocations.includes(n.vocation) || !this.#gate(n.vocation) || s.vocationPoints < cost) return result;
      s.vocationPoints -= cost;
    } else if ((r.currency ?? 'passive') === 'passive') {
      if (s.passivePoints < cost) return result; s.passivePoints -= cost;
    } else {
      const have = s.realmPoints[r.currency!] ?? 0;
      if (have < cost) return result; s.realmPoints[r.currency!] = have - cost;
    }
    if (n.choice && option !== undefined) (s.choices[nodeId] ??= []).push(option);
    this.#allocated.add(nodeId); result.accepted = true; return result;
  }
  quoteRefund(nodeId: string): PassiveRefund {
    const no = (refusal: string): PassiveRefund => ({ points: 0, currency: 'passive', refusal });
    const p = this.policy, n = p.node(nodeId), s = this.#state;
    if (!n || !this.#allocated.has(nodeId)) return no('This node is not allocated.');
    const seen = this.#seen, queue = this.#queue, removed = p.index(nodeId)!;
    seen.fill(0); let count = 0, rootRemoved = false;
    const seed = (key: string): void => {
      if (key === nodeId) { rootRemoved = true; return; }
      const index = p.index(key)!;
      if (this.#allocated.has(key) && !seen[index]) { seen[index] = 1; queue[count++] = index; }
    };
    seed(p.start(s.classId));
    for (const key of s.vocations) seed(p.vocation(key).root);
    for (const r of p.pack.realms) for (const key of r.roots ?? []) seed(key);
    if (rootRemoved) return no('This starting node was granted freely.');
    const picks = s.choices[nodeId]?.length ?? 0;
    if (picks && p.group(n)?.deal === 'first') for (const key of this.#allocated) {
      if (key !== nodeId && p.node(key)!.choice?.group === n.choice?.group) return no(`Refund ${p.node(key)!.name}'s shared path first.`);
    }
    for (const key of this.#allocated) {
      if (key === nodeId) continue;
      const other = p.node(key)!;
      if (other.vocation && key !== p.vocation(other.vocation).root && !this.#gate(other.vocation, nodeId)) return no('Refund the dependent Vocation nodes before removing their gate.');
      if (!other.vocation && p.realm(other).adjacency === 'free') seed(key);
    }
    p.reach(queue, seen, count, this.#allocated, removed);
    for (const key of this.#allocated) if (key !== nodeId && !seen[p.index(key)!]) return no('Keep a connected path to every allocated node. Refund the outer nodes first.');
    return { points: picks ? picks * p.pack.pickCost : 1, currency: n.vocation ? 'vocation' : p.realm(n).currency ?? 'passive', refusal: null };
  }
  refund(nodeId: string, serviceRefusal: string | null = null): PassiveRefund {
    const result = this.quoteRefund(nodeId);
    if (serviceRefusal !== null) return { points: 0, currency: 'passive', refusal: serviceRefusal };
    if (result.refusal !== null) return result;
    const s = this.#state, n = this.policy.node(nodeId)!;
    const have = n.vocation !== undefined ? s.vocationPoints : result.currency === 'passive' ? s.passivePoints : s.realmPoints[result.currency] ?? 0;
    integer(have + result.points, 0, 'refunded wallet'); // Refuse numeric overflow before mutation.
    this.#allocated.delete(nodeId); delete s.choices[nodeId];
    for (const key of Object.keys(s.grafts)) if (key === nodeId || key.startsWith(nodeId + ':')) delete s.grafts[key];
    if (n.vocation !== undefined) s.vocationPoints += result.points;
    else if (result.currency === 'passive') s.passivePoints += result.points;
    else s.realmPoints[result.currency] = have + result.points;
    return result;
  }
  grantRealmPoints(currency: string, amount: number): boolean {
    if (!currency || currency === 'passive' || !Number.isFinite(amount)) return false;
    id(currency); const value = Math.max(0, (this.#state.realmPoints[currency] ?? 0) + Math.round(amount));
    integer(value, 0, 'realm wallet'); this.#state.realmPoints[currency] = value; return true;
  }
  #graftLive(key: string): boolean {
    for (const nodeId of this.#allocated) {
      const n = this.policy.node(nodeId)!;
      if (key === nodeId && n.graft) return true;
      if (n.choice) for (const option of this.#state.choices[nodeId] ?? []) {
        if (key === `${nodeId}:${option}` && this.policy.group(n)?.options.some(o => o.id === option && o.graft)) return true;
      }
    }
    return false;
  }
  bindGraft(key: string, skillId: string | null, knownSkills: ReadonlySet<string>): boolean {
    if (!this.#graftLive(key) || (skillId !== null && !knownSkills.has(skillId))) return false;
    if ((this.#state.grafts[key] ?? null) !== skillId) this.#state.grafts[key] = skillId;
    return true;
  }
}
