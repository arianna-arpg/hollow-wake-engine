import type {CombatPoint} from './combat-geometry.js';import type {Modifier} from './types.js';import type {CombatField,MaddenBank} from './combat-fields.js';import type {GroundDeliverySpec} from './field-delivery-types.js';
export interface PreparationCorpse {pos:CombatPoint;maxLife:number;tier?:number}
export interface PreparationTarget<A,C>{pos:CombatPoint;actor?:A;corpse?:C;corpses?:C[];self?:boolean}
export interface PreparationOptions<A,C>{
  targetInfo?:PreparationTarget<A,C>;dmgMult?:number;aoeMult?:number;repeat?:number;noCooldown?:boolean;keepFacing?:boolean;noRepeat?:boolean;componentUse?:boolean;
  noFollowUp?:boolean;fromFuse?:boolean;strikeAngle?:number;bonusProjectiles?:number;arcMult?:number;paidCost?:{mana:number;life:number};chargesSpent?:number;speedMult?:number;primed?:boolean;ventRounds?:number;
}
export interface PreparationSkill<B>{
  readonly def:{id:string;name:string;color:string;tags:string[];delivery:{type:string;range?:number};effects:readonly {type:string}[];cooldown:number;cooldownAt?:string;
    selfCleanse?:{stacksPortion:number};gauge?:unknown;empower?:{radius:number;dmgPerPower?:number;buffPerPower?:B};ultimate?:unknown;chrono?:{duration:number};
    pool?:{id:string;damageType:string;release:{mode:'vent'}|{mode:'burst';radius:number;ratio?:number}};invokes?:unknown;feedingCue?:unknown;
    poiseReap?:{mult:number};addedEffectiveness?:number;baseDamage?:Record<string,[number,number]>;fieldCue?:false|{form?:string;release?:string;color?:string};};
  state?:{gaugePower?:number};
}
export interface PreparationActor<A,I,B>{
  readonly id:number;pos:CombatPoint;radius:number;facing:number;tier:number;team:string;dead:boolean;untargetable:boolean;defId?:string;rarity:string;owner?:A;construct?:unknown;
  life:number;mana:number;reservedMana:number;poiseBroken:boolean;pools:Map<string,number>;venting:Set<string>;runes:string[];primedPours:{skillId:string;chargesSpent:number;aim:CombatPoint}[];
  statuses:{id:string;dps:number;stacks:number;remaining:number}[];
  sheet:{get(stat:string,tags:Set<string>,extra:Modifier[],base?:number):number;removeSource(id:string):void};
  addBuff(buff:B&{stacksOnApply?:number},duration:number):void;maxPoise():number;maxMana():number;availableMaxMana():number;speedFactor(skill:I):number;
}
export interface PreparationTargetSpec {target:string;castRange?:number;corpseLifeDamage?:number;consumesCorpse?:boolean;corpseLifeRestore?:{life?:number;mana?:number};requiresStatus?:string|string[];consumesStatus?:boolean;drainsTargetLife?:number}
export interface PreparationCurseField {mode:'follow'|'ground';radius:number;tickInterval?:number;damageScale?:number;reservePct?:number;duration?:number}
export interface PreparationSockets {sacrifice:{radius:number;dmgPerLife:number};meleeFissure:{chance:number;radius:number;linger:number;tickInterval?:number;length:number;speed:number;close?:{delay:number;damageScale:number};damageScale:number}}
export interface PreparationRepeat<A,I>{caster:A;inst:I;aim:CombatPoint;n:number;k:number;timer:number;interval:number;dmgMult:number;aoeMult:number;scaleStep:number;retarget:boolean;mark?:A}
export interface PreparationStep<A,I>{caster:A;inst:I;aim:CombatPoint;angle:number;timer:number;dmgMult:number;aoeMult:number;paidCost?:{mana:number;life:number}}
export interface PreparationState<A,I,C,Z>{corpses:C[];pendingSteps:PreparationStep<A,I>[];pendingRepeats:PreparationRepeat<A,I>[];zones:CombatField<A,I,Partial<Record<string,number>>,Z>[]}
export interface PreparationRules {readonly empower:{readonly boss:number;readonly crowned:number;readonly champion:number;readonly rare:number;readonly magic:number;readonly normal:number};readonly corpseAreaPerExtra:number;readonly cosmetic:{readonly radiusScale:number;readonly lifetime:number}}
export interface PreparationPorts<A,I extends PreparationSkill<B>,C,B,D,Z>{
  random():number;replenishingDelivery(skill:I):unknown;prepareChallenge(actor:A,skill:I,primary:boolean):I;prepareAttack(actor:A,skill:I,aim:CombatPoint,power:number):I;
  cosmetic(actor:A,id:string):{color?:string;motif?:unknown};instanceMods(skill:I):Modifier[];castObserved(actor:A,skill:I,repeat:boolean):void;
  ringAfflictions(actor:A,fraction:number):void;skillContextTags(skill:I,extra:string[]):Set<string>;grantedTags(skill:I):string[];
  denseCount():number;enemiesOf(actor:A):A[];actors():A[];bossMonster(id:string):boolean;
  litePromoteNearest(at:CombatPoint,options:{within:number;max:1;opposing:string;rank:CombatPoint;story:number}):void;
  ultimateFlash(actor:A,definition:I['def']):void;castChrono(actor:A,spec:NonNullable<I['def']['chrono']>,key:string,duration:number,source:string):void;
  socketSpec<K extends keyof PreparationSockets>(skill:I,key:K):PreparationSockets[K]|undefined;
  kill(actor:A,silent:true):void;feedingCueFlash(at:CombatPoint,actor:A,cue:unknown,kind:'ritual'|'flesh',tier?:number,radius?:number):object|undefined;
  flash(cue:object):void;showSkillArrival(actor:A,skill:I,at:CombatPoint,radius:number,tier:number,kind:'sacrifice'|true):void;
  failNote(actor:A,key:string,message:string):void;resolveTargeting(actor:A,skill:I,aim:CombatPoint):PreparationTarget<A,C>|null;
  instanceCurseField(skill:I):PreparationCurseField|undefined;instanceTargeting(skill:I):PreparationTargetSpec|undefined;
  showSelfRelease(actor:A,skill:I):void;burstDamage(at:CombatPoint,radius:number,amount:number,type:string,color:string,team:string,tier:number,a?:undefined,b?:undefined,voice?:unknown):void;
  skillSelfVoice(id:string,phase:'burst'):unknown;resolveInvocation(runes:string[]):{id:string;skillId:string;dmgPerRune?:number;releaseCue?:false|{profile?:string;color?:string}}|undefined;
  hasSkill(id:string):boolean;invocationPayload(host:I,id:string,last:string):I;runeColor(id:string):string|undefined;noteProcCue(actor:A,cue:false|{profile:string;color:string},kind:'invoke',id:string,count:number):void;
  instanceInvocation(skill:I):{damagePerRune?:number}|undefined;executeSkill(actor:A,skill:I,aim:CombatPoint,options:PreparationOptions<A,C>):boolean;
  instanceTethers(skill:I):{link:string}[];addTether(from:A,to:A,spec:{link:string},skill:I,caster:A):void;
  instanceAim(skill:I):{sequence?:{steps:number[];pause:number};random?:{spreadDeg:number;offsetDeg?:number}}|undefined;
  removeCorpse(corpse:C):void;spoilStoryAt(at:CombatPoint):number;applyRestore(actor:A,effect:{resource:'life'|'mana';amount:number},options:{tags:string[];feedingCue:unknown}):void;
  corpseSpawn(actor:A,skill:I,at:CombatPoint,count:number):void;statusReqs(requirement:string|string[]):string[]|undefined;
  instanceUseCharges(skill:I):{magazine?:unknown}|undefined;stampSkillCooldown(actor:A,skill:I,seconds:number):void;guardCast(actor:A,skill:I):void;
  payloadTransition(actor:A,skill:I,phase:'prime'):object|undefined;instanceDelivery(skill:I):D;instanceVariance(skill:I):{aoe?:[number,number]}|undefined;
  layFissure(actor:A,skill:I,at:CombatPoint,angle:number,delivery:GroundDeliverySpec,mult:number,flat:Partial<Record<string,number>>|undefined,branches:number):void;
  maddenBankOf(skill:I):MaddenBank|undefined;expireZone(zone:CombatField<A,I,Partial<Record<string,number>>,Z>):void;clampPos(at:CombatPoint,radius:number):CombatPoint;
  combatCueFlash(at:CombatPoint,cue:string,radius:number,facing:number,color:string):object;text(at:CombatPoint,text:string,color:string,size:number):void;
}
export interface PreparedCast<A,I,C,D>{completed?:never;caster:A;inst:I;aim:CombatPoint;opts:PreparationOptions<A,C>;targetInfo:PreparationTarget<A,C>|null;origin:CombatPoint;d:D;
  tags:Set<string>;extra:Modifier[];useMult:number;gPow:number;ventRounds:number;corpseFeast:number;flatBonus:Partial<Record<string,number>>|undefined;aoeScale:number;arcScale:number;cosmeticColor:string;fieldAt:CombatPoint|null}
