import {finite, freeze, integer} from './validation.js';

/** Graph fields only. A caller's node type may carry additional typed payloads. */
export interface SkillTreeNode {
  id: string; name: string; description?: string;
  links?: string[]; excludes?: string[]; ranks?: number;
  empowermentPassive?: boolean; x?: number; y?: number;
  kind?: 'minor' | 'major' | 'keystone';
}
export interface SkillTreeBranch<N extends SkillTreeNode = SkillTreeNode> {
  id: string; name: string; description?: string; rungs: N[];
}
export interface SkillTreeSpec<N extends SkillTreeNode = SkillTreeNode> {
  level: number; nodes?: N[]; branches?: SkillTreeBranch<N>[]; neutral?: N;
}
export interface SkillTreeLayout {
  ring: number; forkArc: readonly [number, number]; freeArc: readonly [number, number];
  minBox: {w: number; h: number}; pad: number;
  radius: Record<'root' | 'minor' | 'major' | 'keystone', number>;
}
export const DEFAULT_SKILL_TREE_LAYOUT: SkillTreeLayout = freeze({
  ring: 120, forkArc: [-210, 30], freeArc: [30, 150],
  minBox: {w: 560, h: 420}, pad: 48,
  radius: {root: 20, minor: 9, major: 14, keystone: 17},
});
export interface SkillGraphNode<N extends SkillTreeNode = SkillTreeNode> {
  id: string; node: N; links: string[]; excludes: Set<string>; ranks: number;
  depth: number; children: string[]; limbId?: string;
  x: number; y: number; kind: 'minor' | 'major' | 'keystone';
}
export interface CompiledSkillTree<N extends SkillTreeNode = SkillTreeNode> {
  nodes: Map<string, SkillGraphNode<N>>; order: string[]; rootChildren: string[];
  limbs: SkillTreeBranch<N>[]; limbRoots: Map<string, string>; dupes: string[];
  box: {minX: number; minY: number; w: number; h: number};
  /** Authored-order reverse links; avoid rescanning every node during traversal. */
  dependents: Map<string, string[]>;
}

/** Compile a host-owned graph view. Node and authored branch identities are
 * retained deliberately. The caller owns this result and must keep topology
 * stable until recompilation. SkillProgression supplies the immutable mode. */
export function compileSkillTree<N extends SkillTreeNode>(
  spec: SkillTreeSpec<N>, layout: SkillTreeLayout = DEFAULT_SKILL_TREE_LAYOUT,
): CompiledSkillTree<N> {
  integer(spec.level, 1, 'Tree opening level');
  const rows: {node: N; links: string[]; excludes: string[]; kind?: N['kind']; limbId?: string; branch?: SkillTreeBranch<N>}[] = [];
  const branches = spec.branches ?? [];
  const forkIds = branches.map(b => b.rungs[0]?.id).filter((id): id is string => !!id);
  for (const branch of branches) {
    branch.rungs.forEach((node, index) => rows.push({
      node, links: [...(index === 0 ? [] : [branch.rungs[index - 1].id]), ...(node.links ?? [])],
      excludes: [...(index === 0 ? forkIds.filter(id => id !== node.id) : []), ...(node.excludes ?? [])],
      kind: node.kind ?? (index === 0 ? 'major' : index === branch.rungs.length - 1 ? 'keystone' : 'minor'),
      limbId: index === 0 ? branch.id : undefined, branch: index === 0 ? branch : undefined,
    }));
  }
  if (spec.neutral) rows.push({node: spec.neutral, links: [...(spec.neutral.links ?? [])], excludes: [...(spec.neutral.excludes ?? [])], kind: spec.neutral.kind ?? 'minor'});
  for (const node of spec.nodes ?? []) rows.push({node, links: [...(node.links ?? [])], excludes: [...(node.excludes ?? [])], kind: node.kind});
  if (rows.length > 4096) throw new Error('Skill tree exceeds 4096 node rows');
  const nodes = new Map<string, SkillGraphNode<N>>(), dupes: string[] = [];
  const forkLimb = new Map<string, string>(), forkBranch = new Map<string, SkillTreeBranch<N>>();
  for (const row of rows) {
    const {node} = row, id = node.id;
    if (typeof id !== 'string' || !id || typeof node.name !== 'string') throw new Error('Invalid skill node identity');
    if (nodes.has(id)) { dupes.push(id); continue; }
    for (const links of [row.links, row.excludes]) if (links.length > 4096 || links.some(l => typeof l !== 'string' || !l)) throw new Error('Invalid skill node link');
    const ranks = Math.max(1, Math.floor(finite(node.ranks ?? 1, 'Node ranks')));
    integer(ranks, 1, 'Node ranks');
    if (node.x !== undefined) finite(node.x, 'Node x');
    if (node.y !== undefined) finite(node.y, 'Node y');
    const kind = row.kind ?? 'minor';
    if (!['minor', 'major', 'keystone'].includes(kind)) throw new Error('Invalid skill node kind');
    nodes.set(id, {id, node, links: [...new Set(row.links.filter(l => l !== id))],
      excludes: new Set(row.excludes.filter(l => l !== id)), ranks,
      depth: 0, children: [], x: 0, y: 0, kind});
    if (row.limbId) forkLimb.set(id, row.limbId);
    if (row.branch) forkBranch.set(id, row.branch);
  }
  const dependents = new Map<string, string[]>();
  for (const node of nodes.values()) {
    for (const ex of node.excludes) nodes.get(ex)?.excludes.add(node.id);
    for (const link of node.links) {
      const list = dependents.get(link);
      if (list) list.push(node.id); else dependents.set(link, [node.id]);
    }
  }
  const rootChildren = [...nodes.values()].filter(n => !n.links.length).map(n => n.id);
  const order: string[] = [], seen = new Set(rootChildren), queue = [...rootChildren];
  for (const id of rootChildren) nodes.get(id)!.depth = 1;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor], node = nodes.get(id)!;
    order.push(id);
    for (const child of dependents.get(id) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child); const next = nodes.get(child)!;
      next.depth = node.depth + 1; node.children.push(child); queue.push(child);
    }
  }
  const limbRoots = new Map<string, string>();
  for (const id of rootChildren) {
    const node = nodes.get(id)!;
    if (!node.excludes.size) continue;
    node.limbId = forkLimb.get(id) ?? id; limbRoots.set(node.limbId, id);
    if (!forkLimb.has(id) && !node.node.kind) node.kind = 'major';
  }
  for (const id of order) {
    const node = nodes.get(id)!;
    for (const child of node.children) {
      const next = nodes.get(child)!;
      if (next.limbId === undefined) next.limbId = node.limbId;
    }
  }
  const limbs: SkillTreeBranch<N>[] = [];
  for (const [id, rootId] of limbRoots) {
    const authored = forkBranch.get(rootId);
    if (authored) { limbs.push(authored); continue; }
    const root = nodes.get(rootId)!;
    limbs.push({id, name: root.node.name, description: root.node.description,
      rungs: order.filter(key => nodes.get(key)!.limbId === id).map(key => nodes.get(key)!.node)});
  }
  const graph = {nodes, order, rootChildren, limbs, limbRoots, dupes, dependents,
    box: {minX: 0, minY: 0, w: 0, h: 0}};
  layoutTree(graph, layout);
  return graph;
}

const DEG = Math.PI / 180;
const round1 = (n: number) => Math.round(n * 10) / 10;
function layoutTree<N extends SkillTreeNode>(graph: CompiledSkillTree<N>, cfg: SkillTreeLayout): void {
  for (const value of [cfg.ring, cfg.minBox.w, cfg.minBox.h, cfg.pad, ...Object.values(cfg.radius)]) if (finite(value, 'Tree layout') < 0) throw new Error('Negative tree layout');
  if (cfg.forkArc.length !== 2 || cfg.freeArc.length !== 2) throw new Error('Invalid tree arc');
  for (const value of [...cfg.forkArc, ...cfg.freeArc]) finite(value, 'Tree arc');
  const {nodes, order, rootChildren} = graph, weights = new Map<string, number>();
  for (let index = order.length - 1; index >= 0; index--) {
    const node = nodes.get(order[index])!;
    weights.set(node.id, node.children.length ? node.children.reduce((sum, id) => sum + weights.get(id)!, 0) : 1);
  }
  const upper = rootChildren.filter(id => {const n = nodes.get(id)!; return n.children.length > 0 || n.excludes.size > 0;});
  const upperSet = new Set(upper), lower = rootChildren.filter(id => !upperSet.has(id));
  const pending: {id: string; angle: number; span: number}[] = [];
  if (!upper.length) rootChildren.forEach((id, i) => pending.push({id, angle: -90 + (360 / rootChildren.length) * i, span: 360 / rootChildren.length}));
  else {
    const [a0, a1] = cfg.forkArc, total = upper.reduce((sum, id) => sum + weights.get(id)!, 0);
    let cursor = a0;
    for (const id of upper) { const span = (a1 - a0) * weights.get(id)! / total; pending.push({id, angle: cursor + span / 2, span}); cursor += span; }
    const [f0, f1] = cfg.freeArc;
    lower.forEach((id, i) => pending.push({id, angle: f0 + (f1 - f0) * (i + 1) / (lower.length + 1), span: (f1 - f0) / (lower.length + 1)}));
  }
  // Children form an acyclic first-parent tree even when authored links share
  // descendants. An explicit work list avoids recursion depth on long chains.
  for (let cursor = 0; cursor < pending.length; cursor++) {
    let {id, angle, span} = pending[cursor]; const node = nodes.get(id)!;
    if (node.node.x !== undefined && node.node.y !== undefined) {
      node.x = node.node.x; node.y = node.node.y; angle = Math.atan2(node.y, node.x) / DEG;
    } else {
      const radius = cfg.ring * node.depth;
      node.x = round1(Math.cos(angle * DEG) * radius); node.y = round1(Math.sin(angle * DEG) * radius);
    }
    finite(node.x, 'Resolved node x'); finite(node.y, 'Resolved node y');
    const total = node.children.reduce((sum, id) => sum + weights.get(id)!, 0);
    let at = angle - span / 2;
    for (const child of node.children) {const width = span * weights.get(child)! / total; pending.push({id: child, angle: at + width / 2, span: width}); at += width;}
  }
  const radii = cfg.radius;
  let minX = -radii.root, maxX = radii.root, minY = -radii.root, maxY = radii.root + 16;
  for (const node of nodes.values()) {
    const radius = radii[node.kind]; minX = Math.min(minX, node.x - radius); maxX = Math.max(maxX, node.x + radius);
    minY = Math.min(minY, node.y - radius); maxY = Math.max(maxY, node.y + radius + 16);
  }
  const w = Math.max(maxX - minX + cfg.pad * 2, cfg.minBox.w), h = Math.max(maxY - minY + cfg.pad * 2, cfg.minBox.h);
  graph.box = {minX: round1((minX + maxX) / 2 - w / 2), minY: round1((minY + maxY) / 2 - h / 2), w: round1(w), h: round1(h)};
  for (const value of Object.values(graph.box)) finite(value, 'Resolved tree bounds');
}

export function skillTreeSpentCount(spent: readonly string[] | undefined, nodeId: string): number {
  let count = 0; for (const id of spent ?? []) if (id === nodeId) count++; return count;
}
export function sealedSkillNodes<N extends SkillTreeNode>(graph: CompiledSkillTree<N> | undefined, spent: readonly string[]): Set<string> {
  const sealed = new Set<string>(); if (!graph) return sealed;
  const owned = new Set(spent), direct = new Set<string>();
  for (const id of owned) for (const rival of graph.nodes.get(id)?.excludes ?? []) if (!owned.has(rival)) direct.add(rival);
  const reached = new Set<string>(), queue: string[] = [];
  for (const id of graph.rootChildren) if (!direct.has(id)) { reached.add(id); queue.push(id); }
  for (let at = 0; at < queue.length; at++) for (const id of graph.dependents.get(queue[at]) ?? []) {
    if (!reached.has(id) && !direct.has(id)) { reached.add(id); queue.push(id); }
  }
  for (const id of graph.order) if (!reached.has(id) && !owned.has(id)) sealed.add(id);
  return sealed;
}
export function skillTreeSealName<N extends SkillTreeNode>(graph: CompiledSkillTree<N> | undefined, spent: readonly string[], nodeId: string, sealed?: ReadonlySet<string>): string {
  const node = graph?.nodes.get(nodeId); if (!graph || !node) return nodeId;
  sealed ??= sealedSkillNodes(graph, spent);
  if (node.limbId !== undefined) {
    const root = graph.limbRoots.get(node.limbId);
    if (root !== undefined && sealed.has(root)) return graph.limbs.find(l => l.id === node.limbId)?.name ?? node.node.name;
  }
  let top = node, visited = 0;
  while (top.links.length) {
    if (++visited > graph.nodes.size) throw new Error('Cyclic skill prerequisite chain');
    const parent = graph.nodes.get(top.links[0]); if (!parent || !sealed.has(parent.id)) break; top = parent;
  }
  return top.node.name;
}
export function skillTreePrerequisite<N extends SkillTreeNode>(graph: CompiledSkillTree<N> | undefined, spent: readonly string[], nodeId: string): string | null {
  let node = graph?.nodes.get(nodeId); if (!graph || !node) return null;
  const owned = new Set(spent); let missing: string | null = null, visited = 0;
  while (node.links.length && !node.links.some(id => owned.has(id))) {
    if (++visited > graph.nodes.size) throw new Error('Cyclic skill prerequisite chain');
    const parent = graph.nodes.get(node.links[0]); if (!parent) return node.links[0]; missing = parent.node.name; node = parent;
  }
  return missing;
}
