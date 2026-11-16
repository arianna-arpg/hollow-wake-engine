import {angleTo,dist,type CombatPoint} from './combat-geometry.js';
import type {Modifier} from './types.js';
export interface SummonContractSpec {
  readonly type:'summon';readonly maxActive:number;readonly poolGroup?:string;readonly exclusiveGroup?:string;
  readonly persistent?:{readonly toggle?:boolean;readonly slots?:number;readonly reserve?:number;readonly respawnTime:number};
}
export interface SummonContractSkill {readonly def:{readonly id:string;readonly hivecall?:unknown};readonly companionGrant?:boolean}
export interface SummonContract<I>{inst:I;reserved:number;slots?:number}
export interface SummonCost {mana:number;life:number}
export interface SummonContractActor<A,I>{
  readonly owner?:A;readonly dead:boolean;readonly summonInst?:I;readonly summonOffspring?:boolean;readonly sourceSkillId?:string;
  readonly pos:CombatPoint;readonly aimPos?:CombatPoint;readonly summonToggles:Map<string,SummonContract<I>>;
  readonly sheet:{get(stat:string,tags:Set<string>,extra:Modifier[],base?:number):number};
  reservedMana:number;manaReserved:number;mana:number;maxMana():number;availableMaxMana():number;canAfford(cost:SummonCost):boolean;
}
export interface SummonRespawn<A,I>{caster:A;inst:I;timer:number}
export interface PendingSummon<A,I>{caster:A;inst:I;remaining:number;timer:number;interval:number;mult?:number;batch?:number;at?:CombatPoint;trackAim?:boolean;scatter?:number;range?:number;costPer?:SummonCost}
export interface SummonQueues<A,I>{respawns:SummonRespawn<A,I>[];summons:PendingSummon<A,I>[]}
export interface SummonContractPorts<A,I,D>{
  /** Undefined means a non-summon delivery. Native and resolved queries differ. */
  delivery(skill:I):D|undefined;native(skill:I):D|undefined;
  tags(skill:I,fromDefinition?:boolean):Set<string>;modifiers(skill:I):Modifier[];
  actors():readonly A[];homes():readonly A[];minions(owner:A):A[];minionsOfSkill(owner:A,id:string):A[];
  clearReleaseFields(owner:A,skill:I):void;kill(body:A,violent:true):void;
  spawn(owner:A,skill:I,options:{pos?:CombatPoint;dmgMult?:number;noReplace:boolean}):A|null;
  recovered(body:A,skill:I):void;
  pay(actor:A,skill:I,cost:SummonCost):void;dry(actor:A,skillId:string):void;
  random():number;clamp(at:CombatPoint,radius:number):CombatPoint;
}
/** In-memory summon reservations and birth debt. "Persistent" here means a
 * minion that respawns during play; no account, saving or database is involved.
 * Queue replacement and live read order follow the source lifecycle. */
export class SummonContracts<A extends SummonContractActor<A,I>,I extends SummonContractSkill,D extends SummonContractSpec>{
  constructor(readonly queues:SummonQueues<A,I>,readonly ports:SummonContractPorts<A,I,D>){}
  capacity(owner:A,skill:I,d:D):number{return Math.max(1,Math.round(owner.sheet.get('minionMaxCount',this.ports.tags(skill),this.ports.modifiers(skill),d.maxActive)));}
  slots(owner:A,skill:I,d:D):number{
    const cap=this.capacity(owner,skill,d),requested=d.persistent?.slots===undefined?cap:Math.max(1,Math.round(d.persistent.slots+owner.sheet.get('summonCount',this.ports.tags(skill),this.ports.modifiers(skill))));
    let held=0;if(d.poolGroup)for(const[id,row]of owner.summonToggles){
      if(id===skill.def.id)continue;const other=this.ports.delivery(row.inst);if(!other||other.poolGroup!==d.poolGroup)continue;
      if(d.exclusiveGroup&&other.exclusiveGroup===d.exclusiveGroup)continue;held+=row.slots??this.capacity(owner,row.inst,other);
    }
    return Math.max(0,Math.min(requested,cap-held));
  }
  reservation(owner:A,skill:I,d:D):number{
    const tags=this.ports.tags(skill),mods=this.ports.modifiers(skill);
    return(d.persistent?.reserve??0)*owner.sheet.get('manaCost',tags,mods)*owner.sheet.get('summonReservation_'+skill.def.id,tags,mods,1);
  }
  release(body:A,scheduleRespawn:boolean):void{
    const owner=body.owner;if(owner&&body.manaReserved>0){owner.reservedMana=Math.max(0,owner.reservedMana-body.manaReserved);body.manaReserved=0;}
    const skill=body.summonInst;
    if(scheduleRespawn&&!skill?.companionGrant&&!skill?.def.hivecall&&!body.summonOffspring&&owner&&!owner.dead&&skill){
      const delivery=this.ports.native(skill);if(delivery?.persistent){const tags=this.ports.tags(skill),extra=this.ports.modifiers(skill);
        this.queues.respawns.push({caster:owner,inst:skill,timer:delivery.persistent.respawnTime*owner.sheet.get('minionRespawnTime',tags,extra)});}
    }
  }
  dismiss(owner:A,skillId:string):void{
    const row=owner.summonToggles.get(skillId);if(!row)return;owner.summonToggles.delete(skillId);this.ports.clearReleaseFields(owner,row.inst);
    for(const body of this.ports.minionsOfSkill(owner,skillId)){this.release(body,false);this.ports.kill(body,true);}
    for(let n=this.queues.respawns.length-1;n>=0;n--){const r=this.queues.respawns[n];if(r.caster===owner&&r.inst.def.id===skillId)this.queues.respawns.splice(n,1);}
    for(let n=this.queues.summons.length-1;n>=0;n--){const r=this.queues.summons[n];if(r.caster===owner&&r.inst.def.id===skillId)this.queues.summons.splice(n,1);}
    owner.reservedMana=Math.max(0,owner.reservedMana-row.reserved);
  }
  dismissExclusive(owner:A,skill:I,d:D):void{
    if(!d.exclusiveGroup)return;
    for(const[id,row]of[...owner.summonToggles]){const other=this.ports.delivery(row.inst);if(id!==skill.def.id&&other?.exclusiveGroup===d.exclusiveGroup)this.dismiss(owner,id);}
    for(const body of this.ports.minions(owner)){
      if(!body.summonInst||body.summonInst.companionGrant||body.sourceSkillId===skill.def.id)continue;
      if(this.ports.delivery(body.summonInst)?.exclusiveGroup===d.exclusiveGroup){this.release(body,false);this.ports.kill(body,true);}
    }
    this.queues.respawns=this.queues.respawns.filter(row=>{const other=this.ports.delivery(row.inst);return row.caster!==owner||row.inst.def.id===skill.def.id||!other||other.exclusiveGroup!==d.exclusiveGroup;});
    this.queues.summons=this.queues.summons.filter(row=>{const other=this.ports.delivery(row.inst);return row.caster!==owner||row.inst.def.id===skill.def.id||!other||other.exclusiveGroup!==d.exclusiveGroup;});
  }
  advanceRespawns(dt:number):void{
    for(let n=this.queues.respawns.length-1;n>=0;n--){const row=this.queues.respawns[n];
      if(row.caster.dead){this.queues.respawns.splice(n,1);continue;}row.timer-=dt;
      if(row.timer<=0){const d=this.ports.delivery(row.inst);
        if(d?.persistent?.toggle&&!row.caster.summonToggles.has(row.inst.def.id)){this.queues.respawns.splice(n,1);continue;}
        const body=this.ports.spawn(row.caster,row.inst,{noReplace:true});
        if(body){this.queues.respawns.splice(n,1);this.ports.recovered(body,row.inst);}else row.timer=2;
      }
    }
  }
  advanceSummons(dt:number):void{
    const p=this.ports;
    for(let n=this.queues.summons.length-1;n>=0;n--){const row=this.queues.summons[n];
      if(row.caster.dead){this.queues.summons.splice(n,1);continue;}row.timer-=dt;if(row.timer>0)continue;row.timer=row.interval;
      if(row.costPer){if(!row.caster.canAfford(row.costPer)){p.dry(row.caster,row.inst.def.id);this.queues.summons.splice(n,1);continue;}p.pay(row.caster,row.inst,row.costPer);}
      let base=row.trackAim?(row.caster.aimPos??row.at):row.at;
      if(base&&row.range!==undefined&&dist(row.caster.pos,base)>row.range){const angle=angleTo(row.caster.pos,base);base={x:row.caster.pos.x+Math.cos(angle)*row.range,y:row.caster.pos.y+Math.sin(angle)*row.range};}
      const count=Math.min(row.batch??1,row.remaining);
      for(let k=0;k<count;k++){
        const scatter=row.scatter??60,pos=base?p.clamp({x:base.x+(-scatter+p.random()*(scatter*2)),y:base.y+(-scatter+p.random()*(scatter*2))},10):undefined;
        const d=p.delivery(row.inst),contract=row.caster.summonToggles.get(row.inst.def.id);
        if(d?.persistent?.toggle&&(!contract||p.minionsOfSkill(row.caster,row.inst.def.id).filter(body=>!body.summonOffspring).length>=(contract.slots??this.capacity(row.caster,row.inst,d))))break;
        p.spawn(row.caster,row.inst,{pos,dmgMult:row.mult,noReplace:!!d?.persistent?.toggle});
      }
      row.remaining-=count;if(row.remaining<=0)this.queues.summons.splice(n,1);
    }
  }
  reconcile():void{
    const p=this.ports;
    for(const owner of[...p.actors(),...p.homes()]){
      if(owner.dead||!owner.summonToggles.size)continue;
      for(const[id,row]of owner.summonToggles){const d=p.delivery(row.inst);if(!d?.persistent)continue;
        const tags=p.tags(row.inst,true),extra=p.modifiers(row.inst);let slots=this.slots(owner,row.inst,d);
        const unit=this.reservation(owner,row.inst,d),headroom=owner.maxMana()-(owner.reservedMana-row.reserved);
        if(unit*slots>headroom)slots=Math.max(0,Math.floor(headroom/Math.max(1,unit)));
        row.slots=slots;const want=unit*slots;
        if(Math.abs(want-row.reserved)>.01){owner.reservedMana=Math.max(0,owner.reservedMana-row.reserved+want);owner.mana=Math.min(owner.mana,owner.availableMaxMana());row.reserved=want;}
        if(row.inst.def.hivecall)continue;
        const bodies=p.minionsOfSkill(owner,id).filter(body=>!body.summonOffspring);while(bodies.length>slots)p.kill(bodies.pop()!,true);
        const alive=bodies.length;let room=Math.max(0,slots-alive);
        this.queues.summons=this.queues.summons.filter(s=>{if(s.caster!==owner||s.inst!==row.inst)return true;s.remaining=Math.min(s.remaining,room);room-=s.remaining;return s.remaining>0;});
        this.queues.respawns=this.queues.respawns.filter(r=>{if(r.caster!==owner||r.inst!==row.inst)return true;return room-->0;});
        let queued=0;for(const r of this.queues.respawns)if(r.caster===owner&&r.inst.def.id===id)queued++;
        for(const s of this.queues.summons)if(s.caster===owner&&s.inst.def.id===id)queued+=s.remaining;
        for(let n=slots-alive-queued;n>0;n--)this.queues.respawns.push({caster:owner,inst:row.inst,timer:d.persistent.respawnTime*owner.sheet.get('minionRespawnTime',tags,extra)});
      }
    }
  }
}
