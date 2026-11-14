import type {RunCheckpointAction,DurableRunOwner} from '../../src/durable-run-owner.js';
import type {CharacterAction} from '../../src/durable-character-located-owner.js';
import type {RunAction,RunCharacterSession} from '../../src/run-character-session.js';
import type {CharacterMemoryDelivery} from 'candidate/memory-delivery';
declare const owner:DurableRunOwner<object>,session:RunCharacterSession;
const drop:CharacterMemoryDelivery={kind:'memory',memoryKind:'rough',units:[{d:'quest',s:42}]};
const payout:RunCheckpointAction={kind:'deliveries',characterKey:'hero',drops:[drop]};void owner.submitTrusted([payout]);
const local:RunAction={kind:'deliveries',profile:7,drops:[drop]};void session.prepareTrusted([local]);
// @ts-expect-error Player submissions cannot grant rewards.
const player:CharacterAction={kind:'deliveries',characterKey:'hero',drops:[drop]};void player;
// @ts-expect-error Checkpoints require stable character keys.
const transient:RunCheckpointAction={kind:'deliveries',profile:7,drops:[drop]};void transient;
// @ts-expect-error Local preparation requires an owned profile.
const absent:RunAction={kind:'deliveries',drops:[drop]};void absent;
// @ts-expect-error A delivery has no preallocated inventory UID.
const foreignId:CharacterMemoryDelivery={...drop,uid:1};void foreignId;
// @ts-expect-error A delivery cannot supply arbitrary item bodies.
const arbitrary:CharacterMemoryDelivery={...drop,item:{uid:1}};void arbitrary;
// @ts-expect-error The sealed random seed is numeric.
const seed:CharacterMemoryDelivery={...drop,units:[{d:'quest',s:'42'}]};void seed;
// @ts-expect-error Provenance is required.
const provenance:CharacterMemoryDelivery={...drop,units:[{s:42}]};void provenance;
// @ts-expect-error Memory form is explicit.
const kind:CharacterMemoryDelivery={memoryKind:'rough',units:[]};void kind;
// @ts-expect-error Ordinary owner entry cannot admit a reward grant.
void owner.submit([payout]);
// @ts-expect-error A pending promise is not a payout.
void owner.submitTrusted([Promise.resolve(payout)]);
