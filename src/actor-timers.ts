import {advanceSkillCooldowns,type ClockOwner} from './cooldown-lifecycle.js';
import {advanceDefensivePools,type DefensivePoolActor,type DefensivePoolPorts} from './defensive-pool-timers.js';
import {advanceRestorationStreams,type StreamActor,type StreamPorts} from './restoration-streams.js';
import {advanceActorRegeneration,type RegenerationActor,type RegenerationPorts,type RegenerationSkill} from './actor-regeneration.js';
import type {AuraLedgerSpec} from './aura-ledgers.js';import type {StatusTick,StatusDamageType} from './status-lifecycle-types.js';
import type {Modifier} from './types.js';
export interface TimerSkill extends RegenerationSkill {level:number;def:RegenerationSkill['def']&{id:string;equipMods?:readonly Modifier[]};state?:{stackN?:number;stackT?:number}}
export interface TimerActor<I> extends ClockOwner<I&{def:{id:string}}>{
  strideSpent:boolean;strideDist:number;recentHurt:number;since:Float64Array;lastGaspCd:number;gaugeSampleIn:number;comboCondLeft:number;lifespan:number;lifespanTotal:number;
  useLock:number;reflexLock:number;hitFlash:number;aiCooldown:number;evadeWindow:number;idleFor:number;plantFor:number;equipKey:string;
  dash?:unknown;leap?:unknown;push?:{vx:number;vy:number};casting?:unknown;
  sheet:{get(stat:string,tags?:Set<string>,mods?:Modifier[],base?:number):number;hasTaggedMods(stat:string):boolean;setSource(id:string,mods:Modifier[]):void;removeSource(id:string):void};
}
export interface TimerServices<A,I,Socket,Cue>{
  conditions:{refresh(actor:A):unknown};charges:{advance(dt:number):void};ammunition:{advance(dt:number):void};buffs:{advance(actor:A,dt:number):void};
  statuses:{tickStatuses(actor:A,dt:number,chronoDt:number,onDotTick?:StatusTick):Partial<Record<StatusDamageType|'untyped',number>>|null};
  /** This binds the SDK conduit service over the same actor. */
  conduits(dt:number):void;damage:DefensivePoolPorts<A>;restoration:StreamPorts<A,Cue>;
  cues(actor:A,chronoDt:number):void;tags(skill:I):Set<string>;modifiers(skill:I):Modifier[];definitionTags(skill:I):Set<string>;
  selfStack(skill:I):{duration:number;decay?:'peel'|'all'}|undefined;sockets(skill:I):readonly Socket[];socketIdentity(socket:Socket):{id:string;level:number};globalMods(socket:Socket):Modifier[];
}
/** One actor's ordered timer pipeline. It reuses the shared cooldown, status,
 * buff, resource, defensive-pool and stream implementations. Queued combat work
 * and death collection belong to the simulation owner after this phase. */
export class ActorTimers<
  A extends TimerActor<I>&DefensivePoolActor&StreamActor<Cue>&RegenerationActor<I,L,Set<string>,Modifier[]>,
  I extends TimerSkill,L extends AuraLedgerSpec,Socket,Cue,
>{
  readonly #cooldowns;readonly #regeneration:RegenerationPorts<I,Set<string>,Modifier[]>;
  constructor(readonly actor:A,readonly services:TimerServices<A,I,Socket,Cue>,readonly rules:{recentNever:number;plantTime:number;poiseOverDecay:number}){
    const p=services;this.#cooldowns={global:(a:A)=>a.sheet.get('cooldownRecovery'),hasTagged:(a:A)=>a.sheet.hasTaggedMods('cooldownRecovery'),scoped:(a:A,i:I)=>a.sheet.get('cooldownRecovery',p.tags(i),p.modifiers(i))};
    this.#regeneration={tags:i=>p.definitionTags(i),modifiers:i=>p.modifiers(i),poiseOverDecay:rules.poiseOverDecay};
  }
  advance(dt:number,chronoDt=dt,onDotTick?:StatusTick):Partial<Record<StatusDamageType|'untyped',number>>|null{
    if(!Number.isFinite(dt)||dt<0||!Number.isFinite(chronoDt)||chronoDt<0)throw new RangeError('Actor frame durations must be finite and nonnegative');
    const a=this.actor,p=this.services;p.cues(a,chronoDt);
    if(a.strideSpent){a.strideDist=0;a.strideSpent=false;}p.conditions.refresh(a);a.recentHurt=Math.min(999,a.recentHurt+dt);
    for(let i=0;i<a.since.length;i++)if(a.since[i]<this.rules.recentNever)a.since[i]=Math.min(this.rules.recentNever,a.since[i]+dt);
    if(a.lastGaspCd>0)a.lastGaspCd=Math.max(0,a.lastGaspCd-dt);if(a.gaugeSampleIn>0)a.gaugeSampleIn-=dt;if(a.comboCondLeft>0)a.comboCondLeft=Math.max(0,a.comboCondLeft-dt);
    if(a.lifespan>a.lifespanTotal)a.lifespanTotal=a.lifespan;
    advanceSkillCooldowns<I,A>(a,dt,this.#cooldowns);
    for(const i of a.skills){const s=i?.state;if(!s?.stackN)continue;const spec=p.selfStack(i!);if(!spec){s.stackN=0;continue;}s.stackT=(s.stackT??spec.duration)-dt;
      if(s.stackT<=0){if((spec.decay??'peel')==='all')s.stackN=0;else{s.stackN-=1;s.stackT=spec.duration;}}}
    if(a.useLock>0)a.useLock-=dt;if(a.reflexLock>0)a.reflexLock-=dt;if(a.hitFlash>0)a.hitFlash-=dt;if(a.aiCooldown>0)a.aiCooldown-=dt;if(a.evadeWindow>0)a.evadeWindow-=dt;
    p.charges.advance(dt);p.conduits(dt);p.buffs.advance(a,dt);
    const dot=p.statuses.tickStatuses(a,dt,chronoDt,onDotTick);
    advanceDefensivePools(a,dt,p.damage);advanceRestorationStreams(a,dt,p.restoration);p.ammunition.advance(dt);
    let key='';for(const i of a.skills){if(!i)continue;if(i.def.equipMods)key+=i.def.id+':'+i.level+';';for(const s of p.sockets(i))if(p.globalMods(s).length){const identity=p.socketIdentity(s);key+='+'+identity.id+':'+identity.level+';';}}
    if(key!==a.equipKey){a.equipKey=key;if(!key)a.sheet.removeSource('equipped');else{const merged:Modifier[]=[];for(const i of a.skills){if(!i)continue;if(i.def.equipMods)merged.push(...i.def.equipMods);for(const s of p.sockets(i))merged.push(...p.globalMods(s));}a.sheet.setSource('equipped',merged);}}
    if(a.dash||a.leap||(a.push&&Math.hypot(a.push.vx,a.push.vy)>40)){a.idleFor=0;a.plantFor=0;}else{a.idleFor+=dt;if(!(a.casting&&a.plantFor<this.rules.plantTime))a.plantFor+=dt;}
    advanceActorRegeneration<A,I,L,Set<string>,Modifier[]>(a,dt,this.#regeneration);return dot;
  }
}
