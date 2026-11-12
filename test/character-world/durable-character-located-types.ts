import {DurableCharacterOwner, type LocatedCharacterOptions, type CharacterGroupStorage,
  type CharacterLivePort, type CharacterDeliveryPort, type CharacterAction,
  type PrivateCharacterOwner, type CharacterPublicationPreparation} from '../../src/durable-character-located-owner.js';

declare const options: LocatedCharacterOptions<CharacterPublicationPreparation>;
declare const privateOwner: PrivateCharacterOwner;
declare const storage: CharacterGroupStorage;
declare const live: CharacterLivePort<CharacterPublicationPreparation>;
declare const delivery: CharacterDeliveryPort;
const owner = await DurableCharacterOwner.open({...options, createOwner: () => privateOwner});
const actions: CharacterAction[] = [
  {kind: 'account', command: {op: 'observe', events: []}},
  {kind: 'activate', characterKey: 'hero'},
  {kind: 'pickup', characterKey: 'hero', deliveryId: 1},
  {kind: 'character', characterKey: 'hero', command: {op: 'character-inventory', command: {op: 'sort'}}},
];
await owner.submit(actions);
const syncLive: CharacterLivePort<CharacterPublicationPreparation> = {
  prepare: packet => packet, publish() {}, discard() {}, recoverRequired() {},
};
void syncLive;
// @ts-expect-error async preparation cannot cross the synchronous publication boundary
live.prepare = async packet => packet;
// @ts-expect-error async publication is not a synchronous acknowledgement
live.publish = async () => {};
// @ts-expect-error async discard leaves lease ownership uncertain
live.discard = async () => {};
// @ts-expect-error recovery notification is synchronous
live.recoverRequired = async () => {};
// @ts-expect-error pickup authorization is immediate and boolean
delivery.authorizePickup = async () => true;
// @ts-expect-error placement planning must finish before durable submission
delivery.prepare = async () => ({state: null, placements: []});
// @ts-expect-error delivery admission cannot accept a promise
delivery.admitState = async () => null;
// @ts-expect-error committed storage outcomes need a revision
storage.commit = async () => ({status: 'committed'});
// @ts-expect-error a key belongs to a specific character rather than an engine handle
await owner.submit([{kind: 'activate', characterKey: 1}]);
// @ts-expect-error pickup requests must identify the delivery
await owner.submit([{kind: 'pickup', characterKey: 'hero'}]);
// @ts-expect-error open is the only public construction path
new DurableCharacterOwner(options);
