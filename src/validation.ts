export function finite(value: number, context: string): number {
  if (!Number.isFinite(value)) throw new Error(`${context} must be finite`);
  return value;
}
export function integer(value: number, min: number, context: string): number {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`${context} must be an integer >= ${min}`);
  return value;
}
export function known<T>(registry: Readonly<Record<string, T>>, id: string, context: string): T {
  if (!Object.hasOwn(registry, id)) throw new Error(`Unknown ${context}: ${id}`);
  return registry[id];
}
export function copy<T>(value: T, ancestors = new Set<object>()): T {
  if (value && typeof value === 'object') {
    if (ancestors.has(value)) throw new Error('Content and snapshots cannot contain cycles');
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
      throw new Error('Content and snapshots must contain plain serializable values');
    }
    ancestors.add(value);
    if (Array.isArray(value)) {
      const out = value.map(child => copy(child, ancestors)) as T;
      ancestors.delete(value);
      return out;
    }
    // Reuse the detached entry tuples while validating children. fromEntries
    // defines own writable properties (including __proto__) without invoking
    // inherited setters or allocating one descriptor object per property.
    const entries = Object.entries(value);
    for (const entry of entries) entry[1] = copy(entry[1], ancestors);
    const out = Object.fromEntries(entries);
    ancestors.delete(value);
    return out as T;
  }
  if (typeof value === 'number') finite(value, 'Serialized number');
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new Error('Content and snapshots must contain plain serializable values');
  }
  return value;
}
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Object.freeze does not freeze a Set's entries. Expose only its read methods. */
export function readonlySet(values: Iterable<string>): ReadonlySet<string> {
  const set = new Set(values);
  const view: ReadonlySet<string> = {
    get size() { return set.size; },
    has: value => set.has(value),
    entries: () => set.entries(),
    keys: () => set.keys(),
    values: () => set.values(),
    [Symbol.iterator]: () => set[Symbol.iterator](),
    forEach: (callback, thisArg) => set.forEach(value => callback.call(thisArg, value, value, view)),
  };
  return Object.freeze(view);
}
