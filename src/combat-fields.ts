import type {CombatPoint} from './combat-geometry.js';
import type {Modifier} from './types.js';
export type FieldCurve='linear'|'quadIn'|'quadOut'|'cubicIn'|'cubicOut'|'expoIn'|'expoOut'|'sqrt'|'smooth'|'breath';
export interface SizeEnvelopeSpec {from?:number;to?:number;curve?:FieldCurve}
export interface GroundPulseSpec {delay:number;count?:number;interval?:number;intervalStep?:number;dmgMult?:number;dmgStep?:number;radiusMult?:number;radiusStep?:number}
export interface GroundCascadeSpec {count:number;dir?:'axis'|'forward'|'backward'|'random';step?:number;scaleStep?:number;dmgStep?:number;interval?:number;intervalStep?:number}
export interface MaddenBank {after:number;dwell:Map<number,number>;credited:Map<number,number>}
export interface CombatField<A,I,F,B> {
  attackPattern?:boolean;fieldCue?:{form?:string;release?:string;color?:string};
  pos:CombatPoint;radius:number;caster:A;inst:I;color:string;tier?:number;delay:number;exploded:boolean;
  linger:number;tickInterval:number;tickTimer:number;shape:number;facing:number;dmgMult:number;depth:number;
  forceDamage?:boolean;hitAll?:boolean;spareDormant?:boolean;spareRoofed?:boolean;curseAllies?:boolean;
  pull?:number;pullRadius?:number;drift?:number;grow?:number;sizeOver?:{from:number;to:number;curve:FieldCurve};radius0?:number;rotate?:number;
  leaveTerrain?:{kind:'ice'|'mud'|'bog'|'swamp'|'water';radius:number;duration:number};edge?:number;fillRate?:number;
  meteor?:boolean;lobFrom?:CombatPoint;lobArc?:number;delay0?:number;presenceRetired?:boolean;impactDress?:unknown;fx?:string;onImpact?:()=>void;birth?:B;
  struck?:Set<number>;arcRad?:number;flatBonus?:F;marker?:boolean;phase?:boolean;follow?:boolean;anchor?:A;toggled?:boolean;reserved?:number;rearm?:boolean;
  retract?:{at:number;speed?:number;fizzle?:true};seg?:{ax:number;ay:number;bx:number;by:number};
  volatile?:{interval:number;chance:number;damageScale:number;next:number};aftershock?:{damageScale:number;radiusScale?:number;rearm:number;readyAt:number};
  roulette?:{interval:number;chance:number;window:number;damageScale:number;radiusScale?:number;next:number;armedUntil:number};
  seek?:{speed:number;range:number};healTick?:number;madden?:MaddenBank;
  pulse?:{delay:number;interval:number;intervalStep:number;dmgMult:number;dmgStep:number;radiusMult:number;radiusStep:number;left:number;next:number;queue?:PulseBeat[]};
  edgeFrac?:number;onGround?:string[];exposure?:{after:number;dwell:Map<number,number>};exposureDomain?:true;armed?:boolean;armSeq?:number;
  endBurst?:{damageScale:number;radiusScale?:number};pendulum?:{arc:number;period:number;base:number};sweep?:{arc:number;base:number};linger0?:number;
  emit?:{skillId:string;interval:number;count?:number;at?:'point'|'enemy';bearing?:'random'|'out';reach?:number};
  emitTimer?:number;emitInterval?:number;emitStep?:number;emitInst?:I;
  domain?:{allyMods?:Modifier[];enemyMods?:Modifier[];minionMods?:Modifier[];stackGroup?:string};domainKey?:string;domainAffected?:Set<A>;
}
export interface PulseBeat {delay:number;dmgMult:number;radiusMult:number}
/** Appended rhythms retain their own damage/radius steps. Cadence replaces
 * interval stepping for each rhythm; it does not rewrite its opening delay. */
export function flattenPulseQueue(appended:readonly GroundPulseSpec[],cadence:number|undefined):PulseBeat[]{
  const queue:PulseBeat[]=[];
  for(const g of appended){const step=cadence??g.intervalStep??1;let delay=g.delay,dmg=g.dmgMult??1,radius=g.radiusMult??1;
    for(let k=0;k<Math.max(1,g.count??1);k++){queue.push({delay:Math.max(.05,delay),dmgMult:dmg,radiusMult:radius});
      delay=Math.max(.05,(g.interval??g.delay)*Math.pow(step,k));dmg*=g.dmgStep??1;radius*=g.radiusStep??1;}}
  return queue;
}
export function resolveSizeOver(spec?:SizeEnvelopeSpec):{from:number;to:number;curve:FieldCurve}|undefined{
  return spec?{from:spec.from??1,to:spec.to??0,curve:spec.curve??'linear'}:undefined;
}
export function evalFieldCurve(kind:FieldCurve|undefined,t:number):number{
  const c=Math.min(1,Math.max(0,t));switch(kind){
    case 'quadIn':return c*c;case 'quadOut':return 1-(1-c)*(1-c);case 'cubicIn':return c*c*c;case 'cubicOut':return 1-Math.pow(1-c,3);
    case 'expoIn':return c<=0?0:Math.pow(2,10*(c-1));case 'expoOut':return c>=1?1:1-Math.pow(2,-10*c);case 'sqrt':return Math.sqrt(Math.max(0,c));
    case 'smooth':return c*c*(3-2*c);case 'breath':return Math.sin(Math.PI*c);default:return c;
  }
}
/** Instance-owned banks are shared across casts of that exact skill, never
 * across equal IDs or independent sessions. Weak keys release retired skills. */
export class MaddenBanks<I extends object>{
  private readonly banks=new WeakMap<I,MaddenBank>();
  constructor(readonly threshold:(skill:I)=>number|undefined){}
  of(skill:I):MaddenBank|undefined{
    const after=this.threshold(skill);if(after===undefined)return undefined;
    let bank=this.banks.get(skill);if(!bank||bank.after!==after){bank={after,dwell:new Map(),credited:new Map()};this.banks.set(skill,bank);}
    return bank;
  }
}
