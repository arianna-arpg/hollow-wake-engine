import type {CombatPoint} from './combat-geometry.js';
import type {PreparedCast} from './cast-preparation-types.js';
import type {ProjectileDeliverySpec,ProjectileDeliveryFrame} from './projectile-delivery.js';
import type {AreaSpecs,AreaFrame} from './area-delivery-types.js';
import type {GroundDeliverySpec,StormDeliverySpec,FieldDeliveryFrame} from './field-delivery-types.js';
import type {DirectFrame} from './direct-deliveries.js';
import type {MovementSpecs,MovementFrame} from './movement-deliveries.js';
import type {SummonDeliverySpec,SummonDeliveryFrame} from './summon-delivery.js';
import type {ConstructDeliverySpec} from './construct-delivery.js';
import type {ConstructBirthSpec} from './construct-birth.js';
import type {AuraActivationDelivery} from './aura-activation.js';
type AreaDelivery={[K in keyof AreaSpecs]:{type:K}&AreaSpecs[K]}[keyof AreaSpecs];
type MovingDelivery<G>={[K in keyof MovementSpecs<G>]:{type:K}&MovementSpecs<G>[K]}[keyof MovementSpecs<G>];
export type CombatDelivery<G,E,U>=ProjectileDeliverySpec|AreaDelivery|MovingDelivery<G>|GroundDeliverySpec|StormDeliverySpec|SummonDeliverySpec
  |({type:'construct'}&ConstructDeliverySpec<E>&ConstructBirthSpec<U>)|({type:'aura'}&AuraActivationDelivery<U,string>)
  |{type:'self'}|{type:'target';splash?:number}|{type:'mark';castRange:number}|{type:'detonate'};
type Flat=Partial<Record<string,number>>;
export interface DeliveryExecutionServices<A,I,C,G,E,U>{
  projectile:{execute(frame:ProjectileDeliveryFrame<A,I,Set<string>,import('./types.js').Modifier,Flat>):CombatPoint|null};
  area:{[K in keyof AreaSpecs]:(frame:AreaFrame<A,I,Flat,AreaSpecs[K]>)=>CombatPoint|null};
  fields:{ground(frame:FieldDeliveryFrame<A,I,Flat,GroundDeliverySpec>):CombatPoint|null;storm(frame:FieldDeliveryFrame<A,I,Flat,StormDeliverySpec>):CombatPoint|null};
  direct:{self(frame:DirectFrame<A,I,Flat>):void;target(frame:DirectFrame<A,I,Flat>,delivery:{splash?:number}):CombatPoint|null};
  movement:{[K in keyof MovementSpecs<G>]:(frame:MovementFrame<A,I>,delivery:MovementSpecs<G>[K])=>void};
  summons:{execute(frame:SummonDeliveryFrame<A,I,C>,delivery:SummonDeliverySpec):void};
  constructs:{execute(actor:A,skill:I,aim:CombatPoint,delivery:ConstructDeliverySpec<E>&ConstructBirthSpec<U>,area:number,multiplier:number,target?:{readonly pos:CombatPoint}|null):void};
  auras:{activate(actor:A,skill:I,delivery:AuraActivationDelivery<U,string>,area:number):void};
  utility:{mark(actor:A,skill:I,aim:CombatPoint,range:number,color:string):void;detonate(actor:A,skill:I,color:string):void};
}
/** The eighteen admitted delivery families share one prepared cast. All
 * implementations are SDK services; geometry/entity providers sit beneath
 * those services. No default fallback can silently discard a new family. */
export class DeliveryExecution<A extends {readonly pos:CombatPoint},I,C,G,E,U>{
  constructor(readonly services:DeliveryExecutionServices<A,I,C,G,E,U>,readonly targeting:(skill:I)=>{consumesCorpse?:boolean}|undefined){}
  execute(frame:PreparedCast<A,I,C,CombatDelivery<G,E,U>>):CombatPoint|null{
    const s=this.services,{caster,inst,aim,d,opts,targetInfo,origin,tags,extra,useMult,gPow,ventRounds,corpseFeast,flatBonus,aoeScale,cosmeticColor}=frame;
    switch(d.type){
      case 'projectile':return s.projectile.execute({caster,skill:inst,aim,delivery:d,multiplier:useMult,flat:flatBonus,tags,modifiers:extra,gaugePower:gPow,
        chargesSpent:opts.chargesSpent??0,corpseFeast,bonusProjectiles:opts.bonusProjectiles??0,ventRounds,color:cosmeticColor});
      case 'melee':return s.area.melee({...frame,d});case 'cone':return s.area.cone({...frame,d});case 'nova':return s.area.nova({...frame,d});case 'detonateProjectile':return s.area.detonateProjectile({...frame,d});
      case 'ground':return s.fields.ground({...frame,d});case 'storm':return s.fields.storm({...frame,d});
      case 'self':s.direct.self({caster,skill:inst,target:targetInfo,origin,tags,modifiers:extra,multiplier:useMult,flat:flatBonus,areaScale:aoeScale,chargesSpent:opts.chargesSpent??0});return null;
      case 'target':return s.direct.target({caster,skill:inst,target:targetInfo,origin,tags,modifiers:extra,multiplier:useMult,flat:flatBonus,areaScale:aoeScale,chargesSpent:opts.chargesSpent??0,targetSpec:this.targeting(inst)},d);
      case 'dash':case 'carom':case 'blink':case 'leap':{
        const movement={caster,skill:inst,aim,target:targetInfo,tags,modifiers:extra,areaScale:aoeScale,multiplier:useMult,color:cosmeticColor,speedMultiplier:opts.speedMult,noRepeat:opts.noRepeat};
        switch(d.type){case 'dash':s.movement.dash(movement,d);break;case 'carom':s.movement.carom(movement,d);break;case 'blink':s.movement.blink(movement,d);break;case 'leap':s.movement.leap(movement,d);break;}return null;
      }
      case 'summon':s.summons.execute({caster,skill:inst,aim,target:targetInfo,tags,modifiers:extra,multiplier:useMult,gaugePower:gPow},d);return null;
      case 'construct':s.constructs.execute(caster,inst,aim,d,aoeScale,useMult,targetInfo?.actor??null);return null;
      case 'aura':s.auras.activate(caster,inst,d,aoeScale);return null;
      case 'mark':s.utility.mark(caster,inst,aim,d.castRange,cosmeticColor);return null;
      case 'detonate':s.utility.detonate(caster,inst,cosmeticColor);return null;
      default:{const unreachable:never=d;throw Error(`Unsupported combat delivery: ${String((unreachable as {type?:unknown}).type)}`);}
    }
  }
}
