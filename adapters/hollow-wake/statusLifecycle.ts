import {createStatusLifecycle} from '@hollow-wake/engine/statuses';
import type {Actor} from './actor';
import {STATUS_DEFS,type StatusDef} from './status';
import {STATUS_RELAY_IDS} from './reception';
import {skillContextTags,type SkillInstance} from './skills';
import type {Modifier,SkillTag} from './stats';
import {noteProcPop} from './procCues';

let relayIds=[...STATUS_RELAY_IDS];
const create=()=>createStatusLifecycle<Actor,SkillInstance,Modifier,SkillTag,StatusDef>({
  definition:id=>STATUS_DEFS[id], random:()=>Math.random(), skillContextTags,
  relayIds,
  popCue:(actor,id,def)=>noteProcPop(actor,def?.pop?.procCue===false?false:{
    profile:def?.dotType==='physical'?'blood':def?.dotType,
    color:def?.color,...def?.pop?.procCue,
  },id),
});

let current=create();
/** Content registers after module evaluation and can be refreshed later. The
 * SDK deliberately owns an immutable vocabulary; replace that service only
 * when the host's ordered relay vocabulary changes. Ordinary applications do
 * an allocation-free comparison of the small registry. */
export const statusLifecycle={...current,
  applyStatus(...args:Parameters<typeof current.applyStatus>){
    let changed=relayIds.length!==STATUS_RELAY_IDS.length;
    for(let i=0;!changed&&i<relayIds.length;i++)changed=relayIds[i]!==STATUS_RELAY_IDS[i];
    if(changed){relayIds=[...STATUS_RELAY_IDS];current=create();}
    return current.applyStatus(...args);
  },
};
