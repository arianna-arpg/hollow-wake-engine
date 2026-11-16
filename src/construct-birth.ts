import {dist,angleTo,type CombatPoint} from './combat-geometry.js';
import type {Modifier} from './types.js';
import type {AuraActivationSpec,AuraActivationState} from './aura-activation.js';
export interface ConstructEmbed {
  runOver?:'collect'|'detonate';collect?:{charge?:string;amount:number;max?:number;resource?:'life'|'mana'|'es'};detonateSkillId?:string;icd?:number;emitInterval?:number;
  beam?:{interval:number;range?:number;damageScale?:number;width?:number};
}
export interface ConstructFx {pulse?:{interval:number;radius:number;damageScale?:number};burst?:{radius:number;damageScale?:number}}
export interface ConstructBirthSpec<U> {
  type:'construct';kind:string;look?:string;aims?:boolean;range:number;duration:number;maxActive:number;life?:number;invulnerable?:boolean;placeRange?:number;interval?:number;
  aura?:U;domeRadius?:number;domeMode?:'dissolve'|'deflect'|'slow';domeSlow?:number;healBurst?:{ratio:number;cap:number;radius:number};embed?:ConstructEmbed;fx?:ConstructFx;
  hatch?:{skillId:string;onBreak?:'fizzle'|'hatch';onScorch?:number};breakable?:{ownerMult:number;affinityTags?:string[];affinityMult?:number};
  deathBurst?:{radius:number;damageScale?:number;fraction?:number;damageType?:string};clearway?:true;follows?:true;castOnStruck?:true;taunt?:true;
}
export interface ConstructBodyState<I> {
  kind:string;castInst?:I;range:number;timer:number;castInterval?:number;healBurst?:{ratio:number;cap:number;radius:number};stored?:number;baseRadius?:number;
  embed?:ConstructEmbed;fx?:ConstructFx;breakable?:{ownerMult:number;affinityTags?:string[];affinityMult?:number};deathBurst?:{radius:number;damageScale?:number;fraction?:number;damageType?:string};massed?:boolean;
  domeRadius?:number;domeMode?:'dissolve'|'deflect'|'slow';domeSlow?:number;hatch?:{skillId:string;onBreak?:'fizzle'|'hatch';onScorch?:number};follows?:boolean;castOnStruck?:boolean;
}
export interface ConstructBirthSkill {readonly def:{id:string;name:string;color:string}}
export interface ConstructBirthActor<A,I,U>{
  readonly id:number;team:string;pos:CombatPoint;facing:number;tier:number;level:number;radius:number;dead:boolean;anchored?:boolean;leap?:unknown;
  owner?:A;sourceSkillId?:string;summonInst?:I;shape:string;color:string;look?:string;construct?:ConstructBodyState<I>;aims?:boolean;taunt?:boolean;
  untargetable:boolean;invulnerable:boolean;lifespan:number;explodeOnDeath:number;gateLink?:number;activeAuras:Map<string,AuraActivationState<I,U,Modifier>>;
  sheet:{get(stat:string,tags:Set<string>,extra:Modifier[],base?:number):number;setBase(stat:string,value:number):void;setSource(id:string,mods:Modifier[]):void;getSourceMods(id:string):Modifier[]|undefined};
  fillResources():void;
}
export interface ConstructBirthSockets {breakableGraft:{ownerMult:number;deathBurst?:ConstructBirthSpec<unknown>['deathBurst']};massGraft:{weight?:number}}
export interface ConstructBirthPorts<A,I>{
  tags(skill:I):Set<string>;modifiers(skill:I):Modifier[];innateModifiers(skill:I):Modifier[];sockets(skill:I):readonly {def:{constructFx?:ConstructFx}}[];
  socket<K extends keyof ConstructBirthSockets>(skill:I,key:K):ConstructBirthSockets[K]|undefined;
  minions(actor:A,id:string):A[];kill(actor:A,silent:true):void;create(name:string,team:string,at:CombatPoint):A;actors():A[];
  random():number;clamp(at:CombatPoint,radius:number,mover:A):CombatPoint;push(actor:A,angle:number,distance:number,owner:A,skill:I):void;
  attachTethers(actor:A,skill:I,owner:A):void;enemies(actor:A):A[];hit(actor:A,skill:I,target:A,mult:number,depth:1):void;
  arrival(actor:A,owner:A,skill:I):boolean;flash(at:CombatPoint,radius:number,color:string,life:number):void;
}
export interface ConstructBirthRules {readonly looks:Readonly<Record<string,string>>;readonly aims:Readonly<Record<string,boolean>>;readonly weight:{readonly refRadius:number;readonly radiusPow:number}}
/** Body creation policy over SDK actor/stat identities. The host creates an
 * empty body and supplies collision facts; caps, inheritance, skills, clocks,
 * aura state, gate pairing and arrival damage are decided here. */
export class ConstructBirth<A extends ConstructBirthActor<A,I,U>,I extends ConstructBirthSkill,U extends AuraActivationSpec<Modifier>> {
  constructor(readonly rules:ConstructBirthRules,readonly ports:ConstructBirthPorts<A,I>){}
  spawn(caster:A,skill:I,d:ConstructBirthSpec<U>,aim:CombatPoint,payload?:I,at?:CombatPoint,scale=1):A|null{
    const p=this.ports,tags=p.tags(skill),extra=p.modifiers(skill);
    if(d.kind!=='echo'){
      const cap=Math.max(1,Math.round(caster.sheet.get('constructMaxCount',tags,extra,d.maxActive))),existing=p.minions(caster,skill.def.id);
      while(existing.length>=cap){const oldest=existing.shift();if(oldest)p.kill(oldest,true);}
    }
    const c=p.create(skill.def.name,caster.team,{x:0,y:0});
    c.owner=caster;c.sourceSkillId=skill.def.id;c.summonInst=skill;c.shape='square';c.color=skill.def.color;c.look=d.look??this.rules.looks[d.kind];
    c.radius=d.kind==='trap'||d.kind==='mine'?8:13;c.level=caster.level;
    c.construct={kind:d.kind,castInst:payload,range:d.range,timer:d.kind==='trap'?.5:(d.interval??0)};
    c.aims=d.aims??this.rules.aims[d.kind];
    if(d.taunt||caster.sheet.get('constructTaunt',tags,extra)>0)c.taunt=true;
    if(d.healBurst){c.construct.healBurst=d.healBurst;c.construct.stored=0;c.construct.baseRadius=c.radius;}
    if(d.embed){const icd=caster.sheet.get('embedIcd',tags,extra,d.embed.icd??0);c.construct.embed=icd>0?{...d.embed,icd}:{...d.embed,icd:undefined};c.untargetable=true;c.radius=8;}
    {let fx=d.fx;for(const socket of p.sockets(skill)){if(!socket.def.constructFx)continue;fx={pulse:socket.def.constructFx.pulse??fx?.pulse,burst:socket.def.constructFx.burst??fx?.burst};}if(fx)c.construct.fx=fx;}
    if(d.invulnerable){c.invulnerable=true;c.untargetable=true;}if(d.kind==='trap'||d.kind==='mine')c.untargetable=true;
    c.sheet.setBase('life',d.life??40);c.sheet.setBase('mana',999);c.sheet.setBase('manaRegen',100);
    const inherited:Modifier[]=[];for(const source of ['attributes','class','passives']){const mods=caster.sheet.getSourceMods(source);if(mods)inherited.push(...mods);}
    c.sheet.setSource('inherited',inherited);c.sheet.setSource('parentSkill',payload===skill?[]:p.innateModifiers(skill));
    c.sheet.setSource('owner',[{stat:'damage',kind:'more',value:caster.sheet.get('minionDamage',tags,extra)-1},{stat:'life',kind:'more',value:caster.sheet.get('minionLife',tags,extra)-1}]);
    if(d.kind==='totem'||d.kind==='sentry'){const rate=caster.sheet.get('constructCastRate',tags,extra);c.sheet.setSource('constructCastRate',[
      {stat:'attackSpeed',kind:'more',value:rate-1},{stat:'castSpeed',kind:'more',value:rate-1},{stat:'cooldownRecovery',kind:'more',value:rate-1}]);}
    c.lifespan=d.duration*scale*caster.sheet.get('effectDuration',tags,extra);
    c.construct.castInterval=(d.interval??.8)/Math.max(.25,scale)/caster.sheet.get('constructCastRate',tags,extra);
    c.explodeOnDeath=caster.sheet.get('minionExplodeDeath',tags,extra);c.fillResources();
    {const flaw=p.socket(skill,'breakableGraft'),breakable=d.breakable??(flaw?{ownerMult:flaw.ownerMult}:undefined),burst=d.deathBurst??flaw?.deathBurst;
      if(breakable)c.construct.breakable=breakable;if(burst)c.construct.deathBurst=burst;}
    {const massed=p.socket(skill,'massGraft');if(massed){c.sheet.setBase('weight',massed.weight??Math.pow(c.radius/this.rules.weight.refRadius,this.rules.weight.radiusPow));c.construct.massed=true;}}
    c.tier=caster.tier;const reach=Math.min(dist(caster.pos,aim),d.placeRange??100),angle=angleTo(caster.pos,aim);
    c.pos=p.clamp(at?{...at}:{x:caster.pos.x+Math.cos(angle)*reach,y:caster.pos.y+Math.sin(angle)*reach},c.radius,c);c.facing=angle;
    if(d.clearway){for(const e of p.actors()){if(e===c||e.dead||e.construct||e.anchored||e.leap)continue;const gap=c.radius+e.radius+6-dist(c.pos,e.pos);if(gap<=0)continue;
      p.push(e,dist(c.pos,e.pos)<1?p.random()*Math.PI*2:angleTo(c.pos,e.pos),gap+12,caster,skill);}}
    if(d.kind==='dome'){c.construct.domeRadius=(d.domeRadius??100)*caster.sheet.get('aoeRadius',tags,extra);c.construct.domeMode=caster.sheet.get('domeDeflects',tags,extra)>0?'deflect':(d.domeMode??'dissolve');c.construct.domeSlow=d.domeSlow;}
    if(d.hatch)c.construct.hatch=d.hatch;if(d.follows)c.construct.follows=true;if(d.castOnStruck)c.construct.castOnStruck=true;if(d.taunt)c.taunt=true;
    if(d.kind==='gate'){const other=p.actors().find(a=>a!==c&&!a.dead&&a.owner===caster&&a.construct?.kind==='gate'&&a.sourceSkillId===skill.def.id&&a.gateLink===undefined);if(other){other.gateLink=c.id;c.gateLink=other.id;}}
    if(d.aura)c.activeAuras.set(skill.def.id,{inst:skill,spec:d.aura,radius:d.aura.radius*caster.sheet.get('aoeRadius',tags,extra),shape:caster.sheet.get('aoeShape',tags,extra),remaining:Infinity,reserved:0,pulseTimer:0,affected:new Set()});
    p.actors().push(c);p.attachTethers(c,skill,caster);
    const burst=c.construct.fx?.burst;if(burst){const radius=burst.radius*caster.sheet.get('aoeRadius',tags,extra);for(const e of p.enemies(c)){if(dist(c.pos,e.pos)-e.radius>radius)continue;p.hit(c,skill,e,burst.damageScale??.5,1);}p.flash({...c.pos},radius,c.color,.25);}
    if(!p.arrival(c,caster,skill))p.flash({...c.pos},22,c.color,.3);return c;
  }
}
