import type {ActiveStatus,StatusOptions,StatusDamageType} from './status-lifecycle-types.js';
export type {StatusDamageType};
export type HitStatusAmounts=Partial<Record<StatusDamageType,number>>;
export interface HitStatusEffect {
  type:'status';status:string;chance:number;magnitude?:number;durationOverride?:number;
}
export interface HitStatusDefinition {
  duration:number;color?:string;dotType?:StatusDamageType;element?:StatusDamageType;
  baseline?:{dps:number;perLevel:number};stacking?:boolean;hitMagnitude?:number;
  cullsAtLethal?:boolean;dischargeOnHit?:boolean;dischargeMatchingType?:boolean;
}
export interface HitStatusSkill<Tag extends string> {
  id:string;name:string;color:string;tags:Tag[];
  effects:readonly {type:string;status?:string}[];
  linkedHexes?:{dmgPerHex:number;durPerHex:number};
}
export interface HitStatusBuff<Tag extends string> {
  def:{nextHit?:{tags?:Tag[];status?:string;statusScale?:number;addedDamage?:HitStatusAmounts;procId?:string}};
}
export interface HitStatusPacket<Tag extends string> {amounts:HitStatusAmounts;tags:Set<Tag>}
export interface HitStatusActor<I,M,Tag extends string,B> {
  id:number;name:string;life:number;dead:boolean;invulnerable:boolean;
  hitFlash:number;hitFlashType?:StatusDamageType;statuses:ActiveStatus[];
  skills:readonly (I|null|undefined)[];buffs:ReadonlyMap<string,B>;
  summonShell?:unknown;owner?:{id:number};
  sheet:{
    get(id:string,tags?:ReadonlySet<Tag>,extra?:readonly M[]):number;
    armedFamily(prefix:string,ids:readonly string[],extra?:readonly M[]):readonly string[];
    removeSource(id:string):void;
  };
  applyStatus(id:string,dps:number,durationScale:number,sourceName:string,options?:StatusOptions):void;
  consumeBuffStacks(id:string,count:number):void;
  isWet():boolean;
}
/** One host-owned resolution. Scalar captures must not be changed after prepare;
 * actor, packet, definition and modifier references remain live and borrowed. */
export interface HitStatusFrame<A,I,S,M,Tag extends string> {
  readonly caster:A;readonly inst:I;readonly target:A;readonly def:S;
  readonly extra:M[];readonly packet:HitStatusPacket<Tag>;
  readonly dealt:number;readonly depth:number;readonly afflictionCarry:number;
  readonly tags:Set<Tag>;readonly durScale:number;readonly bonusChance:number;
  readonly hexDmg:number;readonly hexDur:number;
}
export interface HitStatusPorts<A,I,S,M,Tag extends string,D,B extends HitStatusBuff<Tag>,Q> {
  definition(id:string):D|undefined;
  /** Return the current ordered vocabulary at each original read point. */
  statusIds():readonly string[];
  random():number;
  zoneLevel():number;
  tuning(id:string):{identityThreshold:number;incidentalScale:number}|undefined;
  skillContextTags(def:S,extraTags?:Tag[]):Set<Tag>;
  instanceBrood(inst:I):StatusOptions['brood'];
  mitigateTyped(target:A,amounts:HitStatusAmounts,options?:{attacker?:A;tags?:Set<Tag>;extra?:M[]}):number;
  landLifeDamage(target:A,amount:number):void;
  kill(target:A,silent:boolean,caster:A):void;
  rollStatusProcs(caster:A,inst:I,target:A,id:string,tags:Set<Tag>,extra:M[],depth:number):void;
  bankPools(caster:A,source:{status:string},amount:number):void;
  procDefinition(id:string):Q|undefined;
  executeProc(proc:Q,caster:A,inst:I,target:A,depth:number):void;
  riderCue(target:A,definition:B['def'],buffId:string):void;
  /** Presentation maps the actor and original screen-height offset to its host. */
  text(actor:A,height:number,text:string,color:string,size:number,channel?:'combat'):void;
  statusCue(kind:'resist'|'affliction',target:A,caster:A,color:string|undefined):void;
}
