import type {CombatPoint} from './combat-geometry.js';import type {Modifier} from './types.js';import type {ConstructBodyState,ConstructBirthSpec} from './construct-birth.js';import type {CombatTether} from './tethers.js';import type {PreparationRepeat} from './cast-preparation-types.js';
export interface EchoRiderSpec {mode:'hover'|'strike'|'mimic';count?:number;duration:number;interval?:number;range?:number;glideSpeed?:number;hoverRadius?:number;damageFactor?:number;casts?:number;substitute?:number}
export interface ConstructClockState<I> extends ConstructBodyState<I>{fxAt?:number;embedReadyAt?:number;emitAt?:number;beamAt?:number;echo?:EchoRiderSpec;echoKey?:string;echoPower?:number;echoPrey?:number;echoCasts?:number;echoSlot?:number;echoReadyAt?:number;holdOnce?:boolean;started?:boolean}
export interface ConstructClockSkill {def:{id:string;name:string;color:string;tags:string[];delivery:{type:string;propel?:{distance:number;speed:number};occlusion?:'blocked'|'free'};targeting?:{target:string};chargeUp?:{maxTime:number};pool?:unknown;baseDamage?:unknown;effects:readonly{type:string}[]}}
export interface ConstructClockActor<A,I>{
  id:number;level:number;pos:CombatPoint;tier:number;radius:number;facing:number;team:string;dead:boolean;downed:boolean;untargetable:boolean;passive?:boolean;owner?:A;sourceSkillId?:string;summonInst?:I;construct?:ConstructClockState<I>;gateLink?:number;
  life:number;mana:number;useLock:number;lifespan:number;explodeOnDeath:number;shape:string;color:string;look?:string;adorn?:unknown;material?:string;cooldowns:Map<string,number>;
  dash?:{dir:number;speed:number;remaining:number};dashSkill?:I;dashHits?:Set<number>;caromRun?:unknown;casting?:{held?:boolean}|null;
  sheet:{get(stat:string,tags?:Set<string>,mods?:Modifier[],base?:number):number;setSource(id:string,mods:Modifier[]):void};canUse(skill:I):boolean;maxLife():number;maxMana():number;skillUseTime(skill:I):number;
  gainCharge(id:string,amount:number,max:number,skill?:I):void;
}
export interface ConstructTarget<A>{actor?:A}
export interface ConstructLifecycleState<A,I>{tethers:CombatTether<A,I>[];pendingRepeats:PreparationRepeat<A,I>[]}
export interface ConstructLifecyclePorts<A,I extends ConstructClockSkill>{
  actors():A[];time():number;random():number;enemiesOf(actor:A):A[];actorById(id:number):A|undefined;
  skill(id:string):I['def']|undefined;makeSkillInstance(def:I['def'],level:number):I;effectiveSkillLevel(skill:I):number;instanceMods(skill:I):Modifier[];skillContextTags(skill:I|I['def']):Set<string>;
  instanceChargeCost(skill:I):{optional?:boolean}|undefined;instanceTargeting(skill:I):unknown;instanceAim(skill:I):{sequence?:{steps:readonly unknown[];pause:number}}|undefined;instanceDelivery(skill:I):{type:string;interval?:number};
  hostSockets(skill:I):readonly{def:{id:string;echo?:EchoRiderSpec;mods:readonly Modifier[]}}[];
  resolveHit(caster:A,skill:I,target:A,mult:number,depth:1):void;executeSkill(actor:A,skill:I,aim:CombatPoint,options:{keepFacing:true}):boolean;useSkill(actor:A,skill:I,aim:CombatPoint):unknown;kill(actor:A,silent:true):void;
  applyRestore(actor:A,effect:{resource:'life'|'mana'|'es';amount:number}):void;clampPos(at:CombatPoint,radius:number):CombatPoint;teleportActor(actor:A,at:CombatPoint,color:string):void;
  spawnConstruct(owner:A,source:I,delivery:ConstructBirthSpec<unknown>,aim:CombatPoint,payload?:I):A|null;isStealthed(actor:A):boolean;
  presenceMoment(actor:A,phase:'pulse'):boolean;flash(cue:{pos:CombatPoint;radius:number;color:string;life:number;maxLife:number}):void;text(at:CombatPoint,text:string,color:string,size:number):void;
}
