import {createStatusLifecycle} from '@hollow-wake/engine/statuses';
import type {Actor} from './actor';
import {STATUS_DEFS,type StatusDef} from './status';
import {STATUS_RELAY_IDS} from './reception';
import {skillContextTags,type SkillInstance} from './skills';
import type {Modifier,SkillTag} from './stats';
import {noteProcPop} from './procCues';

export const statusLifecycle=createStatusLifecycle<Actor,SkillInstance,Modifier,SkillTag,StatusDef>({
  definition:id=>STATUS_DEFS[id], random:()=>Math.random(), skillContextTags,
  relayIds:STATUS_RELAY_IDS,
  popCue:(actor,id,def)=>noteProcPop(actor,def?.pop?.procCue===false?false:{
    profile:def?.dotType==='physical'?'blood':def?.dotType,
    color:def?.color,...def?.pop?.procCue,
  },id),
});
