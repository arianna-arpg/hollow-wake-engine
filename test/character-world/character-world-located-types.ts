import {WorldDeliveryBinding, WorldDeliveryFrame, LocatedPickupFrame, type WorldDeliveryPorts,
  type WorldDeliveryOptions, type WorldDeliveryRecord, type DeliveryFrameOptions} from '../../src/character-world-located-deliveries.js';
import type {DurableCharacterOwner, CharacterPublicationPreparation, CharacterSubmission} from '../../src/durable-character-located-owner.js';
import type {HollowWakeSpillPlacement} from '../../src/character-spill-placement.js';
type Handle = {id: number; sdkDelivery?: WorldDeliveryRecord};
type Seat = {characterKey: string};
declare const owner: DurableCharacterOwner<CharacterPublicationPreparation>;
declare const placement: HollowWakeSpillPlacement;
declare const options: WorldDeliveryOptions<Handle>;
const world: WorldDeliveryPorts<Handle> = {
  list: () => [], inspect: handle => handle.sdkDelivery,
  create: delivery => ({id: delivery.id, sdkDelivery: delivery}), remove() {},
};
const binding = new WorldDeliveryBinding({...options, world, admitPlacement: (value, drop) => placement.admitPlacement(value, drop)});
const frame = new LocatedPickupFrame({groupKey: 'group', binding, owner, characterOf: (seat: Seat) => seat.characterKey});
const pending: Promise<CharacterSubmission> | undefined = frame.end(); void pending;
const numeric: WorldDeliveryPorts<number> = {list: () => [1], inspect: () => undefined, create: () => 1, remove() {}};
const numbered = new WorldDeliveryBinding({...options, world: numeric});
new WorldDeliveryFrame({binding: numbered, owner, characterOf: (seat: Seat) => seat.characterKey});
declare const frames: DeliveryFrameOptions<Handle, Seat, Promise<CharacterSubmission>>;
// @ts-expect-error engine listing is synchronous
world.list = async () => [];
// @ts-expect-error inspected metadata cannot be a promise
world.inspect = async () => ({groupKey: 'group'});
// @ts-expect-error creation completes before publication returns
world.create = async delivery => ({id: delivery.id, sdkDelivery: delivery});
// @ts-expect-error retirement is synchronous
world.remove = async () => {};
// @ts-expect-error birth placement contains a world instance identity
options.admitPlacement = () => ({pos: {x: 0, y: 0}});
// @ts-expect-error selecting the character cannot await another frame
frames.characterOf = async seat => seat.characterKey;
// @ts-expect-error foreign handle types cannot cross into this world
binding.pickup(1, 'hero');
// @ts-expect-error frame offers require the host's seat type
frame.offer({id: 1}, 'hero');
// @ts-expect-error numeric world handles are not engine object handles
numbered.pickup({id: 1}, 'hero');
