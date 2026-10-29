import {createDamagePipeline} from '@hollow-wake/engine/combat/damage';
import type {Actor} from './actor';
import {instanceMods,instanceInnateMods,skillContextTags,type SkillInstance} from './skills';
import type {Modifier,SkillTag} from './stats';
import {throngTravelProtected} from './throngEvolution';
import {weakPointBonus} from './weakpoints';
import {plyFloorOf} from './plies';
import {dominantTypeOf} from './bodyVoices';
import {stampSegFlash,feedWound} from './segments';
import {noteResourceFlow} from './feedingCues';
import {STATUS_DEFS} from './status';
import {SIM_TAP} from './tap';

// The legacy host still owns the random stream and live observer selection.
// The SDK owns the complete ordered damage/absorption policy.
export const damagePipeline=createDamagePipeline<Actor,SkillInstance,Modifier,SkillTag>({
  random:()=>Math.random(),instanceMods,instanceInnateMods,skillContextTags,
  travelProtected:throngTravelProtected,weakPointBonus,plyFloor:plyFloorOf,dominantType:dominantTypeOf,
  stampSegment:stampSegFlash,feedWound,resourceFlow:noteResourceFlow,
  boundToAbsorb:id=>!!STATUS_DEFS[id]?.boundToAbsorb,
  onHit:(attacker,target,result,packet)=>SIM_TAP.current?.onHit?.(attacker,target,result,packet),
  onDot:(target,landed,type)=>SIM_TAP.current?.onDot?.(target,landed,type),
});
