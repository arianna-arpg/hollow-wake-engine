import type {PrivateBuildTransition,PreparedCharacterCommand} from './complete-character-contracts.js';
import {copySessionJSON, requireSession as need, sessionFields as fields,
  sessionRecord as record, sessionInteger as integer, sessionText as text,
  sessionArray as array, type SessionJSON} from './session-json.js';

type JSONRecord = Record<string, SessionJSON>;
const clone = <T>(value: T): T => copySessionJSON(value) as T;
const object = (value: unknown): JSONRecord => { record(value); return value as JSONRecord; };
const requireReply = (value: unknown): JSONRecord => {
  const reply = object(value);
  need(reply.ok === true, typeof reply.reason === 'string' ? reply.reason : 'character-owner-refused');
  return reply;
};
const synchronous = <T>(value: T, label: string): T => {
  need(!value || typeof (value as {then?: unknown}).then !== 'function', label + '-must-be-synchronous');
  return value;
};

export interface CharacterBinding {key: string; handle: number}
export interface PendingDelivery {id: number; characterKey: string; drop: SessionJSON}
export interface LocatedDelivery extends PendingDelivery {placement: SessionJSON}
export interface CharacterOutbox {nextId: number; rows: LocatedDelivery[]}
export interface LocatedCharacterGroup {
  schemaVersion: 2;
  capability: 'durable-character-group/located-diagnostic';
  account: JSONRecord;
  characters: {key: string; save: SessionJSON}[];
  outbox: CharacterOutbox;
  deliveryState: SessionJSON;
}
export interface CharacterGroupSnapshot {revision: number; body: LocatedCharacterGroup}
export type CharacterStorageResult = {status: 'committed'; revision: number} | {status: 'refused' | 'conflict'};
/** A port owns atomic compare-and-swap of the entire aggregate. Unknown read
 * data is admitted before use. A rejected or lost commit acknowledgement is
 * uncertain, not proof that storage rolled back. */
export interface CharacterGroupStorage {
  read(key: string): unknown | Promise<unknown>;
  commit(key: string, expectedRevision: number, body: LocatedCharacterGroup): CharacterStorageResult | Promise<CharacterStorageResult>;
}
export type CharacterTransition=PrivateBuildTransition;
export type CharacterJournalEntry=PreparedCharacterCommand;
export interface PrivateCharacterOwner {
  command(input: unknown): unknown;
  preparedJournal(token: number): readonly CharacterJournalEntry[];
}
export interface CharacterSettlement {id: number; characterKey: string; sourceCharacterKey: string}
export interface CharacterPublication {
  groupKey: string;
  journal: readonly CharacterJournalEntry[];
  deliveries: LocatedDelivery[];
  settlements: CharacterSettlement[];
}
export interface CharacterPublicationPreparation extends CharacterPublication {
  current: CharacterGroupSnapshot;
  candidate: CharacterGroupSnapshot;
}
export interface CharacterPublicationCommit extends CharacterPublication {revision: number}
/** These callbacks stay synchronous, including failure/recovery notification.
 * Their undefined result deliberately rejects async callbacks in typed hosts. */
export interface CharacterLivePort<Lease extends object> {
  prepare(packet: CharacterPublicationPreparation): Lease & {readonly then?: never};
  publish(lease: Lease, packet: CharacterPublicationCommit): undefined;
  discard(lease: Lease): undefined;
  recoverRequired(packet: {groupKey: string; error: unknown; lease: Lease | undefined}): undefined;
}
export interface CharacterDeliveryPort {
  admitState(value: unknown): SessionJSON;
  admitPlacement(value: unknown, drop: SessionJSON): SessionJSON;
  prepare(packet: {groupKey: string; state: SessionJSON; rows: PendingDelivery[]}): {
    state: SessionJSON; placements: {id: number; placement: SessionJSON}[];
  };
  authorizePickup(packet: {groupKey: string; characterKey: string; delivery: LocatedDelivery}): boolean;
}
export type CharacterAction =
  | {kind: 'account'; command: JSONRecord}
  | {kind: 'activate'; characterKey: string | null}
  | {kind: 'pickup'; characterKey: string; deliveryId: number}
  | {kind: 'character'; characterKey: string; command: JSONRecord};
export type CharacterSubmission =
  | {status: 'unchanged' | 'committed'; revision: number; replies: SessionJSON}
  | {status: 'refused' | 'conflict'; revision: number};
export interface LocatedCharacterOptions<Lease extends object> {
  createOwner(ports: {resolveDelivery(request: {accountKey: string; profile: number; deliveryId: number}): SessionJSON}): PrivateCharacterOwner;
  storage: CharacterGroupStorage;
  groupKey: string;
  accountKey: string;
  characters: CharacterBinding[];
  live: CharacterLivePort<Lease>;
  admitDrop(value: unknown): SessionJSON;
  delivery: CharacterDeliveryPort;
  initial?: unknown;
}

/** Private integration candidate. The factory transfers sole access to a fresh
 * account owner. Storage compare-and-swap covers unchanged siblings and pending
 * world deliveries. World simulation continues while storage is pending;
 * publication is synchronous and reads retain the last published snapshot. */
export class DurableCharacterOwner<Lease extends object> {
  readonly #delivery: CharacterDeliveryPort;
  readonly #pickupGrants = new Map<number, {profile: number; drop: SessionJSON}>();
  #owner: PrivateCharacterOwner | undefined;
  readonly #storage: CharacterGroupStorage;
  readonly #key: string;
  readonly #accountKey: string;
  readonly #bindings: CharacterBinding[];
  readonly #handles = new Map<number, string>();
  readonly #live: CharacterLivePort<Lease>;
  readonly #admitDrop: (value: unknown) => SessionJSON;
  #current: CharacterGroupSnapshot | undefined;
  #busy = false;
  #poisoned = false;

  static async open<Lease extends object>(options: LocatedCharacterOptions<Lease>): Promise<DurableCharacterOwner<Lease>> {
    const owner = new DurableCharacterOwner(options);
    await owner.#open(options.initial);
    return owner;
  }
  private constructor({createOwner, storage, groupKey, accountKey, characters, live, admitDrop, delivery}: LocatedCharacterOptions<Lease>) {
    for (const method of ['admitState', 'admitPlacement', 'prepare', 'authorizePickup'] as const)
      need(typeof delivery?.[method] === 'function', 'delivery-' + method + '-required');
    this.#delivery = delivery;
    text(groupKey); text(accountKey); array(characters, 7); need(characters.length > 0, 'character-group-empty');
    need(typeof createOwner === 'function' && typeof admitDrop === 'function', 'character-services-required');
    need(typeof storage?.read === 'function' && typeof storage?.commit === 'function', 'grouped-storage-required');
    for (const method of ['prepare', 'publish', 'discard', 'recoverRequired'] as const)
      need(typeof live?.[method] === 'function', 'live-' + method + '-required');
    this.#bindings = clone(characters);
    const keys = new Set<string>();
    for (const row of this.#bindings) {
      fields(row, ['key', 'handle']); text(row.key); integer(row.handle, 0, 0xffffffff);
      need(!keys.has(row.key) && !this.#handles.has(row.handle), 'duplicate-character-binding');
      keys.add(row.key); this.#handles.set(row.handle, row.key);
    }
    this.#owner = createOwner({resolveDelivery: ({accountKey, profile, deliveryId}) => {
      const grant = this.#pickupGrants.get(deliveryId);
      need(this.#busy && accountKey === this.#accountKey && grant?.profile === profile, 'unauthorized-delivery-pickup');
      return clone(grant.drop);
    }});
    this.#storage = storage; this.#key = groupKey; this.#accountKey = accountKey; this.#live = live; this.#admitDrop = admitDrop;
  }
  get status(): 'opening' | 'ready' | 'pending' | 'recovery-required' {
    return this.#poisoned ? 'recovery-required' : this.#busy ? 'pending' : this.#current ? 'ready' : 'opening';
  }
  get #engine(): PrivateCharacterOwner {need(this.#owner, 'character-recovery-required'); return this.#owner;}
  #check(): CharacterGroupSnapshot {
    need(!this.#poisoned, 'character-recovery-required'); need(this.#current, 'character-not-ready'); return this.#current;
  }
  #recover(error: unknown, lease: Lease | undefined): void {
    const first = !this.#poisoned; this.#poisoned = true; this.#owner = undefined;
    if (first) synchronous(this.#live.recoverRequired({groupKey: this.#key, error, lease}), 'live-recovery');
  }
  #outbox(value: unknown): CharacterOutbox {
    const out = clone(value); fields(out, ['nextId', 'rows']); integer(out.nextId, 1); array(out.rows, 256);
    const seen = new Set<number>(), keys = new Set(this.#bindings.map(row => row.key));
    const rows = out.rows.map(row => {
      fields(row, ['id', 'characterKey', 'drop', 'placement']); integer(row.id, 1, out.nextId as number - 1); text(row.characterKey);
      need(keys.has(row.characterKey), 'foreign-delivery-character'); need(!seen.has(row.id), 'duplicate-delivery-id'); seen.add(row.id);
      const drop = clone(this.#admitDrop(row.drop));
      const placement = clone(synchronous(this.#delivery.admitPlacement(row.placement, drop), 'delivery-admission'));
      return {id: row.id, characterKey: row.characterKey, drop, placement};
    });
    return {nextId: out.nextId, rows};
  }
  #copyGroup(group: unknown): LocatedCharacterGroup {
    // Eight legal records must not accidentally share one record's byte limit.
    fields(group, ['schemaVersion', 'capability', 'account', 'characters', 'outbox', 'deliveryState']);
    need(group.schemaVersion === 2 && group.capability === 'durable-character-group/located-diagnostic', 'unsupported-character-group');
    array(group.characters, 7); need(group.characters.length === this.#bindings.length, 'character-group-mismatch');
    const account = object(clone(group.account)); need(account.key === this.#accountKey, 'foreign-group-account');
    const seen = new Set<string>(), characters = group.characters.map(row => {
      fields(row, ['key', 'save']); text(row.key);
      need(this.#bindings.some(b => b.key === row.key) && !seen.has(row.key), 'foreign-group-character'); seen.add(row.key);
      return {key: row.key, save: copySessionJSON(row.save)};
    });
    return {schemaVersion: 2, capability: 'durable-character-group/located-diagnostic', account, characters,
      outbox: this.#outbox(group.outbox), deliveryState: clone(synchronous(this.#delivery.admitState(group.deliveryState), 'delivery-state-admission'))};
  }
  #snapshot(body: unknown, revision: number): CharacterGroupSnapshot {integer(revision, 1); return {revision, body: this.#copyGroup(body)};}
  read(): CharacterGroupSnapshot {const current = this.#check(); return this.#snapshot(current.body, current.revision);}
  #saved(outbox: CharacterOutbox, deliveryState: unknown): unknown {
    return {schemaVersion: 2, capability: 'durable-character-group/located-diagnostic',
      account: requireReply(this.#engine.command({op: 'account-save', account: 1})).save,
      characters: this.#bindings.map(row => ({key: row.key, save: requireReply(this.#engine.command({op: 'workshop-save', profile: row.handle})).save})),
      outbox, deliveryState};
  }
  async #open(initial: unknown): Promise<void> {
    try {
      const stored = await this.#storage.read(this.#key);
      if (stored) {
        fields(stored, ['revision', 'body']); integer(stored.revision, 1);
        const current = this.#snapshot(stored.body, stored.revision);
        requireReply(this.#engine.command({op: 'restore-account', account: 1, save: current.body.account}));
        for (const binding of this.#bindings) {
          const row = current.body.characters.find(row => row.key === binding.key)!;
          requireReply(this.#engine.command({op: 'restore-workshop', profile: binding.handle, account: 1, save: row.save}));
        }
        // Admission may normalize investment; preserve the stored revision fence.
        this.#current = this.#snapshot(this.#saved(current.body.outbox, current.body.deliveryState), current.revision); return;
      }
      need(initial, 'character-group-missing'); fields(initial, ['account', 'characters', 'deliveryState']);
      array(initial.characters, 7); need(initial.characters.length === this.#bindings.length, 'character-group-mismatch');
      const account = object(clone(initial.account)); need(account.key === this.#accountKey, 'foreign-group-account');
      need(!Object.hasOwn(account, 'op') && !Object.hasOwn(account, 'account'), 'initial-account-address');
      requireReply(this.#engine.command({...account, op: 'open-account', account: 1}));
      const seen = new Set();
      for (const row of initial.characters) {
        fields(row, ['key', 'start']); need(!seen.has(row.key), 'duplicate-character-binding'); seen.add(row.key);
        const binding = this.#bindings.find(b => b.key === row.key); need(binding, 'foreign-group-character');
        const start = object(clone(row.start));
        for (const field of ['op', 'profile', 'account']) need(!Object.hasOwn(start, field), 'initial-character-address');
        requireReply(this.#engine.command({...start, op: 'open-workshop', profile: binding.handle, account: 1}));
      }
      const body = this.#copyGroup(this.#saved({nextId: 1, rows: []}, initial.deliveryState));
      const result = await this.#storage.commit(this.#key, 0, this.#copyGroup(body));
      need(result?.status === 'committed' && result.revision === 1, 'initial-character-save-refused');
      this.#current = {revision: 1, body};
    } catch (error) {this.#poisoned = true; this.#owner = undefined; throw error;}
  }
  #commands(actions: unknown): SessionJSON[] {
    const values = clone(actions); array(values, 16); need(values.length > 0, 'invalid-command-batch');
    return values.map((raw): SessionJSON => {
      const row = object(raw);
      if (row.kind === 'account') {fields(row, ['kind', 'command']); return {op: 'account', account: 1, command: row.command};}
      if (row.kind === 'activate') {
        fields(row, ['kind', 'characterKey']);
        const binding = row.characterKey === null ? null : this.#bindings.find(b => b.key === row.characterKey);
        need(row.characterKey === null || binding, 'foreign-group-character');
        return {op: 'activate-workshop', account: 1, profile: binding?.handle ?? null};
      }
      if (row.kind === 'pickup') {
        fields(row, ['kind', 'characterKey', 'deliveryId']); integer(row.deliveryId, 1);
        const binding = this.#bindings.find(b => b.key === row.characterKey); need(binding, 'foreign-group-character');
        const delivery = this.#check().body.outbox.rows.find(d => d.id === row.deliveryId); need(delivery, 'unknown-pending-delivery');
        need(!this.#pickupGrants.has(row.deliveryId), 'duplicate-pickup-delivery');
        need(synchronous(this.#delivery.authorizePickup({groupKey: this.#key, characterKey: binding.key, delivery: clone(delivery)}), 'delivery-pickup-authority') === true, 'pickup-not-authorized');
        this.#pickupGrants.set(row.deliveryId, {profile: binding.handle, drop: delivery.drop});
        return {op: 'workshop', profile: binding.handle, command: {op: 'character-pickup', command: {op: 'pickup', deliveryId: row.deliveryId}}};
      }
      const command = object(row.command); need(command.op !== 'character-pickup', 'durable-pickup-action-required');
      fields(row, ['kind', 'characterKey', 'command']); need(row.kind === 'character', 'invalid-character-action');
      const binding = this.#bindings.find(b => b.key === row.characterKey); need(binding, 'foreign-group-character');
      return {op: 'workshop', profile: binding.handle, command};
    });
  }
  async submit(actions: readonly CharacterAction[]): Promise<CharacterSubmission> {
    const current = this.#check(); need(!this.#busy, 'character-save-pending'); this.#busy = true;
    let pending: number | undefined, lease: Lease | undefined;
    let prepared = false, commitAttempted = false, committed = false, leaseUncertain = false;
    try {
      const reply = requireReply(this.#engine.command({op: 'prepare', commands: this.#commands(actions)}));
      integer(reply.token, 0); pending = reply.token;
      if (!pending) return {status: 'unchanged', replies: clone(reply.replies), revision: current.revision};
      const journal = this.#engine.preparedJournal(pending), body = this.#copyGroup(current.body);
      array(reply.writes, 8);
      for (const write of reply.writes) {
        fields(write, ['kind', 'handle']); integer(write.handle, 0, 0xffffffff);
        need(write.kind === 'account' || write.kind === 'workshop', 'foreign-group-write');
        const saved = requireReply(this.#engine.command({op: 'prepared-save', token: pending, kind: write.kind, handle: write.handle})).save;
        if (write.kind === 'account') {need(write.handle === 1, 'foreign-group-write'); body.account = object(saved);}
        else {const key = this.#handles.get(write.handle), row = body.characters.find(row => row.key === key); need(row, 'foreign-group-write'); row.save = saved;}
      }
      const pendingDeliveries: PendingDelivery[] = [], deliveries: LocatedDelivery[] = [], settlements: CharacterSettlement[] = [];
      for (const entry of journal) {
        const command = object(entry.command);
        if (command.op !== 'workshop') continue;
        const request = object(command.command); if (request.op !== 'character-pickup') continue;
        const id = object(request.command).deliveryId; integer(id, 1);
        const grant = this.#pickupGrants.get(id); need(grant?.profile === command.profile, 'unauthorized-delivery-pickup');
        const reply = object(object(entry.reply).reply); need(reply.deliveryId === id, 'pickup-reply-mismatch');
        if (reply.accepted === true) {
          const index = body.outbox.rows.findIndex(row => row.id === id); need(index >= 0, 'unknown-pending-delivery');
          const [delivery] = body.outbox.rows.splice(index, 1);
          const characterKey = this.#handles.get(grant.profile); need(characterKey, 'foreign-group-write');
          settlements.push({id, characterKey, sourceCharacterKey: delivery.characterKey});
        }
      }
      for (const entry of journal) {
        const detail = object(entry.reply).reply;
        const drops = detail == null ? [] : object(detail).worldDrops ?? []; array(drops, 64); if (!drops.length) continue;
        const command = object(entry.command); need(command.op === 'workshop', 'unowned-world-delivery'); integer(command.profile, 0, 0xffffffff);
        const key = this.#handles.get(command.profile); need(key, 'foreign-group-write');
        for (const drop of drops) {
          integer(body.outbox.nextId, 1, Number.MAX_SAFE_INTEGER - 1);
          pendingDeliveries.push({id: body.outbox.nextId++, characterKey: key, drop: clone(this.#admitDrop(drop))});
        }
      }
      if (pendingDeliveries.length) {
        const planned = synchronous(this.#delivery.prepare({groupKey: this.#key, state: clone(body.deliveryState), rows: clone(pendingDeliveries)}), 'delivery-preparation');
        fields(planned, ['state', 'placements']); array(planned.placements, 256); need(planned.placements.length === pendingDeliveries.length, 'delivery-placement-count');
        body.deliveryState = clone(synchronous(this.#delivery.admitState(planned.state), 'delivery-state-admission'));
        for (let n = 0; n < pendingDeliveries.length; n++) {
          const plannedRow = planned.placements[n], pendingRow = pendingDeliveries[n];
          fields(plannedRow, ['id', 'placement']); need(plannedRow.id === pendingRow.id, 'delivery-placement-address');
          const row = {...pendingRow, placement: clone(synchronous(this.#delivery.admitPlacement(plannedRow.placement, pendingRow.drop), 'delivery-admission'))};
          body.outbox.rows.push(row); deliveries.push(row);
        }
      }
      const next = this.#copyGroup(body); integer(current.revision, 1, Number.MAX_SAFE_INTEGER - 1);
      lease = synchronous(this.#live.prepare({groupKey: this.#key, journal, current: this.read(), candidate: this.#snapshot(next, current.revision + 1), deliveries: clone(deliveries), settlements: clone(settlements)}), 'live-prepare');
      prepared = true;
      commitAttempted = true;
      const result = await this.#storage.commit(this.#key, current.revision, this.#copyGroup(next));
      if (result?.status !== 'committed') {
        need(result?.status === 'refused' || result?.status === 'conflict', 'unknown-storage-outcome'); commitAttempted = false;
        prepared = false;
        try {synchronous(this.#live.discard(lease), 'live-discard');} catch (error) {leaseUncertain = true; throw error;}
        requireReply(this.#engine.command({op: 'abort-prepared', token: pending})); pending = undefined;
        if (result.status === 'conflict') this.#recover(Error('stale-character-group'), undefined);
        return {status: result.status, revision: current.revision};
      }
      committed = true; need(result.revision === current.revision + 1, 'invalid-storage-revision');
      requireReply(this.#engine.command({op: 'commit-prepared', token: pending})); pending = undefined;
      synchronous(this.#live.publish(lease, {groupKey: this.#key, revision: result.revision, journal, deliveries: clone(deliveries), settlements: clone(settlements)}), 'live-publish');
      prepared = false; this.#current = {revision: result.revision, body: next};
      return {status: 'committed', revision: result.revision, replies: clone(journal.map(row => row.reply))};
    } catch (error) {
      if (this.#poisoned || commitAttempted || committed || leaseUncertain) this.#recover(error, lease);
      else {
        try {
          if (prepared) {need(lease, 'missing-live-lease'); synchronous(this.#live.discard(lease), 'live-discard');}
          if (pending) requireReply(this.#engine.command({op: 'abort-prepared', token: pending}));
        } catch (failure) {this.#recover(failure, lease);}
      }
      throw error;
    } finally {this.#pickupGrants.clear(); this.#busy = false;}
  }
}
