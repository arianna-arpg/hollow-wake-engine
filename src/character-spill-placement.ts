import {Random} from './random.js';
import {copySessionJSON, requireSession as need, sessionFields as fields,
  sessionRecord as record, sessionInteger as integer, sessionText as text,
  sessionArray as array, type SessionJSON} from './session-json.js';
import type {CharacterDeliveryPort, LocatedDelivery} from './durable-character-located-owner.js';

export type GroundPosition = {x: number; y: number};
export type SpillStream = {
  schemaVersion: 1; capability: 'hollow-wake-spill-stream/v1';
  random: {algorithm: 'mulberry32/v1'; state: number; draws: number};
};
export type GroundPlacement = {
  schemaVersion: 1; capability: 'hollow-wake-ground/v1';
  worldKey: string; pos: GroundPosition; bob: number; tier?: number;
};
export interface SpillObservationRequest {
  groupKey: string; characterKey: string; deliveryId: number; kind: 'skill' | 'support';
}
export interface GroundPickupRequest {
  groupKey: string; characterKey: string;
  delivery: LocatedDelivery & {placement: GroundPlacement};
}
export interface HollowWakePlacementHost {
  observe(request: SpillObservationRequest): {worldKey: string; pos: GroundPosition; tier: number};
  clamp(worldKey: string, pos: GroundPosition, radius: number, from?: GroundPosition, options?: {tier: number}): GroundPosition;
  canPickup(request: GroundPickupRequest): boolean;
}
const sync = <T>(value: T, label: string): T => {
  need(!value || typeof (value as {then?: unknown}).then !== 'function', label + '-must-be-synchronous'); return value;
};
function number(value: unknown): asserts value is number {
  need(typeof value === 'number' && Number.isFinite(value), 'invalid-placement-number');
}
function position(value: unknown): asserts value is GroundPosition {
  fields(value, ['x', 'y']); number(value.x); number(value.y);
}
function randomState(value: unknown): asserts value is SpillStream['random'] {
  fields(value, ['algorithm', 'state', 'draws']);
  // The stream owns algorithm and safe-integer admission; do not duplicate it.
  Random.restore(value as SpillStream['random']);
}
function dropKind(value: unknown): 'skill' | 'support' {
  record(value); need(value.kind === 'skill' || value.kind === 'support', 'unknown-placement-kind'); return value.kind;
}

/** Hollow Wake's bare-gem spill geometry over explicit world observations.
 * Placement has its own saved stream. Floating-text jitter remains a host
 * presentation effect; this is not global World random-stream equivalence. */
export class HollowWakeSpillPlacement implements CharacterDeliveryPort {
  readonly #observe: HollowWakePlacementHost['observe'];
  readonly #clamp: HollowWakePlacementHost['clamp'];
  readonly #canPickup: HollowWakePlacementHost['canPickup'];
  constructor({observe, clamp, canPickup}: HollowWakePlacementHost) {
    for (const fn of [observe, clamp, canPickup]) need(typeof fn === 'function', 'placement-host-required');
    this.#observe = observe; this.#clamp = clamp; this.#canPickup = canPickup;
  }
  seed(seed: number): SpillStream {
    return {schemaVersion: 1, capability: 'hollow-wake-spill-stream/v1', random: new Random(seed).snapshot()};
  }
  admitState(raw: unknown): SpillStream {
    const state = copySessionJSON(raw); fields(state, ['schemaVersion', 'capability', 'random']);
    need(state.schemaVersion === 1 && state.capability === 'hollow-wake-spill-stream/v1', 'unsupported-placement-stream');
    randomState(state.random); return state as SpillStream;
  }
  admitPlacement(raw: unknown, drop: SessionJSON): GroundPlacement {
    const value = copySessionJSON(raw); fields(value, ['schemaVersion', 'capability', 'worldKey', 'pos', 'bob', 'tier']);
    need(value.schemaVersion === 1 && value.capability === 'hollow-wake-ground/v1', 'unsupported-placement');
    text(value.worldKey); position(value.pos); number(value.bob); need(value.bob >= 0 && value.bob < Math.PI * 2, 'invalid-placement-bob');
    if (dropKind(drop) === 'skill') integer(value.tier, 0);
    else need(!Object.hasOwn(value, 'tier'), 'unexpected-support-tier');
    return value as GroundPlacement;
  }
  #context(groupKey: string, characterKey: string, deliveryId: number, kind: 'skill' | 'support') {
    const context = copySessionJSON(sync(this.#observe({groupKey, characterKey, deliveryId, kind}), 'placement-observation'));
    fields(context, ['worldKey', 'pos', 'tier']); text(context.worldKey); position(context.pos); integer(context.tier, 0);
    return context as {worldKey: string; pos: GroundPosition; tier: number};
  }
  prepare(raw: unknown): {state: SpillStream; placements: {id: number; placement: GroundPlacement}[]} {
    const input = copySessionJSON(raw); fields(input, ['groupKey', 'state', 'rows']); text(input.groupKey); array(input.rows, 256);
    const groupKey = input.groupKey, state = this.admitState(input.state), random = Random.restore(state.random), seen = new Set<number>();
    need(state.random.draws <= Number.MAX_SAFE_INTEGER - input.rows.length * 3, 'placement-stream-exhausted');
    const placements = input.rows.map(row => {
      fields(row, ['id', 'characterKey', 'drop']); integer(row.id, 1); text(row.characterKey);
      need(!seen.has(row.id), 'duplicate-delivery-id'); seen.add(row.id); const kind = dropKind(row.drop);
      const context = this.#context(groupKey, row.characterKey, row.id, kind);
      const at = {x: context.pos.x + (-14 + random.next() * 28), y: context.pos.y + (-14 + random.next() * 28)};
      const pos = sync(kind === 'skill'
        ? this.#clamp(context.worldKey, at, 10, undefined, context.tier >= 1 ? {tier: context.tier} : undefined)
        : this.#clamp(context.worldKey, at, 10), 'placement-clamp');
      const placement = this.admitPlacement({schemaVersion: 1, capability: 'hollow-wake-ground/v1', worldKey: context.worldKey,
        pos: copySessionJSON(pos), bob: random.next() * Math.PI * 2, ...(kind === 'skill' ? {tier: context.tier} : {})}, row.drop as SessionJSON);
      return {id: row.id, placement};
    });
    return {state: {...state, random: random.snapshot()}, placements};
  }
  authorizePickup(raw: unknown): boolean {
    const input = copySessionJSON(raw); fields(input, ['groupKey', 'characterKey', 'delivery']); text(input.groupKey); text(input.characterKey);
    const row = input.delivery; fields(row, ['id', 'characterKey', 'drop', 'placement']); integer(row.id, 1);
    // This port is also callable directly: admit the source address before a
    // typed host receives it, even without an upstream coordinator.
    text(row.characterKey);
    const placement = this.admitPlacement(row.placement, row.drop as SessionJSON);
    const context = this.#context(input.groupKey, input.characterKey, row.id, dropKind(row.drop));
    return context.worldKey === placement.worldKey && sync(this.#canPickup(input as unknown as GroundPickupRequest), 'placement-pickup-authority') === true;
  }
}
