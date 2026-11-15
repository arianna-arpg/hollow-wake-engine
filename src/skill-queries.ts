import type {GemDefinition,GemSkill} from './gem-residence.js';
import type {Modifier} from './types.js';
import type {PricedSkill,PricingActor} from './skill-pricing.js';
import type {DamageSkill} from './damage-pipeline-types.js';
/** Structural authored definitions carried by the default content package. */
export type CharacterSkillDefinition=GemDefinition&PricedSkill['def']&DamageSkill['def']&{cooldown:number};
export interface CharacterSkill extends GemSkill<CharacterSkillDefinition,GemDefinition> {
  bonusLevels?:number;grantedBy?:string;grantedHostUid?:number;relicSource?:string;
  grafts?:{def:GemDefinition;level:number}[];
}
/** Pure compiled original queries over admitted authored instances. These are
 * ports for the shared runtime, never a second combat implementation. */
export interface CharacterSkillQueries {
  instanceMods(skill:GemSkill):Modifier[];
  instanceInnateMods(skill:GemSkill):Modifier[];
  skillContextTags(skill:GemSkill|GemDefinition,extra?:string[]):Set<string>;
  instanceTrigger(skill:GemSkill):Readonly<{on:string;then?:never}>|undefined;
  skillCooldownSeconds(actor:PricingActor<Modifier,string>,skill:CharacterSkill):number;
  treeNodeRefusal(skill:GemSkill,nodeId:string):string|null;
  guarded(skill:GemSkill):boolean;
  replenishing(skill:GemSkill):boolean;
}
