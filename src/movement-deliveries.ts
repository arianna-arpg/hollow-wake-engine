import {angleTo,dist,type CombatPoint} from './combat-geometry.js';
import {readList,type LiveList} from './live-list.js';
import type {Modifier} from './types.js';
export interface MovementTrail {readonly radius:number;readonly duration:number;readonly tickInterval?:number;readonly damageScale?:number}
export interface MovementConjure<G>{radius:number;duration:number;grants?:readonly G[];look?:string}
export interface MovementSkill {readonly def:{readonly id:string;readonly name:string;readonly color:string}}
export interface MovementLeap<I> {
  from:CombatPoint;dest:CombatPoint;total:number;timer:number;radius:number;inst:I;dmgMult:number;wasUntargetable:boolean;
  telegraph:{color:string}|undefined;vent:{columnR:number}|undefined;
}
export interface MovementActor<A,I,G> {
  readonly name:string;readonly team:string;readonly dead:boolean;readonly sheet:{get(stat:string,tags:Set<string>,extra:readonly Modifier[]):number;setBase(stat:string,value:number):void};
  owner?:A;sourceSkillId?:string;summonInst?:I;tier:number;shape:unknown;color:string;radius:number;pos:CombatPoint;facing:number;facingPrev:number;
  look:unknown;adorn:unknown;material:unknown;taunt:boolean;construct?:{kind:string;range:number;timer:number};lifespan?:number;
  untargetable:boolean;useLock:number;leap:MovementLeap<I>|null;dash:{dir:number;speed:number;remaining:number}|null;caromRun:{dir:number;speed:number;status:string}|null;
  dashSkill?:I;dashHits?:Set<number>;dashTrailSpec?:MovementTrail;dashVentSpec?:{bank:string;radius:number;duration:number;spacing:number};dashConjureSpec?:MovementConjure<G>;
  caromSkill?:I;caromHits?:Map<number,number>;caromRung?:Set<number>;
  maxLife():number;fillResources():void;applyStatus(id:string,dps:number,durationScale:number,source:string):void;endStatus(id:string):void;
}
export interface MovementSpecs<G>{
  dash:{readonly speed:number;readonly distance:number;readonly decoyDuration?:number;readonly phase?:boolean;readonly trailZone?:MovementTrail;
    readonly trailVent?:{readonly bank:string;readonly radius:number;readonly duration:number;readonly spacing?:number};readonly trailConjure?:MovementConjure<G>};
  carom:{readonly speed:number;readonly duration:number;readonly status?:string};
  blink:{readonly range:number;readonly behindTarget?:boolean;readonly delay?:number};
  leap:{readonly range:number;readonly radius:number;readonly airTime:number;readonly telegraph?:boolean|{readonly color?:string};readonly vent?:{readonly columnR:number;readonly scale?:number}};
}
export interface MovementFlash {pos:CombatPoint;radius:number;color:string;life:number;maxLife:number;fx?:unknown;facing?:number;recoveryCueTier?:number}
export interface PendingBlink<A,I>{actor:A;dest:CombatPoint;timer:number;color:string;inst?:I;visual?:MovementFlash;faceTarget?:A}
export interface MovementFrame<A,I>{
  readonly caster:A;readonly skill:I;readonly aim:CombatPoint;readonly target?:{readonly actor?:A;readonly pos:CombatPoint}|null;
  readonly tags:Set<string>;readonly modifiers:Modifier[];readonly areaScale:number;readonly multiplier:number;readonly color:string;
  readonly speedMultiplier?:number;readonly noRepeat?:boolean;
}
export interface MovementDeliveryPorts<A,I,G>{
  createActor(name:string,team:string,at:CombatPoint):A;addActor(actor:A):void;
  forgetMotion(actor:A):void;moment(actor:A,skill:I,phase:'depart'|'arrive'):void;
  blast(actor:A,skill:I,at:CombatPoint,phase?:'depart'):void;
  status(id:string):{readonly duration:number}|undefined;
  clamp(at:CombatPoint,radius:number,mover:A):CombatPoint;afforded(actor:A,skill:I,dest:CombatPoint):CombatPoint;
  grants(actor:A,tags:Set<string>,extra:Modifier[],base?:readonly G[]):G[];
  conjure(x:number,y:number,radius:number,duration:number,options:{caster:A;grants:G[]}):void;
  trailSpec(amount:number):MovementTrail;trail(actor:A,skill:I,spec:MovementTrail,at:CombatPoint,facing:number):void;
  teleport(actor:A,dest:CombatPoint,color:string,layer:number,skillId?:string):void;
  linger(actor:A,skill:I,at:CombatPoint):void;
  enemies(actor:A):readonly A[];hit(actor:A,skill:I,target:A,multiplier:number):void;
  surfaces(actor:A,at:CombatPoint,radius:number):void;
  flash(flash:MovementFlash):void;voice(id:string,phase:'wait'|'impact'):unknown;
}
/** Movement skills establish combat state and effects. The host supplies the
 * mover and collision facts; it does not reimplement dash/leap/cast policy. */
export class MovementDeliveries<A extends MovementActor<A,I,G>,I extends MovementSkill,G>{
  constructor(private readonly blinkOwner:LiveList<PendingBlink<A,I>>,readonly cloud:{readonly radius:number;readonly radiusPer:number;readonly hold:number;readonly holdPer:number},readonly ports:MovementDeliveryPorts<A,I,G>){}
  get blinks():PendingBlink<A,I>[]{return readList(this.blinkOwner);}
  endCarom(actor:A,options?:{readonly quiet?:boolean}):void{
    const run=actor.caromRun;if(!run)return;actor.caromRun=null;
    const skill=actor.caromSkill;actor.caromSkill=undefined;actor.caromHits=undefined;actor.caromRung=undefined;actor.endStatus(run.status);
    if(!options?.quiet&&skill&&!actor.dead){this.ports.moment(actor,skill,'arrive');this.ports.blast(actor,skill,actor.pos);this.ports.linger(actor,skill,actor.pos);}
  }
  advanceBlinks(dt:number):void{
    const p=this.ports;
    for(let n=this.blinks.length-1;n>=0;n--){
      const row=this.blinks[n];if(row.actor.dead){if(row.visual)row.visual.life=0;this.blinks.splice(n,1);continue;}
      row.timer-=dt;if(row.timer<=0){
        this.blinks.splice(n,1);if(row.visual)row.visual.life=0;p.teleport(row.actor,row.dest,row.color,row.actor.tier,row.inst?.def.id);
        if(row.faceTarget&&(row.actor.tier??0)===(row.faceTarget.tier??0))row.actor.facingPrev=row.actor.facing=angleTo(row.actor.pos,row.faceTarget.pos);
        if(row.inst){p.blast(row.actor,row.inst,row.actor.pos);p.linger(row.actor,row.inst,row.actor.pos);}
      }
    }
  }
  dash(frame:MovementFrame<A,I>,d:MovementSpecs<G>['dash']):void{
    const p=this.ports,{caster:a,skill:i,tags,modifiers,areaScale:area}=frame;
    if(a.caromRun)this.endCarom(a,{quiet:true});
    if(d.decoyDuration){
      const body=p.createActor(a.name+'?',a.team,{...a.pos});body.owner=a;body.sourceSkillId=i.def.id;body.summonInst=i;body.tier=a.tier;
      body.shape=a.shape;body.color=a.color;body.radius=a.radius;body.facing=a.facing;body.look=a.look;body.adorn=a.adorn;body.material=a.material;
      body.taunt=true;body.construct={kind:'decoy',range:0,timer:0};body.sheet.setBase('life',25+a.maxLife()*.2);body.fillResources();
      body.lifespan=d.decoyDuration*a.sheet.get('effectDuration',tags,modifiers);p.addActor(body);
    }
    const speed=d.speed*(frame.speedMultiplier??1);a.dash={dir:a.facing,speed,remaining:d.distance/speed};p.forgetMotion(a);p.moment(a,i,'depart');
    if(d.phase){const want=d.distance/speed+.25;a.applyStatus('phasing',0,want/(p.status('phasing')?.duration??4),i.def.name);}
    a.dashSkill=i;a.dashHits=new Set();const trail=a.sheet.get('moveTrail',tags,modifiers);
    a.dashTrailSpec=d.trailZone??(trail>0?{radius:32,duration:2.2,tickInterval:.4,damageScale:trail}:undefined);
    a.dashVentSpec=d.trailVent?{bank:d.trailVent.bank,radius:d.trailVent.radius*area,duration:d.trailVent.duration*a.sheet.get('effectDuration',tags,modifiers),spacing:Math.max(20,d.trailVent.spacing??90)}:undefined;
    const cloud=a.sheet.get('cloudTrail',tags,modifiers),base=d.trailConjure??(cloud>0?{radius:this.cloud.radius+cloud*this.cloud.radiusPer,duration:this.cloud.hold+cloud*this.cloud.holdPer}:undefined);
    a.dashConjureSpec=base?{radius:base.radius,duration:base.duration,grants:p.grants(a,tags,modifiers,base.grants),...(base.look!==undefined?{look:base.look}:{})}:undefined;
    p.blast(a,i,a.pos,'depart');
  }
  carom(frame:MovementFrame<A,I>,d:MovementSpecs<G>['carom']):void{
    const p=this.ports,{caster:a,skill:i,tags,modifiers}=frame;if(a.caromRun)this.endCarom(a,{quiet:true});
    const speed=d.speed*(frame.speedMultiplier??1),duration=d.duration*a.sheet.get('effectDuration',tags,modifiers),status=d.status??'caroming';
    a.caromRun={dir:a.facing,speed,status};p.forgetMotion(a);p.moment(a,i,'depart');a.caromSkill=i;a.caromHits=new Map();a.caromRung=new Set();
    const definition=p.status(status);if(definition)a.applyStatus(status,0,duration/(definition.duration||1),i.def.name);p.blast(a,i,a.pos,'depart');
  }
  blink(frame:MovementFrame<A,I>,d:MovementSpecs<G>['blink']):void{
    const p=this.ports,{caster:a,skill:i,target,aim,tags,modifiers,color}=frame;if(a.caromRun)this.endCarom(a,{quiet:true});let dest:CombatPoint;
    if(d.behindTarget&&target?.actor){const foe=target.actor,angle=foe.facing+Math.PI;dest={x:foe.pos.x+Math.cos(angle)*(foe.radius+a.radius+10),y:foe.pos.y+Math.sin(angle)*(foe.radius+a.radius+10)};}
    else if(target)dest={...target.pos};
    else{const distance=Math.min(dist(a.pos,aim),d.range);dest={x:a.pos.x+Math.cos(a.facing)*distance,y:a.pos.y+Math.sin(a.facing)*distance};}
    dest=p.afforded(a,i,p.clamp(dest,a.radius,a));
    const cloud=a.sheet.get('cloudTrail',tags,modifiers);
    if(cloud>0)p.conjure(a.pos.x,a.pos.y,this.cloud.radius+cloud*this.cloud.radiusPer,this.cloud.hold+cloud*this.cloud.holdPer,{caster:a,grants:p.grants(a,tags,modifiers)});
    const trail=a.sheet.get('moveTrail',tags,modifiers);if(trail>0){const spec=p.trailSpec(trail);p.trail(a,i,spec,a.pos,a.facing);p.trail(a,i,spec,dest,a.facing);}
    p.blast(a,i,a.pos,'depart');
    if(d.delay&&d.delay>0){
      const visual:MovementFlash={pos:{...dest},radius:a.radius*1.6,color,life:d.delay,maxLife:d.delay,fx:p.voice(i.def.id,'wait'),facing:a.facing,recoveryCueTier:a.tier};
      this.blinks.push({actor:a,dest,timer:d.delay,color,inst:i,visual,...(d.behindTarget&&target?.actor?{faceTarget:target.actor}:{})});p.flash(visual);
    }else{
      p.teleport(a,dest,color,a.tier,i.def.id);if(d.behindTarget&&target?.actor)a.facingPrev=a.facing=angleTo(a.pos,target.actor.pos);
      p.blast(a,i,a.pos);p.linger(a,i,a.pos);
    }
  }
  leap(frame:MovementFrame<A,I>,d:MovementSpecs<G>['leap']):void{
    const p=this.ports,{caster:a,skill:i,aim,tags,modifiers,areaScale:area,multiplier:mult,color}=frame;
    if(a.leap||frame.noRepeat){
      const radius=d.radius*area;
      for(const enemy of p.enemies(a)){if((a.tier??0)!==(enemy.tier??0))continue;if(dist(a.pos,enemy.pos)-enemy.radius<=radius)p.hit(a,i,enemy,mult);}
      p.surfaces(a,a.pos,radius);p.flash({pos:{...a.pos},radius,color,life:.3,maxLife:.3,fx:p.voice(i.def.id,'impact'),facing:a.facing,recoveryCueTier:a.tier});return;
    }
    const distance=Math.min(dist(a.pos,aim),d.range),dest=p.afforded(a,i,p.clamp({x:a.pos.x+Math.cos(a.facing)*distance,y:a.pos.y+Math.sin(a.facing)*distance},a.radius,a));
    a.leap={from:{...a.pos},dest,total:d.airTime,timer:d.airTime,radius:d.radius*area,inst:i,dmgMult:mult,wasUntargetable:a.untargetable,
      telegraph:d.telegraph?{color:(typeof d.telegraph==='object'?d.telegraph.color:undefined)??i.def.color}:undefined,vent:d.vent?{columnR:d.vent.columnR*area}:undefined};
    a.untargetable=true;p.forgetMotion(a);p.moment(a,i,'depart');a.dash=null;if(a.caromRun)this.endCarom(a,{quiet:true});a.useLock=Math.max(a.useLock,d.airTime+.1);
    if(d.vent){const radius=d.vent.columnR*area,power=mult*(d.vent.scale??.6);
      for(const enemy of p.enemies(a))if(dist(a.pos,enemy.pos)-enemy.radius<=radius)p.hit(a,i,enemy,power);
      p.surfaces(a,a.pos,radius);p.flash({pos:{...a.pos},radius,color:'#d9f7fb',life:.35,maxLife:.35});
    }
    const cloud=a.sheet.get('cloudTrail',tags,modifiers);
    if(cloud>0)p.conjure(a.pos.x,a.pos.y,this.cloud.radius+cloud*this.cloud.radiusPer,this.cloud.hold+cloud*this.cloud.holdPer,{caster:a,grants:p.grants(a,tags,modifiers)});
    const trail=a.sheet.get('moveTrail',tags,modifiers);if(trail>0)p.trail(a,i,p.trailSpec(trail),a.pos,a.facing);p.blast(a,i,a.pos,'depart');
  }
}
