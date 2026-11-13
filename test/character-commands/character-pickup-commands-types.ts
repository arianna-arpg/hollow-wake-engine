import {changeCharacterPickup,type CharacterPickupPorts} from '../../src/character-pickup-commands.js';
import type {CharacterGemDelivery} from '../../src/character-delivery-types.js';
declare const ports:CharacterPickupPorts,drop:CharacterGemDelivery;
const result=changeCharacterPickup(ports,{op:'pickup',deliveryId:1},{drop});
result.request.nextUid.toFixed();result.deliveryId.toFixed();
// @ts-expect-error durable deliveries cannot change their gem kind
const invalid:CharacterGemDelivery={kind:'support',gem:{kind:'skill',skillId:'bolt',level:1,rarity:'common',sockets:[]}};
// @ts-expect-error a delivery admission result must be synchronous
changeCharacterPickup({...ports,admitDrop:async()=>drop},{},{});
// @ts-expect-error an inventory placement result must be synchronous
changeCharacterPickup({...ports,inventory:{autoPlace:async()=>true}},{},{});
// @ts-expect-error delivery identity is not a world object or string key
const address:string=result.deliveryId;
// @ts-expect-error command results cannot directly retire a durable obligation
result.events.push({kind:'retire-delivery',deliveryId:1});
void invalid;void address;
