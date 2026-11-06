/** Immutable, dependency-free content transport. This validates the table, not
 * a game's schema: pass the decoded value through its capability constructor. */
export type ContentValue = null | boolean | number | string | readonly ContentValue[] | {readonly [key: string]: ContentValue};
export type ContentTableNode = readonly [0, null | boolean | number | string] | readonly [1, ...number[]] | readonly [2, ...number[]] | readonly [3];
export interface ContentTable {
  readonly schemaVersion: 1;
  readonly capability: 'content-table/v1';
  readonly root: number;
  readonly nodes: readonly ContentTableNode[];
}
export const CONTENT_TABLE_LIMITS = Object.freeze({nodes:262144,references:2097152,stringUnits:8388608,depth:64,expandedValues:4194304});
function need(value: unknown, reason: string): asserts value {if (!value) throw new Error('Invalid content table: ' + reason);}
function data(value: object, key: string): unknown {
  const d = Object.getOwnPropertyDescriptor(value,key);
  need(d && 'value' in d && d.enumerable, 'plain values required'); return d.value;
}
function array(value: unknown, max: number): asserts value is readonly unknown[] {
  need(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype, 'array required');
  need(value.length <= max && Object.getOwnPropertySymbols(value).length === 0 && Object.getOwnPropertyNames(value).length === value.length + 1, 'dense array required');
}

/** Atom/array/object nodes are in postorder; references only point backward.
 * Arrays and null-prototype objects are detached, recursively frozen and may
 * share equal child values. No caller objects, caches or mutable global state
 * are retained. Reserved object keys remain ordinary own data properties. */
export function decodeContentTable(input: unknown): ContentValue {
  need(input && typeof input === 'object' && !Array.isArray(input), 'object required');
  need(Object.getPrototypeOf(input) === Object.prototype || Object.getPrototypeOf(input) === null, 'plain object required');
  const names = Object.getOwnPropertyNames(input);
  need(Object.getOwnPropertySymbols(input).length === 0 && names.length === 4 && names.every(n => ['schemaVersion','capability','root','nodes'].includes(n)), 'unknown or missing field');
  need(data(input,'schemaVersion') === 1 && data(input,'capability') === 'content-table/v1', 'unsupported format');
  const root = data(input,'root'), rows = data(input,'nodes'), limits = CONTENT_TABLE_LIMITS;
  array(rows,limits.nodes); need(rows.length > 0 && root === rows.length - 1, 'root must be the final node');
  const values: ContentValue[] = [], depths = new Uint8Array(rows.length), weights = new Uint32Array(rows.length), used = new Uint8Array(rows.length);
  let references = 0, stringUnits = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = data(rows,String(index)); array(row,limits.references + 1); need(row.length > 0,'empty node');
    const kind = data(row,'0'); let value: ContentValue, depth = 0, weight = 1;
    const read = (at: number): ContentValue => {
      const ref = data(row,String(at)); need(Number.isSafeInteger(ref) && (ref as number) >= 0 && (ref as number) < index, 'reference must point backward');
      const id = ref as number; used[id] = 1; depth = Math.max(depth,depths[id] + 1); weight += weights[id];
      need(weight <= limits.expandedValues,'expanded value limit'); return values[id];
    };
    if (kind === 0) {
      need(row.length === 2,'atom length'); const atom = data(row,'1');
      need(atom === null || typeof atom === 'string' || typeof atom === 'boolean' || typeof atom === 'number' && Number.isFinite(atom) && !Object.is(atom,-0), 'invalid atom');
      if (typeof atom === 'string') {stringUnits += atom.length; need(stringUnits <= limits.stringUnits,'string limit');}
      value = atom;
    } else if (kind === 3) {need(row.length === 1,'negative zero length'); value = -0;}
    else {
      need(kind === 1 || kind === 2,'unknown node kind'); references += row.length - 1; need(references <= limits.references,'reference limit');
      if (kind === 1) {
        const out: ContentValue[] = []; for (let at = 1; at < row.length; at++) out.push(read(at)); value = Object.freeze(out);
      } else {
        need(row.length % 2 === 1,'object pairs required'); const out: Record<string,ContentValue> = Object.create(null);
        for (let at = 1; at < row.length; at += 2) {
          const key = read(at); need(typeof key === 'string' && !Object.hasOwn(out,key),'unique string keys required'); out[key] = read(at + 1);
        }
        value = Object.freeze(out);
      }
    }
    need(depth <= limits.depth,'depth limit'); depths[index] = depth; weights[index] = weight; values.push(value);
  }
  for (let index = 0; index < rows.length - 1; index++) need(used[index] === 1,'unreachable node');
  return values[root as number];
}
