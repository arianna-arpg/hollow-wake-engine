import {CraftingSessionCore,type CraftingSessionFormat} from './crafting-session-core.js';
import type {WorkshopRack} from './workshop-rack.js';
export type {CraftingSessionState,CraftingSessionDefinitions} from './crafting-session-data.js';
import type {CraftingSessionDefinitions} from './crafting-session-data.js';
import {CharacterResidenceData} from './character-residence-data.js';
import {requireSession as need} from './session-json.js';
const format:CraftingSessionFormat=Object.freeze({
 data:CharacterResidenceData,
 version:(state:{skillBook?:unknown;rack?:unknown})=>{need(state.skillBook!==undefined&&state.rack===undefined,'complete-book-required');return 1;},
 capability:()=>'crafting-session/complete-diagnostic'
});
/** Internal complete-character facade; never selected by untrusted save data. */
export class CraftingSession extends CraftingSessionCore {
 constructor(definitions:CraftingSessionDefinitions,maxProfiles=8,rack?:WorkshopRack){super(definitions,maxProfiles,rack,format);}
}
