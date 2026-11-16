import type {CombatPoint} from './combat-geometry.js';import type {Modifier} from './types.js';
import type {PreparationOptions,PreparedCast} from './cast-preparation-types.js';import type {CasterEffectFrame} from './caster-effects.js';import type {AftermathFrame} from './cast-aftermath-types.js';
export interface ExecutionActor {readonly sheet:{get(stat:string,tags:Set<string>,extra:Modifier[]):number}}
export interface CombatExecutionServices<A,I,C,D,E>{
  preparation:{prepare(actor:A,skill:I,aim:CombatPoint,options:PreparationOptions<A,C>):PreparedCast<A,I,C,D>|{completed:boolean}};
  deliveries:{execute(frame:PreparedCast<A,I,C,D>):CombatPoint|null};
  caster:{apply(frame:CasterEffectFrame<A,I>,effects:readonly E[]):void};
  aftermath:{complete(frame:AftermathFrame<A,I,C,D>):void};
  linger(actor:A,skill:I,at:CombatPoint,multiplier:number):void;
  effects(skill:I):readonly E[];
}
/** Synchronous execution after request/payment admission. Preparation may
 * finish special releases itself. Ordinary deliveries, lingering fields,
 * caster effects and post-cast reactions retain their original order.
 * Reentrant casts own a new frame and preserve live actor/skill identities. */
export class CombatExecution<A extends ExecutionActor,I,C,D extends {type:string},E>{
  constructor(readonly corpseDurationPerExtra:number,readonly services:CombatExecutionServices<A,I,C,D,E>){}
  execute(caster:A,skill:I,aim:CombatPoint,options:PreparationOptions<A,C>={}):boolean{
    const s=this.services,frame=s.preparation.prepare(caster,skill,aim,options);
    if(frame.completed!==undefined)return frame.completed;
    const fieldAt=s.deliveries.execute(frame);if(fieldAt)s.linger(frame.caster,frame.inst,fieldAt,frame.useMult);
    const duration=frame.caster.sheet.get('effectDuration',frame.tags,frame.extra)*(frame.corpseFeast>0?1+this.corpseDurationPerExtra*frame.corpseFeast:1);
    s.caster.apply({caster:frame.caster,skill:frame.inst,origin:frame.origin,aim:frame.aim,delivery:frame.d.type,durationScale:duration,areaScale:frame.aoeScale,
      multiplier:frame.useMult,color:frame.cosmeticColor,tags:frame.tags,modifiers:frame.extra,chargesSpent:frame.opts.chargesSpent??0,fromFuse:frame.opts.fromFuse},s.effects(frame.inst));
    s.aftermath.complete(frame);return true;
  }
}
