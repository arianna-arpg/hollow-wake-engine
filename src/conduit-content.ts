import {finite} from './validation.js';

export type ConduitPool = 'life' | 'mana' | 'es' | 'poise' | 'ward' | 'guard' | 'insight';
export interface ConduitSpec {
  from: ConduitPool; to: ConduitPool; drainPct?: number; drainFlat?: number; ratio: number; floor?: number;
}

const pools = new Set(['life','mana','es','poise','ward','guard','insight']);
const fields = new Set(['from','to','drainPct','drainFlat','ratio','floor']);

/** Validate authored rows when loading content, before exposing them to live actors. */
export function validateConduitSpec(spec: ConduitSpec): void {
  for (const key of Object.keys(spec)) if (!fields.has(key)) throw new Error('Unsupported grant field: ' + key);
  if (!pools.has(spec.from) || !pools.has(spec.to)) throw new Error('Unknown conduit pool');
  for (const value of [spec.drainPct ?? 0, spec.drainFlat ?? 0, spec.ratio, spec.floor ?? 0]) {
    if (finite(value,'conduit value') < 0) throw new Error('Negative conduit value');
  }
  if ((spec.floor ?? 0) > 1) throw new Error('Conduit floor exceeds its pool');
}
