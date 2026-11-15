import type {CharacterSession,CharacterSessionDefinitions,CharacterProjection} from '@hollow-wake/engine/character/session';
import type {CharacterLive,CharacterLiveRules,CharacterLiveEffects} from '@hollow-wake/engine/character/live';
import type {CharacterRebuildFrame} from '@hollow-wake/engine/character/rebuild';
import type {CharacterSkill,CharacterSkillDefinition,CharacterSkillQueries} from '@hollow-wake/engine/character/skill-queries';
import type {SkillPricing} from '@hollow-wake/engine/character/skill-pricing';
import type {ItemInstance} from '@hollow-wake/engine/items';
import type {GemDefinition} from '@hollow-wake/engine/inventory/gems';
import type {Modifier} from '@hollow-wake/engine';
export interface CharacterKit {
  readonly definitions:CharacterSessionDefinitions;
  readonly rules:CharacterLiveRules;
  readonly queries:CharacterSkillQueries;
  readonly pricing:SkillPricing<CharacterSkill,Modifier,string>;
  create(classId:string,options?:{seed?:number;board?:{w:number;h:number;rows?:string[]};authority?:CharacterProjection}):CharacterSession;
  admit(data:unknown,authority:CharacterProjection):CharacterSession;
  live(frame:CharacterRebuildFrame<CharacterSkillDefinition,GemDefinition,CharacterSkill,ItemInstance>,effects:CharacterLiveEffects<CharacterSkill>):CharacterLive<CharacterSkillDefinition,GemDefinition,CharacterSkill,ItemInstance,{id:string;innate?:Modifier[]},{id:string;active:boolean}>;
}
export declare function createCharacterKit(buildPack:unknown,pack:unknown):CharacterKit;
