/** Bounded portable JSON for UI/session commands, never per-frame simulation. */
export type SessionJSON = null | boolean | number | string | SessionJSON[] | {[key: string]: SessionJSON};
export class SessionInputError extends Error {}
export function requireSession(value: unknown, reason: string): asserts value {
  if (!value) throw new SessionInputError(reason);
}
export function sessionRecord(value: unknown): asserts value is Record<string, unknown> {
  requireSession(value && typeof value === 'object' && !Array.isArray(value), 'invalid-object');
}
export function sessionFields(value: unknown, names: readonly string[]): asserts value is Record<string, unknown> {
  sessionRecord(value); requireSession(Object.keys(value).every(key => names.includes(key)), 'unknown-field');
}
export function sessionInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  requireSession(Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max, 'invalid-integer');
}
export function sessionText(value: unknown): asserts value is string {
  requireSession(typeof value === 'string' && value.length > 0 && value.length <= 512, 'invalid-string');
}
export function sessionArray(value: unknown, max = 2048): asserts value is unknown[] {
  requireSession(Array.isArray(value) && value.length <= max, 'invalid-array');
}
export function sessionBoolean(value: unknown): asserts value is boolean {requireSession(typeof value === 'boolean', 'invalid-boolean');}

/** A detached, deeply frozen JSON subtree with its exact admission cost. */
export interface SessionPart {
  value: SessionJSON; nodes: number; bytes: number; characters: number; depth: number;
}
export function retainSessionPart(input: unknown): Readonly<SessionPart> {
  sessionRecord(input);
  const part: SessionPart = {value:null,nodes:0,bytes:0,characters:0,depth:0};
  part.value = visitSessionJSON(input,undefined,part);
  return Object.freeze(part);
}

/** Only for state already detached and admitted inside the session. Preserve
 * negative zero, insertion order and arbitrary own keys in independent copies. */
export function cloneOwnedJSON<T>(input:T, shared?:SessionJSON):T {
  if(input===null || typeof input!=='object' || input===shared)return input;
  if(Array.isArray(input))return input.map(value=>cloneOwnedJSON(value,shared)) as T;
  const copy=Object.create(null);
  for(const key of Object.keys(input))copy[key]=cloneOwnedJSON(input[key as keyof T],shared);
  return copy;
}

/** Refuses getters, symbols, hidden properties, cycles and non-JSON values.
 * The encoded-byte budget covers compact UTF-8 JSON; no TextEncoder/browser API
 * is needed. Limits bound admitted data, not total VM/process memory. */
export function copySessionJSON(value: unknown, shared?:Readonly<SessionPart>): SessionJSON {
  return visitSessionJSON(value,shared);
}
function visitSessionJSON(value: unknown, shared?:Readonly<SessionPart>, capture?:SessionPart): SessionJSON {
  let nodes = 0, characters = 0, bytes = 0;
  const charge = (n: number) => {bytes += n; requireSession(bytes <= 512 * 1024, 'json-byte-limit');};
  const string = (s: string) => {
    characters += s.length; requireSession(characters <= 262144, 'json-limit');
    let n = 2;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      requireSession(c !== 0, 'unsupported-nul');
      if (c === 34 || c === 92 || c === 8 || c === 9 || c === 10 || c === 12 || c === 13) n += 2;
      else if (c < 32) n += 6;
      else if (c < 128) n++;
      else if (c < 2048) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) {n += 4; i++;}
      else {requireSession(c < 0xd800 || c > 0xdfff, 'invalid-unicode'); n += 3;}
    }
    charge(n);
  };
  function visit(row: unknown, depth: number): SessionJSON {
    if(shared && row===shared.value && nodes+shared.nodes<=32768 && depth+shared.depth<=16
        && characters+shared.characters<=262144 && bytes+shared.bytes<=512*1024){
      nodes+=shared.nodes; characters+=shared.characters; bytes+=shared.bytes;
      return shared.value;
    }
    requireSession(++nodes <= 32768 && depth <= 16, 'json-limit');
    if(capture && depth>capture.depth)capture.depth=depth;
    if (row === null || typeof row === 'boolean') {charge(row === false ? 5 : 4); return row;}
    if (typeof row === 'number') {requireSession(Number.isFinite(row), 'invalid-number'); charge(String(row).length); return row;}
    if (typeof row === 'string') {string(row); return row;}
    sessionRecordOrArray(row);
    requireSession(Object.getOwnPropertySymbols(row).length === 0, 'unsupported-symbol');
    const names = Object.getOwnPropertyNames(row);
    requireSession(names.length <= 32768, 'json-limit');
    if (Array.isArray(row)) {
      requireSession(Object.getPrototypeOf(row) === Array.prototype && row.length <= 32768 && names.length === row.length + 1, 'invalid-array');
      const out: SessionJSON[] = []; charge(2 + Math.max(0, row.length - 1));
      for (let i = 0; i < row.length; i++) {
        const d = Object.getOwnPropertyDescriptor(row, String(i));
        requireSession(d && 'value' in d && d.enumerable, 'invalid-array'); out.push(visit(d.value, depth + 1));
      }
      if(capture)Object.freeze(out);
      return out;
    }
    requireSession(Object.getPrototypeOf(row) === Object.prototype || Object.getPrototypeOf(row) === null, 'invalid-object');
    const out: Record<string, SessionJSON> = Object.create(null); charge(2);
    for (let i = 0; i < names.length; i++) {
      const key = names[i], d = Object.getOwnPropertyDescriptor(row, key)!;
      requireSession('value' in d && d.enumerable, 'invalid-property'); string(key); charge(i === 0 ? 1 : 2);
      out[key] = visit(d.value, depth + 1);
    }
    if(capture)Object.freeze(out);
    return out;
  }
  const result=visit(value,0);
  if(capture){capture.nodes=nodes;capture.characters=characters;capture.bytes=bytes;}
  return result;
}
function sessionRecordOrArray(value: unknown): asserts value is object {
  requireSession(value !== null && typeof value === 'object', 'invalid-json');
}
