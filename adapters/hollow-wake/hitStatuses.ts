import {createHitStatuses} from '@hollow-wake/engine/statuses/hits';
import type {Actor,ActiveBuff} from './actor';
import type {World} from './world';
import {STATUS_DEFS,AILMENT_TUNING,type StatusDef} from './status';
import {skillContextTags,instanceBrood,type SkillDef,type SkillInstance} from './skills';
import type {Modifier,SkillTag} from './stats';
import {PROCS,type ProcDef} from '../data/procs';
import {mitigateTyped,landLifeDamage} from './damage';
import {buffProcCue,noteProcCue} from './procCues';
import {combatCueFlash} from './combatCues';
import {angleTo,vec} from '../core/math';

export function bindHitStatuses(w:World,statusIds:()=>readonly string[]){
  return createHitStatuses<Actor,SkillInstance,SkillDef,Modifier,SkillTag,StatusDef,ActiveBuff,ProcDef>({
    definition:id=>STATUS_DEFS[id],statusIds,tuning:id=>AILMENT_TUNING[id],
    random:()=>Math.random(),zoneLevel:()=>w.zone.level,skillContextTags,instanceBrood,mitigateTyped,landLifeDamage,
    kill:(...args)=>w.kill(...args),rollStatusProcs:(...args)=>w['rollStatusProcs'](...args),bankPools:(...args)=>w['bankPools'](...args),
    procDefinition:id=>PROCS[id],executeProc:(...args)=>w['executeProc'](...args),
    riderCue:(target,definition,buffId)=>noteProcCue(target,buffProcCue(definition),'release','rider:'+buffId),
    text:(actor,height,text,color,size,channel)=>{
      const pos=vec(actor.pos.x,actor.pos.y-height);
      if(channel===undefined)w.text(pos,text,color,size);else w.text(pos,text,color,size,channel);
    },
    statusCue:(kind,target,caster,color)=>{
      w.flashes.push(combatCueFlash(target.pos,kind,target.radius+(kind==='resist'?8:7),angleTo(target.pos,caster.pos),color));
    },
  });
}
