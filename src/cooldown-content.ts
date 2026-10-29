import type {ProcCooldownEffect} from './cooldowns.js';

/** Bounds for serialized authoring input, applied once during loading. */
export const COOLDOWN_CONTENT_LIMITS = Object.freeze({selectorEntries: 4096, identifierLength: 256});
const allowed = Object.freeze(['type', 'seconds', 'fraction', 'reset', 'skills', 'tags', 'exceptSelf']);

function selector(value: unknown): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new Error('Cooldown selector requires a plain array');
  const length = Object.getOwnPropertyDescriptor(value, 'length')!.value as number;
  if (length > COOLDOWN_CONTENT_LIMITS.selectorEntries) throw new Error('Cooldown selector exceeds its entry limit');
  if (Reflect.ownKeys(value).length !== length + 1) throw new Error('Cooldown selector requires dense data entries');
  const result: string[] = [];
  for (let i = 0; i < length; i++) {
    const field = Object.getOwnPropertyDescriptor(value, String(i));
    if (!field || !field.enumerable || !('value' in field)) throw new Error('Cooldown selector requires dense data entries');
    const id: unknown = field.value;
    if (typeof id !== 'string' || id.length === 0 || id.length > COOLDOWN_CONTENT_LIMITS.identifierLength) throw new Error('Invalid cooldown selector identifier');
    result.push(id);
  }
  return Object.freeze(result);
}

/** Own immutable content without invoking record/array accessors. Signed finite
 * arithmetic, selector order/duplicates and empty arrays retain native meaning.
 * IDs are host-defined; compilation does not require a skill to be on a bar. */
export function compileProcCooldownEffect(input: unknown): ProcCooldownEffect {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Cooldown effect requires a plain record');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('Cooldown effect requires a plain record');
  const keys = Reflect.ownKeys(input);
  if (keys.length > allowed.length) throw new Error('Unsupported cooldown fields');
  const fields: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.includes(key)) throw new Error('Unsupported cooldown field');
    const field = Object.getOwnPropertyDescriptor(input, key)!;
    if (!field.enumerable || !('value' in field)) throw new Error('Cooldown effect requires enumerable data fields');
    fields[key] = field.value;
  }
  if (fields.type !== 'cooldown') throw new Error('Expected a cooldown proc effect');
  for (const key of ['seconds', 'fraction']) {
    const value = fields[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Cooldown arithmetic must be finite');
  }
  for (const key of ['reset', 'exceptSelf']) if (fields[key] !== undefined && fields[key] !== true) throw new Error('Cooldown flags must be true or omitted');
  return Object.freeze({type: 'cooldown',
    ...(fields.seconds === undefined ? {} : {seconds: fields.seconds as number}),
    ...(fields.fraction === undefined ? {} : {fraction: fields.fraction as number}),
    ...(fields.reset === undefined ? {} : {reset: true as const}),
    ...(fields.skills === undefined ? {} : {skills: selector(fields.skills)}),
    ...(fields.tags === undefined ? {} : {tags: selector(fields.tags)}),
    ...(fields.exceptSelf === undefined ? {} : {exceptSelf: true as const})});
}
