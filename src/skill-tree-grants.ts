import type {SkillTreeNode} from './skill-tree.js';

/** These interfaces describe payload folding, not combat execution. Hosts may
 * supply richer typed records; their additional fields retain source order and
 * identity. Modifiers/effects are borrowed, never mutated by these resolvers. */
export interface SkillTreeAura<M = unknown> {selfMods?: M[]; allyMods?: M[]; enemyMods?: M[]}
export interface SkillTreeDomain<M = unknown> {allyMods?: M[]; enemyMods?: M[]; minionMods?: M[]}
export interface SkillTreeSummon<M = unknown> {
  selectPool?: string[]; crewSkills?: string[]; crewAuras?: string[];
  crewRules?: unknown[]; crewInherit?: unknown[]; crewOnDeath?: unknown[]; crewMods?: M[];
}
export interface SkillTreeOverride<M = unknown> {
  aura?: SkillTreeAura<M>; construct?: object; ground?: {domain?: SkillTreeDomain<M>}; channel?: object;
  summon?: SkillTreeSummon<M>; tags?: {add?: string[]; remove?: string[]};
  reduceCooldowns?: object; recallImpales?: object; castCycle?: object;
}
export interface SkillTreeEffect<M = unknown> {type: string; id?: string; duration?: unknown; mods?: M[]}
export interface SkillTreeBuff<M = unknown> {id: string; duration?: number; mods?: M[]}
export interface SkillTreeGrantNode<M = unknown, O extends SkillTreeOverride<M> = SkillTreeOverride<M>, E extends SkillTreeEffect<M> = SkillTreeEffect<M>> extends SkillTreeNode {
  over?: O; mods?: M[]; utilityEffects?: E[]; buffs?: SkillTreeBuff<M>[];
}
export interface SkillNodeLookup<N> {node(id: string): N | undefined}
const union = (a?: string[], b?: string[]): string[] | undefined => a || b ? [...new Set([...(a ?? []), ...(b ?? [])])].sort() : undefined;
function mergeAura<M>(a?: SkillTreeAura<M>, b?: SkillTreeAura<M>): SkillTreeAura<M> {
  return {selfMods: [...(a?.selfMods ?? []), ...(b?.selfMods ?? [])], allyMods: [...(a?.allyMods ?? []), ...(b?.allyMods ?? [])], enemyMods: [...(a?.enemyMods ?? []), ...(b?.enemyMods ?? [])]};
}
function rankAura<M>(a: SkillTreeAura<M>, ranks: number): SkillTreeAura<M> {
  return Object.fromEntries(Object.entries(a).map(([key, mods]) => {
    const result: M[] = [];
    for (let rank = 0; rank < ranks; rank++) for (const mod of mods as M[]) result.push(mod);
    return [key, result];
  }));
}
function mergeDomain<M>(a?: SkillTreeDomain<M>, b?: SkillTreeDomain<M>): SkillTreeDomain<M> | undefined {
  if (!a) return b; if (!b) return a;
  return {allyMods: [...(a.allyMods ?? []), ...(b.allyMods ?? [])], enemyMods: [...(a.enemyMods ?? []), ...(b.enemyMods ?? [])], minionMods: [...(a.minionMods ?? []), ...(b.minionMods ?? [])]};
}

/** Unique nodes fold in first-investment order. Scalar fields apply once;
 * aura arrays repeat by rank. A single count pass replaces per-node filtering. */
export function foldSkillTreeOverrides<O extends SkillTreeOverride>(lookup: SkillNodeLookup<{over?: O}>, ids?: readonly string[]): O | undefined {
  if (!ids?.length) return undefined;
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  let out: O | undefined;
  for (const [id, rank] of counts) {
    const base = lookup.node(id)?.over, over = base?.aura ? {...base, aura: rankAura(base.aura, rank)} : base;
    if (!over) continue;
    out = out ? {
      ...out, ...over,
      ...(out.aura || over.aura ? {aura: mergeAura(out.aura, over.aura)} : {}),
      ...(out.construct || over.construct ? {construct: {...out.construct, ...over.construct}} : {}),
      ...(out.ground || over.ground ? {ground: {...out.ground, ...over.ground,
        ...(out.ground?.domain || over.ground?.domain ? {domain: mergeDomain(out.ground?.domain, over.ground?.domain)} : {})}} : {}),
      ...(out.channel || over.channel ? {channel: {...out.channel, ...over.channel}} : {}),
      ...(out.summon || over.summon ? {summon: {...out.summon, ...over.summon,
        selectPool: union(out.summon?.selectPool, over.summon?.selectPool),
        crewSkills: union(out.summon?.crewSkills, over.summon?.crewSkills),
        crewAuras: union(out.summon?.crewAuras, over.summon?.crewAuras),
        crewRules: [...(out.summon?.crewRules ?? []), ...(over.summon?.crewRules ?? [])],
        crewInherit: [...(out.summon?.crewInherit ?? []), ...(over.summon?.crewInherit ?? [])],
        crewOnDeath: [...(out.summon?.crewOnDeath ?? []), ...(over.summon?.crewOnDeath ?? [])],
        crewMods: [...(out.summon?.crewMods ?? []), ...(over.summon?.crewMods ?? [])],
      }} : {}),
      ...(out.tags || over.tags ? {tags: {add: union(out.tags?.add, over.tags?.add), remove: union(out.tags?.remove, over.tags?.remove)}} : {}),
    } as O : over as O;
  }
  return out;
}
export function foldSkillTreeModifiers<M>(lookup: SkillNodeLookup<{mods?: M[]}>, ids?: readonly string[]): M[] | undefined {
  if (!ids?.length) return undefined;
  let result: M[] | undefined;
  for (const id of ids) for (const mod of lookup.node(id)?.mods ?? []) (result ??= []).push(mod);
  return result;
}

/** The host explicitly resolves mechanics which suppress native effects (such
 * as challenge delivery). A false flag is a host decision, not an SDK guess.
 * Optional pre-folded overrides let one preview share its resolution work. */
export function resolveSkillTreeEffects<E extends SkillTreeEffect>(
  lookup: SkillNodeLookup<{over?: SkillTreeOverride; utilityEffects?: E[]; buffs?: SkillTreeBuff[]}>,
  base: E[], ids: readonly string[] | undefined, suppressed: boolean,
  over?: SkillTreeOverride,
): E[] {
  if (suppressed) return [];
  if (!ids?.length) return base;
  let out: E[] | undefined;
  over ??= foldSkillTreeOverrides(lookup, ids);
  if (over?.reduceCooldowns) out = base.map(fx => fx.type === 'reduceCooldowns' ? {...fx, ...over.reduceCooldowns} : fx);
  if (over?.recallImpales) out = (out ?? base).map(fx => fx.type === 'recallImpales' ? {...fx, ...over.recallImpales} : fx);
  for (const id of ids) {
    const node = lookup.node(id);
    if (node?.utilityEffects?.length) (out ??= [...base]).push(...node.utilityEffects);
    for (const patch of node?.buffs ?? []) {
      out ??= [...base];
      const index = out.findIndex(fx => fx.type === 'buff' && fx.id === patch.id), prior = index >= 0 ? out[index] : undefined;
      if (!prior && patch.duration === undefined) continue;
      const buff = {type: 'buff', duration: 0, ...prior, ...patch, mods: [...(prior?.mods ?? []), ...(patch.mods ?? [])]} as E;
      if (index >= 0) out[index] = buff; else out.push(buff);
    }
  }
  return out ?? base;
}
/** Channel overrides never create a channel on a channel-less skill. */
export function resolveSkillTreeChannel<C extends object>(base: C | undefined, over: SkillTreeOverride | undefined): C | undefined {
  return base && over?.channel ? {...base, ...over.channel} : base;
}
export function resolveSkillTreeCastCycle<C extends object>(base: C | undefined, over: {castCycle?: C} | undefined): C | undefined {
  return over?.castCycle ?? base;
}
