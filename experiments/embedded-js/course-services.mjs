// Test-only services required by the original game's headless arena. These are
// not SDK services or a general structuredClone/performance implementation.
export function installCourseServices() {
  const logs = [];
  let clones = 0, clockReads = 0, lastClock = Date.now();
  function cloneData(value, memo = new Map()) {
    if (value === null || ['undefined', 'string', 'boolean', 'number', 'bigint'].includes(typeof value)) return value;
    if (typeof value !== 'object') throw new Error('Unsupported course clone value');
    if (memo.has(value)) return memo.get(value);
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw new Error('Unsupported course clone prototype');
    if (Object.getOwnPropertySymbols(value).length) throw new Error('Unsupported course clone symbols');
    const result = Array.isArray(value) ? new Array(value.length) : {};
    memo.set(value, result);
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!('value' in descriptor)) throw new Error('Unsupported course clone accessor');
      Object.defineProperty(result, key, {value: cloneData(descriptor.value, memo), enumerable: true, writable: true, configurable: true});
    }
    return result;
  }
  globalThis.structuredClone = value => {
    const result = cloneData(value);
    // The Node replay independently compares every reached clone with its
    // built-in structuredClone, including graph aliases and undefined fields.
    globalThis.courseCloneOracle?.(value, result);
    clones++;
    return result;
  };
  globalThis.console = Object.fromEntries(['log', 'warn', 'error', 'info', 'debug'].map(kind => [kind, (...args) => {
    if (logs.length >= 10000) throw new Error('Course diagnostic limit');
    logs.push({kind, args: args.map(String)});
  }]));
  // Only the original arena's optional background work budget reads this.
  // This coarse nondecreasing wall clock is not a performance measurement.
  globalThis.performance = {now() {clockReads++; return lastClock = Math.max(lastClock, Date.now());}};
  globalThis.courseServiceReport = () => ({clones, clockReads, logs});
}
