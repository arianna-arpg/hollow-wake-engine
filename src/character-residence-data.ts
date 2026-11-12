import {CraftingSessionData} from './crafting-session-data.js';
import type {ItemInstance} from './item-types.js';

/** Internal complete-character format. Structural retention always precedes
 * complete build admission; a save or player command cannot select this codec. */
export class CharacterResidenceData extends CraftingSessionData {
  override item(input:unknown):ItemInstance{return this.retainedItem(input);}
}
