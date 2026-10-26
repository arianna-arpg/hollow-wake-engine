import { BUFF_LIMITS, type BuffConsumeEvent, type BuffDefinition } from './buffs.js';
import { validateModifier, type StatRules, type Modifier } from './stat-rules.js';

function record(input: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${name} must be a plain record`);
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${name} must be a plain record`);
  const fields = Reflect.ownKeys(input);
  if (fields.length > keys.length) throw new Error(`${name} has unsupported fields`);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of fields) {
    if (typeof key !== 'string' || !keys.includes(key)) throw new Error(`${name} has an unsupported field`);
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) throw new Error(`${name} requires enumerable data fields`);
    result[key] = descriptor.value;
  }
  return result;
}

function array(input: unknown, maximum: number, name: string): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) throw new Error(`${name} must be a plain array`);
  const length = Object.getOwnPropertyDescriptor(input, 'length')!.value as number;
  if (length > maximum) throw new Error(`${name} exceeds its collection limit`);
  if (Reflect.ownKeys(input).length !== length + 1) throw new Error(`${name} must be dense without extra fields`);
  const result: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new Error(`${name} requires array data elements`);
    result.push(descriptor.value);
  }
  return result;
}

function text(input: unknown, name: string, maximum = 256): string {
  if (typeof input !== 'string' || !input.length || input.length > maximum) throw new Error(`${name} must be a bounded nonempty string`);
  return input;
}
function number(input: unknown, name: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) throw new Error(`${name} must be finite`);
  return input;
}
function count(input: unknown, name: string): number {
  const result = number(input, name);
  if (!Number.isInteger(result) || result < 1 || result > BUFF_LIMITS.clocks) throw new Error(`${name} exceeds buff count bounds`);
  return result;
}
function strings(input: unknown, name: string): string[] {
  const result = array(input, 256, name).map(value => text(value, name));
  Object.freeze(result);
  return result;
}
function modifier(input: unknown, rules: StatRules): Modifier {
  const value = record(input, ['stat', 'kind', 'value', 'fromStat', 'tags', 'when', 'gauge', 'gaugeAt'], 'Buff modifier');
  const stat = text(value.stat, 'Modifier stat'), kind = text(value.kind, 'Modifier kind');
  if (!Object.hasOwn(rules.definitions, stat)) throw new Error('Unknown buff modifier stat');
  if (!['flat', 'increased', 'more', 'override', 'link'].includes(kind)) throw new Error('Unknown modifier kind');
  const result: Modifier = { stat, kind: kind as Modifier['kind'], value: number(value.value, 'Modifier value') };
  if (value.fromStat !== undefined) {
    result.fromStat = text(value.fromStat, 'Modifier fromStat');
    if (!Object.hasOwn(rules.definitions, result.fromStat)) throw new Error('Unknown buff modifier source stat');
  }
  if (value.tags !== undefined) result.tags = strings(value.tags, 'Modifier tags');
  if (value.when !== undefined) result.when = text(value.when, 'Modifier condition');
  if (value.gauge !== undefined) result.gauge = text(value.gauge, 'Modifier gauge');
  if (value.gaugeAt !== undefined) result.gaugeAt = number(value.gaugeAt, 'Modifier gauge threshold');
  validateModifier(result);
  return Object.freeze(result);
}

/** Own and freeze serialized stat buffs outside the simulation loop. Native
 * spatial, next-hit and presentation metadata require the host's typed path. */
export function compileBuffDefinition(input: unknown, rules: StatRules): BuffDefinition<Modifier> {
  const value = record(input, ['type', 'id', 'duration', 'mods', 'maxStacks', 'stackTimers', 'stacksOnApply', 'consumeOnUse', 'consumeOn', 'label'], 'Buff definition');
  if (value.type !== 'buff') throw new Error('Expected buff definition');
  const id = text(value.id, 'Buff id'), duration = number(value.duration, 'Buff duration');
  if (duration < 0) throw new Error('Buff duration must be nonnegative');
  const mods = Object.freeze(array(value.mods, BUFF_LIMITS.modifiers, 'Buff modifiers').map(item => modifier(item, rules)));
  const maxStacks = value.maxStacks === undefined ? undefined : count(value.maxStacks, 'Buff cap');
  const stacksOnApply = value.stacksOnApply === undefined ? undefined : count(value.stacksOnApply, 'Buff grant');
  const stackTimers = value.stackTimers;
  if (stackTimers !== undefined && stackTimers !== 'shared' && stackTimers !== 'independent') throw new Error('Unknown buff timer mode');
  let consumeOn: BuffDefinition['consumeOn'], consumeOnUse: BuffDefinition['consumeOnUse'];
  if (value.consumeOn !== undefined) {
    const gate = record(value.consumeOn, ['on', 'tags', 'skills'], 'Buff consumption');
    const on = text(gate.on, 'Buff consumption event');
    if (!['use', 'hit', 'crit', 'kill', 'hurt', 'block', 'evade'].includes(on)) throw new Error('Unknown buff consumption event');
    consumeOn = Object.freeze({ on: on as BuffConsumeEvent,
      ...(gate.tags === undefined ? {} : { tags: strings(gate.tags, 'Buff consumption tags') }),
      ...(gate.skills === undefined ? {} : { skills: strings(gate.skills, 'Buff consumption skills') }),
    });
  }
  if (value.consumeOnUse !== undefined) {
    const gate = record(value.consumeOnUse, ['tags'], 'Buff use consumption');
    consumeOnUse = Object.freeze(gate.tags === undefined ? {} : { tags: strings(gate.tags, 'Buff use tags') });
  }
  return Object.freeze({ type: 'buff', id, duration, mods,
    ...(maxStacks === undefined ? {} : { maxStacks }),
    ...(stacksOnApply === undefined ? {} : { stacksOnApply }),
    ...(stackTimers === undefined ? {} : { stackTimers }),
    ...(consumeOn === undefined ? {} : { consumeOn }),
    ...(consumeOnUse === undefined ? {} : { consumeOnUse }),
    ...(value.label === undefined ? {} : { label: text(value.label, 'Buff label', 1_024) }),
  });
}
