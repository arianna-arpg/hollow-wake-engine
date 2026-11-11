export interface ChallengeSpec {
  resetChance?: number;
  guaranteedResetEvery?: number;
  bleedPop?: number;
  bleedingImpaleMore?: number;
  splinters?: { count: number; power: number; spread: number };
  ballast?: { duration: number; radius: number; power: number; rehit: number; cap: number };
  device?: { duration: number; radius: number; life: number; thornsRatio: number; interval: number; range: number };
  deviceCap?: number;
  impaleField?: { ratio: number; radius: number };
  bleedingField?: { power: number };
  aftershock?: { chance: number; delay: number; radius: number; power: number };
  greaterShock?: { chance: number; radius: number; power: number; echoes: number };
  creeper?: { speed: number; trailRadius: number; trailDuration: number; trailPower: number; strikePower: number; strikeInterval: number };
}
export interface ChallengePoint {x:number;y:number}
export interface ChallengeConstructDelivery {
 range:number;placeRange?:number;
}
export interface ChallengeSkill<M> {
 def:{id:string;name:string;tags:string[];delivery:unknown;effects:unknown[];
   tree?:unknown;noDrop?:boolean;cooldown:number;useTime:number;leveling?:unknown;innateMods?:M[]};
 level:number;treeNodes?:string[];sockets:({def:{id:string};level:number}|null)[];
 grafts?:{def:{id:string};level:number}[];state?:object;challengeHost?:unknown;procChainDepth?:number;
}
export interface ChallengeStatus {
 id:string;dps:number;stacks:number;remaining:number;total?:number;
 casterId?:number;challengeField?:number;rupture?:number;ruptureType?:string;
}
export interface ChallengeActor<I,M> {
 id:number;dead:boolean;team:unknown;tier:number;pos:ChallengePoint;radius:number;
 owner?:unknown;sourceSkillId?:string;color:string;shape:unknown;
 passive:boolean;untargetable:boolean;invulnerable:boolean;noBounty:boolean;
 skills:(I|null)[];statuses:ChallengeStatus[];
 cooldowns:Map<string,number>;cooldownTotals:Map<string,number>;
 construct?:{range:number;timer:number};
 sheet:{get(id:string,tags?:ReadonlySet<string>,mods?:M[]):number;setSource(id:string,mods:M[]):void};
 removeBuff(id:string):void;
 addBuff(effect:{type:'buff';id:string;label:string;duration:number;mods:M[]}):void;
 applyStatus(id:string,dps:number,duration:number,sourceName:string,options:{casterId:number;challengeField?:number}):void;
}
export interface ChallengeCarrier<A,I> {caster:A;inst:I}
export interface ChallengeProjectile<A,I> extends ChallengeCarrier<A,I> {
 orbitAnchorId?:number;anchor:ChallengePoint;hits:Map<number,number>;
}
export interface ChallengeFlash {
 pos:ChallengePoint;radius:number;color:string;life:number;maxLife:number;
}
export interface ChallengePorts<A extends ChallengeActor<I,M>,I extends ChallengeSkill<M>,M,
 P extends ChallengeProjectile<A,I>,R extends ChallengeCarrier<A,I>,F extends ChallengeCarrier<A,I>,Z extends ChallengeCarrier<A,I>,C extends ChallengeConstructDelivery> {
 time:number;actors:A[];projectiles:P[];pendingRepeats:R[];pendingFuses:F[];zones:Z[];flashes:ChallengeFlash[];
 spec(inst:I):ChallengeSpec|undefined;
 random():number;tags(inst:I):ReadonlySet<string>;modifiers(inst:I):M[];
 modifier(stat:string,kind:'flat',value:number):M;
 damageBands(actor:A,inst:I):{total:{lo:number;hi:number}};
 createSkill(def:I['def'],level:number):I;deviceCall:I['def'];
 allocate(name:string,team:A['team'],pos:ChallengePoint):A;
 text(pos:ChallengePoint,label:string,color:string,size:number):void;
 enemiesOf(actor:A):A[];clampPos(pos:ChallengePoint,radius:number):ChallengePoint;
 spawnProjectile(caster:A,inst:I,from:ChallengePoint,angle:number,options:{mult:number}):void;
 spawnConstruct(owner:A,host:I,delivery:C,at:ChallengePoint,call:I,aim:ChallengePoint):A|null|undefined;
 executeSkill(caster:A,inst:I,aim:ChallengePoint,options:{noRepeat:true;noCooldown:true;dmgMult:number}):void;
 challengeBurst(caster:A,target:A,amount:number):void;
 challengeHit(caster:A,inst:I,target:A,power:number):void;
 retireOwnedZone(zone:Z):void;
}
