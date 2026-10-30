/** Bounded interning of live string-set contents. The encoder must be pure and
 * its result must be treated as immutable. Inputs are never retained or changed.
 * Hits check membership, so same-size mutation and readonly views remain valid.
 * A miss gives the encoder a frozen, sorted snapshot. Empty context is shared. */
export class TagContextCache<Key> {
  private readonly entries: {tags: readonly string[]; value: Key}[] = [];
  private recent: {tags: readonly string[]; value: Key} | undefined;
  private next = 0;
  private readonly empty: Key;
  constructor(private readonly encode: (tags: readonly string[]) => Key, private readonly capacity = 16) {
    if (!Number.isSafeInteger(capacity) || capacity < 0) throw new RangeError('Invalid tag context capacity');
    this.empty = encode(Object.freeze([]));
  }
  /** Number of retained nonempty contexts, always at most capacity. */
  get size(): number { return this.entries.length; }
  /** Forget nonempty contexts. The pure empty-context encoding remains valid. */
  clear(): void { this.entries.length = 0; this.recent = undefined; this.next = 0; }
  get(tags?: ReadonlySet<string>): Key {
    if (!tags || tags.size === 0) return this.empty;
    const size = tags.size;
    let entry = this.recent;
    if (entry && entry.tags.length === size) {
      let same = true;
      for (const tag of entry.tags) if (!tags.has(tag)) { same = false; break; }
      if (same) return entry.value;
    }
    candidate: for (let i = 0; i < this.entries.length; i++) {
      entry = this.entries[i]!;
      if (entry === this.recent || entry.tags.length !== size) continue;
      for (const tag of entry.tags) if (!tags.has(tag)) continue candidate;
      this.recent = entry;
      return entry.value;
    }
    const snapshot = Object.freeze([...tags].sort());
    const value = this.encode(snapshot);
    if (this.capacity > 0) {
      entry = {tags: snapshot, value};
      if (this.entries.length < this.capacity) this.entries.push(entry);
      else { this.entries[this.next] = entry; this.next = (this.next + 1) % this.capacity; }
      this.recent = entry;
    }
    return value;
  }
}
