import {finite} from './validation.js';

/** Detach an immutable-content graph without expanding repeated child values.
 * Caller data is never frozen or retained. Cycles and unsupported values retain
 * the ordinary content-copy refusal. Scope this to read-only definitions: live
 * items and saves still use their established independent-copy contracts. */
export function copySharedContent<T>(input: T): T {
  const seen = new Map<object,unknown>(), active = new Set<object>();
  function visit(value: unknown): unknown {
    if (value && typeof value === 'object') {
      if (active.has(value)) throw new Error('Content and snapshots cannot contain cycles');
      if (seen.has(value)) return seen.get(value);
      const prototype = Object.getPrototypeOf(value);
      if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error('Content and snapshots must contain plain serializable values');
      active.add(value);
      let out: unknown;
      if (Array.isArray(value)) out = value.map(visit);
      else {const entries = Object.entries(value); for (const entry of entries) entry[1] = visit(entry[1]); out = Object.fromEntries(entries);}
      active.delete(value); seen.set(value,out); return out;
    }
    if (typeof value === 'number') finite(value,'Serialized number');
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new Error('Content and snapshots must contain plain serializable values');
    return value;
  }
  return visit(input) as T;
}
