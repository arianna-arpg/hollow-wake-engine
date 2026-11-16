import {createDamagePipeline,type DamageActor,type DamageSkill,type DamagePacket,type DamagePorts,type DamageRules,type HitResult} from './damage-pipeline.js';
import {createHitPreparation,type HitPreparationActor,type HitPreparationSkill,type HitPreparationPorts} from './hit-preparation.js';
import {createHitLanding,type HitLandingActor,type HitLandingSkill,type HitLandingPorts} from './hit-landing.js';
import {createHitSustain,type HitSustainActor,type HitSustainSkill,type HitSustainPorts} from './hit-sustain.js';
import {createHitReactions,type HitReactionActor,type HitReactionInstance,type HitReactionPorts} from './hit-reactions.js';
import {createHitAftermath,type HitAftermathActor,type HitAftermathInstance,type HitAftermathSkill,type HitAftermathSocket,type HitAftermathPorts} from './hit-aftermath.js';
import {createHitStatuses,type HitStatusActor,type HitStatusSkill,type HitStatusBuff,type HitStatusDefinition,type HitStatusEffect,type HitStatusFrame,type HitStatusPorts} from './hit-status.js';
import {createHitEffects,type HitEffectActor,type HitEffectSkill,type HitEffectSet,type HitEffectInput,type HitEffectPorts} from './hit-effects.js';
import type {ActiveStatus} from './status-lifecycle-types.js';

type CampaignLanding='bindDeeds'|'recordSelfDamage'|'metaActive'|'deedEnemy'|'deedOwned'|'recordDeed'|'trackHurt';
type StatusLinks='dischargeStatuses'|'plantImpale'|'prepareStatuses'|'applyRiders'|'dispatchEffects'|'applyGrantedStatuses'|'resolveHit'|'resistance';
/** Keep configuration getters live; object spread would snapshot them. */
function bindPorts<Base extends object,Links extends object>(base:Base,links:Links):Base&Links {
  return Object.defineProperties(Object.create(base),Object.getOwnPropertyDescriptors(links)) as Base&Links;
}

/** One hit graph, with the original ordering and shared borrowed identities.
 * The damage, preparation, landing, sustain, reactions, status dispatch and
 * aftermath services are constructed here. Internal phase callbacks cannot
 * accidentally be omitted or bound to a second actor graph by an adapter.
 *
 * Combat-specific bindings remain explicit until the authored combat factory
 * supplies them. Campaign observation is optional and never imports a campaign
 * or persistence runtime. Trusted synchronous failures retain preceding writes. */
export function createCombatHits<
  A extends DamageActor<A,I,M,Tag> & HitPreparationActor<A,P,M,Tag> & HitLandingActor<P>
    & HitSustainActor<P,M,Tag> & HitReactionActor<P,M,Tag,Item,Brain,Watch>
    & HitAftermathActor<A,I,P,M,Tag,ActiveStatus> & HitStatusActor<I,M,Tag,Buff>
    & HitEffectActor<A,P,M,Tag,ActiveStatus>,
  I extends DamageSkill & HitAftermathInstance<S> & HitReactionInstance & {def:S;procChainDepth?:number},
  S extends HitPreparationSkill<Tag> & HitLandingSkill & HitSustainSkill<Cue>
    & HitAftermathSkill<Tag> & HitStatusSkill<Tag> & HitEffectSkill<Tag>,
  P,Direction,M extends {when?:string},Tag extends string,Item,Brain,Watch,Spill,Cue,
  Definition extends HitStatusDefinition,Buff extends HitStatusBuff<Tag>,Proc,
  Socket extends HitAftermathSocket,E extends HitEffectSet & {status:HitStatusEffect},Other extends string,
>(input:{
  damage:DamagePorts<A,I,M,Tag>;damageRules?:DamageRules;
  preparation:Omit<HitPreparationPorts<A,I,S,P,M,Tag,DamagePacket<M,Tag>,string,HitEffectInput<E,Other>,void>,'continue'|'roll'>;
  landing:Omit<HitLandingPorts<A,I,S,P,M,Tag,DamagePacket<M,Tag>,string,HitEffectInput<E,Other>,HitResult,void>,'continue'|'applyHit'|CampaignLanding>;
  campaign?:Pick<HitLandingPorts<A,I,S,P,M,Tag,DamagePacket<M,Tag>,string,HitEffectInput<E,Other>,HitResult,void>,CampaignLanding>;
  sustain:HitSustainPorts<A,S,P,Tag,Cue>;
  reactions:HitReactionPorts<A,I,S,P,M,Tag,Item,Brain,Watch,Spill,HitResult>;
  statuses:Omit<HitStatusPorts<A,I,S,M,Tag,Definition,Buff,Proc>,'mitigateTyped'|'landLifeDamage'>;
  effects:Omit<HitEffectPorts<A,I,P,Direction,M,Tag,ActiveStatus,E,Other,HitStatusFrame<A,I,S,M,Tag>>,'status'>;
  aftermath:Omit<HitAftermathPorts<A,I,S,P,Direction,M,Tag,ActiveStatus,Socket,HitStatusFrame<A,I,S,M,Tag>,DamagePacket<M,Tag>,string,HitEffectInput<E,Other>>,StatusLinks>;
}){
  const damage=createDamagePipeline(input.damage,input.damageRules);
  const statuses=createHitStatuses<A,I,S,M,Tag,Definition,Buff,Proc>(bindPorts(input.statuses,{mitigateTyped:damage.mitigateTyped,landLifeDamage:damage.landLifeDamage}));
  const effects=createHitEffects<A,I,S,P,Direction,M,Tag,ActiveStatus,E,Other,HitStatusFrame<A,I,S,M,Tag>>(bindPorts(input.effects,{status:statuses.applyAuthored}));
  const sustain=createHitSustain<A,S,P,M,Tag,Cue>(input.sustain);
  const reactions=createHitReactions<A,I,S,P,M,Tag,Item,Brain,Watch,Spill,DamagePacket<M,Tag>,HitResult>(input.reactions);
  const aftermath=createHitAftermath<A,I,S,P,Direction,M,Tag,ActiveStatus,Socket,HitStatusFrame<A,I,S,M,Tag>,DamagePacket<M,Tag>,string,HitEffectInput<E,Other>>(bindPorts(input.aftermath,{
    dischargeStatuses:statuses.dischargeOnHit,plantImpale:statuses.plantImpale,
    prepareStatuses:statuses.prepare,applyRiders:statuses.applyRiders,dispatchEffects:effects.dispatch,applyGrantedStatuses:statuses.applyGranted,
    resistance:damage.resistValue,resolveHit:(caster:A,inst:I,target:A,multiplier:number,depth:number,force?:true)=>preparation.prepare(caster,inst,target,multiplier,depth,undefined,force),
  }));
  const campaign=input.campaign??{bindDeeds(){},recordSelfDamage(){},metaActive:()=>false,deedEnemy:()=>false,deedOwned:()=>false,recordDeed(){},trackHurt:()=>0};
  const continueLanded:HitLandingPorts<A,I,S,P,M,Tag,DamagePacket<M,Tag>,string,HitEffectInput<E,Other>,HitResult,void>['continue'] =
    (caster,inst,target,mult,depth,_force,added,origin,tier,def,extra,packet,_rear,tone,carry,hasDamage,dealt,critical,result)=>{
      if(hasDamage){
        sustain.apply(caster,target,def,extra,dealt,depth);
        reactions.apply(caster,inst,target,def,extra,packet,dealt,depth,critical,result!,origin,tier);
      }
      aftermath.apply(caster,inst,target,mult,depth,added,def,extra,packet,tone,carry,hasDamage,dealt,critical);
    };
  const landing=createHitLanding<A,I,S,P,M,Tag,DamagePacket<M,Tag>,string,HitEffectInput<E,Other>,HitResult,void>(bindPorts(bindPorts(input.landing,campaign),{applyHit:damage.applyHit,continue:continueLanded}));
  const preparation=createHitPreparation<A,I,S,P,M,Tag,DamagePacket<M,Tag>,string,HitEffectInput<E,Other>,void>(bindPorts(input.preparation,{roll:damage.rollSkillDamage,continue:landing.land}));
  return Object.freeze({resolve:preparation.prepare,damage,statuses});
}
