import {requireSession as need} from './session-json.js';
import {WorldDeliveryBinding, LocatedPickupFrame,
  type WorldDeliveryOptions, type PickupAuthorizationRequest} from './character-world-located-deliveries.js';
import type {DurableCharacterOwner, CharacterAction, CharacterSubmission,
  CharacterGroupSnapshot, CharacterLivePort} from './durable-character-located-owner.js';

type HandleValue = object | number | string;
type Eligibility<Handle, Seat> = (handle: Handle, seat: Seat) => void;
export interface CharacterWorldAdapterOptions<Handle extends HandleValue, Seat, Lease extends object> {
  world: WorldDeliveryOptions<Handle>;
  characterOf(seat: Seat): string | undefined;
  /** Checks the lifetime of this exact scene instance, not merely its saved key. */
  isCurrent(): boolean;
  createOwner(ports: {
    live: CharacterLivePort<Lease>;
    authorizePickup(request: PickupAuthorizationRequest): boolean;
  }): Promise<DurableCharacterOwner<Lease>>;
  /** Publishes ordered character effects. Delivery reconciliation follows it. */
  live: CharacterLivePort<Lease>;
  /** Reconnects a loaded character without replaying pickup effects. */
  restore(snapshot: CharacterGroupSnapshot): undefined;
}
const sync = <T>(value: T, label: string): T => {
  need(!value || typeof (value as {then?: unknown}).then !== 'function', label + '-must-be-synchronous');
  return value;
};

/** Owns one world lifetime around durable character operations. Storage may
 * finish after departure; that saved result remains authoritative, but its
 * publication cannot enter a retired scene. Recovery opens a fresh adapter. */
export class CharacterWorldAdapter<Handle extends HandleValue, Seat, Lease extends object> {
  #options: CharacterWorldAdapterOptions<Handle, Seat, Lease> | undefined;
  #binding: WorldDeliveryBinding<Handle> | undefined;
  #owner: DurableCharacterOwner<Lease> | undefined;
  #frame: LocatedPickupFrame<Handle, Seat, Promise<CharacterSubmission>> | undefined;
  #active = true;
  #updating = false;

  private constructor(options: CharacterWorldAdapterOptions<Handle, Seat, Lease>) {
    need(typeof options.isCurrent === 'function' && typeof options.createOwner === 'function' &&
      typeof options.restore === 'function', 'world-adapter-services-required');
    for (const name of ['prepare', 'publish', 'discard', 'recoverRequired'] as const)
      need(typeof options.live?.[name] === 'function', 'world-adapter-live-' + name + '-required');
    this.#options = options;
    this.#binding = new WorldDeliveryBinding(options.world);
  }
  static async open<Handle extends HandleValue, Seat, Lease extends object>(
    options: CharacterWorldAdapterOptions<Handle, Seat, Lease>,
  ): Promise<CharacterWorldAdapter<Handle, Seat, Lease>> {
    const adapter = new CharacterWorldAdapter(options);
    try {
      adapter.#current();
      let prepared: {lease: Lease; candidate: CharacterGroupSnapshot} | undefined;
      const live: CharacterLivePort<Lease> = {
        prepare(packet) {
          adapter.#current(); need(!prepared, 'world-adapter-publication-pending');
          const lease = sync(options.live.prepare(packet), 'world-adapter-prepare');
          prepared = {lease, candidate: packet.candidate}; return lease;
        },
        publish(lease, packet) {
          try {
            adapter.#current();
            need(prepared?.lease === lease && prepared.candidate.revision === packet.revision, 'foreign-world-publication');
            sync(options.live.publish(lease, packet), 'world-adapter-publish');
            adapter.#current(); adapter.#reconcile(prepared.candidate);
          } finally {prepared = undefined;}
        },
        // Cleanup and recovery notification must still run after departure.
        discard(lease) {try {sync(options.live.discard(lease), 'world-adapter-discard');} finally {prepared = undefined;}},
        recoverRequired(packet) {try {sync(options.live.recoverRequired(packet), 'world-adapter-recovery');} finally {prepared = undefined;}},
      };
      adapter.#owner = await options.createOwner({live,
        authorizePickup: request => adapter.#active && adapter.#frame?.authorizePickup(request) === true});
      adapter.#current();
      const snapshot = adapter.#engine.read();
      sync(options.restore(snapshot), 'world-adapter-restore');
      adapter.#current(); adapter.#reconcile(snapshot); adapter.#current();
      need(adapter.#binding, 'world-adapter-disposed');
      adapter.#frame = new LocatedPickupFrame({groupKey: options.world.groupKey, binding: adapter.#binding,
        owner: adapter.#engine, characterOf: options.characterOf});
      return adapter;
    } catch (error) {adapter.dispose(); throw error;}
  }
  get #engine(): DurableCharacterOwner<Lease> {
    need(this.#owner, 'world-adapter-opening'); return this.#owner;
  }
  #current(): void {
    need(this.#active && this.#options, 'world-adapter-disposed');
    if (sync(this.#options.isCurrent(), 'world-adapter-lifetime') !== true) {
      this.dispose(); need(false, 'world-adapter-expired');
    }
  }
  #reconcile(snapshot: CharacterGroupSnapshot): void {
    need(this.#binding && this.#options, 'world-adapter-disposed');
    this.#binding.reconcile({groupKey: this.#options.world.groupKey, revision: snapshot.revision,
      rows: snapshot.body.outbox.rows});
  }
  get status(): 'disposed' | 'opening' | 'ready' | 'pending' | 'recovery-required' {
    return !this.#active ? 'disposed' : this.#owner?.status ?? 'opening';
  }
  read(): CharacterGroupSnapshot {this.#current(); return this.#engine.read();}
  submit(actions: readonly CharacterAction[]): Promise<CharacterSubmission> {
    this.#current(); need(!this.#updating, 'world-adapter-update-active'); return this.#engine.submit(actions);
  }
  /** Brackets the original synchronous eligibility loop. The supplied offer
   * callback expires at the end of this update, including exceptional exits. */
  update(run: (offer: Eligibility<Handle, Seat>) => undefined): Promise<CharacterSubmission> | undefined {
    this.#current(); need(!this.#updating, 'reentrant-world-adapter-update');
    const frame = this.#frame; need(frame, 'world-adapter-opening');
    this.#updating = true; let open = false, eligible = true;
    try {
      frame.begin(); open = true;
      sync(run((handle, seat) => {
        need(eligible, 'expired-world-eligibility'); this.#current(); need(this.#frame, 'world-adapter-disposed'); this.#frame.offer(handle, seat);
      }), 'world-adapter-update');
      this.#current(); eligible = false; open = false; return frame.end();
    } finally {
      eligible = false; if (open) frame.cancel(); this.#updating = false;
    }
  }
  /** Releases owned references without destroying host objects or rolling back
   * storage. An in-flight operation retains its own lease until settlement. */
  dispose(): void {
    this.#active = false;
    this.#owner = undefined; this.#frame = undefined; this.#binding = undefined;
    this.#options = undefined;
  }
}
