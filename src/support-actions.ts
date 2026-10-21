export interface SocketSkill<G> {def: {id: string}; sockets: (G | null)[]}
export interface StoredSocketSkill {skillId: string; sockets: (unknown | null)[]}
export interface SupportActionPorts<S, I extends SocketSkill<G>, G, T> {
  bagItem(seat: S, uid: number): T | undefined; support(item: T): G | undefined;
  known(seat: S, id: string): I | undefined; granted(seat: S, id: string): I | undefined;
  fits(support: G, inst: I): boolean;
  refusal(seat: S, kind: 'socket' | 'unsocket', skillId: string): string | null;
  fail(seat: S, key: string, reason: string): void;
  remove(seat: S, uid: number): void; give(seat: S, support: G): boolean;
  recalculate(seat: S): void; resync(inst: I): void; dirty(seat: S): void;
  stored(item: T): StoredSocketSkill | undefined; storedSupport(item: T, index: number): G | undefined;
}
/** Synchronous custody commits. Host ports must not throw or reenter after a
 * commit begins. give() must either place one returned support or leave custody
 * unchanged. It owns any save notification for its new wrapper, before clearing
 * the old socket. Durable transactions and actor updates remain host-owned. */
export class SupportActions<S, I extends SocketSkill<G>, G, T> {
  readonly #p: SupportActionPorts<S, I, G, T>; #busy = false;
  constructor(ports: SupportActionPorts<S, I, G, T>) {
    const names = ['bagItem','support','known','granted','fits','refusal','fail','remove','give','recalculate','resync','dirty','stored','storedSupport'] as const;
    for (const name of names) if (typeof ports[name] !== 'function') throw new Error(`Support action ${name} port is required`);
    this.#p = Object.fromEntries(names.map(name => [name, ports[name].bind(ports)])) as unknown as SupportActionPorts<S, I, G, T>;
  }
  #run(work: () => boolean): boolean {if (this.#busy) throw new Error('Reentrant support action'); this.#busy = true; try {return work();} finally {this.#busy = false;}}
  socket(seat: S, uid: number, skillId: string): boolean {
    return this.#run(() => {
      if (!Number.isSafeInteger(uid) || uid < 0 || typeof skillId !== 'string') return false;
      const p = this.#p, item = p.bagItem(seat, uid), gem = item ? p.support(item) : undefined;
      const inst = p.known(seat, skillId) ?? p.granted(seat, skillId);
      if (!gem || !inst || !p.fits(gem, inst)) return false;
      const index = inst.sockets.indexOf(null); if (index < 0) return false;
      const refusal = p.refusal(seat, 'socket', skillId);
      if (refusal) {p.fail(seat, skillId + ':discipline', refusal); return false;}
      inst.sockets[index] = gem; p.remove(seat, uid); p.recalculate(seat); p.resync(inst); p.dirty(seat); return true;
    });
  }
  unsocket(seat: S, skillId: string, index: number): boolean {
    return this.#run(() => {
      if (!Number.isSafeInteger(index) || index < 0 || typeof skillId !== 'string') return false;
      const p = this.#p, inst = p.known(seat, skillId) ?? p.granted(seat, skillId), gem = inst?.sockets[index];
      if (!inst || !gem) return false;
      const refusal = p.refusal(seat, 'unsocket', skillId);
      if (refusal) {p.fail(seat, skillId + ':discipline', refusal); return false;}
      if (!p.give(seat, gem)) return false;
      inst.sockets[index] = null; p.recalculate(seat); p.resync(inst); return true;
    });
  }
  unsocketStored(seat: S, uid: number, index: number): boolean {
    return this.#run(() => {
      if (!Number.isSafeInteger(uid) || uid < 0 || !Number.isSafeInteger(index) || index < 0) return false;
      const p = this.#p, item = p.bagItem(seat, uid), stored = item ? p.stored(item) : undefined, gem = item ? p.storedSupport(item, index) : undefined;
      if (!stored || !gem) return false;
      const refusal = p.refusal(seat, 'unsocket', stored.skillId);
      if (refusal) {p.fail(seat, stored.skillId + ':discipline', refusal); return false;}
      if (!p.give(seat, gem)) return false;
      stored.sockets[index] = null; p.dirty(seat); return true;
    });
  }
}
