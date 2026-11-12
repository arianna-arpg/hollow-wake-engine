import {copySessionJSON, requireSession as need, sessionFields as fields,
  sessionInteger as integer, sessionText as text, sessionArray as array,
  type SessionJSON} from './session-json.js';
import type {CharacterAction} from './durable-character-located-owner.js';

type HandleValue = object | number | string;
type Synchronous<T> = T & {readonly then?: never};
export type WorldPlacement = {worldKey: string} & Record<string, SessionJSON>;
export type WorldDeliveryRow = {id: number; characterKey: string; drop: SessionJSON; placement: WorldPlacement};
export type WorldDeliveryRecord = WorldDeliveryRow & {groupKey: string};
export type PickupAction = Extract<CharacterAction, {kind: 'pickup'}>;
export interface WorldDeliveryPorts<Handle extends HandleValue> {
  /** Enumerates borrowed handles; no handle is serialized or copied. */
  list(): Handle[];
  /** Foreign namespaces may supply only their group identity. Matching records
   * are fully admitted before reconciliation or pickup. */
  inspect(handle: Handle): ({groupKey: string} & Record<string, unknown>) | undefined;
  create(delivery: WorldDeliveryRecord): Synchronous<Handle>;
  remove(handle: Handle): undefined;
}
export interface WorldDeliveryOptions<Handle extends HandleValue> {
  groupKey: string; worldKey: string;
  admitDrop(value: unknown): SessionJSON;
  admitPlacement(value: unknown, drop: SessionJSON): WorldPlacement;
  world: WorldDeliveryPorts<Handle>;
}
export interface WorldDeliveryResult {revision: number; created: number; retired: number; preserved: number}
export interface DeliveryFrameOwner<Reply> {
  readonly status: string;
  submit(actions: readonly PickupAction[]): Reply;
}
export interface DeliveryFrameOptions<Handle extends HandleValue, Seat, Reply> {
  binding: Pick<WorldDeliveryBinding<Handle>, 'status' | 'pickup'>;
  owner: DeliveryFrameOwner<Reply>;
  characterOf(seat: Seat): string | undefined;
}
export interface PickupAuthorizationRequest {groupKey: string; characterKey: string; delivery: {id: number}}
const copy = <T>(value: T): T => copySessionJSON(value) as T;
const sync = <T>(value: T, label: string): T => {
  need(!value || typeof (value as {then?: unknown}).then !== 'function', label + '-must-be-synchronous'); return value;
};
const key = (value: unknown): string | undefined => JSON.stringify(value, (_k: string, v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, (v as Record<string, unknown>)[k]])) : v);

/** One durable delivery namespace in one trusted live world. Retained handles
 * keep position, animation, grace and other transient fields. Creation belongs
 * to the host, which applies the already admitted birth placement. */
export class WorldDeliveryBinding<Handle extends HandleValue> {
  readonly #worldKey: string;
  readonly #admitPlacement: WorldDeliveryOptions<Handle>['admitPlacement'];
  readonly #group: string;
  readonly #admit: WorldDeliveryOptions<Handle>['admitDrop'];
  readonly #world: WorldDeliveryPorts<Handle>;
  #revision = 0;
  #body: string | undefined;
  #handles = new Map<number, Handle>();
  #rows = new Map<number, WorldDeliveryRow>();
  #busy = false;
  #failed = false;
  constructor({groupKey, worldKey, admitDrop, admitPlacement, world}: WorldDeliveryOptions<Handle>) {
    text(worldKey); need(typeof admitPlacement === 'function', 'placement-codec-required');
    this.#worldKey = worldKey; this.#admitPlacement = admitPlacement;
    text(groupKey); need(typeof admitDrop === 'function', 'delivery-codec-required');
    for (const name of ['list', 'inspect', 'create', 'remove'] as const)
      need(typeof world?.[name] === 'function', 'delivery-world-' + name + '-required');
    this.#group = groupKey; this.#admit = admitDrop; this.#world = world;
  }
  get status(): 'unbound' | 'ready' | 'reconciling' | 'recovery-required' {
    return this.#failed ? 'recovery-required' : this.#busy ? 'reconciling' : this.#revision ? 'ready' : 'unbound';
  }
  #check(): void {need(!this.#failed, 'delivery-world-recovery-required'); need(!this.#busy, 'reentrant-delivery-world');}
  #row(raw: unknown): WorldDeliveryRow {
    const row = copySessionJSON(raw); fields(row, ['id', 'characterKey', 'drop', 'placement']); integer(row.id, 1); text(row.characterKey);
    row.drop = copy(this.#admit(row.drop));
    row.placement = copy(sync(this.#admitPlacement(row.placement, row.drop as SessionJSON), 'world-placement-admission'));
    return row as unknown as WorldDeliveryRow;
  }
  #list(): Handle[] {const list = sync(this.#world.list(), 'delivery-world-list'); array(list, 65536); return list.slice();}
  #inspect(handle: Handle): WorldDeliveryRow | undefined {
    const value = sync(this.#world.inspect(handle), 'delivery-world-inspect');
    if (value === undefined || value?.groupKey !== this.#group) return undefined;
    fields(value, ['groupKey', 'id', 'characterKey', 'drop', 'placement']);
    const row = this.#row({id: value.id, characterKey: value.characterKey, drop: value.drop, placement: value.placement});
    return row.placement.worldKey === this.#worldKey ? row : undefined;
  }
  reconcile(raw: unknown): WorldDeliveryResult {
    this.#check(); this.#busy = true; let mutating = false;
    try {
      const input = copySessionJSON(raw); fields(input, ['groupKey', 'revision', 'rows']);
      need(input.groupKey === this.#group, 'foreign-delivery-group'); integer(input.revision, 1); array(input.rows, 256);
      need(input.revision >= this.#revision, 'stale-delivery-revision');
      const all = input.rows.map(row => this.#row(row)), seen = new Set<number>();
      for (const row of all) {need(!seen.has(row.id), 'duplicate-delivery-id'); seen.add(row.id);}
      const rows = all.filter(row => row.placement.worldKey === this.#worldKey), wanted = new Map(rows.map(row => [row.id, row]));
      const body = key(all); need(input.revision !== this.#revision || body === this.#body, 'conflicting-delivery-revision');
      const retained = new Map<number, Handle>(), remove: Handle[] = [], seenHandles = new Set<Handle>();
      for (const handle of this.#list()) {
        const present = this.#inspect(handle); if (!present) continue;
        need(!seenHandles.has(handle), 'duplicate-world-handle'); seenHandles.add(handle);
        const expected = wanted.get(present.id);
        if (!expected || retained.has(present.id)) {remove.push(handle); continue;}
        need(key(present) === key(expected), 'delivery-world-payload-mismatch'); retained.set(present.id, handle);
      }
      const missing = rows.filter(row => !retained.has(row.id));
      // Admission precedes world mutation. A failed callback after this point
      // requires a fresh binding and an authoritative saved snapshot.
      mutating = true;
      for (const row of missing) {
        const handle = sync(this.#world.create(copy({groupKey: this.#group, ...row})), 'delivery-world-create');
        need(handle !== undefined, 'missing-created-delivery');
        need(key(this.#inspect(handle)) === key(row), 'invalid-created-delivery'); retained.set(row.id, handle);
      }
      for (const handle of remove) sync(this.#world.remove(handle), 'delivery-world-remove');
      const actual = new Map<number, Handle>();
      for (const handle of this.#list()) {
        const row = this.#inspect(handle); if (!row) continue;
        need(!actual.has(row.id), 'duplicate-world-delivery');
        need(wanted.has(row.id) && key(wanted.get(row.id)) === key(row), 'unreconciled-world-delivery'); actual.set(row.id, handle);
      }
      need(actual.size === wanted.size, 'missing-world-delivery');
      this.#revision = input.revision; this.#body = body; this.#handles = actual; this.#rows = wanted;
      return {revision: input.revision, created: missing.length, retired: remove.length, preserved: rows.length - missing.length};
    } catch (error) {if (mutating) this.#failed = true; throw error;}
    finally {this.#busy = false;}
  }
  pickup(handle: Handle, characterKey: string): PickupAction {
    this.#check(); need(this.#revision > 0, 'delivery-world-unbound'); text(characterKey);
    const row = this.#inspect(handle); need(row && this.#handles.get(row.id) === handle, 'foreign-world-delivery');
    need(key(row) === key(this.#rows.get(row.id)), 'delivery-world-payload-mismatch');
    return {kind: 'pickup', characterKey, deliveryId: row.id};
  }
}

/** The host brackets its ordinary drop update. Eligibility belongs to that
 * loop. Pending saves suppress repeat requests while world simulation runs.
 * Scratch arrays are reused; a submitted batch owns a detached array. */
export class WorldDeliveryFrame<Handle extends HandleValue, Seat, Reply> {
  readonly #binding: DeliveryFrameOptions<Handle, Seat, Reply>['binding'];
  readonly #owner: DeliveryFrameOwner<Reply>;
  readonly #characterOf: DeliveryFrameOptions<Handle, Seat, Reply>['characterOf'];
  readonly #actions: PickupAction[] = [];
  readonly #ids = new Set<number>();
  #open = false;
  #enabled = false;
  constructor({binding, owner, characterOf}: DeliveryFrameOptions<Handle, Seat, Reply>) {
    need(binding && owner && typeof characterOf === 'function', 'delivery-frame-services-required');
    this.#binding = binding; this.#owner = owner; this.#characterOf = characterOf;
  }
  begin(): void {need(!this.#open, 'delivery-frame-open'); this.#open = true; this.#enabled = this.#owner.status === 'ready' && this.#binding.status === 'ready';}
  offer(handle: Handle, seat: Seat): void {
    need(this.#open, 'delivery-frame-not-open'); if (!this.#enabled || this.#actions.length === 16) return;
    const characterKey = sync(this.#characterOf(seat), 'delivery-character'); if (characterKey === undefined) return;
    const action = this.#binding.pickup(handle, characterKey); if (this.#ids.has(action.deliveryId)) return;
    this.#ids.add(action.deliveryId); this.#actions.push(action);
  }
  cancel(): void {need(this.#open, 'delivery-frame-not-open'); this.#actions.length = 0; this.#ids.clear(); this.#open = false; this.#enabled = false;}
  end(): Reply | undefined {
    need(this.#open, 'delivery-frame-not-open'); const actions = this.#actions.length ? this.#actions.slice() : undefined;
    this.cancel(); return actions ? this.#owner.submit(actions) : undefined;
  }
}

/** Only eligibility offers from the current world update authorize synchronous
 * preparation. A permit never survives a promise boundary, cancellation,
 * failed submission, or recovery. */
export class LocatedPickupFrame<Handle extends HandleValue, Seat, Reply> {
  readonly #frame: WorldDeliveryFrame<Handle, Seat, Reply>;
  readonly #group: string;
  readonly #grants = new Map<number, string>();
  #submitting = false;
  constructor({groupKey, binding, owner, characterOf}: DeliveryFrameOptions<Handle, Seat, Reply> & {groupKey: string}) {
    text(groupKey); this.#group = groupKey; const self = this;
    const scopedOwner: DeliveryFrameOwner<Reply> = {
      get status() {return owner.status;},
      submit(actions) {
        need(!self.#submitting, 'reentrant-pickup-authority'); self.#submitting = true;
        try {
          for (const action of actions) self.#grants.set(action.deliveryId, action.characterKey);
          return owner.submit(actions);
        } finally {self.#grants.clear(); self.#submitting = false;}
      },
    };
    this.#frame = new WorldDeliveryFrame({binding, owner: scopedOwner, characterOf});
  }
  begin(): void {this.#frame.begin();}
  offer(handle: Handle, seat: Seat): void {this.#frame.offer(handle, seat);}
  cancel(): void {this.#frame.cancel();}
  end(): Reply | undefined {return this.#frame.end();}
  authorizePickup({groupKey, characterKey, delivery}: PickupAuthorizationRequest): boolean {
    if (!this.#submitting || groupKey !== this.#group || this.#grants.get(delivery.id) !== characterKey) return false;
    this.#grants.delete(delivery.id); return true;
  }
}
