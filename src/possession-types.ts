import type {Modifier} from './types.js';
export interface PossessSpec {duration?:number;lifeFrac?:number;powerFactor?:number;guise?:boolean;husk?:'stands'|'carried';huskLostFrac?:number}
export interface ShiftSpec {form:string;powerFactor?:number;duration?:number}
export type EjectReason='press'|'duration'|'bodyDied'|'huskDying'|'huskPain'|'huskSeized'|'travel'|'released';
export interface PossessRide {
  seatId:string;kind:'possess'|'shift';prevTeam:string;prevKind:string|undefined;guiseFaction?:string;guiseBroken?:boolean;until?:number;
  huskLifeAt:number;huskLostFrac:number;huskMode:'stands'|'carried';guestSlot:number;gemId:string;mintedForm?:boolean;
}
export interface PossessionRules {
  readonly lifeFrac:number;readonly duration:number;readonly powerFactor:number;readonly shiftPowerFactor:number;readonly policy:Readonly<Record<string,number>>;
  readonly endOn:{readonly huskLostFrac:number;readonly huskSeized:boolean};readonly eject:{readonly bodyStun:number;readonly selfStun:number;readonly cooldown:number};
  readonly denyTags:readonly string[];
}
export interface PossessionDefinition {readonly name:string;readonly driven?:unknown;readonly possessable?:boolean;readonly bossBar?:boolean;readonly boss?:boolean;readonly tags?:readonly string[]}
export interface PossessionPoint {x:number;y:number}
export interface PossessionSkill {readonly def:{readonly id:string}}
export interface PossessionActor<I>{
  readonly id:number;readonly radius:number;readonly level:number;readonly color:string;readonly faction?:string;readonly defId?:string;readonly rarity?:string;
  readonly construct?:unknown;readonly doorId?:string;readonly partLink?:unknown;readonly partActors?:readonly unknown[];readonly worm?:unknown;
  readonly companion?:boolean;readonly owner?:unknown;readonly hiveForm?:unknown;readonly heldBy?:number;
  readonly skills:(I|null)[];readonly statuses:{id:string}[];readonly cooldowns:Map<string,number>;readonly cooldownTotals:Map<string,number>;
  readonly sheet:{get(stat:string,tags?:ReadonlySet<string>,extra?:readonly Modifier[]):number;setSource(id:string,mods:Modifier[]):void;removeSource(id:string):void};
  life:number;dead:boolean;casting:unknown;aiTargetId?:number;vacated?:{seatId:string};possession?:PossessRide;
  team:string;kind?:string;pos:PossessionPoint;noBounty?:boolean;
  maxLife():number;applyStatus(id:string,dps:number,durationScale:number,source:string):void;
}
export interface PossessionController<A>{id:string;actor:A;home?:A}
export interface PossessionPorts<A,I,C>{
  actors():A[];controllers():readonly C[];controllerFor(actor:A):C|undefined;reindex():void;time():number;
  definition(id:string):PossessionDefinition|undefined;status(id:string):{readonly duration:number}|undefined;
  tags(skill:I,granted:readonly string[]):ReadonlySet<string>;grantedTags(skill:I):readonly string[];modifiers(skill:I):readonly Modifier[];
  createBody(id:string,level:number,team:'player'):A;clamp(at:PossessionPoint,radius:number):PossessionPoint;
  text(at:PossessionPoint,text:string,color:string,size:number):void;
  flash(value:{pos:PossessionPoint;radius:number;color:string;life:number;maxLife:number}):void;
  fail(actor:A,key:string,message:string):void;
  /** Refresh host views/ownership indices; no save acknowledgement is needed. */
  changed(controller:C):void;
  embodied(signal:{seat:string;body:A;hero:A;kind:'possess'|'shift'}):void;
  ejected(signal:{seat:string;body:A;hero:A;reason:EjectReason}):void;
  /** Bind the skill-specific swarm return service when that form is admitted. */
  returnSwarmForm(body:A,reason:EjectReason):void;
}
