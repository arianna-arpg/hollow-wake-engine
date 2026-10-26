export type BuffConsumeEvent = 'use' | 'hit' | 'crit' | 'kill' | 'hurt' | 'block' | 'evade';
export interface BuffModifier { readonly value: number }
export interface BuffDefinition<M extends BuffModifier = BuffModifier, T extends string = string> {
  readonly type: 'buff';
  readonly id: string;
  readonly duration: number;
  readonly mods: readonly M[];
  readonly maxStacks?: number;
  readonly stackTimers?: 'shared' | 'independent';
  readonly stacksOnApply?: number;
  readonly consumeOnUse?: { readonly tags?: readonly T[] };
  readonly consumeOn?: { readonly on: BuffConsumeEvent; readonly tags?: readonly T[]; readonly skills?: readonly string[] };
  readonly label?: string;
}
export interface ActiveBuff<D extends BuffDefinition = BuffDefinition> {
  def: D;
  remaining: number;
  stacks: number;
  expiries?: number[];
}
export interface BuffGainEvent<D extends BuffDefinition = BuffDefinition, T extends string = string> {
  kind: 'buff'; id: string; depth: number; buff: D; tags?: T[];
}
export interface BuffOwner<D extends BuffDefinition = BuffDefinition, T extends string = string> {
  readonly buffs: Map<string, ActiveBuff<D>>;
  readonly gainEvents: { readonly length: number; push(event: BuffGainEvent<D, T>): unknown };
}
export interface BuffPorts<M extends BuffModifier, D extends BuffDefinition<M>, O> {
  readonly publish: (owner: O, source: string, mods: M[]) => undefined;
  readonly removeSource: (owner: O, source: string) => undefined;
  readonly release: (owner: O, def: D, id: string, count: number) => undefined;
  /** Preserve a host's observable method dispatch when spending event-gated buffs. */
  readonly consume?: (owner: O, id: string, count: number) => undefined;
}

export const BUFF_LIMITS = Object.freeze({ clocks: 65_536, visits: 65_536, nesting: 64, gainEvents: 64, modifiers: 4_096 });

function nonnegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be finite and nonnegative`);
}
function positiveCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1 || value > BUFF_LIMITS.clocks) throw new Error(`${name} exceeds buff count bounds`);
}
function longest(clocks: readonly number[]): number {
  let result = -Infinity;
  for (const clock of clocks) result = Math.max(result, clock);
  return result;
}

/** Borrowed coherent state and synchronous ports; no engine or global registry.
 * One runtime can serve several actors. Reuse it throughout a simulation so its
 * callback guards cover every operation. Serialized content uses buff-content. */
export class BuffRuntime<
  M extends BuffModifier = BuffModifier,
  T extends string = string,
  D extends BuffDefinition<M, T> = BuffDefinition<M, T>,
  O extends BuffOwner<D, T> = BuffOwner<D, T>,
> {
  private readonly ports: BuffPorts<M, D, O>;
  private readonly advancing: { owner: O | undefined; parents: O[] | undefined } = {
    owner: undefined, parents: undefined,
  };
  private nesting = 0;

  constructor(ports: BuffPorts<M, D, O>) {
    for (const key of ['publish', 'removeSource', 'release'] as const) {
      if (typeof ports?.[key] !== 'function') throw new Error(`Missing buff port: ${key}`);
    }
    if (ports.consume !== undefined && typeof ports.consume !== 'function') throw new Error('Invalid buff consume port');
    this.ports = Object.freeze({ ...ports });
  }

  private enter(): void {
    if (this.nesting >= BUFF_LIMITS.nesting) throw new Error('Buff callback nesting limit exceeded');
    this.nesting++;
  }

  /** The gain queue commits before the map. Definitions and tag arrays remain
   * borrowed; a full queue suppresses the event, not the grant. */
  grant(owner: O, def: D, durationScale = 1, chainDepth = 0, tags?: T[]): void {
    nonnegative(durationScale, 'Buff duration scale');
    this.enter();
    try {
      if (owner.gainEvents.length < BUFF_LIMITS.gainEvents) {
        owner.gainEvents.push({ kind: 'buff', id: def.id, depth: chainDepth, buff: def, tags });
      }
      const existing = owner.buffs.get(def.id);
      // A queue callback may replace a record or change borrowed definition data.
      nonnegative(def.duration, 'Buff duration');
      const duration = def.duration * durationScale, grant = def.stacksOnApply ?? 1;
      nonnegative(duration, 'Scaled buff duration');
      positiveCount(grant, 'Buff grant');
      if (def.maxStacks !== undefined) positiveCount(def.maxStacks, 'Buff cap');
      if (def.mods.length > BUFF_LIMITS.modifiers) throw new Error('Buff modifier limit exceeded');
      if (def.stackTimers === 'independent' && (def.maxStacks ?? 1) > 1) {
        const buff = existing ?? { def, remaining: 0, stacks: 0, expiries: [] };
        const clocks = buff.expiries ??= [];
        if (clocks.length > BUFF_LIMITS.clocks) throw new Error('Buff clock limit exceeded');
        for (let i = 0; i < grant && clocks.length < (def.maxStacks ?? 1); i++) clocks.push(duration);
        buff.stacks = clocks.length;
        buff.remaining = longest(clocks);
        owner.buffs.set(def.id, buff);
      } else if (existing) {
        if ((def.maxStacks ?? 1) > 1) existing.stacks = Math.min(def.maxStacks ?? 1, existing.stacks + grant);
        existing.remaining = duration;
        existing.def = def;
        owner.buffs.set(def.id, existing);
      } else {
        owner.buffs.set(def.id, { def, remaining: duration, stacks: Math.min(def.maxStacks ?? grant, grant) });
      }
      this.publish(owner, def.id);
    } finally { this.nesting--; }
  }

  /** Cue first, then modify the captured record, then publish the current map.
   * Independent clocks are spent in application order, never duration order. */
  consume(owner: O, id: string, count = 1): void {
    nonnegative(count, 'Buff spend');
    if (!Number.isSafeInteger(count)) throw new Error('Buff spend must be a safe integer');
    this.enter();
    try {
      const buff = owner.buffs.get(id);
      if (!buff) return;
      this.ports.release(owner, buff.def, id, Math.min(count, buff.stacks));
      if (buff.expiries && count > 0) {
        const clocks = buff.expiries;
        if (clocks.length > BUFF_LIMITS.clocks) throw new Error('Buff clock limit exceeded');
        const spent = Math.min(count, clocks.length);
        for (let i = spent; i < clocks.length; i++) clocks[i - spent] = clocks[i];
        clocks.length -= spent;
        if (clocks.length) buff.remaining = longest(clocks);
      }
      buff.stacks -= count;
      if (buff.stacks <= 0) owner.buffs.delete(id);
      this.publish(owner, id);
    } finally { this.nesting--; }
  }

  spend(owner: O, on: BuffConsumeEvent, tags?: readonly T[], skillId?: string): void {
    if (!owner.buffs.size) return;
    if (owner.buffs.size > BUFF_LIMITS.visits) throw new Error('Buff visit limit exceeded');
    this.enter();
    try {
      // Snapshot entries, not definitions: a callback may replace an unvisited def.
      for (const [id, buff] of [...owner.buffs]) {
        const def = buff.def;
        const gate = def.consumeOn ?? (def.consumeOnUse ? { on: 'use', tags: def.consumeOnUse.tags } : undefined);
        if (!gate || gate.on !== on) continue;
        if (gate.tags && !gate.tags.some(tag => tags?.includes(tag))) continue;
        if ('skills' in gate && gate.skills && (!skillId || !gate.skills.includes(skillId))) continue;
        if (this.ports.consume) this.ports.consume(owner, id, 1);
        else this.consume(owner, id, 1);
      }
    } finally { this.nesting--; }
  }

  remove(owner: O, id: string): void {
    this.enter();
    try { if (owner.buffs.delete(id)) this.publish(owner, id); }
    finally { this.nesting--; }
  }

  /** Explicit recovery for a source callback that failed after a map commit. */
  synchronize(owner: O, id: string): void {
    this.enter();
    try { this.publish(owner, id); }
    finally { this.nesting--; }
  }

  private publish(owner: O, id: string): void {
    const buff = owner.buffs.get(id), source = 'buff:' + id;
    if (!buff) { this.ports.removeSource(owner, source); return; }
    const mods = buff.def.mods.map(mod => ({ ...mod, value: mod.value * buff.stacks }));
    this.ports.publish(owner, source, mods);
  }

  /** Call once at the host's buff timer phase with its already-scaled delta.
   * Live map iteration preserves callback insertions/deletions. */
  advance(owner: O, delta: number): void {
    nonnegative(delta, 'Buff delta');
    const active = this.advancing;
    if (active.owner !== undefined && (active.owner === owner || active.parents?.includes(owner))) throw new Error('Buff advance is already active for this owner');
    if (!owner.buffs.size) return;
    this.enter();
    const previous = active.owner;
    // Ordinary ticks need no collection. Allocate only for cross-owner nesting,
    // whose depth is bounded by enter(), and retain no owners after unwinding.
    if (previous !== undefined) (active.parents ??= []).push(previous);
    active.owner = owner;
    try {
      let visits = 0;
      for (const [id, buff] of owner.buffs) {
        if (++visits > BUFF_LIMITS.visits) throw new Error('Buff visit limit exceeded');
        const clocks = buff.expiries;
        if (clocks) {
          if (clocks.length > BUFF_LIMITS.clocks) throw new Error('Buff clock limit exceeded');
          let write = 0, maximum = -Infinity;
          const length = clocks.length;
          for (let read = 0; read < length; read++) {
            const remaining = clocks[read] - delta;
            if (remaining <= 0) continue;
            clocks[write++] = remaining;
            if (remaining > maximum) maximum = remaining;
          }
          clocks.length = write;
          if (!write) {
            owner.buffs.delete(id);
            this.publish(owner, id);
          } else if (write !== length) {
            buff.stacks = write;
            buff.remaining = maximum;
            this.publish(owner, id);
          } else buff.remaining -= delta;
          continue;
        }
        buff.remaining -= delta;
        if (buff.remaining <= 0) {
          owner.buffs.delete(id);
          this.publish(owner, id);
        }
      }
    } finally {
      active.owner = previous;
      if (previous !== undefined) active.parents!.pop();
      else active.parents = undefined;
      this.nesting--;
    }
  }
}
