import {dist,type CombatPoint} from './combat-geometry.js';
import type {Modifier} from './types.js';
import type {SummonContract,SummonContractSpec,SummonQueues,SummonCost} from './summon-contracts.js';
export interface SummonDeliverySpec extends SummonContractSpec {
  readonly count:number;readonly fromCorpse?:boolean;
  readonly placeAt?:{readonly at?:string;readonly range?:number;readonly scatter?:number};
  readonly waves?:{readonly count:number;readonly interval:number;readonly costFactor?:number;readonly trackAim?:boolean};
}
export interface SummonDeliverySkill {readonly def:{readonly id:string;readonly hivecall?:unknown}}
export interface SummonDeliveryCorpse {readonly defId:string;readonly pos:CombatPoint}
export interface SummonDeliveryActor<I>{
  readonly pos:CombatPoint;readonly facing:number;readonly summonToggles:Map<string,SummonContract<I>>;
  readonly sheet:{get(stat:string,tags:Set<string>,extra:Modifier[],base?:number):number};
  reservedMana:number;mana:number;maxMana():number;availableMaxMana():number;skillCost(skill:I):SummonCost;
}
export interface SummonDeliveryPorts<A,I,D,C>{
  form(skill:I):string|undefined;monster(id:string):boolean;
  corpses():readonly C[];minionsOfGroup(actor:A,group:string):readonly {readonly summonOffspring?:boolean}[];minionsOfSkill(actor:A,id:string):readonly {readonly summonOffspring?:boolean}[];
  removeCorpse(corpse:C):void;corpseSpawn(actor:A,skill:I,at:CombatPoint,count:number):void;
  /** Bind SummonBirth.spawn and SummonContracts, sharing the same queue owner. */
  spawn(actor:A,skill:I,options:{monsterId?:string;pos?:CombatPoint;dmgMult?:number}):unknown;
  contracts:{slots(actor:A,skill:I,delivery:D):number;reservation(actor:A,skill:I,delivery:D):number;dismissExclusive(actor:A,skill:I,delivery:D):void};
  delivery(skill:I):D|undefined;cannotSustain(actor:A):void;
  clamp(at:CombatPoint,radius:number):CombatPoint;random():number;
}
export interface SummonDeliveryFrame<A,I,C>{
  readonly caster:A;readonly skill:I;readonly aim:CombatPoint;readonly target?:{readonly corpse?:C;readonly corpses?:readonly C[]}|null;
  readonly tags:Set<string>;readonly modifiers:Modifier[];readonly multiplier:number;readonly gaugePower:number;
}
/** A summon cast's corpse, reservation, wave and sequential-birth policy.
 * Physical bodies are produced through the existing SummonBirth service. */
export class SummonDelivery<A extends SummonDeliveryActor<I>,I extends SummonDeliverySkill,D extends SummonDeliverySpec,C extends SummonDeliveryCorpse>{
  constructor(readonly queues:SummonQueues<A,I>,readonly ports:SummonDeliveryPorts<A,I,D,C>){}
  execute(frame:SummonDeliveryFrame<A,I,C>,d:D):void{
    const p=this.ports,{caster:a,skill:i,aim,target,tags,modifiers:extra,multiplier:mult,gaugePower:power}=frame;
    if(d.fromCorpse){
      const form=p.form(i);if(form&&p.monster(form)){p.spawn(a,i,{monsterId:form});return;}
      if(!target?.corpse)return;const haul=(target.corpses??[target.corpse]).filter(c=>p.corpses().includes(c));if(!haul.length)return;
      const cap=Math.max(1,Math.round(a.sheet.get('minionMaxCount',tags,extra,d.maxActive))),standing=(d.poolGroup?p.minionsOfGroup(a,d.poolGroup):p.minionsOfSkill(a,i.def.id)).filter(body=>!body.summonOffspring).length;
      const raise=Math.max(1,Math.min(haul.length,cap-standing));
      for(let n=0;n<raise;n++){const corpse=haul[n];p.removeCorpse(corpse);p.spawn(a,i,{monsterId:corpse.defId,pos:corpse.pos});}
      p.corpseSpawn(a,i,haul[0].pos,raise);return;
    }
    if(d.persistent?.toggle){
      if(a.summonToggles.has(i.def.id))return;
      const slots=p.contracts.slots(a,i,d),reserve=p.contracts.reservation(a,i,d)*slots;let freed=0;
      if(d.exclusiveGroup)for(const row of a.summonToggles.values()){const other=p.delivery(row.inst);if(other?.exclusiveGroup===d.exclusiveGroup)freed+=row.reserved;}
      if(slots<=0||a.reservedMana-freed+reserve>a.maxMana()){p.cannotSustain(a);return;}
      p.contracts.dismissExclusive(a,i,d);a.reservedMana+=reserve;a.mana=Math.min(a.mana,a.availableMaxMana());a.summonToggles.set(i.def.id,{inst:i,reserved:reserve,slots});
      const first=i.def.hivecall?1:Math.min(slots,Math.max(1,Math.round((d.count+Math.round(a.sheet.get('summonCount',tags,extra)))*power))),sequential=a.sheet.get('summonSequence',tags,extra)>0;
      if(sequential&&first>1){p.spawn(a,i,{dmgMult:mult});this.queues.summons.push({caster:a,inst:i,remaining:first-1,timer:.35,interval:.35,mult});}
      else for(let n=0;n<first;n++)p.spawn(a,i,{dmgMult:mult});return;
    }
    p.contracts.dismissExclusive(a,i,d);
    const total=Math.max(1,Math.round((d.count+Math.round(a.sheet.get('summonCount',tags,extra)))*power)),range=d.placeAt?.range??420,
      wantCursor=d.placeAt?.at==='cursor'||a.sheet.get('summonAtCursor',tags,extra)>0;
    const at=wantCursor?p.clamp(dist(a.pos,aim)<=range?{...aim}:{x:a.pos.x+Math.cos(a.facing)*range,y:a.pos.y+Math.sin(a.facing)*range},10):undefined,scatter=d.placeAt?.scatter??60;
    const spot=():CombatPoint|undefined=>at?{x:at.x+(-scatter+p.random()*(scatter*2)),y:at.y+(-scatter+p.random()*(scatter*2))}:undefined;
    if(d.waves&&d.waves.count>1){
      for(let n=0;n<total;n++)p.spawn(a,i,{pos:spot(),dmgMult:mult});
      const cost=d.waves.costFactor?(()=>{const price=a.skillCost(i);return{mana:price.mana*d.waves!.costFactor!,life:price.life*d.waves!.costFactor!};})():undefined;
      this.queues.summons.push({caster:a,inst:i,remaining:(d.waves.count-1)*total,timer:d.waves.interval,interval:d.waves.interval,batch:total,
        at:at?{...at}:undefined,trackAim:d.waves.trackAim,scatter,range:d.placeAt?.range??420,mult,costPer:cost});return;
    }
    const sequential=a.sheet.get('summonSequence',tags,extra)>0;
    if(sequential&&total>1){p.spawn(a,i,{pos:spot(),dmgMult:mult});this.queues.summons.push({caster:a,inst:i,remaining:total-1,timer:.35,interval:.35,at,scatter});}
    else for(let n=0;n<total;n++)p.spawn(a,i,{pos:spot(),dmgMult:mult});
  }
}
