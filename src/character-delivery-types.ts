import type {SkillGemPayload,SupportGemPayload} from './item-types.js';

/** Validated bare-gem obligation. It has no inventory UID or world authority. */
export type CharacterGemDelivery=
  | {kind:'skill';gem:SkillGemPayload;locked?:boolean}
  | {kind:'support';gem:SupportGemPayload;locked?:boolean};
