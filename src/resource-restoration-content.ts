import type {InstantRestorationEffect, ProcRestorationEffect} from './resource-restoration.js';

function fields(input: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Restoration requires a plain record');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('Restoration requires a plain record');
  const keys = Reflect.ownKeys(input);
  if (keys.length > allowed.length) throw new Error('Unsupported restoration fields');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.includes(key)) throw new Error('Unsupported restoration field');
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) throw new Error('Restoration requires enumerable data fields');
    result[key] = descriptor.value;
  }
  if (result.type !== 'restore') throw new Error('Expected a restore effect');
  if (result.resetEsDelay !== undefined && typeof result.resetEsDelay !== 'boolean') throw new Error('Restoration resetEsDelay must be boolean');
  return result;
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
const instantFields = Object.freeze(['type', 'resource', 'amount', 'resetEsDelay']);
const procFields = Object.freeze(['type', 'resource', 'flat', 'pctMax', 'resetEsDelay']);

/** Validate once, own a frozen record; optional undefined fields are omitted. */
export function compileInstantRestorationEffect(input: unknown): InstantRestorationEffect {
  const row = fields(input, instantFields), resource = row.resource;
  if (resource !== 'life' && resource !== 'mana' && resource !== 'es' && resource !== 'poise') throw new Error('Unsupported instant restoration resource');
  if (!finite(row.amount)) throw new Error('Restoration amount must be finite');
  return Object.freeze({type: 'restore', resource, amount: row.amount,
    ...(row.resetEsDelay === undefined ? {} : {resetEsDelay: row.resetEsDelay as boolean})});
}

/** Proc healing has its own schema; life is not a proc-restoration resource. */
export function compileProcRestorationEffect(input: unknown): ProcRestorationEffect {
  const row = fields(input, procFields), resource = row.resource;
  if (resource !== 'mana' && resource !== 'es' && resource !== 'poise') throw new Error('Unsupported proc restoration resource');
  for (const value of [row.flat, row.pctMax]) if (value !== undefined && !finite(value)) throw new Error('Proc restoration values must be finite');
  return Object.freeze({type: 'restore', resource,
    ...(row.flat === undefined ? {} : {flat: row.flat as number}),
    ...(row.pctMax === undefined ? {} : {pctMax: row.pctMax as number}),
    ...(row.resetEsDelay === undefined ? {} : {resetEsDelay: row.resetEsDelay as boolean})});
}
