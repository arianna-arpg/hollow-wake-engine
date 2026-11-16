import type {CombatPoint} from './combat-geometry.js';import type {CombatField,GroundCascadeSpec,GroundPulseSpec,SizeEnvelopeSpec,MaddenBank} from './combat-fields.js';
import type {Modifier} from './types.js';import type {GroundDeliverySpec,FieldSocketSpecs} from './field-delivery-types.js';
import type {ProjectileSockets} from './projectile-types.js';
export interface AftermathFieldActor {readonly pos:CombatPoint;readonly facing:number;readonly tier:number;readonly radius:number;readonly sheet:{get(stat:string,tags:Set<string>,extra:Modifier[],base?:number):number}}
export interface AftermathFieldSkill {readonly def:{readonly id:string;readonly color:string}}
export interface DropZoneSpec {radius:number;duration:number;tickInterval?:number;damageScale?:number;sizeOver?:SizeEnvelopeSpec}
export interface AftermathFieldSockets extends FieldSocketSpecs,ProjectileSockets {healField:{amount:number};fissurePath:{kind:'orbit'|'spiral'|'serpent';turns?:number;waveDeg?:number}}
export interface AftermathFieldPorts<A,I,F,B>{
  time():number;random():number;instanceDelivery(skill:I):{type:string;fx?:string};
  skillBurstVoice(id:string):string|undefined;skillStrikeVoice(id:string):string|undefined;skillMovementVoice(id:string,phase:'impact'):string|undefined;skillPresenceVoice(id:string,phase:'pulse'):string|undefined;
  socketSpec<K extends keyof AftermathFieldSockets>(skill:I,key:K):AftermathFieldSockets[K]|undefined;
  instancePulsePlan(skill:I):{native?:GroundPulseSpec;appended:GroundPulseSpec[]};instanceCascadePlan(skill:I,fallback:'forward'):{native?:GroundCascadeSpec;recasts:GroundCascadeSpec[]};
  skillContextTags(skill:I,extra:string[]):Set<string>;grantedTags(skill:I):string[];instanceMods(skill:I):Modifier[];
  instanceSizeOver(skill:I):SizeEnvelopeSpec|undefined;hostSockets(skill:I):readonly {def:{pendulum?:{arcDeg:number;period:number}}}[];maddenBankOf(skill:I):MaddenBank|undefined;
  enemiesOf(actor:A):A[];resolveHit(actor:A,skill:I,target:A,multiplier:number,depth:number,flat?:F,force?:boolean):void;
  cosmetic(actor:A,skillId:string):{color?:string};flash(cue:{pos:CombatPoint;radius:number;color:string;life:number;maxLife:number;fx?:string;facing?:number;recoveryCueTier?:number}):void;
  frontSplash(actor:A,skill:I,at:CombatPoint,radius:number):void;strikeSurfaces(actor:A,at:CombatPoint,radius:number):void;
  skillOcclusion(actor:A,skill:I):string;clipShot(from:CombatPoint,to:CombatPoint,tier:number):CombatPoint;occluded(kind:'place'):void;
  clampPos(at:CombatPoint,radius:number):CombatPoint;
}
export type AftermathFieldState<A,I,F,B>={zones:CombatField<A,I,F,B>[]};
export type {GroundDeliverySpec};
