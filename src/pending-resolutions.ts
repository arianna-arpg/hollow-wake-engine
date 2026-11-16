import {readList,type LiveList} from './live-list.js';
export interface FuseSpec {readonly delay:number;readonly tell?:string}
export interface PendingBuff<A,I,B> {kind:'buff';due:number;caster:A;inst:I;fx:B;durScale:number;mult:number}
export interface PendingHit<A,I,F,P,E> {
  kind:'hit';due:number;caster:A;inst:I;targetId:number;mult:number;depth:number;flat?:F;force?:boolean;hitEffects?:E[];hitOrigin?:P;hitTier?:number;
}
export type PendingFuse<A,I,B,F,P,E>=PendingBuff<A,I,B>|PendingHit<A,I,F,P,E>;
export interface PendingPersist<A,I>{caster:A;inst:I;remaining:number;total:number;timer:number;interval:number;fade:number;powerMult:number}
export interface ResolutionActor<P>{readonly dead:boolean;readonly pos:P}
export interface PendingResolutionPorts<A,I,B,F,P,E> {
  time():number;actorById(id:number):A|undefined;fusePower(actor:A,skill:I):number;
  buff(actor:A,skill:I,effect:B,durationScale:number,multiplier:number):void;
  hit(actor:A,skill:I,target:A,multiplier:number,depth:number,flat:F|undefined,force:boolean|undefined,fromFuse:true,effects:E[]|undefined,origin:P|undefined,tier:number|undefined):void;
  arrived(actor:A,skill:I,kind:'hit'|'buff'):void;
  copyPosition(at:P):P;
  execute(actor:A,skill:I,aim:P,options:{dmgMult:number;noCooldown:true;noRepeat:true;keepFacing:true}):void;
}
/** Reverse, live queue traversal matches the source's single-beat clock policy.
 * Due rows leave their queue before callbacks; a throw never replays payment.
 * Queues belong to one combat owner and retain exact actor/skill identities. */
export class PendingResolutions<A extends ResolutionActor<P>,I,B,F,P,E>{
  constructor(private readonly fuseOwner:LiveList<PendingFuse<A,I,B,F,P,E>>,private readonly persistOwner:LiveList<PendingPersist<A,I>>,readonly ports:PendingResolutionPorts<A,I,B,F,P,E>){}
  get fuses():PendingFuse<A,I,B,F,P,E>[]{return readList(this.fuseOwner);}
  get persists():PendingPersist<A,I>[]{return readList(this.persistOwner);}
  advance(dt:number):void{
    for(let i=this.fuses.length-1;i>=0;i--){
      const row=this.fuses[i];if(this.ports.time()<row.due)continue;this.fuses.splice(i,1);
      if(row.caster.dead)continue;
      const power=this.ports.fusePower(row.caster,row.inst);
      if(row.kind==='hit'){
        const target=this.ports.actorById(row.targetId);if(!target||target.dead)continue;
        this.ports.arrived(target,row.inst,'hit');
        this.ports.hit(row.caster,row.inst,target,row.mult*power,row.depth,row.flat,row.force,true,row.hitEffects,row.hitOrigin,row.hitTier);
      }else{
        this.ports.arrived(row.caster,row.inst,'buff');this.ports.buff(row.caster,row.inst,row.fx,row.durScale,row.mult*power);
      }
    }
    for(let i=this.persists.length-1;i>=0;i--){
      const row=this.persists[i];row.remaining-=dt;
      if(row.caster.dead||row.remaining<=0){this.persists.splice(i,1);continue;}
      row.timer-=dt;if(row.timer>0)continue;row.timer+=row.interval;
      const lived=1-row.remaining/row.total,decay=1+(row.fade-1)*lived;
      this.ports.execute(row.caster,row.inst,this.ports.copyPosition(row.caster.pos),{dmgMult:row.powerMult*decay,noCooldown:true,noRepeat:true,keepFacing:true});
    }
  }
}
