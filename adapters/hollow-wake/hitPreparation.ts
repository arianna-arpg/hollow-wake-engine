import {createHitPreparation,type PreparedHitContinuation} from '@hollow-wake/engine/combat/hit-preparation';
import type {Actor} from './actor';
import type {World} from './world';
import {instanceFuse,instanceMods,grantedTags,skillContextTags,type SkillDef,type SkillInstance,type SkillEffect} from './skills';
import type {Modifier,SkillTag,DamageType} from './stats';
import {rollSkillDamage,type DamagePacket} from './damage';
import {concealmentActive} from './perception';
import {victimScopeArmed,victimTags} from './victim';
import {toneOfAmounts} from './tuning';
import {DEFENSE_CFG} from './defense';
import {angleDiff,angleTo,dist,vec,type Vec2} from '../core/math';

type ContinueHit = PreparedHitContinuation<Actor,SkillInstance,SkillDef,Vec2,Modifier,DamagePacket,DamageType,SkillEffect,void>;
export function bindHitPreparation(w:World,continueHit?:ContinueHit) {
  return createHitPreparation<Actor,SkillInstance,SkillDef,Vec2,Modifier,SkillTag,DamagePacket,DamageType,SkillEffect,void>({
    time:()=>w.time,fuse:instanceFuse,instanceTags:inst=>skillContextTags(inst,grantedTags(inst)),
    definitionTags:skillContextTags,modifiers:instanceMods,copyPosition:pos=>({...pos}),
    fuseQueue:()=>w.pendingFuses,
    fuseCue:(target,def,fuse)=>{
      w.text(vec(target.pos.x,target.pos.y-target.radius-8),fuse.tell??'…',def.color,11);
      w.flashes.push({pos:vec(target.pos.x,target.pos.y),radius:target.radius+8,color:def.color,life:.25,maxLife:.25});
    },
    combat:(caster,target)=>{
      if(caster.team==='player'||target.team==='player'){
        w.lastCombatAt=w.time;
        if(caster.team==='enemy'&&w.seatOf(target))caster.grudgeMark=true;
        else if(target.team==='enemy'&&w.seatOf(caster))target.grudgeMark=true;
      }
    },
    guiseCue:caster=>w.text(vec(caster.pos.x,caster.pos.y-caster.radius-10),'the guise breaks!','#b8a8e8',12,'combat'),
    forTarget:(caster,inst,target,depth)=>w['attackSequences'].forTarget(caster,inst,target,depth),
    noise:(at,radius,caster)=>w['noiseAt'](at,radius,caster),
    shatterCue:target=>{
      w.text(vec(target.pos.x,target.pos.y-14),'SHATTER!','#bfe8ff',14,'combat');
      w.flashes.push({pos:vec(target.pos.x,target.pos.y),radius:target.radius+14,color:'#bfe8ff',life:.25,maxLife:.25});
    },
    concealed:concealmentActive,ambushCue:target=>w.text(vec(target.pos.x,target.pos.y-18),'AMBUSH!','#b8d0ff',13,'combat'),
    rearAngle:(target,caster)=>angleDiff(target.facing,angleTo(target.pos,caster.pos)),
    distance:dist,proximityRadius:()=>DEFENSE_CFG.proximity.radius,
    victimScopeArmed:(caster,extra)=>victimScopeArmed(caster.sheet,extra),victimTags:(target,caster,time)=>victimTags(target,caster,{time}),
    roll:rollSkillDamage,tone:toneOfAmounts,
    guard:(target,caster,origin,raw)=>w['tryGuardBlock'](target,caster,origin,raw),
    shell:(target,origin,packet,caster)=>w['tryShellBlock'](target,origin,packet,caster),
    // A fully installed landing capability supplies its stable closure directly.
    // The fallback supports the earlier preparation-only extraction boundary.
    continue:continueHit??((caster,inst,target,mult,depth,force,effects,origin,tier,def,extra,packet,rear,tone,carry)=>
      w['continuePreparedHit'](caster,inst,target,mult,depth,force,effects,origin,tier,def,extra,packet,rear,tone,carry)),
  });
}
