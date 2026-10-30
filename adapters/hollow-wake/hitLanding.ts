import {createHitLanding} from '@hollow-wake/engine/combat/hit-landing';
import type {Actor} from './actor';
import type {World} from './world';
import type {SkillDef,SkillInstance,SkillEffect} from './skills';
import type {Modifier,SkillTag,DamageType} from './stats';
import {applyHit,type DamagePacket,type HitResult} from './damage';
import {concealmentActive} from './perception';
import {mimicRefreshWatch,mimicCapture} from './mimic';
import {DEED_CFG} from '../data/classdeeds';
import {combatCueFlash} from './combatCues';
import {defenseCueFlash} from './defenseCues';
import {angleTo,dist,vec,type Vec2} from '../core/math';

export function bindHitLanding(w:World) {
  return createHitLanding<Actor,SkillInstance,SkillDef,Vec2,Modifier,SkillTag,DamagePacket,DamageType,SkillEffect,HitResult,void>({
    player:()=>w.player,time:()=>w.time,bindDeeds:()=>w['bindCombatDeeds'](),concealed:concealmentActive,
    assault:(caster,packet,depth)=>w['assaults'].packet(caster,packet,depth),applyHit,
    recordSelfDamage:(caster,amount)=>w['recordSelfDamage'](caster,amount),metaActive:()=>w.metaProgressionActive(),
    deedEnemy:actor=>w['deedEnemy'](actor),deedOwned:actor=>w['deedOwned'](actor),recordDeed:event=>w['recordDeed'](event),
    trackHurt:(before,target)=>w['combatDeeds'].hurt(before,target.life,target.maxLife(),DEED_CFG.crisisEnter),distance:dist,
    evadeCue:(target,caster)=>{w.flashes.push(combatCueFlash(target.pos,'evade',target.radius,angleTo(target.pos,caster.pos)));},
    blockCue:(target,caster)=>{w.flashes.push(defenseCueFlash(target,'guard','impact','#8ab8d8',{facing:angleTo(target.pos,caster.pos),arc:.85}));},
    immuneCue:(target,caster)=>{w.flashes.push(combatCueFlash(target.pos,'immune',target.radius+8,angleTo(target.pos,caster.pos)));},
    rearCue:(target,caster,def)=>{w.flashes.push(combatCueFlash(target.pos,(def.backstabCue as string|undefined)??'rear_hit',target.radius,angleTo(target.pos,caster.pos)));},
    capturedArtCue:def=>w.notice(`ART CAPTURED: ${def.name}`,'#c8a0e8',14,'world'),
    thorns:(target,caster)=>w['applyThorns'](target,caster),blockCharges:target=>w['tapCharges'](target,'block'),
    ownProcs:(actor,event,context)=>w['rollOwnProcs'](actor,event,context),
    blockTriggers:(target,caster)=>w['rollTriggers'](target,'block',{aim:vec(caster.pos.x,caster.pos.y)}),
    kill:(target,environmental,caster)=>w.kill(target,environmental,caster),
    knockFixtures:(caster,target,tone,wounding,inst)=>w['knockFixtures'](caster,target,tone,wounding,inst),
    refreshMimic:mimicRefreshWatch,captureMimic:(target,caster,def)=>mimicCapture(w,target,caster,def),
    bankPool:(caster,type,amount)=>w['bankPools'](caster,{type:type as DamageType},amount),
    continue:(caster,inst,target,mult,depth,force,effects,origin,tier,def,extra,packet,rear,tone,carry,hasDamage,dealt,critical,result)=>
      w['continueLandedHit'](caster,inst,target,mult,depth,force,effects,origin,tier,def,extra,packet,rear,tone,carry,hasDamage,dealt,critical,result),
  });
}
