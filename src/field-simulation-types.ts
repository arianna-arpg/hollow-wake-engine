import type {CombatPoint} from './combat-geometry.js';import type {CombatField} from './combat-fields.js';import type {Modifier} from './types.js';
export interface FieldSimulationSkill {
  readonly level:number;readonly def:{readonly id:string;readonly name:string;readonly color:string;readonly delivery:{readonly type:string;readonly awaitRelease?:{readonly order?:'placed'|'random';readonly interval?:number}}};
}
export interface FieldSimulationActor<A,I>{
  readonly id:number;pos:CombatPoint;facing:number;readonly radius:number;readonly tier:number;readonly team:string;readonly dead:boolean;readonly downed?:unknown;
  readonly untargetable:boolean;readonly kind:string;readonly defId?:string;readonly owner?:A;readonly aiSkillBans?:ReadonlySet<string>;reservedMana:number;
  readonly construct?:{readonly breakable?:unknown};readonly leap?:unknown;readonly anchored?:boolean;readonly casting?:{readonly mode:string;readonly inst:I};
  readonly statuses:readonly {readonly id:string}[];applyStatus(id:string,dps:number,multiplier:number,source:string,options:{casterId:number}):unknown;healBy(value:number):number;
  readonly sheet:{get(stat:string,tags:Set<string>,extra:Modifier[]):number;setSource(id:string,modifiers:Modifier[]):void;removeSource(id:string):void};
}
export interface FieldSimulationCue {
  pos:CombatPoint;radius:number;color:string;life:number;maxLife:number;shape?:number;facing?:number;arcRad?:number;edgeFrac?:number;
  bolt?:boolean;meteor?:boolean;fx?:string;onGround?:string[];recoveryCueTier?:number;
}
export interface FieldSimulationRules {readonly expireCueSeconds:number;readonly maddenEpsilon:number;readonly occludingDeliveries:Readonly<Record<string,boolean>>}
export interface FieldSimulationPorts<A,I extends FieldSimulationSkill,F,B>{
  time():number;random():number;actors():A[];actorById(id:number):A|undefined;enemiesOf(actor:A,tier?:number):A[];
  /** Encounter facts are host data, not campaign or account state. */
  encounterLevel():number;activeBoss():{readonly bossId:string}|undefined;passiveMonster(id:string):boolean;
  regionAt(x:number,y:number):string|undefined;underRoofAt(at:CombatPoint):boolean;isDormant(actor:A):boolean;
  clampPos(at:CombatPoint,radius:number,previous?:CombatPoint,options?:{tier?:number;mover?:A}):CombatPoint;lineOfFire(from:CombatPoint,to:CombatPoint,tier?:number):boolean;skillOcclusion(actor:A,skill:I):string;
  bodyWhere(actor:A,predicate:(at:CombatPoint,radius:number)=>boolean):{readonly seg:number}|null;noteBodyHit(actor:A,segment:number):void;
  skillContextTags(skill:I|I['def']):Set<string>;instanceMods(skill:I):Modifier[];instanceDelivery(skill:I):{readonly type:string};
  socketSpec(skill:I,key:'releaseOrder'):'placed'|'random'|undefined;baselineStatusDps(id:string,level:number):number;
  hasSkill(id:string):boolean;makeSkill(id:string,level:number):I;
  /** These bind the same SDK hit, caster, summon and recovery controllers. */
  resolveHit(caster:A,skill:I,victim:A,multiplier:number,depth:number,flat:F|undefined,force?:boolean,secondary?:false,unused?:undefined,origin?:CombatPoint,tier?:number):void;
  executeSkill(actor:A,skill:I,aim:CombatPoint,options:{tier?:number;dmgMult:number;noCooldown:true;noRepeat:true;keepFacing:true}):unknown;
  birthAt(actor:A,skill:I,birth:B,at:CombatPoint):void;releaseStruckSummons(actor:A,skill:I,predicate:(body:{pos:CombatPoint;radius:number})=>boolean,struck:Set<number>,facing:number):void;
  healAlliesInArea(actor:A,skill:I,predicate:(actor:A)=>boolean,multiplier:number,recovery:true,struck:Set<number>|undefined,tier?:number):void;
  frontSplash(actor:A,skill:I,at:CombatPoint,radius:number,tier?:number):void;strikeSurfaces(actor:A,at:CombatPoint,radius:number,predicate?:((at:CombatPoint,radius:number)=>boolean),struck?:Set<number>,tier?:number):void;
  addTempGround(at:CombatPoint,kind:string,radius:number,duration:number,options?:{tier?:number}):void;plantImpactDress(field:CombatField<A,I,F,B>):void;
  flash(cue:FieldSimulationCue):void;text(at:CombatPoint,text:string,color:string,size:number):void;
  presenceProfile(id:string):{family:string}|undefined;skillPresenceVoice(id:string,phase:'expire'):string|undefined;
  combatCueFlash(at:CombatPoint,cue:string,radius:number,facing:number,color:string):FieldSimulationCue;
}
