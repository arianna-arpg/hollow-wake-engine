import {finite,integer} from './validation.js';

export type ProcTrigger='hit'|'kill'|'collision'|'statusApply'|'block'|'evade'|'esBreak'
  |'esRechargeStart'|'esFilled'|'poiseBreakDealt'|'poiseBroken'|'poiseBracket'|'poiseRearmed'
  |'chargeGain'|'buffGain'|'orbPickup'|'surface'|'hurt'|'miss'|'foiled'|'cast'|'condition'
  |'pulse'|'minionDeath'|'heal'|'lastGasp'|'struck';
export interface ProcConfiguration {readonly maxExtraDepth:number;readonly depthFalloff:number;readonly ppmCatchup:number}
export const DEFAULT_PROC_CONFIGURATION:ProcConfiguration=Object.freeze({maxExtraDepth:2,depthFalloff:.5,ppmCatchup:4});
export function procConfiguration(input:ProcConfiguration):ProcConfiguration {
  const maxExtraDepth=integer(input.maxExtraDepth,0,'Proc depth limit');
  const depthFalloff=finite(input.depthFalloff,'Proc depth falloff');
  const ppmCatchup=finite(input.ppmCatchup,'Proc catch-up');
  if(depthFalloff<0||depthFalloff>1||ppmCatchup<0)throw new Error('Invalid proc configuration');
  return Object.freeze({maxExtraDepth,depthFalloff,ppmCatchup});
}
/** Dispatch grammar only. Effects and presentation metadata remain application data. */
export interface ProcDefinition {
  readonly id:string;readonly trigger:ProcTrigger;readonly effect:unknown;
  readonly skills?:readonly string[];readonly when?:string;readonly unless?:string;
  readonly requireBuff?:string|readonly string[];readonly requireStatus?:string|readonly string[];
  readonly tags?:readonly string[];readonly oncePerCast?:true;readonly icd?:number;readonly ppm?:number;
  readonly bracket?:number|readonly number[];readonly condition?:string;readonly receivedTypes?:readonly string[];
  readonly crit?:true;readonly noCrit?:true;readonly vs?:readonly string[];
  readonly charge?:string|readonly string[];readonly buff?:string|readonly string[];readonly orb?:string|readonly string[];
  readonly status?:string|readonly string[];readonly rollTop?:number;readonly hitType?:string;
  readonly minionCarry?:true;readonly every?:number;
}
export interface ProcRiderDefinition<C=unknown> {readonly id:string;readonly proc:string|readonly string[];readonly cast:C}
export interface ProcSource<D extends ProcDefinition,R extends ProcRiderDefinition> {
  readonly configuration:ProcConfiguration;
  allIds():readonly string[];
  triggerIds(trigger:ProcTrigger):ReadonlySet<string>|undefined;
  candidates(trigger:ProcTrigger):readonly D[];
  hitCandidates():readonly D[];
  definition(id:string):D|undefined;
  riders():readonly R[];
}
export interface ProcActor {
  readonly dead:boolean;
  readonly procReadyAt:Map<string,number>;readonly procAttemptAt:Map<string,number>;readonly procFiredAt:Map<string,number>;
  readonly buffs:ReadonlyMap<string,unknown>;
  readonly statuses:readonly {readonly id:string;readonly stacks:number}[];
}
export interface ProcSkill {readonly def:{readonly id:string}}
export interface ProcTalentState {condRose:string[];healedSince:number;gasped:boolean}
export interface ProcGainEvent {readonly kind:string;readonly id:string;readonly depth:number}
export interface ProcOwnEvent<A,I,T,E,Aim> {
  readonly tags?:T;readonly extra?:readonly E[];readonly inst?:I;readonly target?:A;readonly depth?:number;
  readonly bracket?:number;readonly condition?:string;readonly crit?:boolean;
  readonly receivedAmounts?:Readonly<Partial<Record<string,number>>>;readonly aim?:Aim;
}
/** Already resolved hit observations. Geometry and damage resolution stay with the host. */
export interface ProcHitEvent<T,E> {
  readonly dealt:number;readonly depth:number;readonly crit:boolean;readonly lethal:boolean;readonly elite:boolean;
  readonly dominantType?:string;readonly rollT?:number;readonly tags?:T;readonly extra?:readonly E[];
}
export interface ProcPorts<A,I,D,R extends ProcRiderDefinition,T,E,Aim> {
  time():number;random():number;
  stat(actor:A,id:string,tags?:T,extra?:readonly E[]):number;
  condition(actor:A,id:string):boolean;
  armed(actor:A,all:readonly string[],extra?:readonly E[]):readonly string[];
  tags(inst:I):T;extra(inst:I):readonly E[];
  carryTags(inst:I):T;carryCourt(actor:A,inst:I):number;
  victim(ids:readonly string[],target:A,actor:A):boolean;
  execute(proc:D,actor:A,inst:I|null,target:A|null,depth:number,aim?:Aim):void;
  castRider(actor:A,inst:I|null,target:A|null,depth:number,cast:R['cast']):void;
  bankStatus(actor:A,inst:I,target:A,status:string):void;
  lastGasp(actor:A):void;
}
