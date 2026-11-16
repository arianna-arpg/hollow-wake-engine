import {angleTo,dist,type CombatPoint} from './combat-geometry.js';
import {readList,type LiveList} from './live-list.js';
export type ProjectileCount=number|readonly [number,number];
export interface ProjectileDeliverySpec {
  readonly type:'projectile';readonly count?:ProjectileCount;readonly radius:number;
  readonly caroms?:{readonly anchors:number;readonly window:number;readonly hang?:{readonly duration?:number;readonly triggerRadius?:number}};
  readonly origin?:string;readonly originRange?:number;readonly fire?:string;readonly salvoInterval?:number;readonly volleySpacing?:number;
  readonly ring?:{readonly phaseJitter?:boolean};readonly spreadDeg?:number;readonly spreadByAim?:{readonly range:number;readonly near:number;readonly far:number};
}
export interface ProjectileDeliverySkill {readonly def:{readonly id:string};state?:{anchorsAt?:number;anchors?:CombatPoint[]}}
export interface ProjectileDeliveryActor<I,Tags,M> {
  readonly pos:CombatPoint;readonly facing:number;
  readonly sheet:{get(stat:string,tags:Tags,modifiers:readonly M[]):number};
  speedFactor(skill:I):number;
}
export interface ProjectileSpawnOptions<F> {mult:number;flat?:F;patrol?:CombatPoint[];dest?:CombatPoint}
export interface ProjectileSalvo<A,I,F> {caster:A;inst:I;aim:CombatPoint;origin:CombatPoint|null;shots:number;timer:number;interval:number;mult:number;flat?:F}
export interface ProjectileAmbush<A,I> {caster:A;inst:I;points:CombatPoint[];arrowIds:number[];triggerRadius:number;deadline:number}
export interface ProjectileDeliveryFrame<A,I,Tags,M,F> {
  readonly caster:A;readonly skill:I;readonly aim:CombatPoint;readonly delivery:ProjectileDeliverySpec;readonly multiplier:number;readonly flat?:F;
  readonly tags:Tags;readonly modifiers:readonly M[];readonly gaugePower:number;readonly chargesSpent:number;readonly corpseFeast:number;
  readonly bonusProjectiles:number;readonly ventRounds:number;readonly color:string;
}
export interface ProjectileDeliveryPorts<A,I,F>{
  time():number;random():number;projectilesPerCharge(skill:I):number;caromCapacity(actor:A,skill:I):number;
  clamp(at:CombatPoint,radius:number):CombatPoint;
  spawn(actor:A,skill:I,at:CombatPoint,direction:number,options:ProjectileSpawnOptions<F>):void;
  embed(actor:A,skill:I,spec:{type:'construct';kind:'embed';range:0;duration:number;maxActive:number;invulnerable:true;placeRange:9999},aim:CombatPoint,at:CombatPoint):unknown;
  minions(actor:A,skillId:string):readonly {readonly id:number;readonly pos:CombatPoint;readonly construct?:{readonly kind:string}}[];
  triggerAmbush(index:number,multiplier:number,flat:F|undefined):void;
  anchor(at:CombatPoint,color:string):void;
}
/** CountSpec's original inclusive range and draw policy. Fixed counts consume
 * no random value; a degenerate authored range still consumes one. */
export function rollDeliveryCount(spec:ProjectileCount|undefined,bonus:number,random:()=>number):number{
  if(spec===undefined)return Math.max(0,1+bonus);if(typeof spec==='number')return Math.max(0,spec+bonus);
  const lo=spec[0]+bonus,hi=spec[1]+bonus;return Math.max(0,lo+Math.floor(random()*(hi-lo+1)));
}
/** Projectile release arrangement. Actual moving projectile simulation is a
 * separate SDK service; terrain clamping and body presence are host services.
 * A null result means this branch did not establish a lingering-field origin. */
export class ProjectileDelivery<A extends ProjectileDeliveryActor<I,Tags,M>,I extends ProjectileDeliverySkill,Tags,M,F>{
  constructor(private readonly salvoOwner:LiveList<ProjectileSalvo<A,I,F>>,private readonly ambushOwner:LiveList<ProjectileAmbush<A,I>>,readonly corpseProjectiles:number,readonly ports:ProjectileDeliveryPorts<A,I,F>){}
  get salvos():ProjectileSalvo<A,I,F>[]{return readList(this.salvoOwner);}
  get ambushes():ProjectileAmbush<A,I>[]{return readList(this.ambushOwner);}
  execute(frame:ProjectileDeliveryFrame<A,I,Tags,M,F>):CombatPoint|null{
    const p=this.ports,{caster:a,skill:i,aim,delivery:d,multiplier:mult,flat,tags,modifiers:mods,gaugePower:power}=frame;
    let count=rollDeliveryCount(d.count,Math.round(a.sheet.get('projectileCount',tags,mods)),()=>p.random())+frame.bonusProjectiles+frame.ventRounds
      +Math.round(p.projectilesPerCharge(i)*frame.chargesSpent)+frame.corpseFeast*this.corpseProjectiles;
    if(power!==1)count=Math.max(1,Math.round(count*power));
    const chance=a.sheet.get('projectileCountChance',tags,mods);if(chance>0&&p.random()<chance)count++;
    count=Math.max(1,count);const capacity=p.caromCapacity(a,i);
    if(d.caroms?.hang){
      const armed=this.ambushes.findIndex(row=>row.caster===a&&row.inst.def.id===i.def.id);
      if(armed!==-1){p.triggerAmbush(armed,mult,flat);return null;}
      const arrow=p.embed(a,i,{type:'construct',kind:'embed',range:0,duration:d.caroms.hang.duration??24,maxActive:capacity,invulnerable:true,placeRange:9999},aim,p.clamp({...aim},10));
      const arrows=p.minions(a,i.def.id).filter(body=>body.construct?.kind==='embed');
      if(arrow&&arrows.length>=capacity)this.ambushes.push({caster:a,inst:i,points:arrows.map(body=>({...body.pos})),arrowIds:arrows.map(body=>body.id),
        triggerRadius:d.caroms.hang.triggerRadius??90,deadline:p.time()+(d.caroms.hang.duration??24)});
      return{...aim};
    }
    if(d.caroms){
      const state=i.state??={},stale=state.anchorsAt!==undefined&&p.time()-state.anchorsAt>d.caroms.window;
      if(!state.anchors||stale)state.anchors=[];state.anchorsAt=p.time();
      const at=p.clamp({...aim},10);state.anchors.push({...at});p.anchor({...at},frame.color);
      if(state.anchors.length<capacity)return null;
      const points=state.anchors.map(point=>({...point}));state.anchors=[];
      for(let n=0;n<count;n++)p.spawn(a,i,{...points[0]},angleTo(points[0],points[1%points.length]),{mult,flat,patrol:points});
      return{...points[0]};
    }
    let origin=a.pos;
    if(d.origin==='cursor'||a.sheet.get('castAtCursor',tags,mods)>0){
      const reach=Math.min(dist(a.pos,aim),d.originRange??420),angle=angleTo(a.pos,aim);
      origin=p.clamp({x:a.pos.x+Math.cos(angle)*reach,y:a.pos.y+Math.sin(angle)*reach},d.radius);
    }
    const nova=Math.round(a.sheet.get('projNova',tags,mods));
    if(nova>0){const total=count+nova;for(let n=0;n<total;n++)p.spawn(a,i,origin,a.facing+n/total*Math.PI*2,{mult,flat});return null;}
    const style=a.sheet.get('fireSalvo',tags,mods)>0?'salvo':a.sheet.get('fireVolley',tags,mods)>0?'volley':d.fire??'fan';
    if(style==='salvo'){
      const interval=Math.max(.03,(d.salvoInterval??.09)/a.speedFactor(i)),fixed=origin!==a.pos?{...origin}:null;
      p.spawn(a,i,origin,a.facing,{mult,flat});
      if(count>1)this.salvos.push({caster:a,inst:i,aim:{...aim},origin:fixed,shots:count-1,timer:interval,interval,mult,flat});return null;
    }
    if(style==='volley'){
      const gap=(d.volleySpacing??34)*a.sheet.get('volleySpacing',tags,mods),perpendicular=a.facing+Math.PI/2;
      for(let n=0;n<count;n++){const rank=n===0?0:Math.ceil(n/2)*(n%2===1?1:-1);
        const at=p.clamp({x:origin.x+Math.cos(perpendicular)*gap*rank,y:origin.y+Math.sin(perpendicular)*gap*rank},d.radius);p.spawn(a,i,at,a.facing,{mult,flat});}
      return null;
    }
    if(d.ring){
      const phase=d.ring.phaseJitter===false?0:p.random()*(Math.PI*2/Math.max(1,count));
      for(let n=0;n<count;n++)p.spawn(a,i,origin,phase+n/Math.max(1,count)*Math.PI*2,{mult,flat});return null;
    }
    let spread=d.spreadDeg??14;
    if(d.spreadByAim){const f=Math.min(1,dist(a.pos,aim)/Math.max(1,d.spreadByAim.range));spread=d.spreadByAim.near+(d.spreadByAim.far-d.spreadByAim.near)*f;}
    const radians=spread*Math.PI/180*a.sheet.get('spreadAngle',tags,mods);
    for(let n=0;n<count;n++){const offset=count===1?0:(n/(count-1)-.5)*radians;p.spawn(a,i,origin,a.facing+offset,{mult,flat,dest:{...aim}});}
    return null;
  }
}
