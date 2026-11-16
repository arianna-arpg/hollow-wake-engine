import {dist,type CombatPoint} from './combat-geometry.js';
import type {Modifier} from './types.js';
import type {CasterEffect} from './caster-effects.js';
import type {CastBuff} from './cast-buffs.js';
import type {CastSelfPorts} from './cast-self-effects.js';
import type {TameEffect} from './companion-claims.js';
export interface DirectSkill {
  readonly def:{readonly id:string;readonly tags:readonly string[];readonly effects:readonly {readonly type:string}[];
    readonly amalgam?:{readonly cap:number;readonly radius:number}};
}
export interface DirectActor<A,I,Trail> {
  readonly id:number;readonly team:string;readonly radius:number;readonly tier:number;readonly pos:CombatPoint;readonly dead:boolean;
  readonly owner?:A|null;readonly construct?:unknown;readonly untargetable:boolean;readonly statuses:readonly {readonly id:string}[];
  readonly sheet:{get(stat:string,tags:Set<string>,modifiers:readonly Modifier[]):number};
  readonly casting:{readonly mode:string;amalgamFed?:number}|null;
  gainWard(amount:number):number;
  walkTrail?:{spec:Trail;until:number;inst:I};walkTrailPrev?:CombatPoint;walkTrailOdo?:number;
}
export interface DirectTarget<A>{readonly actor?:A;readonly self?:boolean;readonly corpse?:unknown;readonly pos:CombatPoint}
export interface DirectFrame<A,I,F>{
  readonly caster:A;readonly skill:I;readonly target?:DirectTarget<A>|null;readonly origin:CombatPoint;
  readonly tags:Set<string>;readonly modifiers:Modifier[];readonly multiplier:number;readonly flat?:F;readonly areaScale:number;readonly chargesSpent:number;
  readonly targetSpec?:{readonly consumesCorpse?:boolean};
}
export interface DirectPorts<A,I,F,Trail,Cue> extends Pick<CastSelfPorts<A,I,Cue,string>,'absorbAmount'|'absorb'|'restore'|'stream'|'heal'|'cleanse'>{
  critical(actor:A,skill:I,at:CombatPoint):number;
  time():number;actors():readonly A[];enemies(actor:A):A[];
  effects(skill:I):readonly CasterEffect<Cue,unknown,CastBuff<Modifier,string>>[];
  rite(skill:I):boolean;statusDuration(id:string):number|undefined;trailSpec(amount:number):Trail;
  arrive(caster:A,skill:I,at:CombatPoint,radius:number,tier:number,self?:boolean,area?:boolean):void;
  selfRelease(caster:A,skill:I):void;
  kill(actor:A,violent:true):void;feeding(meal:A,caster:A,skill:I):void;
  tame(caster:A,skill:I,target:A,effect:TameEffect):void;
  hit(caster:A,skill:I,target:A,multiplier:number,depth:0,flat?:F):void;
  requiredStatuses(skill:I):readonly string[]|undefined;
  nearestBody(actor:A,at:CombatPoint):{readonly pos:CombatPoint;readonly r:number;readonly seg:number};
  noteBody(actor:A,segment:number):void;
  frontSplash(caster:A,skill:I,at:CombatPoint,radius:number):void;
  strikeSurfaces(caster:A,at:CombatPoint,radius:number):void;
}
/** Self and resolved-target deliveries, with recovery and tame rules bound to
 * SDK services. Target resolution and geometric body facts belong to the host;
 * target expansion, effect order and source identity remain combat rules. */
export class DirectDeliveries<A extends DirectActor<A,I,Trail>,I extends DirectSkill,F,Trail,Cue>{
  constructor(readonly ports:DirectPorts<A,I,F,Trail,Cue>){}
  self(frame:DirectFrame<A,I,F>):void{
    const p=this.ports,{caster:a,skill:i,tags,modifiers}=frame;
    p.arrive(a,i,a.pos,a.radius+18,a.tier,true);
    if(!p.rite(i)&&!p.effects(i).some(f=>f.type==='detonateMinions'||f.type==='shatterConstructs'))p.selfRelease(a,i);
    const trail=a.sheet.get('moveTrail',tags,modifiers);
    if(trail>0){
      let duration=0;for(const fx of p.effects(i)){
        if(fx.type==='buff'&&fx.duration)duration=Math.max(duration,fx.duration);
        else if(fx.type==='status')duration=Math.max(duration,p.statusDuration(fx.status)??0);
      }
      const hold=(duration>0?duration:4)*a.sheet.get('effectDuration',tags,modifiers);
      a.walkTrail={spec:p.trailSpec(trail),until:p.time()+hold,inst:i};a.walkTrailPrev={...a.pos};a.walkTrailOdo=0;
    }
    if(i.def.amalgam&&a.casting?.mode==='channel'){
      const lord=a.owner??a,cast=a.casting;
      if((cast.amalgamFed??0)<i.def.amalgam.cap){
        let meal:A|null=null,nearest=i.def.amalgam.radius;
        for(const body of p.actors()){
          if(body.owner!==lord||body.dead||body.construct||body.untargetable)continue;
          const distance=dist(a.pos,body.pos);if(distance<nearest){nearest=distance;meal=body;}
        }
        if(meal){cast.amalgamFed=(cast.amalgamFed??0)+1;p.kill(meal,true);if(meal.dead)p.feeding(meal,a,i);}
      }
    }
  }
  target(frame:DirectFrame<A,I,F>,delivery:{readonly splash?:number}):CombatPoint|null{
    const p=this.ports,{caster:a,skill:i,target,origin,tags,modifiers,multiplier:mult,areaScale:area}=frame;
    const friendly=target?.actor?.team===a.team?target.actor:target?.self?a:null;
    if(friendly){
      let critical:number|undefined;
      for(const fx of p.effects(i))switch(fx.type){
        case 'heal':p.heal(a,i,friendly,fx,mult);break;
        case 'cleanse':p.cleanse(friendly,fx.count??2);break;
        case 'absorb':p.absorb(friendly,p.absorbAmount(a,i,fx.amount),fx.duration*a.sheet.get('effectDuration',tags,modifiers));break;
        case 'restore':p.restore(friendly,fx,{tags:i.def.tags});break;
        case 'ward':friendly.gainWard(fx.amount*(fx.perCharge?Math.max(1,frame.chargesSpent):1));break;
        case 'restoreOverTime':critical??=p.critical(a,i,friendly.pos);p.stream(friendly,a,i,fx,frame.chargesSpent,critical);break;
      }
      p.arrive(a,i,friendly.pos,friendly.radius+14,friendly.tier);return null;
    }
    if(target?.actor){
      const tame=i.def.effects.find((effect):effect is TameEffect=>effect.type==='tame');
      if(tame){p.tame(a,i,target.actor,tame);if(target.actor.owner===a)p.arrive(a,i,target.actor.pos,target.actor.radius+14,target.actor.tier);return null;}
      p.hit(a,i,target.actor,mult,0,frame.flat);
      const count=Math.round(a.sheet.get('multiTarget',tags,modifiers));
      if(count>0){
        const need=p.requiredStatuses(i),more=p.enemies(a).filter(body=>body!==target.actor&&dist(target.pos,body.pos)<=170&&(!need||body.statuses.some(status=>need.includes(status.id))))
          .sort((x,y)=>dist(target.pos,x.pos)-dist(target.pos,y.pos)).slice(0,count);
        for(const body of more){p.hit(a,i,body,mult,0,frame.flat);p.arrive(a,i,body.pos,body.radius+14,body.tier);}
      }
      if(delivery.splash){
        const radius=delivery.splash*area;
        for(const body of p.enemies(a)){
          if(body===target.actor)continue;const nearest=p.nearestBody(body,target.pos);
          if(dist(target.pos,nearest.pos)-nearest.r<=radius){p.noteBody(body,nearest.seg);p.hit(a,i,body,mult*.5,0);}
        }
        p.frontSplash(a,i,target.pos,radius);p.strikeSurfaces(a,target.pos,radius);
      }
    }
    if(!target?.corpse||frame.targetSpec?.consumesCorpse===false||!p.rite(i))
      p.arrive(a,i,target?.actor?.pos??origin,delivery.splash?delivery.splash*area:(target?.actor?.radius??12)+14,target?.actor?.tier??a.tier,false,!!delivery.splash);
    return{...origin};
  }
}
