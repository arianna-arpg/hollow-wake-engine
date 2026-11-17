import type {CombatPoint} from './combat-geometry.js';import type {Modifier} from './types.js';import type {DamageAmounts,DamagePacket,DamageType} from './damage-pipeline-types.js';
import type {CombatField} from './combat-fields.js';import type {ConstructBodyState,ConstructBirthSpec} from './construct-birth.js';import type {ParryDamage} from './parry-damage.js';
import type {ProjectileDelivery,ProjTrailSpec,FissureTrailSpec,SequelSpec} from './projectile-specs.js';import type {CombatProjectile} from './projectile-record.js';import type {ViewRect} from './projectile-math.js';
export type {CombatProjectile,InheritedFlight} from './projectile-record.js';
export interface ProjectileDefinition {id:string;color:string;tags:string[];baseDamage?:Partial<Record<DamageType,[number,number]>>;delivery:ProjectileDelivery|{type:'self'|'target'|'aura'|'ground'|'storm'|'melee'|'cone'|'nova'|'summon'|'construct'|'dash'|'leap'|'blink'|'carom'|'mark'|'detonate'|'detonateProjectile'}}
export interface ProjectileSkill {def:ProjectileDefinition;level:number;state?:{seqDepth?:number};summonArtCast?:unknown;projectileSpec?:{flight?:unknown}}
export interface ProjectileActor<A,I>{
  id:number;pos:CombatPoint;radius:number;tier:number;team:string;dead:boolean;color:string;owner?:A;aimPos?:CombatPoint;passive?:boolean;construct?:ConstructBodyState<I>;
  life:number;hitFlash:number;hitFlashType?:DamageType;worm?:{segments:CombatPoint[]};facing?:number;facingPrev?:number;
  sheet:{get(stat:string,tags:Set<string>,mods:Modifier[],base?:number):number};
  gainCharge(id:string,amount:number,max:number,skill:I):void;applyStatus(id:string,power:number,duration:number,source:string):void;
}
export interface SegBody {pos:CombatPoint;r:number;seg:number}
export interface ProjectileObstacle {kind:string;pos:CombatPoint;radius:number;tier?:number;gone?:boolean}
export interface ProjectileSurface {kind:string}
export interface ProjectileFlash {pos:CombatPoint;radius:number;color:string;life:number;maxLife:number;fx?:string;shape?:number;facing?:number;edgeFrac?:number;recoveryCueTier?:number}
export interface ProjectileSockets {
  fissureVolatile:{interval:number;chance:number;damageScale:number};fissureAftershock:{damageScale:number;radiusScale?:number;rearm:number};
  fissureRoulette:{interval:number;chance:number;window:number;damageScale:number;radiusScale?:number};fissureReclose:{interval:number;damageScale:number;times:number;chance:number};
}
export type ProjectileEndEffect={type:'litePour';species:string;count:number|[number,number];duration?:number}|{type:'lure';radius:number;pace?:number;standoff?:number;sec:number}|{type:'spawnZone';radius:number;duration:number;tickInterval?:number;damageScale?:number}|{type:'unrelated'};
export interface ProjectileState<A,I,B>{projectiles:CombatProjectile<A,I>[];zones:CombatField<A,I,DamageAmounts,B>[]}
export interface ProjectileRules {childDepthMax:number;auraTick:number;shrapnelSkill:string;catchSpotLook:string;headSegment:number;frameEdgePad:number;frameFlashPad:number;sequelMaxDepth:number;elementColors:Partial<Record<DamageType,string>>}
/** Internal combat bindings compose other SDK services. Hosts supply spatial facts,
 * body geometry and presentation; they do not implement projectile behavior. */
export interface ProjectilePorts<A,I extends ProjectileSkill,B>{
  instanceDelivery?(skill:I):I['def']['delivery'];
  hostileTo?(caster:A,target:A,tier:number):boolean;
  plantedLook?():string;
  artConfigure?(projectile:CombatProjectile<A,I>):void;artUpdate?(seconds:number):void;
  artValid?(projectile:CombatProjectile<A,I>):boolean;artElapsed?(projectile:CombatProjectile<A,I>,seconds:number):number;
  artMove?(projectile:CombatProjectile<A,I>,seconds:number):CombatPoint|undefined;
  artTouches?(projectile:CombatProjectile<A,I>,x:number,y:number,radius:number):boolean|undefined;
  artBounce?(projectile:CombatProjectile<A,I>):void;artTick?(projectile:CombatProjectile<A,I>):void;
  artImpact?(projectile:CombatProjectile<A,I>):CombatPoint;artOrigin?(projectile:CombatProjectile<A,I>):CombatPoint;
  artContact?(projectile:CombatProjectile<A,I>):I;artExpire?(projectile:CombatProjectile<A,I>):void;
  time():number;random():number;actors():A[];actorById(id:number):A|undefined;enemiesOf(actor:A,tier?:number):A[];arena():{boundless?:boolean;w:number;h:number};actorScale(actor:A):number;
  cosmetic(actor:A,id:string):{color?:string;motif?:string;projectile?:string};skillContextTags(def:I['def'],extra?:string[]):Set<string>;instanceMods(skill:I):Modifier[];
  applyConversion(actor:A,amounts:DamageAmounts,tags:Set<string>,extra:Modifier[]):void;effectiveSkillLevel(skill:I):number;skill(id:string):I['def']|undefined;makeSkill(def:I['def'],level:number):I;
  instanceTrail(skill:I):ProjTrailSpec|undefined;instanceFissureTrail(skill:I):FissureTrailSpec|undefined;instanceSequel(skill:I):SequelSpec|undefined;
  instanceBirth(skill:I):B|undefined;instanceEffects(skill:I):readonly ProjectileEndEffect[];grantedTags(skill:I):string[];socketSpec<K extends keyof ProjectileSockets>(skill:I,key:K):ProjectileSockets[K]|undefined;
  skillOcclusion(actor:A,skill:I):string;flash(cue:ProjectileFlash):void;noteLightningTravel(projectile:CombatProjectile<A,I>,from:CombatPoint):void;
  segsHittable(actor:A):boolean;segR(actor:A,index:number):number;noteBodyHit(actor:A,segment:number):void;
  viewRectFor(actor:A):ViewRect;doodadsAt(x:number,y:number):readonly ProjectileObstacle[];doodadRuleOf(kind:string):{brittle?:{on:readonly string[]}};popBrittle(obstacle:ProjectileObstacle,actor:A|null,at:CombatPoint):void;
  blocksProjectiles(obstacle:ProjectileObstacle):boolean;hitSurfaceOf(obstacle:ProjectileObstacle,lane:'shot'):ProjectileSurface;
  shapeContains(surface:ProjectileSurface,ox:number,oy:number,x:number,y:number,pad:number):boolean;
  pushOutOfShape(surface:ProjectileSurface,ox:number,oy:number,x:number,y:number,pad:number):{x:number;y:number;nx:number;ny:number}|null;
  shotGrid():{cellSize:number}|undefined;shotElev(at:CombatPoint,tier:number):number;castGridRay(from:CombatPoint,to:CombatPoint,lane:'shot',elevation:number):number|null;
  occluded(kind:'proj'):void;lineOfFire(from:CombatPoint,to:CombatPoint,tier?:number):boolean;clampPos(at:CombatPoint,radius:number):CombatPoint;groundAt(at:CombatPoint,tier?:number):{kind:string}|undefined;
  hitVoiceOf(type:DamageType|undefined,contact:'wall'|'body'):string|undefined;skillBaseTypeOf(damage:I['def']['baseDamage']):DamageType|undefined;
  guardiansActive():boolean;satellitesCount():number;carriedEffectContext():unknown;
  reflectSatellites(actor:A,tier:number,from:CombatPoint,to:CombatPoint,radius:number,context:unknown):{at:CombatPoint;owner:A;power:number;radius:number;color:string}|undefined;
  interceptGuardians(actor:A,tier:number,from:CombatPoint,to:CombatPoint,radius:number,context:unknown):CombatPoint|undefined;
  reflectParriedProjectile(projectile:CombatProjectile<A,I>,owner:A,power:number):void;
  sequenceFlight(projectile:CombatProjectile<A,I>):void;sequenceBeforeContact(projectile:CombatProjectile<A,I>):void;sequenceContact(projectile:CombatProjectile<A,I>,target:A):boolean;
  tryGuardBlock(target:A,caster:A,at:CombatPoint,raw:number,projectile:CombatProjectile<A,I>,packet?:DamagePacket<Modifier,string>):boolean;
  resolveParryDamage(caster:A,target:A,payload:ParryDamage,scale:number,at:CombatPoint):void;
  rollSkillDamage(caster:A,skill:I,flat?:DamageAmounts):DamagePacket<Modifier,string>;
  resolveHit(caster:A,skill:I,target:A,mult:number,depth:number,flat?:DamageAmounts,force?:boolean,crit?:boolean,scale?:undefined,origin?:CombatPoint,tier?:number):void;
  mitigateTyped(actor:A,amounts:DamageAmounts):number;dominantTypeOf(amounts:DamageAmounts):DamageType|undefined;accumulateDotText(actor:A,damage:number,dt:number):void;kill(actor:A,silent:boolean,killer:A):void;
  spawnConstruct(actor:A,skill:I,spec:ConstructBirthSpec<unknown>,aim:CombatPoint,payload?:I,at?:CombatPoint,scale?:number,tier?:number):A|null;ringBell(actor:A):boolean;
  frontSplash(actor:A,skill:I,at:CombatPoint,radius:number,tier?:number):void;strikeSurfaces(actor:A,at:CombatPoint,radius:number,shape?:number,facing?:number,tier?:number):void;
  liteCount():number;liteProjectileSweep(projectile:CombatProjectile<A,I>,x:number,y:number):boolean;
  executeSkill(actor:A,skill:I,aim:CombatPoint,options:{tier?:number;targetInfo:{pos:CombatPoint};dmgMult:number;noCooldown:true;noRepeat:true;noFollowUp:true;keepFacing:true}):boolean;
  litePourAt(actor:A,effect:Extract<ProjectileEndEffect,{type:'litePour'}>,at:CombatPoint):void;
  setLure(id:string,at:CombatPoint,radius:number,pace:number,standoff:number,duration:number,tier:number):void;birthAt(actor:A,skill:I,spec:B,at:CombatPoint):void;noiseAt(at:CombatPoint,amount:number,actor:A):void;
}
