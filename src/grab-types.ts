import type {Modifier} from './types.js';
export type GrabVerb='carry'|'drag'|'pin'|'swallow';
export interface GrabHandoffSpec {range?:number}
export interface GrabThrowSpec {impulse:number;spitAt?:'foe'|'away';handoff?:GrabHandoffSpec}
export interface GrabSpec {
  verb:GrabVerb;holdSec?:[number,number];breakMult?:number;releaseGrace?:number;severFrac?:number;ratio?:number;pad?:number;rideStatus?:string;
  dot?:{type:string;frac:number};leech?:number;burstHurt?:number;throw?:GrabThrowSpec;haul?:'away'|'hold';holderMove?:number;
}
export interface GripHold {
  id:number;verb:GrabVerb;until:number;spec:GrabSpec;skillId?:string;struggle:number;severed:number;statusAt:number;dotAcc:number;bearing:number;wasUntargetable?:boolean;
}
export interface GrabRules {
  eligibility:{ratio:number;maxRatio:number};holdSec:Record<GrabVerb,readonly [number,number]>;holderMove:Record<GrabVerb,number>;
  break:{base:number;powRatio:number;severFrac:number;graceSec:number};release:{onHardCC:boolean};swallow:{burstHurt:number};
  policy:Readonly<Record<string,number>>;seat:{carryDist:number;dragDist:number;pinDist:number;swallowDist:number};handoff:{range:number};reelSpeed:number;
  markers:Record<GrabVerb,string>;labels:Record<GrabVerb,string>;physicalColor:string;
}
export interface GrabPoint {x:number;y:number}
export interface GrabSkillDefinition {readonly id:string;readonly effects:readonly ({readonly type:'grabSeize';readonly grab:GrabSpec}|{readonly type:string})[]}
export interface GrabSkill {readonly def:GrabSkillDefinition}
export interface GrabActor<I> {
  readonly id:number;readonly dead:boolean;readonly radius:number;readonly tier:number;readonly rarity?:string;
  readonly grabbable?:boolean|number;readonly passive:boolean;readonly invulnerable:boolean;readonly construct?:unknown;readonly anchored?:boolean;
  readonly leap?:unknown;readonly flying?:boolean;readonly clingTo?:unknown;readonly skills:readonly (I|null|undefined)[];
  readonly sheet:{get(stat:string,tags?:ReadonlySet<string>,extra?:readonly Modifier[]):number;removeSource(id:string):void};
  readonly statuses:{id:string}[];
  gripping?:GripHold;heldBy?:number;untargetable:boolean;grabProofUntil:number;casting:unknown;
  aiTargetId?:number;pos:GrabPoint;facing:number;push?:{vx:number;vy:number}|null;life:number;hitFlash:number;hitFlashType?:string;
  effectiveWeight():number;maxLife():number;healBy(amount:number):number;isStunned():boolean;
  applyStatus(id:string,dps:number,durationScale:number,source:string):void;
}
export interface GrabPorts<A,I>{
  actors():readonly A[];actorById(id:number):A|undefined;enemies(actor:A):Iterable<A>;time():number;random():number;localActor():A|undefined;
  tags(skill:I|GrabSkillDefinition):ReadonlySet<string>;modifiers(skill:I):readonly Modifier[];
  dormant(actor:A):boolean;hostileTo(a:A,b:A):boolean;lineOfSight(a:GrabPoint,b:GrabPoint):boolean;
  clamp(at:GrabPoint,radius:number):GrabPoint;unclasp(actor:A):void;
  mitigate(actor:A,amount:Partial<Record<string,number>>):number;
  kill(actor:A,violent:boolean,killer?:A):void;hit(caster:A,skill:I,target:A,multiplier:number,depth:0):void;
  push(actor:A,direction:number,impulse:number,caster:A,skill?:I):void;
  text(at:GrabPoint,text:string,color:string,size:number):void;
  flash(flash:{pos:GrabPoint;radius:number;color:string;life:number;maxLife:number}):void;
  fail(actor:A,key:string,message:string):void;
  damaged(target:A,source:A,lifeBefore:number):void;dot(target:A,amount:number,type:string):void;
  leech(source:A,target:A,resource:'life',amount:number):void;
  /** Ordered combat signal; a host may optionally record discovery/progression. */
  seized(target:A,caster:A):void;
}
