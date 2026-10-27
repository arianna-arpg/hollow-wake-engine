import type {ProcHealingEffect} from './life-recovery.js';

/** Own a frozen proc-heal record without invoking accessors or accepting the
 * different targeted-skill schema. Undefined optional fields are omitted. */
export function compileProcHealingEffect(input: unknown): ProcHealingEffect {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Proc healing requires a plain record');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('Proc healing requires a plain record');
  const keys = Reflect.ownKeys(input);
  if (keys.length > 3) throw new Error('Unsupported proc healing fields');
  let type: unknown, flat: unknown, pctMax: unknown;
  for (const key of keys) {
    if (key !== 'type' && key !== 'flat' && key !== 'pctMax') throw new Error('Unsupported proc healing field');
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) throw new Error('Proc healing requires enumerable data fields');
    if (key === 'type') type = descriptor.value;
    else if (key === 'flat') flat = descriptor.value;
    else pctMax = descriptor.value;
  }
  if (type !== 'heal') throw new Error('Expected a heal proc');
  for (const value of [flat, pctMax]) {
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Proc healing values must be finite');
  }
  return Object.freeze({type: 'heal', ...(flat === undefined ? {} : {flat: flat as number}),
    ...(pctMax === undefined ? {} : {pctMax: pctMax as number})});
}
