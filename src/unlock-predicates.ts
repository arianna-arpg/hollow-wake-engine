
/** Serializable package prerequisites. Ordered groups preserve short-circuit reads. */
export type UnlockPredicate =
  | {readonly kind: 'constant'; readonly value: boolean}
  | {readonly kind: 'counter'; readonly source: 'ledger'; readonly key: string;
      readonly comparison: '>=' | '>'; readonly threshold: number; readonly fallback: number}
  | {readonly kind: 'counter'; readonly source: 'accountLevel';
      readonly comparison: '>=' | '>'; readonly threshold: number}
  | {readonly kind: 'any' | 'all'; readonly terms: readonly UnlockPredicate[]};

export interface UnlockPredicateInput {
  readonly account: {readonly level: number};
  readonly ledger: Readonly<Record<string, number>>;
}

export function validateUnlockPredicate(value: UnlockPredicate, depth = 0): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 32) throw new Error('Invalid unlock predicate');
  const keys = Object.keys(value);
  if (value.kind === 'constant') {
    if (keys.some(key => key !== 'kind' && key !== 'value') || typeof value.value !== 'boolean') throw new Error('Invalid constant predicate');
  } else if (value.kind === 'counter') {
    const ledger = value.source === 'ledger';
    const fields = ledger ? ['kind','source','key','comparison','threshold','fallback'] : ['kind','source','comparison','threshold'];
    if (keys.some(key => !fields.includes(key)) || (!ledger && value.source !== 'accountLevel')
      || (value.comparison !== '>=' && value.comparison !== '>') || !Number.isFinite(value.threshold)) throw new Error('Invalid counter predicate');
    if (ledger && (typeof value.key !== 'string' || !value.key || !Number.isFinite(value.fallback))) throw new Error('Invalid ledger predicate');
  } else if (value.kind === 'any' || value.kind === 'all') {
    if (keys.some(key => key !== 'kind' && key !== 'terms') || !Array.isArray(value.terms) || value.terms.length < 2 || value.terms.length > 64) throw new Error('Invalid predicate group');
    for (const term of value.terms) validateUnlockPredicate(term, depth + 1);
  } else throw new Error('Unknown unlock predicate kind');
}

/** Evaluate validated immutable data. No source text or dynamic evaluation is accepted. */
export function testUnlockPredicate(predicate: UnlockPredicate, input: UnlockPredicateInput): boolean {
  switch (predicate.kind) {
    case 'constant': return predicate.value;
    case 'counter': {
      const value = predicate.source === 'ledger' ? input.ledger[predicate.key] ?? predicate.fallback : input.account.level;
      return predicate.comparison === '>=' ? value >= predicate.threshold : value > predicate.threshold;
    }
    case 'any':
      for (const term of predicate.terms) if (testUnlockPredicate(term, input)) return true;
      return false;
    case 'all':
      for (const term of predicate.terms) if (!testUnlockPredicate(term, input)) return false;
      return true;
  }
}
