import {createStatusEffects} from '@hollow-wake/engine/statuses/effects';
import type {Actor} from './actor';
import type {World} from './world';
import {STATUS_DEFS,type StatusDef} from './status';
import {skillContextTags,instanceMods,type SkillInstance} from './skills';
import type {Modifier,SkillTag} from './stats';
import {dist,vec,type Vec2} from '../core/math';
import {sameStory} from './tiers';
import {mitigateTyped,resistValue} from './damage';
import {armedCueProfile,armedCueStyle} from './armedCues';
import {combatCueFlash} from './combatCues';

/** A binding per World: live host services and presentation, no gameplay policy. */
export function bindStatusEffects(w:World){
  return createStatusEffects<Actor,SkillInstance,Vec2,Modifier,SkillTag,StatusDef>({
    definition:id=>STATUS_DEFS[id],actors:()=>w.actors,actorById:id=>w.actorById(id),
    time:()=>w.time,zoneLevel:()=>w.zone.level,distance:dist,sameStory,
    skillContextTags,instanceMods,mitigateTyped,resistValue,
    recordIndirectDamage:(...args)=>w['recordIndirectDamage'](...args),
    kill:(...args)=>w.kill(...args),accumulateDotText:(...args)=>w['accumulateDotText'](...args),
    text:(at,text,color,size,channel,height)=>{
      const pos=height===undefined?at:vec(at.x,at.y-height);
      if(channel===undefined)w.text(pos,text,color,size);else w.text(pos,text,color,size,channel);
    },
    flash:(at,radius,color,life)=>{w.flashes.push({pos:vec(at.x,at.y),radius,color,life,maxLife:life});},
    ruptureCue:(victim,s,radius)=>{
      const cue=armedCueProfile(STATUS_DEFS[s.id]);
      w.flashes.push(cue?combatCueFlash(victim.pos,armedCueStyle(cue).release,radius,0,STATUS_DEFS[s.id].color)
        :{pos:vec(victim.pos.x,victim.pos.y),radius,color:'#b06bd4',life:.3,maxLife:.3});
    },
  });
}
