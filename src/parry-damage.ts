import type {DamagePacket} from './damage-pipeline-types.js';import type {Modifier} from './types.js';
export interface ParryDamage {packet:DamagePacket<Modifier,string>;power:number;reflections:number}
/** Captured original packet; another reflection replaces power instead of multiplying it. */
export function parryCounter(payload:ParryDamage,scale=1):DamagePacket<Modifier,string>{
  const amounts={...payload.packet.amounts};for(const type of Object.keys(amounts) as (keyof typeof amounts)[])amounts[type]!*=payload.power*scale;
  return{...payload.packet,amounts,tags:new Set(payload.packet.tags)};
}
/** One shared retaliation window per victim, released with that body. */
export class ParryDamageWindow<A extends object>{
  private readonly until=new WeakMap<A,number>();
  constructor(readonly cooldown:(actor:A)=>number){}
  ready(target:A,now:number):boolean{return now>=(this.until.get(target)??-Infinity);}
  spend(target:A,now:number):void{this.until.set(target,now+this.cooldown(target));}
}
