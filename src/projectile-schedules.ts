import {angleTo,dist,type CombatPoint} from './combat-geometry.js';
import {readList,type LiveList} from './live-list.js';
import {rollDeliveryCount,type ProjectileAmbush,type ProjectileSalvo,type ProjectileSpawnOptions,type ProjectileCount} from './projectile-delivery.js';
export interface ScheduledProjectileActor<Tags,M>{
  readonly dead:boolean;readonly pos:CombatPoint;readonly radius:number;readonly aimPos?:CombatPoint;
  readonly sheet:{get(stat:string,tags:Tags,extra:readonly M[]):number};
}
export interface ScheduledProjectileSkill{readonly def:{readonly color:string;readonly delivery:{readonly type:string;readonly count?:ProjectileCount}}}
export interface ProjectileSchedulePorts<A,I,F,Tags,M>{
  time():number;random():number;actorById(id:number):A|undefined;enemies(actor:A):readonly A[];timeScale(actor:A):number;
  /** Context is the native definition plus granted tags, as in ambush release. */
  tags(skill:I):Tags;modifiers(skill:I):readonly M[];
  kill(actor:A,violent:true):void;spawn(actor:A,skill:I,at:CombatPoint,direction:number,options:{mult?:number;flat?:F;patrol?:CombatPoint[]}):void;
  released(at:CombatPoint,color:string):void;
}
/** Combat-owned salvo and hanging-arrow lifecycles. One scheduled shot fires
 * per update, retaining overdue debt; a held actor's clock uses its time scale.
 * Arrow geometry is read again when triggered, never from stale cue positions. */
export class ProjectileSchedules<A extends ScheduledProjectileActor<Tags,M>,I extends ScheduledProjectileSkill,F,Tags,M>{
  constructor(private readonly salvoOwner:LiveList<ProjectileSalvo<A,I,F>>,private readonly ambushOwner:LiveList<ProjectileAmbush<A,I>>,readonly ports:ProjectileSchedulePorts<A,I,F,Tags,M>){}
  get salvos():ProjectileSalvo<A,I,F>[]{return readList(this.salvoOwner);}
  get ambushes():ProjectileAmbush<A,I>[]{return readList(this.ambushOwner);}
  advanceSalvos(dt:number):void{
    const p=this.ports;
    for(let n=this.salvos.length-1;n>=0;n--){
      const row=this.salvos[n];if(row.caster.dead){this.salvos.splice(n,1);continue;}
      row.timer-=dt*p.timeScale(row.caster);if(row.timer>0)continue;row.timer+=row.interval;
      const aim=row.caster.aimPos??row.aim,from=row.origin??row.caster.pos;
      p.spawn(row.caster,row.inst,{...from},angleTo(from,aim),{mult:row.mult,flat:row.flat});
      if(--row.shots<=0)this.salvos.splice(n,1);
    }
  }
  advanceAmbushes():void{
    const p=this.ports;
    for(let n=this.ambushes.length-1;n>=0;n--){
      const row=this.ambushes[n],arrows=row.arrowIds.map(id=>p.actorById(id)).filter((a):a is A=>!!a&&!a.dead);
      if(row.caster.dead||p.time()>=row.deadline||arrows.length<row.arrowIds.length){
        for(const arrow of arrows)p.kill(arrow,true);this.ambushes.splice(n,1);continue;
      }
      if(p.enemies(row.caster).some(enemy=>arrows.some(arrow=>dist(arrow.pos,enemy.pos)-enemy.radius<=row.triggerRadius)))this.trigger(n,1);
    }
  }
  trigger(index:number,multiplier:number,flat?:F):void{
    const p=this.ports,row=this.ambushes[index];
    if(!Number.isInteger(index)||!row)throw RangeError('Unknown projectile ambush');
    this.ambushes.splice(index,1);const points:CombatPoint[]=[];
    for(const id of row.arrowIds){const arrow=p.actorById(id);if(arrow&&!arrow.dead){points.push({...arrow.pos});p.kill(arrow,true);}}
    if(points.length<2||row.caster.dead)return;
    const tags=p.tags(row.inst),extra=p.modifiers(row.inst),delivery=row.inst.def.delivery;
    const count=Math.max(1,rollDeliveryCount(delivery.type==='projectile'?delivery.count:1,Math.round(row.caster.sheet.get('projectileCount',tags,extra)),()=>p.random()));
    for(let n=0;n<count;n++)p.spawn(row.caster,row.inst,{...points[0]},angleTo(points[0],points[1]),{mult:multiplier,flat,patrol:points} satisfies ProjectileSpawnOptions<F>);
    p.released({...points[0]},row.inst.def.color);
  }
}
