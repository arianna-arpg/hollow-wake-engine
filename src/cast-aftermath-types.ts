import type {CombatPoint} from './combat-geometry.js';import type {Modifier} from './types.js';import type {PreparationOptions,PreparationTarget,PreparationRepeat} from './cast-preparation-types.js';
export interface AftermathSkill {readonly def:{readonly id:string;readonly name:string;readonly color:string;readonly tags:readonly string[];readonly effects:readonly {type:string}[];readonly delivery:{type:string};readonly invokes?:unknown};
  state?:{pressAt?:number;lastUseAt?:number;stackN?:number;stackT?:number};readonly chainOf?:string;}
export interface AftermathActor<A,I,B>{
  readonly pos:CombatPoint;readonly radius:number;readonly tier:number;readonly team:string;readonly kind:string;readonly dead:boolean;readonly owner?:A;
  readonly construct?:{kind:string;echo?:unknown;timer:number;castInterval?:number;castInst?:I};readonly mimicWatch?:unknown;readonly mimicWitnessR:number;
  useLock:number;mana:number;castCycles:Map<string,number>;sheet:{get(stat:string,tags:Set<string>,extra:Modifier[]):number};
  speedFactor(skill:I):number;noteRecent(kind:'move'):void;addBuff(buff:B,duration:number):void;gainCharge(id:string,amount:number,max:number|undefined,skill:I):void;maxMana():number;
}
export interface AftermathRemnant {pos:CombatPoint;element:string;bob:number;life:number}
export interface AftermathState<A,I>{pendingRepeats:PreparationRepeat<A,I>[];remnants:AftermathRemnant[]}
export interface AftermathFrame<A,I,C,D>{caster:A;inst:I;aim:CombatPoint;origin:CombatPoint;d:D;opts:PreparationOptions<A,C>;targetInfo:PreparationTarget<A,C>|null;tags:Set<string>;extra:Modifier[];useMult:number}
export interface AftermathRules {readonly unleashInterval:number;readonly elements:readonly string[]}
export interface AftermathPorts<A,I extends AftermathSkill,C,B,Z,E>{
  time():number;random():number;instanceBirth(skill:I):(Z&{onHit?:boolean})|undefined;birthAt(actor:A,skill:I,birth:Z,at:CombatPoint):void;
  instanceChargeCost(skill:I):{repeatsPerCharge?:number}|undefined;instanceTargeting(skill:I):{target:string}|undefined;instanceDelivery(skill:I):{type:string};
  consumeRemnants(actor:A,definition:I['def']):void;consumeAmmunition(actor:A,definition:I['def']):void;rollOwnProcs(actor:A,event:'cast',context:{tags:Set<string>;extra:Modifier[];inst:I;aim:CombatPoint}):void;
  instanceSelfStack(skill:I):{maxStacks:number;duration:number}|undefined;instanceCastCycle(skill:I):{count:number;buff:B&{id:string}}|undefined;associateTreeBuff(buff:B,source:{caster:A;inst:I}):void;
  text(at:CombatPoint,text:string,color:string,size:number):void;instanceChargeGain(skill:I):readonly {on:string;chance?:number;charge:string;amount:number;max?:number}[];
  clampPos(at:CombatPoint,radius:number):CombatPoint;consumeStealth(actor:A,definition:I['def']):void;bankRune(actor:A,definition:I['def']):void;recordCast(actor:A,definition:I['def'],chainOf?:string):void;
  markBodyAction(actor:A,skill:I,time:number,angle:number):void;seats():readonly {actor:A}[];mimicRefreshWatch(actor:A,time:number):void;mimicCapture(witness:A,caster:A,definition:I['def']):boolean;
  lineOfSight(from:CombatPoint,to:CombatPoint,fromTier:number,toTier:number):boolean;notice(text:string,color:string,size:number,kind:'world'):void;
  instanceEchoes(skill:I):readonly {spec:E;key:string}[];spawnEchoRiders(actor:A,skill:I,spec:E,key:string,aim:CombatPoint,payload:I):void;
  actors():A[];executeSkill(actor:A,skill:I,aim:CombatPoint,options:PreparationOptions<A,C>):boolean;
  queueFollowUps(actor:A,skill:I,aim:CombatPoint,chargesSpent:number):void;challengeCompleted(actor:A,skill:I):void;companionCast(actor:A,skill:I,aim:CombatPoint):void;
  echoToClones(actor:A,skill:I,aim:CombatPoint,multiplier:number,target:PreparationTarget<A,C>|undefined):void;presenceMoment(actor:A,phase:'pulse'):void;
}
