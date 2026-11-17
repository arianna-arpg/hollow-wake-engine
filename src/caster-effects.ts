import type {Modifier} from './types.js';
import type {CastResourceEffect} from './cast-resource-effects.js';
import type {CastSelfEffect,CastSelfFrame} from './cast-self-effects.js';
import type {CastFieldEffect,CastFieldFrame} from './cast-fields.js';
import type {CastBuff} from './cast-buffs.js';
import type {MinionCastEffect,MinionCommandEffect} from './minion-orders.js';
import type {MinionPourEffect} from './minion-pour.js';
import type {GrabHandoffSpec} from './grab-types.js';
import type {ShiftSpec} from './possession-types.js';
import type {IronWardEffect} from './iron-ward.js';
import type {GuardSurgeEffect} from './guard-surge.js';
import type {SiphonStatusEffect,RecallImpalesEffect} from './status-delivery-types.js';
import type {PendingBuff,FuseSpec} from './pending-resolutions.js';

export interface CasterPoint {x:number;y:number}
export interface CasterEffectActor {readonly pos:CasterPoint;readonly facing:number;readonly gripping?:{readonly id:number}}
export interface CasterEffectSkill {readonly def:{readonly id:string;readonly name:string;readonly color:string}}
/** Contact-only effects are intentionally untouched by the caster phase.
 * Their implementation is required separately by the content admission gate. */
export type ContactOnlyEffect={readonly type:'birth'|'damage'|'grabSeize'|'knockback'|'possess'|'pull'|'rupture'|'siphonOrb'|'spreadStatus'|'tame'|'transfuseStatus'};
export type CasterEffect<Cue,Grant,B extends CastBuff<Modifier,string>> =
  CastResourceEffect|CastSelfEffect<Cue>|CastFieldEffect<Grant>|B|ContactOnlyEffect|GuardSurgeEffect|SiphonStatusEffect|RecallImpalesEffect
  |({readonly type:'ironWard'}&IronWardEffect)
  |({readonly type:'minionCast'}&MinionCastEffect)|({readonly type:'commandMinions'}&MinionCommandEffect)
  |({readonly type:'litePour'}&MinionPourEffect)
  |{readonly type:'throngDirect';readonly pin?:number;readonly linger?:number}
  |{readonly type:'grabThrow';readonly impulse:number;readonly damageMult?:number;readonly handoff?:GrabHandoffSpec}
  |{readonly type:'possessEnd'}|{readonly type:'shapeshift';readonly shift:ShiftSpec}
  |{readonly type:'whistleCompanion'}|{readonly type:'companionStance';readonly stance?:string}
  |{readonly type:'relocateConstruct';readonly radius:number}|{readonly type:'recallMinions';readonly radius?:number}
  |{readonly type:'mimicSelect';readonly sid?:string;readonly step?:number}
  |{readonly type:'detonateMinions';readonly fraction:number}
  |{readonly type:'shatterConstructs';readonly fraction:number;readonly radius:number}
  |{readonly type:'spawnCorpse';readonly monsterId:string;readonly count:number}|{readonly type:'dragCorpses';readonly radius:number};
export interface CasterEffectFrame<A,I> extends CastFieldFrame<A,I,Set<string>,Modifier>{
  readonly aim:CasterPoint;readonly chargesSpent:number;readonly fromFuse?:boolean;
  readonly modifiers:Modifier[];
}
/** These are SDK service bindings, not host implementations of the algorithms.
 * The authored composition constructs them once per simulation. Only queries,
 * physical facts and presentation below are supplied by the consuming game. */
export interface CasterEffectServices<A,I extends CasterEffectSkill,Cue,Grant,B extends CastBuff<Modifier,string>,C> {
  resource:{apply(actor:A,skill:I,effect:CastResourceEffect):void};
  self:{apply(frame:CastSelfFrame<A,I>,effect:CastSelfEffect<Cue>):void};
  fields:{apply(frame:CastFieldFrame<A,I,Set<string>,Modifier>,effect:CastFieldEffect<Grant>):void};
  buffs:{apply(actor:A,skill:I,effect:B,durationScale:number,multiplier:number):void};
  throng:{direct(actor:A,skill:I,aim:CasterPoint,effect:{readonly pin?:number;readonly linger?:number}):void};
  minions:{cast(actor:A,skill:I,aim:CasterPoint,effect:MinionCastEffect,tier?:number):void;command(actor:A,skill:I,aim:CasterPoint,effect:MinionCommandEffect,color:string,tier?:number):void};
  companions:{whistle(actor:A,skill:I,aim:CasterPoint):void;stance(actor:A,skill:I,stance?:string):void;recall(actor:A,skill:I,radius?:number,tier?:number):void;
    detonate(actor:A,skill:I,fraction:number,color:string):void;shatter(actor:A,skill:I,fraction:number,radius:number,color:string,tier?:number):void};
  relocation:{move(actor:A,skill:I,aim:CasterPoint,radius:number,color:string):void};
  grabs:{handoff(from:A,victim:A,spec:GrabHandoffSpec):boolean;throw(actor:A,impulse:number,direction:number,skill:I,multiplier?:number):void};
  possession:{shift(actor:A,skill:I,spec:ShiftSpec):void;eject(controller:C,reason:'press'):void};
  mimic:{select(actor:A,time:number,pick:string|number):{readonly sid:string}|null};
  pour:{pour(actor:A,effect:MinionPourEffect,at:CasterPoint):number};
  statuses:{siphon(actor:A,effect:SiphonStatusEffect,area:number,def:I['def'],tags:Set<string>,extra:Modifier[],color:string,tier?:number):void;
    recall(actor:A,skill:I,effect:RecallImpalesEffect,area:number,def:I['def'],tier?:number):void};
  ironWard:{arm(actor:A,effect:IronWardEffect,duration:number,area:number,tags:Set<string>,extra:readonly Modifier[],color:string,skill?:I):void};
  guardSurge:{apply(actor:A,skill:I,effect:GuardSurgeEffect):boolean};
  corpses:{spawn(actor:A,aim:CasterPoint,monsterId:string,count:number,tags:Set<string>,extra:readonly Modifier[],color:string,tier?:number):void;
    gather(actor:A,aim:CasterPoint,skillId:string,radius:number,area:number,tags:Set<string>,extra:readonly Modifier[],color:string,tier?:number):void};
}
export interface CasterEffectPorts<A,I,B,C>{
  time():number;actorById(id:number):A|undefined;
  controller(actor:A):C|undefined;hasHome(controller:C):boolean;
  fuse(skill:I):FuseSpec|undefined;fuseDelay(actor:A,tags:Set<string>,extra:readonly Modifier[]):number;
  bankBuff(row:PendingBuff<A,I,B>):void;
  fuseTell(actor:A,skill:I,text:string):void;
  definition(id:string):{readonly name:string;readonly color:string}|undefined;
  mimicSelected(actor:A,definition:{readonly name:string;readonly color:string}):void;
  mimicEmpty(actor:A):void;guardSurged(actor:A,tier?:number):void;
}

/** The complete caster-side loop, after delivery and before cast aftermath.
 * Effects stay in authored order, including duplicate effects. Each invocation
 * owns its lazy critical result; nested casts cannot share it accidentally.
 * This trusted phase does not pay resources or stand in for content admission. */
export class CasterEffects<A extends CasterEffectActor,I extends CasterEffectSkill,Cue,Grant,B extends CastBuff<Modifier,string>,C>{
  constructor(readonly services:CasterEffectServices<A,I,Cue,Grant,B,C>,readonly ports:CasterEffectPorts<A,I,B,C>){}
  apply(frame:CasterEffectFrame<A,I>,effects:readonly CasterEffect<Cue,Grant,B>[]):void{
    const s=this.services,p=this.ports,{caster:a,skill:i,aim,origin,delivery,durationScale:duration,areaScale:area,multiplier:mult,color,tags,modifiers}=frame;
    const self:CastSelfFrame<A,I>={actor:a,skill:i,delivery,durationScale:duration,useMultiplier:mult,chargesSpent:frame.chargesSpent};
    const layer:[]|[number]=frame.effectTier===undefined?[]:[frame.effectTier];
    for(const fx of effects)switch(fx.type){
      case 'buff':{
        const fuse=p.fuse(i);
        if(fuse&&!frame.fromFuse){p.bankBuff({kind:'buff',due:p.time()+fuse.delay*p.fuseDelay(a,tags,modifiers),caster:a,inst:i,fx,durScale:duration,mult});p.fuseTell(a,i,fuse.tell??'…');}
        else s.buffs.apply(a,i,fx,duration,mult);
        break;
      }
      case 'gainCharge':case 'drainCharge':case 'payLedger':case 'reduceCooldowns':case 'restoreSkillCharges':s.resource.apply(a,i,fx);break;
      case 'status':case 'absorb':case 'restore':case 'ward':case 'restoreOverTime':case 'heal':case 'cleanse':case 'shed':s.self.apply(self,fx);break;
      case 'terrain':case 'conjure':case 'kindle':case 'vent':case 'lure':case 'spawnZone':case 'townPortal':s.fields.apply(frame,fx);break;
      case 'throngDirect':s.throng.direct(a,i,aim,fx);break;
      case 'minionCast':s.minions.cast(a,i,aim,fx,...layer);break;
      case 'commandMinions':s.minions.command(a,i,aim,fx,color,...layer);break;
      case 'grabThrow':if(a.gripping){
        const victim=fx.handoff?p.actorById(a.gripping.id):undefined;
        if(!(fx.handoff&&victim&&s.grabs.handoff(a,victim,fx.handoff))){
          const direction=Math.hypot(aim.x-a.pos.x,aim.y-a.pos.y)>4?Math.atan2(aim.y-a.pos.y,aim.x-a.pos.x):a.facing;
          s.grabs.throw(a,fx.impulse,direction,i,fx.damageMult);
        }
      }break;
      case 'possessEnd':{const c=p.controller(a);if(c&&p.hasHome(c))s.possession.eject(c,'press');break;}
      case 'shapeshift':s.possession.shift(a,i,fx.shift);break;
      case 'whistleCompanion':s.companions.whistle(a,i,aim);break;
      case 'companionStance':s.companions.stance(a,i,fx.stance);break;
      case 'relocateConstruct':s.relocation.move(a,i,aim,fx.radius,color);break;
      case 'recallMinions':s.companions.recall(a,i,fx.radius,...layer);break;
      case 'litePour':if(delivery!=='projectile')s.pour.pour(a,fx,origin);break;
      case 'mimicSelect':{
        const selected=s.mimic.select(a,p.time(),fx.sid??fx.step??1),definition=selected?p.definition(selected.sid):undefined;
        if(selected&&definition)p.mimicSelected(a,definition);else if(!selected)p.mimicEmpty(a);break;
      }
      case 'siphonStatus':s.statuses.siphon(a,fx,area,i.def,tags,modifiers,color,...layer);break;
      case 'recallImpales':s.statuses.recall(a,i,fx,area,i.def,...layer);break;
      case 'ironWard':s.ironWard.arm(a,fx,duration,area,tags,modifiers,color,...(frame.effectTier===undefined?[]:[i]));break;
      case 'guardSurge':if(s.guardSurge.apply(a,i,fx))p.guardSurged(a,...layer);break;
      case 'detonateMinions':s.companions.detonate(a,i,fx.fraction,color);break;
      case 'shatterConstructs':s.companions.shatter(a,i,fx.fraction,fx.radius,color,...layer);break;
      case 'spawnCorpse':s.corpses.spawn(a,aim,fx.monsterId,fx.count,tags,modifiers,color,...layer);break;
      case 'dragCorpses':s.corpses.gather(a,aim,i.def.id,fx.radius,area,tags,modifiers,color,...layer);break;
      case 'birth':case 'damage':case 'grabSeize':case 'knockback':case 'possess':case 'pull':case 'rupture':case 'siphonOrb':case 'spreadStatus':case 'tame':case 'transfuseStatus':break;
      default:{const never:never=fx;throw Error('Unadmitted caster effect: '+String((never as {type?:unknown}).type));}
    }
  }
}
