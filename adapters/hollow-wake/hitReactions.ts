import {createHitReactions} from '@hollow-wake/engine/combat/hit-reactions';
import type {Actor} from './actor';
import type {World,DropItem} from './world';
import {skillContextTags,instanceMods,type SkillDef,type SkillInstance} from './skills';
import type {Modifier,SkillTag} from './stats';
import type {DamagePacket,HitResult} from './damage';
import {alertScale,normalizeBrain,type BrainDef} from './brain';
import {feedWatch,watchValueOf,watchRungOf,WATCH_CFG,type WatchSpec} from './watch';
import {PERCEPTION_CFG} from './perception';
import {MONSTERS} from '../data/monsters';
import type {EssenceSpillSpec} from '../data/essences';
import {ORB_CAP,ORB_DEFS,orbOnHurtStat} from '../data/orbs';
import {chance,dist,rand,vec,type Vec2} from '../core/math';

export function bindHitReactions(w:World,isStealthed:(actor:Actor)=>boolean,lowLifeFlashSeconds:number) {
  return createHitReactions<Actor,SkillInstance,SkillDef,Vec2,Modifier,SkillTag,DropItem,BrainDef,WatchSpec,EssenceSpillSpec,DamagePacket,HitResult>({
    time:()=>w.time,player:()=>w.player,actors:()=>w.actors,
    copyPoint:p=>vec(p.x,p.y),assignWatchPoint:(target,from)=>{target.watchAt!.x=from.x;target.watchAt!.y=from.y;},
    aimPoint:target=>vec(target.pos.x,target.pos.y),distance:dist,
    hostileTo:(target,caster)=>w.hostileTo(target,caster),alertScale,
    get woundSearchSeconds(){return PERCEPTION_CFG.woundSearchSec;},
    bumpDrives:(actor,event)=>w['bumpDrives'](actor,event),
    spillLoot:(target,item)=>{w.drops.push({pos:vec(target.pos.x+rand(-20,20),target.pos.y+rand(-20,20)),item,bob:rand(0,Math.PI*2),tier:target.tier});},
    essenceSpill:id=>MONSTERS[id]?.essenceSpill,
    bankEssenceSpill:(target,spill,damage)=>w['bankEssenceSpill'](target,spill,damage),
    releasePrimedPours:target=>w['releasePrimedPours'](target),
    baseThreatWeight:brain=>normalizeBrain(brain).base.target?.threat?.damage,
    tags:skillContextTags,instanceMods,
    tapCharges:(actor,event,counterpart)=>w['tapCharges'](actor,event,undefined,undefined,counterpart),
    orbCount:()=>w.orbs.length,get orbCap(){return ORB_CAP;},orbKeys:()=>Object.keys(ORB_DEFS),orbOnHurtStat,chance,
    shedOrb:(id,position,options)=>w.shedOrb(id,position,options),
    rouseOnWound:target=>w['rouseOnWound'](target),springAmbush:target=>w.springAmbush(target),isStealthed,
    get watchSearchRung(){return WATCH_CFG.rungs.search;},feedWatch,watchValue:watchValueOf,watchRung:watchRungOf,
    lowLifeFlashSeconds,lowLifeFlash:seconds=>{w.lowLifeHitFlash=seconds;},
    damageCue:(target,dealt,result)=>w.text(target.pos,Math.round(dealt).toString(),result.crit?'#ffd24a':'#ffffff',result.crit?18:13,'dmg'),
    outcomeCue:(target,outcome,origin)=>w['showCombatOutcome'](target,outcome,origin),
    ownProcs:(actor,event,context)=>w['rollOwnProcs'](actor,event,context),
    sweepDefenseEvents:(target,depth)=>w['sweepDefenseEvents'](target,depth),
    rollTriggers:(caster,event,context)=>w['rollTriggers'](caster,event,context),
    bankDamageTakenTriggers:(target,dealt,caster)=>w['bankDamageTakenTriggers'](target,dealt,caster),
  });
}
