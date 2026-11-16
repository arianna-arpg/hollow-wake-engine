import type {CombatPoint} from './combat-geometry.js';
import type {Modifier} from './types.js';
export interface AreaBody {pos:CombatPoint;r:number;seg:number}
export interface AreaSkill {readonly def:{readonly id:string;readonly tags:readonly string[]}}
export interface AreaActor<A>{
  readonly id:number;readonly pos:CombatPoint;readonly radius:number;readonly facing:number;readonly tier:number;readonly dead:boolean;
  readonly untargetable:boolean;readonly team:string;readonly partLink?:{readonly root:A};readonly statuses:readonly {readonly id:string}[];
  readonly sheet:{get(stat:string,tags:Set<string>,modifiers:Modifier[],base?:number):number};
}
export interface AreaProjectile<A,I>{readonly caster:A;readonly inst:I;readonly pos:CombatPoint}
export interface AreaSpecs {
  melee:{readonly range:number;readonly arcDeg:number;readonly shape?:'circle'|'square'|'triangle'|'crescent'|'sector'|'band';readonly fx?:unknown};
  cone:{readonly range:number;readonly arcDeg:number;readonly edgeOnly?:number;readonly beamFx?:boolean};
  nova:{readonly radius:number;readonly affects?:'all'|'allies'|'enemies';readonly spareCaster?:boolean;readonly maxTargets?:number;readonly requiresStatus?:readonly string[];
    readonly lanceFx?:boolean;readonly edgeOnly?:number;readonly fx?:unknown};
  detonateProjectile:{readonly radius:number;readonly requireTag?:string;readonly consumeBonus?:number};
}
export interface AreaFrame<A,I,F,D> {
  readonly caster:A;readonly inst:I;readonly d:D;readonly aim:CombatPoint;readonly origin:CombatPoint;
  readonly tags:Set<string>;readonly extra:Modifier[];readonly useMult:number;readonly flatBonus?:F;readonly aoeScale:number;readonly arcScale:number;readonly cosmeticColor:string;
}
export interface AreaFlash {
  pos:CombatPoint;radius:number;color:string;life:number;maxLife:number;
  shape?:number;facing?:number;arc?:{facing:number;arcRad:number};edgeFrac?:number;beam?:boolean;fx?:unknown;recoveryCueTier?:number;
}
export interface SweepZone<A,I,F>{
  pos:CombatPoint;radius:number;caster:A;inst:I;color:string;delay:number;exploded:boolean;linger:number;tickInterval:number;tickTimer:number;
  shape:number;facing:number;dmgMult:number;depth:number;drift:number;arcRad:number;struck:Set<number>;flatBonus?:F;
}
/** Hit, recovery, aftermath and delayed fields bind SDK services. Only physical
 * bodies, world occlusion and presentation are consuming-host responsibilities. */
export interface AreaDeliveryPorts<A,I,F>{
  actors():A[];enemiesOf(actor:A):A[];projectiles():AreaProjectile<A,I>[];
  assaultLocked(actor:A,skill:I):A|undefined;
  resolveHit(actor:A,skill:I,target:A,multiplier:number,depth:0,flat?:F):void;
  nearestBody(actor:A,at:CombatPoint):AreaBody;noteBodyHit(actor:A,segment:number):void;
  inAoeBody(origin:CombatPoint,radius:number,shape:number,facing:number,actor:A,arc:number|undefined,predicate:(at:CombatPoint,radius:number)=>boolean):AreaBody|null;
  zone(zone:SweepZone<A,I,F>):void;flash(flash:AreaFlash):void;
  releaseStruckSummons(actor:A,skill:I,predicate:(body:{pos:CombatPoint;radius:number})=>boolean):void;
  skillStrikeVoice(id:string):unknown;skillBurstVoice(id:string):unknown;skillBeamVoice(id:string):unknown;skillSelfVoice(id:string,phase:'burst'):unknown;
  skillContextTags(skill:I):Set<string>;
  mintAftermath(actor:A,skill:I,at:CombatPoint,radius:number,shape:number,facing:number,multiplier:number,tags:Set<string>,extra:Modifier[],arc?:number,edge?:number,originalFacing?:number):void;
  healAlliesInArea(actor:A,skill:I,predicate:(actor:A)=>boolean,multiplier:number):void;
  frontSplash(actor:A,skill:I,at:CombatPoint,radius:number):void;
  strikeSurfaces(actor:A,at:CombatPoint,radius:number,predicate:(point:CombatPoint,radius:number)=>boolean,unused?:undefined,alsoUnused?:undefined,isArea?:boolean):void;
  skillOcclusion(actor:A,skill:I):string;lineOfFire(from:CombatPoint,to:CombatPoint,tier:number):boolean;
  clipShot(from:CombatPoint,to:CombatPoint,tier:number):CombatPoint;
  spawnAftershocks(actor:A,skill:I,at:CombatPoint,radius:number,shape:number):void;
}
