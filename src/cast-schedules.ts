import {dist,type CombatPoint} from './combat-geometry.js';import type {Modifier} from './types.js';
import type {PreparationRepeat,PreparationStep,PreparationOptions,PreparationTarget} from './cast-preparation-types.js';
export interface ScheduledCastActor<I>{dead:boolean;pos:CombatPoint;facing:number;useLock:number;skills:readonly (I|null)[]}
export interface ScheduledCastSkill<I>{def:{tags:readonly string[]};sequenceHost?:I;sequenceRole?:string;followUpHost?:I;procChainDepth?:number;extraMods?:Modifier[]}
export interface FollowUpCast<A,I>{caster:A;inst:I;aim:CombatPoint;timer:number;dmgMult?:number}
export interface MetaCast<A,I>{caster:A;host:I;skillId:string;aim:CombatPoint;timer:number}
export interface CastScheduleState<A,I>{pendingSteps:PreparationStep<A,I>[];pendingRepeats:PreparationRepeat<A,I>[];pendingFollowUps:FollowUpCast<A,I>[];pendingMetas:MetaCast<A,I>[]}
export interface CastSchedulePorts<A,I,C>{
  random():number;timeScale(actor:A):number;hasSkill(id:string):boolean;modifiers(skill:I):Modifier[];
  followUps(skill:I):readonly {skillId:string;chance?:number;delay?:number;perCharge?:boolean}[];mintMeta(actor:A,host:I,id:string):I;
  targeting(skill:I):{target:string}|undefined;resolveTargeting(actor:A,skill:I,aim:CombatPoint):PreparationTarget<A,C>|null;enemies(actor:A):readonly A[];
  execute(actor:A,skill:I,aim:CombatPoint,options:PreparationOptions<A,C>):boolean;use(actor:A,skill:I,aim:CombatPoint):void;
}
/** Synchronous continuation queues. Repeats retain overdue time but execute
 * once per update, matching the original frame rule. Salvos run immediately
 * before advanceRepeats through ProjectileSchedules in the simulation owner. */
export class CastSchedules<A extends ScheduledCastActor<I>,I extends ScheduledCastSkill<I>,C>{
  constructor(readonly state:CastScheduleState<A,I>,readonly ports:CastSchedulePorts<A,I,C>){}
  queueFollowUps(caster:A,host:I,aim:CombatPoint,chargesSpent:number):void {
    const p=this.ports;for(const next of p.followUps(host)){
      if(!p.hasSkill(next.skillId)||(next.chance!==undefined&&!(p.random()<next.chance)))continue;
      let payload=p.mintMeta(caster,host,next.skillId);
      if(host.sequenceHost)payload={...payload,sequenceHost:host.sequenceHost,sequenceRole:'payload',followUpHost:host.sequenceHost,procChainDepth:Math.max(1,(host.procChainDepth??0)+1)};
      if(host.def.tags.includes('flask'))payload={...payload,extraMods:p.modifiers(host),followUpHost:host,procChainDepth:1};
      this.state.pendingFollowUps.push({caster,inst:payload,aim:{...aim},timer:next.delay??.35,dmgMult:next.perCharge?Math.max(1,chargesSpent):1});
    }
  }
  advanceFollowUps(dt:number):void {
    const queue=this.state.pendingFollowUps,p=this.ports;for(let n=queue.length-1;n>=0;n--){const row=queue[n];row.timer-=dt*p.timeScale(row.caster);if(row.timer>0)continue;
      queue.splice(n,1);if(row.caster.dead)continue;if(row.inst.followUpHost&&!row.caster.skills.includes(row.inst.followUpHost))continue;
      const facing=row.caster.facing;p.execute(row.caster,row.inst,row.aim,{noCooldown:true,noRepeat:true,noFollowUp:true,dmgMult:row.dmgMult});if(row.inst.followUpHost)row.caster.facing=facing;
    }
  }
  advanceMetas(dt:number):void {
    const queue=this.state.pendingMetas,p=this.ports;for(let n=queue.length-1;n>=0;n--){const row=queue[n];
      if(row.caster.dead||!p.hasSkill(row.skillId)){queue.splice(n,1);continue;}row.timer-=dt;if(row.timer>0)continue;
      queue.splice(n,1);row.caster.useLock=0;p.use(row.caster,p.mintMeta(row.caster,row.host,row.skillId),row.aim);
    }
  }
  advanceRepeats(dt:number):void {
    const p=this.ports,steps=this.state.pendingSteps,repeats=this.state.pendingRepeats;
    for(let n=steps.length-1;n>=0;n--){const row=steps[n];if(row.caster.dead){steps.splice(n,1);continue;}
      row.timer-=dt*p.timeScale(row.caster);if(row.timer>0)continue;steps.splice(n,1);
      p.execute(row.caster,row.inst,row.aim,{strikeAngle:row.angle,dmgMult:row.dmgMult,aoeMult:row.aoeMult,noCooldown:true,noRepeat:true,keepFacing:true,paidCost:row.paidCost});
    }
    for(let n=repeats.length-1;n>=0;n--){const row=repeats[n];if(row.caster.dead){repeats.splice(n,1);continue;}
      row.timer-=dt*p.timeScale(row.caster);if(row.timer>0)continue;row.timer+=row.interval;
      let aim=row.aim,targetInfo:PreparationTarget<A,C>|undefined;
      if(row.retarget){const spec=p.targeting(row.inst),target=spec&&spec.target!=='corpse'?p.resolveTargeting(row.caster,row.inst,row.aim):null;
        if(target?.actor&&!target.actor.dead){aim={...target.actor.pos};targetInfo=target;}
        else{let best:A|null=null,nearest=220;for(const enemy of p.enemies(row.caster)){const d=dist(row.caster.pos,enemy.pos);if(d<nearest){nearest=d;best=enemy;}}if(best)aim=best.pos;}
      }
      if(!targetInfo&&row.mark){const found=p.resolveTargeting(row.caster,row.inst,row.mark.dead?row.aim:row.mark.pos);if(found){aim={...found.pos};targetInfo=found;}}
      const factor=Math.max(.2,1+row.scaleStep*row.k);
      p.execute(row.caster,row.inst,aim,{dmgMult:row.dmgMult*factor,aoeMult:row.aoeMult*factor,noCooldown:true,noRepeat:true,targetInfo});
      row.k++;if(--row.n<=0)repeats.splice(n,1);
    }
  }
}
