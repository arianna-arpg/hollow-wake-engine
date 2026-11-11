export interface SummonOffspringShape {maxActive:number;size:number;life:number;damage:number}
export interface SummonOffspringAction {monster:string;count?:number;ring?:number;lifespan?:number;inheritSummon?:SummonOffspringShape}
export interface SummonOffspringActor<A,S> {owner?:A;dead:boolean;summonInst?:S;summonOffspring?:boolean;skills:(S|null)[];pos:{x:number;y:number}}
export interface SummonOffspringDelivery {type:'summon';persistent?:unknown;poolGroup?:string;exclusiveGroup?:string;crewOnDeath?:unknown;shell?:unknown;duration?:number}
export type SummonOffspringBirth<D>=Omit<D,'persistent'|'poolGroup'|'exclusiveGroup'|'crewOnDeath'|'shell'|'duration'>&{
 persistent:undefined;poolGroup:undefined;exclusiveGroup:undefined;crewOnDeath:undefined;shell:undefined;duration:number;
};
export interface SummonOffspringPorts<A,S,D> {
 /** Return the current resolved summon delivery, or undefined for another mode. */
 delivery(inst:S):D|undefined;
 random(min:number,max:number):number;
 spawn(owner:A,inst:S,overrides:{monsterId:string;offspring:SummonOffspringShape;delivery:SummonOffspringBirth<D>;pos:{x:number;y:number}}):A|null;
}
/** Synchronous offspring requests over borrowed parent, source and action data.
 * Birth results do not change the requested count. A throwing host retains all
 * earlier effects. The host owns admission, body construction and publication. */
export class SummonOffspring<A extends SummonOffspringActor<A,S>,S,D extends SummonOffspringDelivery> {
 constructor(private readonly p:SummonOffspringPorts<A,S,D>){}
 spawn(parent:A,action:SummonOffspringAction):void {
  const owner=parent.owner,inst=parent.summonInst,shape=action.inheritSummon;
  if(!owner||owner.dead||!inst||!shape||parent.summonOffspring)return;
  const delivery=this.p.delivery(inst);
  if(!delivery||!owner.skills.includes(inst))return;
  const count=Math.max(0,Math.round(action.count??1));
  // Preserve the draw for zero count, and the source references through callbacks.
  const base=this.p.random(0,Math.PI*2);
  for(let i=0;i<count;i++){
   const angle=base+i/Math.max(1,count)*Math.PI*2;
   this.p.spawn(owner,inst,{monsterId:action.monster,offspring:shape,
    delivery:{...delivery,persistent:undefined,poolGroup:undefined,exclusiveGroup:undefined,crewOnDeath:undefined,duration:action.lifespan??8,shell:undefined},
    pos:{x:parent.pos.x+Math.cos(angle)*(action.ring??28),y:parent.pos.y+Math.sin(angle)*(action.ring??28)},
   });
  }
 }
}
