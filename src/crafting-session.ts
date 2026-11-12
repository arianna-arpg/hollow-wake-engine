import {CraftingSessionCore,type CraftingSessionFormat} from './crafting-session-core.js';
import type {WorkshopRack} from './workshop-rack.js';
export type {CraftingSessionState,CraftingSessionDefinitions} from './crafting-session-data.js';
import {CraftingSessionData,craftingSaveVersion,type CraftingSessionDefinitions} from './crafting-session-data.js';
const format:CraftingSessionFormat={
 data:CraftingSessionData,
 version:craftingSaveVersion,
 capability:(version:number)=>'crafting-session/v'+version
};
/** Existing public API, with its original v1-v4 admission and save formats. */
export class CraftingSession extends CraftingSessionCore {
 constructor(definitions:CraftingSessionDefinitions,maxProfiles=8,rack?:WorkshopRack){super(definitions,maxProfiles,rack,format);}
}
