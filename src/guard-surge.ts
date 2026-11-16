export interface GuardSurgeEffect {
  readonly type:'guardSurge';readonly manaFraction:number;readonly ratio:number;
  readonly unguarded?:{readonly capLife:number;readonly duration:number};
}
export interface GuardSurgeActor {
  readonly casting:{readonly mode:string;shield?:number;maxShield?:number}|null;
  mana:number;absorb:number;absorbTimer:number;maxLife():number;
}
export interface GuardSurgePorts<A,I> {
  absorbAmount(actor:A,skill:I,base:number):number;
  durationScale(actor:A,skill:I):number;
}
/** Preview and execution share the same price and strongest-only fallback.
 * The held guard identity is captured before live stat queries, as in source. */
export class GuardSurge<A extends GuardSurgeActor,I> {
  constructor(readonly ports:GuardSurgePorts<A,I>){}
  preview(actor:A,skill:I,effect:GuardSurgeEffect):{guarded:boolean;mana:number;amount:number;duration:number}{
    const guarded=actor.casting?.mode==='guard',mana=Math.max(0,actor.mana*Math.max(0,Math.min(1,effect.manaFraction))),ward=effect.unguarded;
    const base=guarded?mana*effect.ratio:ward?Math.min(mana*effect.ratio,actor.maxLife()*ward.capLife):0;
    return{guarded,mana,amount:this.ports.absorbAmount(actor,skill,base),duration:!guarded&&ward?ward.duration*this.ports.durationScale(actor,skill):0};
  }
  apply(actor:A,skill:I,effect:GuardSurgeEffect):boolean{
    const guard=actor.casting?.mode==='guard'?actor.casting:undefined;
    if(!guard&&!effect.unguarded)return false;
    const surge=this.preview(actor,skill,effect);if(!surge.mana)return false;
    actor.mana-=surge.mana;
    if(guard){guard.shield=(guard.shield??0)+surge.amount;guard.maxShield=Math.max(guard.maxShield??1,guard.shield);}
    else{actor.absorb=Math.max(actor.absorb,surge.amount);actor.absorbTimer=Math.max(actor.absorbTimer,surge.duration);}
    return true;
  }
}
