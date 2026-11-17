import type {CharacterSession,CharacterChange,CharacterPublisher} from '@hollow-wake/engine/character/session';
import type {CharacterLiveRules,CharacterLiveEffects} from '@hollow-wake/engine/character/live';
import type {CharacterRebuildFrame} from '@hollow-wake/engine/character/rebuild';
import type {CharacterBuildView} from '@hollow-wake/engine/character/builds';
import type {CharacterSkill,CharacterSkillDefinition} from '@hollow-wake/engine/character/skill-queries';
import type {GemDefinition} from '@hollow-wake/engine/inventory/gems';
import type {ItemInstance} from '@hollow-wake/engine/items';

export interface Point {x:number;y:number}
export interface Rect extends Point {w:number;h:number}
/** Trusted synchronous host callbacks borrow body facts. Do not retain or
 * mutate bodies, call the session recursively, or implement combat outcomes. */
export interface SpatialBody {readonly id:number;readonly pos:Point;readonly radius:number;readonly tier:number;readonly team:string;readonly [key:string]:unknown}
export interface BodyContact {pos:Point;r:number;seg:number}
export interface CombatPose {
  id:number;pos:Point;tier:number;radius:number;facing:number;velocity:Point;
  moveAccumulator:number;strideDistance:number;idleFor:number;plantFor:number;
}
export interface PhysicalPose {pos:Point;tier:number;collision?:{hit:'none'|'wall'|'void';[key:string]:unknown}}
export interface ClampOptions {mover?:SpatialBody;tier?:number;out?:{hit:string;[key:string]:unknown};disp?:unknown;[key:string]:unknown}
export interface CombatSpace {
  /** Synchronous collision/floor result. Facts and returned pose are detached;
   * this is a host geometry service, never a client teleport command. */
  stepPhysical?(actor:Readonly<{id:number;pos:Point;radius:number;tier:number;flying:boolean;touchdown:boolean}>,to:Point,from:Point,displacement?:unknown):PhysicalPose;
  /** Derived geography/weather multiplier; defaults to one. Detached input. */
  walkScale?(facts:{id:number;pos:Point;tier:number;direction:Point}):number;
  arena():{w:number;h:number};
  clamp(at:Point,radius:number,from?:Point,options?:ClampOptions):Point;
  layerAt(at:Point):number;
  lineOfFire(from:Point,to:Point,...facts:unknown[]):boolean;
  lineOfSight(from:Point,to:Point,...facts:unknown[]):boolean;
  clipShot(from:Point,to:Point,...facts:unknown[]):Point;
  nearestBody(actor:SpatialBody,at:Point):BodyContact;
  inAoeBody(at:Point,radius:number,shape:number,facing:number,actor:SpatialBody,arc?:number,predicate?:(at:Point,radius:number)=>boolean):BodyContact|null;
  noteBodyHit(actor:SpatialBody,segment:number):void;
  reachTo(actor:SpatialBody,at:Point):number;
  bodyWhere(actor:SpatialBody,predicate:(at:Point,radius:number)=>boolean):BodyContact|null;
  strikeSurfaces(...facts:unknown[]):void;
  frontSplash(...facts:unknown[]):void;
  freeSpot(at:Point,...facts:unknown[]):Point;
  emergenceGround(at:Point,...facts:unknown[]):unknown;
  isWalkable(x:number,y:number,layer:number):boolean;
  pointInSolid(x:number,y:number,radius:number,layer:number):boolean;
  dwellReachable(from:Point,to:Point,mode:unknown,story:{from:number;to:number}):boolean;
  segsHittable?(actor:SpatialBody):boolean;
  segR?(actor:SpatialBody,segment:number):number;
  viewRectFor?(actor:SpatialBody):Rect;
  doodadsAt?(...facts:unknown[]):unknown[];
  doodadRuleOf?(...facts:unknown[]):unknown;
  popBrittle?(...facts:unknown[]):void;
  blocksProjectiles?(...facts:unknown[]):boolean;
  hitSurfaceOf?(...facts:unknown[]):unknown;
  shapeContains?(...facts:unknown[]):boolean;
  pushOutOfShape?(...facts:unknown[]):Point;
  shotGrid?(...facts:unknown[]):unknown;
  shotElev?(...facts:unknown[]):unknown;
  castGridRay?(...facts:unknown[]):unknown;
  groundAt?(...facts:unknown[]):unknown;
  travelHit?(...facts:unknown[]):unknown;
  farthestStand?(...facts:unknown[]):Point|null;
  resolveBoundary?(...facts:unknown[]):void;
  [service:string]:unknown;
}
export type CombatObservers = Readonly<Partial<Record<
  'cast'|'onDot'|'seized'|'defeated'|'indirectDamage'|'hit'|'dot'|'claimed'|
  'summoned'|'healed'|'onLifeSpent'|'dotApplied'|'refreshCompany'|'guardBlocked'|'pooledKill',
  (...facts:never[])=>unknown
>> & {
  death?:Readonly<{
    begin?(actor:SpatialBody,silent:boolean):void;
    beforeClutch?(actor:SpatialBody,credit:boolean):void;
    retired?(actor:SpatialBody,silent:boolean):void;
    death?(actor:SpatialBody,killer:SpatialBody|undefined,silent:boolean):void;
    enemyKilled?(actor:SpatialBody,killer:SpatialBody|undefined,credit:boolean):void;
  }>;
}>;
export interface CombatHost {
  /** Safe hubs suspend assembly-pact pickup generation; combat remains active. */
  safeZone?:boolean;
  space:CombatSpace;
  /** Optional world simulation. Called after actor timers and before projectile
   * contact. Receives detached facts; returns statuses for this phase only.
   * The SDK owns status application, resistance, duration, damage and expiry. */
  environment?(frame:{seconds:number;time:number;actors:readonly SpatialBody[]}):readonly {actor:number;status:string;dps:number;magnitude:number;source:string}[];
  fields?:{
    terrain?(at:Point,kind:string,radius:number,duration:number,options?:{tier?:number;shallow?:boolean;evaporate?:{rate?:number}}):void;
    conjure?(x:number,y:number,radius:number,duration:number,options:unknown):void;
    kindle?(kind:string,at:Point,options:{radius:number;poolMul:number}):boolean;
    vent?(bank:string,at:Point,radius:number,duration:number,layer:number):{reach:number;color?:string}|null;
    portal?(actor:SpatialBody):void;
    lightwell?(...facts:unknown[]):unknown;
  };
  /** Optional presentation, AI observations and world consequences. No account,
   * quest or storage authority is required to run combat. */
  presentation?:Readonly<Record<string,(...facts:never[])=>unknown>>;
  intent?:Readonly<Record<string,(...facts:never[])=>unknown>>;
  observers?:CombatObservers;
  consequences?:Readonly<Record<string,(...facts:never[])=>unknown>>;
  surfaces?:Readonly<Record<string,(...facts:never[])=>unknown>>;
  knowledge?:Readonly<Record<string,(...facts:never[])=>unknown>>;
  relationships?:Readonly<Record<string,(...facts:never[])=>unknown>>;
}
declare const contentBrand:unique symbol;
export interface CombatContent {readonly [contentBrand]:true;readonly capability:'combat-content/v1'}
declare const actorBrand:unique symbol;
export interface CombatActor {readonly [actorBrand]:true;readonly id:number}
export interface SkillInvestment {id:string;level?:number;treeNodes?:string[];summonSchools?:string[];sockets?:({id:string;level?:number;rolled?:Record<string,string>}|null)[]}
export interface BodyInput {
  name:string;team:'player'|'enemy'|'ally';position:Point;level?:number;layer?:number;controlled?:boolean;
  /** Trusted encounter morphology, never player input or character investment. */
  flying?:boolean;levitates?:boolean;
  stats?:Record<string,number>;attributes?:Record<string,number>;skills?:(string|SkillInvestment)[];resourceFraction?:number;
}
export interface CombatActorView {
  id:number;name:string;defId:string|null;team:string;pos:Point;tier:number;life:number;mana:number;es:number;
  dead:boolean;downed:boolean;lifespan:number|null;
  casting:{id:string;mode:string;elapsed:number;total:number}|null;
  cooldowns:[string,number][];charges:[string,number][];statuses:{id:string;remaining:number;dps:number;stacks:number}[];
}
export interface CombatCharacterKit {
  readonly rules:CharacterLiveRules;
  live(frame:CharacterRebuildFrame<CharacterSkillDefinition,GemDefinition,CharacterSkill,ItemInstance>,effects:CharacterLiveEffects<CharacterSkill>):CharacterPublisher&{initialize(change:ReturnType<CharacterSession['current']>):void};
}
export interface CombatSession {
  addMonster(id:string,config:{team:'player'|'enemy'|'ally';position:Point;level?:number;layer?:number;resourceFraction?:number}):CombatActor;
  /** Native bodies are trusted encounter input. Character investment should
   * enter through addCharacter and its validated memory-only owner. */
  addActor(config:BodyInput):CombatActor;
  /** Transfers exclusive publication responsibility for this character to this
   * session. Prepare/read on the character; commit only through this session. */
  addCharacter(kit:CombatCharacterKit,character:CharacterSession,config:{name:string;position:Point;layer?:number}):CombatActor;
  commitCharacter(actor:CombatActor,change:CharacterChange):{accepted:true}|{accepted:false;refusal:Record<string,unknown>};
  press(actor:CombatActor,skillId:string,aim:Point):boolean;
  /** Only an authored, invested Dismiss Frame node authorizes this action. */
  dismissFrame(actor:CombatActor,skillId:string):boolean;
  /** Detached ability, buff-source, summon-command and transient-growth facts. */
  details(actor:CombatActor):Record<string,unknown>;
  /** Detached semantic presentation; reading it never consumes combat randomness. */
  visuals():{fields:Record<string,unknown>[];projectiles:Record<string,unknown>[];cues:Record<string,unknown>[]};
  /** Resolve skill-authored cohort/protective tactics after the host's perception,
   * taunt and order selection. A movement destination is an intent for the
   * host navigator, resolved through move(); false leaves ordinary AI to it. */
  summonTactic(actor:CombatActor,target:CombatActor|null,seconds:number):{handled:boolean;movement?:Point};
  /** Host-authorized ordinary intent, once per simulation step before casts
   * and advance (zero to one second). Direction is normalized by the original movement rule. The
   * host submits physical pose results through space.stepPhysical/clamp. */
  move(actor:CombatActor,direction:Point,seconds:number):void;
  meta(actor:CombatActor,skillId:string,aim:Point):boolean;
  aim(actor:CombatActor,aim:Point):void;release(actor:CombatActor):void;timingPress(actor:CombatActor):void;
  advance(seconds:number):void;
  actor(id:number):CombatActor|null;inspect(actor:CombatActor):CombatActorView;
  pose(actor:CombatActor):CombatPose;
  poses():CombatPose[];
  controlled(actor:CombatActor):CombatActor|null;
  stat(actor:CombatActor,id:string):number;build(actor:CombatActor):CharacterBuildView;
  effects():Record<string,unknown>[];
  procs():{id:number;ready:[string,number][];fired:[string,number][];attempted:[string,number][]}[];
  snapshot():{time:number;draws:number;actors:CombatActorView[];projectiles:{skill:string;pos:Point;life:number}[];
    zones:{skill:string;pos:Point;delay:number;linger:number;tick?:number;exploded:boolean}[];corpses:{pos:Point;remaining:number}[]};
  drainSignals():{kind:string;detail:unknown}[];
}
/** Invalid commands fail before mutation. A thrown host callback quarantines
 * the session; it cannot be resumed or retried as though the call rolled back. */
export declare function createCombatSession(content:CombatContent,host:CombatHost,options?:{seed?:number;encounterLevel?:number;capacity?:number}):CombatSession;
export declare function createCombatGeometry(content:CombatContent):Readonly<Pick<CombatSpace,'nearestBody'|'bodyWhere'|'inAoeBody'|'reachTo'|'segsHittable'|'segR'>>;
