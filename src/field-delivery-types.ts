import type {CombatPoint} from './combat-geometry.js';
import type {Modifier} from './types.js';
import type {CastFieldEffect} from './cast-fields.js';
import type {CombatField,GroundPulseSpec,GroundCascadeSpec,SizeEnvelopeSpec,MaddenBank} from './combat-fields.js';
export interface GroundDeliverySpec {
  type:'ground';radius:number;castRange:number;occlusion?:'blocked'|'free';delay?:number;impactDress?:unknown;lingerDuration?:number;tickInterval?:number;
  exposure?:number;exposureDomain?:true;pull?:number;pullRadius?:number;fillFrom?:number;fillTime?:number;line?:{segments:number;spacing:number};
  drift?:number;seek?:{speed:number;range?:number};rotate?:number;grow?:number;sizeOver?:SizeEnvelopeSpec;noImpact?:true;hitOnce?:boolean;rearmOnExit?:boolean;
  shape?:'circle'|'square'|'triangle'|'crescent'|'sector'|'band';arcDeg?:number;cascade?:GroundCascadeSpec;pulse?:GroundPulseSpec;
  emit?:{skillId:string;interval:number;count?:number;at?:'point'|'enemy';bearing?:'random'|'out';reach?:number;intervalStep?:number};
  domain?:{allyMods?:Modifier[];enemyMods?:Modifier[];minionMods?:Modifier[]};
  leaveTerrain?:{kind:'ice'|'mud'|'bog'|'swamp'|'water';radius:number;duration:number};
  fissure?:{length:number;speed:number;step?:number;branches?:number;branchDeg?:number;close?:{delay:number;damageScale:number}};
  marker?:{cap:number};exclusive?:true;follow?:true;retract?:{at:number;speed?:number;fizzle?:true};endBurst?:{damageScale:number;radiusScale?:number};
  pendulum?:{arcDeg:number;period:number};sweep?:{arcDeg:number;converge?:true};strobe?:{interval:number;bearing?:'random'|'facing';reservePct?:number};
}
export interface StormDeliverySpec {
  type:'storm';count:number|readonly[number,number];interval:number;areaRadius:number;hitRadius:number;castRange:number;occlusion?:'blocked'|'free';
  atEnemies?:true;scatter?:number;awaitRelease?:{order?:'placed'|'random';interval?:number};telegraph?:number;sky?:true;lob?:{arc?:number};impactDress?:unknown;fx?:string;onGround?:string[];
}
export interface FieldDeliveryActor<I>{readonly pos:CombatPoint;readonly facing:number;readonly tier:number;readonly casting?:{readonly mode:string;readonly inst:I};
  readonly sheet:{get(stat:string,tags:Set<string>,extra:Modifier[],base?:number):number};}
export interface FieldDeliverySkill {readonly def:{readonly id:string;readonly tags:readonly string[]}}
export interface FieldDeliveryFrame<A,I,F,D>{
  readonly caster:A;readonly inst:I;readonly d:D;readonly aim:CombatPoint;readonly tags:Set<string>;readonly extra:Modifier[];
  readonly aoeScale:number;readonly arcScale:number;readonly useMult:number;readonly flatBonus?:F;readonly cosmeticColor:string;readonly ventRounds:number;readonly gPow:number;
}
export interface FieldSocketSpecs {cadence:{intervalStep:number};exposure:{after:number;domain?:boolean};zoneGrow:number;zoneFollow:boolean;
  zoneEmit:{skillId:string;interval:number;at?:'point'|'enemy'};}
export interface FieldDeliveryState<A,I,F,B>{zones:CombatField<A,I,F,B>[];domainSeq:number;sparkSeq:number}
/** Combat callbacks bind SDK services. The host provides spatial facts and
 * presentation; these callbacks are not a substitute for combat extraction. */
export interface FieldDeliveryPorts<A,I,F,B,G>{
  time():number;random():number;clampGroundTarget(actor:A,skillAim:CombatPoint,delivery:GroundDeliverySpec,skill:I):CombatPoint;
  clampPos(at:CombatPoint,radius:number):CombatPoint;skillOcclusion(actor:A,skill:I):string;clipShot(from:CombatPoint,to:CombatPoint,tier:number):CombatPoint;enemiesOf(actor:A):A[];
  instanceEffects(skill:I):readonly (CastFieldEffect<G>|{readonly type:'damage'})[];
  plantKindle(actor:A,kind:string,at:CombatPoint,area:number,duration:number):void;
  plantVent(effect:Extract<CastFieldEffect<G>,{type:'vent'}>,at:CombatPoint,area:number,duration:number,tier:number):void;
  conjureGrantsFor(actor:A,tags:Set<string>,extra:Modifier[],grants:readonly G[]|undefined):readonly G[];
  conjureCloud(x:number,y:number,radius:number,duration:number,options:{caster:A;grants:readonly G[];look?:string;follow?:boolean}):void;
  instanceBirth(skill:I):B|undefined;birthAt(actor:A,skill:I,birth:B,at:CombatPoint):void;expireZone(zone:CombatField<A,I,F,B>):void;
  instanceTurret(skill:I):{castSkillId:string;life?:number;look?:string}|undefined;hasSkill(id:string):boolean;makeSkill(id:string,level:number):I;effectiveSkillLevel(skill:I):number;
  forwardSummonSockets(host:I,payloads:I[],options:{scale:number}):void;
  spawnConstruct(actor:A,skill:I,spec:{type:'construct';kind:'totem';range:number;duration:number;maxActive:number;life:number;placeRange:number;look?:string},aim:CombatPoint,payload:I,at:CombatPoint):A|null;
  layFissure(actor:A,skill:I,at:CombatPoint,angle:number,delivery:GroundDeliverySpec,mult:number,flat:F|undefined,branches:number,fan:number):void;
  socketSpec<K extends keyof FieldSocketSpecs>(skill:I,key:K):FieldSocketSpecs[K]|undefined;
  instancePulsePlan(skill:I):{native?:GroundPulseSpec;appended:GroundPulseSpec[]};instanceSizeOver(skill:I):SizeEnvelopeSpec|undefined;
  maddenBankOf(skill:I):MaddenBank|undefined;hostSockets(skill:I):readonly {def:{pendulum?:{arcDeg:number;period:number}}}[];
  instanceCascadePlan(skill:I,fallback:'axis'):{native?:GroundCascadeSpec;recasts:GroundCascadeSpec[]};skillPresenceVoice(id:string,phase:'pulse'):string|undefined;
}
export interface FieldDeliveryRules {readonly conjure:{readonly lineStep:number;readonly lineMaxHops:number};readonly forwarding:{readonly scale:Readonly<Record<string,number>>;readonly scaleDefault:number}}
