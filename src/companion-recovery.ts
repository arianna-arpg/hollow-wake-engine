import {companionRecoverySeconds,type CompanionRules} from './companion-bond-rules.js';

export interface CompanionRecoveryActor<A,S> {
 companion:boolean;dead:boolean;downed:boolean;companionDormant?:boolean;owner?:A;name:string;
 life:number;companionReviveRemaining?:number;companionReviveDwell:number;expiredStatuses:S[];
}
export interface CompanionRecoveryStatus {id:string}
export interface CompanionRecoveryPorts<A> {
 rules():Readonly<CompanionRules['recovery']>;
 /** Dense, current actor list, including downed bodies and other bond hosts. */
 actors():readonly A[];
 status(id:string):{beneficial?:boolean;duration:number}|undefined;
 cleanse(actor:A):void;endStatus(actor:A,id:string):void;
 applyStatus(actor:A,id:string,dps:number,durationScale:number,sourceName:string):void;
 maxLife(actor:A):number;revivalCue(actor:A):void;
}
/** Command-only rules over borrowed actors. No clock, world clone or transaction. */
export class CompanionRecovery<A extends CompanionRecoveryActor<A,S>,S extends CompanionRecoveryStatus> {
 constructor(private readonly p:CompanionRecoveryPorts<A>){}
 revive(a:A,fraction=.5):void {
  if(!a.companion||a.dead||!a.downed||a.companionDormant)return;
  a.downed=false;a.companionReviveRemaining=undefined;a.companionReviveDwell=0;
  this.recover(a);a.life=Math.max(1,this.p.maxLife(a)*fraction);this.p.revivalCue(a);
 }
 recover(a:A):void {
  if(!a.companion||a.dead||a.downed||a.companionDormant||!a.owner)return;
  const cfg=this.p.rules();
  if(cfg.cleanse){this.p.cleanse(a);a.expiredStatuses=a.expiredStatuses.filter(s=>this.p.status(s.id)?.beneficial);}
  let count=0;for(const b of this.p.actors())if(b.companion&&!b.dead&&!b.companionDormant&&b.owner===a.owner)count++;
  const seconds=companionRecoverySeconds(count,this.p.rules()),status=this.p.status(cfg.status);
  this.p.endStatus(a,cfg.status);
  if(seconds>0&&status&&status.duration>0)this.p.applyStatus(a,cfg.status,0,seconds/status.duration,a.owner.name);
 }
}
