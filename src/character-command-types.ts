import type {CraftingSessionState} from './crafting-session-data.js';
import type {ProgressionCharacterState} from './workshop-character-progression.js';

/** Already admitted complete-character input. These types do not authorize
 * account writes, currency spending, delivery retirement or live effects. */
export interface CharacterCommandDraft {
  state:Omit<CraftingSessionState,'account'|'rack'|'skillBook'>&{
    skillBook:NonNullable<CraftingSessionState['skillBook']>;
  };
  character:ProgressionCharacterState;
  nextUid:number;
}
