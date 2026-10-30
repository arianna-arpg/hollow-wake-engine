import {createHitSustain} from '@hollow-wake/engine/combat/hit-sustain';
import type {Actor} from './actor';
import type {World} from './world';
import {skillContextTags,type SkillDef} from './skills';
import type {Modifier,SkillTag} from './stats';
import type {FeedingCueSpec} from '../data/feedingCues';
import {noteResourceFlow} from './feedingCues';
import {sameStory} from './tiers';
import {DEFENSE_CFG} from './defense';
import {dist,type Vec2} from '../core/math';

export function bindHitSustain(w:World) {
  return createHitSustain<Actor,SkillDef,Vec2,Modifier,SkillTag,FeedingCueSpec>({
    actors:()=>w.actors,tags:skillContextTags,sameStory,distance:dist,
    get sharingRadius(){return DEFENSE_CFG.sustain.vampiricRadius;},
    resourceFlow:(recipient,source,amount,cue)=>noteResourceFlow(recipient,source,'life',amount,cue),
    sharedHealingCue:(recipient,amount)=>w.text(recipient.pos,'+'+Math.round(amount),'#8ae0a8',10),
    bondedHealingCue:(recipient,amount)=>w.text(recipient.pos,'+'+Math.round(amount),'#7ee0b8',11),
  });
}
