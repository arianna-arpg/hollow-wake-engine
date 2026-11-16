import {dist,type CombatPoint} from './combat-geometry.js';
export interface ConstructDeliverySpec<E>{
  readonly type:'construct';readonly kind?:string;readonly castSkillId?:string;readonly echo?:E;
  readonly ring?:{readonly radius:number;readonly segments:number};readonly wallSegments?:number;readonly placeRange?:number;
}
export interface ConstructDeliveryActor {readonly pos:CombatPoint;readonly facing:number}
export interface ConstructDeliverySkill {readonly def:{readonly id:string;readonly castMode?:string}}
export interface ConstructDeliveryPorts<A,I,D,E,S>{
  /** These bind the SDK challenge, summon-birth, socket and construct services. */
  device(skill:I):boolean;toss(actor:A,skill:I,aim:CombatPoint,delivery:D,multiplier:number):void;
  summon(skill:I):S|undefined;spawnMinion(actor:A,skill:I,options:{delivery:S}):unknown;
  level(skill:I):number;makeSkill(id:string,level:number):I;
  forwardSockets(host:I,payloads:I[],options:{scale:number}):void;
  echoes(actor:A,skill:I,spec:E,sourceId:string,aim:CombatPoint,payload:I|undefined):void;
  clamp(at:CombatPoint,radius:number):CombatPoint;
  spawn(actor:A,skill:I,delivery:D,aim:CombatPoint,payload:I|undefined,at:CombatPoint|undefined,multiplier?:number):unknown;
}
/** Construct release arrangement. Converted summons and challenge devices keep
 * precedence; rings and walls share one forwarded payload, as in the source. */
export class ConstructDelivery<A extends ConstructDeliveryActor,I extends ConstructDeliverySkill,D extends ConstructDeliverySpec<E>,E,S>{
  constructor(readonly scales:Readonly<Record<string,number>>,readonly defaultScale:number,readonly ports:ConstructDeliveryPorts<A,I,D,E,S>){}
  execute(actor:A,skill:I,aim:CombatPoint,delivery:D,areaScale:number,multiplier:number,target?:{readonly pos:CombatPoint}|null):void{
    const p=this.ports,d=delivery;
    if(p.device(skill)){p.toss(actor,skill,aim,d,multiplier);return;}
    const summon=p.summon(skill);if(summon){p.spawnMinion(actor,skill,{delivery:summon});return;}
    const payload=d.castSkillId?p.makeSkill(d.castSkillId,p.level(skill)):undefined;
    if(payload)p.forwardSockets(skill,[payload],{scale:this.scales[d.kind??'']??this.defaultScale});
    if(d.kind==='echo'&&d.echo){p.echoes(actor,skill,d.echo,skill.def.id+':self',aim,payload);return;}
    if(d.ring){
      const reach=Math.min(dist(actor.pos,aim),d.placeRange??320),center=target?.pos??p.clamp({x:actor.pos.x+Math.cos(actor.facing)*reach,y:actor.pos.y+Math.sin(actor.facing)*reach},10),radius=d.ring.radius*areaScale;
      for(let n=0;n<d.ring.segments;n++){const angle=n/d.ring.segments*Math.PI*2;p.spawn(actor,skill,d,aim,payload,{x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius});}return;
    }
    const segments=d.wallSegments??1;
    if(segments>1){
      const reach=Math.min(dist(actor.pos,aim),d.placeRange??100),base={x:actor.pos.x+Math.cos(actor.facing)*reach,y:actor.pos.y+Math.sin(actor.facing)*reach},perpendicular=actor.facing+Math.PI/2;
      for(let n=0;n<segments;n++){const offset=(n-(segments-1)/2)*34;p.spawn(actor,skill,d,aim,payload,{x:base.x+Math.cos(perpendicular)*offset,y:base.y+Math.sin(perpendicular)*offset});}
    }else p.spawn(actor,skill,d,aim,payload,undefined,skill.def.castMode==='charge'?multiplier:1);
  }
}
