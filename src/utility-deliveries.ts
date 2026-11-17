import {dist,type CombatPoint} from './combat-geometry.js';
import {readList,type LiveList} from './live-list.js';
export interface UtilitySkill {readonly def:{readonly id:string};state?:{markPos?:CombatPoint|null}}
export interface UtilityActor<A,I>{readonly owner?:A;readonly dead:boolean;readonly construct?:{readonly kind:string;readonly castInst?:I};readonly pos:CombatPoint;readonly facing:number;
  readonly tier:number;readonly cooldowns:{clear():void};useLock:number;mana:number;maxMana():number;}
export interface MineVisual {pos:CombatPoint;life:number;recoveryCueTier?:number}
export interface PendingDetonation<A,V>{mine:A;timer:number;visual:V|undefined}
export interface UtilityDeliveryPorts<A,I,V>{
  mineReady?(mine:A):boolean;
  mineClock?(mine:A,remaining:number):void;
  actors():readonly A[];clamp(at:CombatPoint,radius:number):CombatPoint;
  teleport(actor:A,at:CombatPoint,color:string,skillId:string):void;
  marked(actor:A,skill:I,at:CombatPoint,color:string):void;
  prepareMine(mine:A,skill:I,timer:number,color:string):V|undefined;
  released(actor:A,skill:I):void;empty(actor:A):void;
  execute(actor:A,skill:I,aim:CombatPoint,options:{keepFacing:true}):void;
  kill(actor:A,violent:true):void;
}
/** Small delivery lifecycles with exact instance-owned marks and ordered mine
 * scheduling. Teleport physics and presentation are replaceable host services. */
export class UtilityDeliveries<A extends UtilityActor<A,I>,I extends UtilitySkill,V extends MineVisual>{
  constructor(private readonly detonationOwner:LiveList<PendingDetonation<A,V>>,readonly ports:UtilityDeliveryPorts<A,I,V>){}
  get detonations():PendingDetonation<A,V>[]{return readList(this.detonationOwner);}
  mark(actor:A,skill:I,aim:CombatPoint,castRange:number,color:string):void{
    const state=skill.state??={};
    if(state.markPos){this.ports.teleport(actor,{...state.markPos},color,skill.def.id);state.markPos=null;}
    else{
      const reach=Math.min(dist(actor.pos,aim),castRange),at=this.ports.clamp({x:actor.pos.x+Math.cos(actor.facing)*reach,y:actor.pos.y+Math.sin(actor.facing)*reach},10);
      state.markPos={...at};this.ports.marked(actor,skill,{...at},color);
    }
  }
  detonate(actor:A,skill:I,color:string):void{
    const mines=this.ports.actors().filter(body=>body.owner===actor&&!body.dead&&body.construct?.kind==='mine'&&(!this.ports.mineReady||this.ports.mineReady(body)&&!this.detonations.some(row=>row.mine===body)));
    mines.forEach((mine,n)=>{const timer=.05+n*.08;this.ports.mineClock?.(mine,timer);const visual=this.ports.prepareMine(mine,skill,timer,color);this.detonations.push({mine,timer,visual});});
    if(mines.length)this.ports.released(actor,skill);else this.ports.empty(actor);
  }
  advanceDetonations(dt:number):void{
    for(let n=this.detonations.length-1;n>=0;n--){
      const row=this.detonations[n];
      if(row.visual){row.visual.pos={...row.mine.pos};row.visual.recoveryCueTier=row.mine.tier;if(row.mine.dead||!row.mine.construct?.castInst)row.visual.life=0;}
      row.timer-=dt;this.ports.mineClock?.(row.mine,Math.max(0,row.timer));if(row.timer>0)continue;this.detonations.splice(n,1);if(row.visual)row.visual.life=0;
      const mine=row.mine;if(mine.dead||!mine.construct?.castInst)continue;
      mine.useLock=0;mine.mana=mine.maxMana();mine.cooldowns.clear();this.ports.execute(mine,mine.construct.castInst,mine.pos,{keepFacing:true});this.ports.kill(mine,true);
    }
  }
}
