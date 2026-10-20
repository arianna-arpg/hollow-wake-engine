import type { Modifier, StatDefinition, StatTrade } from './types.js';
import { copy, finite, freeze, known } from './validation.js';

export type { Modifier };
export type SkillTag = string;
export type ConditionId = string;
export interface ArmedFamily {
  registry: readonly string[];
  registryLength: number;
  ids: readonly string[];
  set: ReadonlySet<string>;
}

/** Shared immutable definitions; all derived caches and sources belong to a sheet. */
export class StatRules {
  readonly definitions: Readonly<Record<string, StatDefinition>>;
  readonly trades: readonly StatTrade[];
  readonly incoming: Readonly<Record<string, readonly StatTrade[]>>;
  readonly outgoing: Readonly<Record<string, readonly StatTrade[]>>;
  constructor(definitions: Record<string, StatDefinition>, trades: StatTrade[] = []) {
    this.definitions = freeze(copy(definitions));
    this.trades = freeze(copy(trades));
    for (const [id, def] of Object.entries(this.definitions)) {
      if (['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error(`Reserved stat id: ${id}`);
      finite(def.base, `${id}.base`);
      if (def.min !== undefined) finite(def.min, `${id}.min`);
      if (def.max !== undefined) finite(def.max, `${id}.max`);
      if (def.min !== undefined && def.max !== undefined && def.min > def.max) throw new Error(`Invalid bounds: ${id}`);
    }
    const endpoints = new Set(this.trades.flatMap(t => [t.from, t.to]));
    const incoming: Record<string, StatTrade[]> = Object.create(null);
    const outgoing: Record<string, StatTrade[]> = Object.create(null);
    const forgo = new Set<string>();
    for (const trade of this.trades) {
      for (const id of [trade.from, trade.to, trade.rateStat, trade.forgoStat]) known(this.definitions, id, 'trade stat');
      if (endpoints.has(trade.rateStat) || endpoints.has(trade.forgoStat)) throw new Error('Trade dials cannot be trade endpoints');
      if (forgo.has(trade.forgoStat)) throw new Error('Trade forgo dials must be unique');
      forgo.add(trade.forgoStat);
      (incoming[trade.to] ??= []).push(trade);
      (outgoing[trade.from] ??= []).push(trade);
    }
    this.incoming = freeze(incoming);
    this.outgoing = freeze(outgoing);
    Object.freeze(this);
  }
  staticallyArmed(stat: string): boolean {
    const def = this.definitions[stat];
    return !!(def && (def.base > 0 || (def.min ?? 0) > 0)) || !!this.incoming[stat]?.length;
  }
}

export function modReadsVictim(mod: Modifier): boolean {
  return !!mod.tags?.some(tag => tag.startsWith('vs:'));
}
export function validateModifier(mod: Modifier): void {
  if (typeof mod.stat !== 'string' || !mod.stat) throw new Error('Modifier stat must be an id');
  if (!['flat', 'increased', 'more', 'override', 'link'].includes(mod.kind)) throw new Error(`Unknown modifier kind: ${mod.kind}`);
  finite(mod.value, `${mod.stat}.value`);
  if (mod.kind === 'link' && !mod.fromStat) throw new Error('Link modifier requires fromStat');
  if (mod.gaugeAt !== undefined) {
    if (!mod.gauge) throw new Error('Gauge threshold requires a gauge');
    finite(mod.gaugeAt, 'gaugeAt');
  }
}
