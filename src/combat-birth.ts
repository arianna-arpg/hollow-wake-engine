import type {CombatPoint} from './combat-geometry.js';
import type {BirthPool,BirthPoolEntry} from './birth-pool.js';
export type OrphanFate='die'|'wither'|'frenzy'|'rout';
export interface CombatBirthEffect<E=unknown>{type:'birth';monsterId?:string;pool?:readonly BirthPoolEntry[];count?:readonly [number,number];cap?:number;duration?:number;onHit?:true;bounty?:'full';scatter?:number;tag?:string;emerge?:E;orphan?:OrphanFate;incubate?:{sec:number;vessel?:string}}
export interface CombatBirthSkill {def:{id:string;color:string};hostSkillId?:string}
export interface CombatBirthActor<A,I,B,E>{
  id:number;team:string;level:number;tier:number;radius:number;color:string;pos:CombatPoint;dead:boolean;owner?:A;sourceSkillId?:string;noBounty:boolean;lifelineId?:number;
  lifespan:number;bornOf?:number;faction?:string;tag?:string;orphanFate?:OrphanFate;clutchLive?:number;eggHatch?:{at:number;fx:CombatBirthEffect<E>};
  construct?:{hatch?:{skillId:string}};summonInst?:I;sheet:{get(stat:string):number};addBuff(buff:B,scale:number,spent:number):void;applyStatus(id:string,dps:number,duration:number,source:string):void;
}
export interface CombatBirthRules<B>{count:readonly[number,number];cap:number;minionCap:number;scatter:number;flash:{radius:number;life:number};incubate:{vessel:string};orphan:{witherSec:number;rout:{status:string;durMul:number}};frenzy:B}
export interface CombatBirthPorts<A,I,B,E>{
  actors():A[];time():number;random():number;monsterExists(id:string):boolean;pool:Pick<BirthPool,'pick'>;
  spawnMinion(caster:A,skill:I,options:{monsterId:string;pos:CombatPoint;delivery:{type:'summon';monsterId:string;count:1;maxActive:number;duration?:number}}):A|null;
  createMonster(id:string,level:number,team:string,owner?:A):A;lifeline(owner:A):number|undefined;freeSpot(at:CombatPoint,radius:number,tier:number):CombatPoint;
  emerge(body:A,options:{spec?:E;host?:true}):void;flash(at:CombatPoint,radius:number,color:string,life:number):void;kill(body:A,silent:true):void;
  corpseSpawn(skill:I):{perCorpse?:boolean;count?:number;max:number;monsterId:string;duration:number}|undefined;clamp(at:CombatPoint,radius:number):CombatPoint;
  skillExists(id:string):boolean;makeSkill(id:string,level:number):I;effectiveLevel(skill:I):number;execute(owner:A,skill:I,at:CombatPoint,options:{keepFacing:true;noCooldown:true;noRepeat:true}):boolean;hatched(body:A):void;
}
/** Birth, incubation, corpse-born servants and pod hatching on one borrowed
 * actor graph. Body assembly, summon policy and death bind to SDK services;
 * the host supplies publication and spatial facts. No campaign/save imports. */
export class CombatBirth<A extends CombatBirthActor<A,I,B,E>,I extends CombatBirthSkill,B,E=unknown>{
  #scan=0;
  constructor(readonly rules:CombatBirthRules<B>,readonly ports:CombatBirthPorts<A,I,B,E>){}
  birth(caster:A,inst:I|null,fx:CombatBirthEffect<E>,at:CombatPoint,opts?:{host?:boolean;capKey?:string}):A[]{
    const p=this.ports,r=this.rules,born:A[]=[],band=fx.count??r.count;
    const n=Math.max(0,Math.round(Math.floor(band[0]+p.random()*(band[1]+1-band[0]))));if(n<=0)return born;
    const scatter=fx.scatter??r.scatter,playerSide=caster.team==='player',brood=()=>p.actors().filter(a=>!a.dead&&a.bornOf===caster.id).length;
    for(let i=0;i<n;i++){
      const id=fx.pool?.length?p.pool.pick(fx.pool,caster.level):fx.monsterId;if(!id||!p.monsterExists(id))continue;
      const seat={x:at.x+(-scatter+p.random()*(scatter-(-scatter))),y:at.y+(-scatter+p.random()*(scatter-(-scatter)))};let body:A|null;
      if(playerSide&&inst)body=p.spawnMinion(caster,inst,{monsterId:id,pos:seat,delivery:{type:'summon',monsterId:id,count:1,maxActive:fx.cap??r.minionCap,...(fx.duration!==undefined?{duration:fx.duration}:{})}});
      else if(playerSide){
        const owner=caster.owner??caster,key=opts?.capKey??'__birth',cap=fx.cap??r.minionCap;
        if(p.actors().filter(a=>a.owner===owner&&!a.dead&&a.sourceSkillId===key).length>=cap)break;
        body=p.createMonster(id,owner.level,owner.team,owner);body.sourceSkillId=key;body.noBounty=true;body.lifelineId=p.lifeline(owner);
        if(fx.duration)body.lifespan=fx.duration*owner.sheet.get('effectDuration');body.pos=p.freeSpot(seat,body.radius,body.tier);p.actors().push(body);
      }else{
        if(brood()>=(fx.cap??r.cap))break;
        const vessel=fx.incubate?(fx.incubate.vessel??r.incubate.vessel):id;
        if(!p.monsterExists(vessel))continue;
        body=p.createMonster(vessel,caster.level,caster.team);body.bornOf=caster.id;
        if(caster.faction)body.faction=caster.faction;if(fx.bounty!=='full')body.noBounty=true;if(fx.tag)body.tag=fx.tag;if(fx.orphan)body.orphanFate=fx.orphan;
        body.pos=p.freeSpot(seat,body.radius,body.tier);
        if(fx.incubate){const hatchFx={...fx};delete hatchFx.incubate;body.eggHatch={at:p.time()+fx.incubate.sec,fx:hatchFx};}
        p.actors().push(body);caster.clutchLive=brood();
      }
      if(!body)continue;born.push(body);p.emerge(body,{...(fx.emerge?{spec:fx.emerge}:{}),...(opts?.host?{host:true}:{})});
    }
    if(born.length)p.flash({...at},r.flash.radius,inst?.def.color??caster.color,r.flash.life);return born;
  }
  advance(dt:number):void{
    this.#scan-=dt;if(this.#scan>0)return;this.#scan=.25;const p=this.ports;
    for(const egg of [...p.actors()]){if(egg.dead||!egg.eggHatch||p.time()<egg.eggHatch.at)continue;const fx=egg.eggHatch.fx;egg.eggHatch=undefined;this.birth(egg,null,fx,{...egg.pos},{host:true});p.kill(egg,true);}
  }
  onDeath(victim:A):void{
    const p=this.ports;
    if(victim.bornOf!==undefined){const mother=p.actors().find(a=>!a.dead&&a.id===victim.bornOf);if(mother?.clutchLive!==undefined)mother.clutchLive=p.actors().filter(a=>!a.dead&&a!==victim&&a.bornOf===mother.id).length;}
    let brood:A[]|null=null;for(const a of p.actors())if(!a.dead&&a.bornOf===victim.id&&a.orphanFate)(brood??=[]).push(a);if(!brood)return;
    for(const child of brood){if(child.dead)continue;switch(child.orphanFate){case'die':p.kill(child,true);break;case'wither':child.lifespan=this.rules.orphan.witherSec;break;case'frenzy':child.addBuff(this.rules.frenzy,1,0);break;case'rout':child.applyStatus(this.rules.orphan.rout.status,0,this.rules.orphan.rout.durMul,'orphaned');break;}}
  }
  corpse(caster:A,inst:I,at:CombatPoint,count:number):void{
    const p=this.ports,s=p.corpseSpawn(inst);if(!s)return;const births=s.perCorpse?count:s.count??1,key='__hive:'+inst.def.id;
    for(let i=0;i<births;i++){if(p.actors().filter(a=>a.owner===caster&&!a.dead&&a.sourceSkillId===key).length>=s.max)return;
      const child=p.createMonster(s.monsterId,caster.level,caster.team,caster);child.sourceSkillId=key;child.lifespan=s.duration;
      child.pos=p.clamp({x:at.x+(-22+p.random()*44),y:at.y+(-22+p.random()*44)},child.radius);p.actors().push(child);p.emerge(child,{host:true});}
  }
  hatch(pod:A):void{
    const p=this.ports,h=pod.construct?.hatch;if(!h||!p.skillExists(h.skillId))return;pod.construct!.hatch=undefined;
    const owner=pod.owner;if(!owner||owner.dead)return;const payload=p.makeSkill(h.skillId,pod.summonInst?p.effectiveLevel(pod.summonInst):pod.level);payload.hostSkillId=pod.sourceSkillId;
    p.execute(owner,payload,{...pod.pos},{keepFacing:true,noCooldown:true,noRepeat:true});p.hatched(pod);
  }
}
