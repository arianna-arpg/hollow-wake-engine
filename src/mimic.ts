export interface MimicEntry {sid:string;src:string;at:number}
export interface MimicDefinition {
  readonly id:string;readonly mimic?:{readonly powerFactor?:number};readonly invokes?:unknown;readonly throng?:unknown;
  readonly delivery:{readonly type:string;readonly grimoire?:unknown};readonly mimicable?:boolean;
  readonly tags:readonly string[];readonly effects:readonly {readonly type:string}[];
}
export interface MimicSkill<D>{readonly def:D}
export interface MimicActor<I,Tags,M>{
  readonly skills:readonly (I|null|undefined)[];
  readonly sheet:{get(stat:string,tags:Tags,extra:readonly M[]):number};
  mimicBank:MimicEntry[]|null;mimicSel:string|null;mimicWatch:boolean;mimicWatchAt:number;mimicWitnessR:number;
}
export interface MimicRules {
  readonly studyGroup:string;readonly bankSize:number;readonly expirySec:number;readonly powerFactor:number;
  readonly witnessRadius:number;readonly watchRefresh:number;readonly denyTags:readonly string[];
  readonly denyDeliveries:readonly string[];readonly denyEffects:readonly string[];
}
export interface MimicPorts<A,I,D,Tags,M>{
  tags(definition:D):Tags;
  modifiers(skill:I):readonly M[];
  /** Host-authorized knowledge projection. A bestiary, account and campaign
   * ledger are optional ways of answering this question, never dependencies. */
  studied(actor:A,monsterId:string,group:string):boolean;
  monsterExists(id:string):boolean;
}

/** Combat-transient captured arts. One service per immutable content revision;
 * the policy cache is instance-owned and never retains actors or account data. */
export class Mimic<A extends MimicActor<I,Tags,M>,I extends MimicSkill<D>,D extends MimicDefinition,Tags,M>{
  readonly #allowed=new WeakMap<D,boolean>();
  constructor(readonly rules:MimicRules,readonly ports:MimicPorts<A,I,D,Tags,M>){}
  allowed(definition:D):boolean{
    const cached=this.#allowed.get(definition);if(cached!==undefined)return cached;
    const structural=!!definition.mimic||!!definition.invokes||!!definition.throng
      ||definition.delivery.type==='summon'&&!!definition.delivery.grimoire;
    const allowed=!structural&&(definition.mimicable??(!definition.tags.some(tag=>this.rules.denyTags.includes(tag))
      &&!this.rules.denyDeliveries.includes(definition.delivery.type)&&!definition.effects.some(effect=>this.rules.denyEffects.includes(effect.type))));
    this.#allowed.set(definition,allowed);return allowed;
  }
  refresh(actor:A,time:number):void{
    if(time-actor.mimicWatchAt<this.rules.watchRefresh&&actor.mimicWatchAt!==0)return;
    actor.mimicWatchAt=time;
    let slot:I|undefined;
    for(const skill of actor.skills)if(skill?.def.mimic){slot=skill;break;}
    actor.mimicWatch=!!slot;
    if(slot){
      const witness=actor.sheet.get('mimicWitness',this.ports.tags(slot.def),this.ports.modifiers(slot));
      actor.mimicWitnessR=witness>0?witness*this.rules.witnessRadius:0;
    }else{
      actor.mimicWitnessR=0;if(actor.mimicBank){actor.mimicBank=null;actor.mimicSel=null;}
    }
  }
  capacity(actor:A):number{
    let extra=0;
    for(const skill of actor.skills)if(skill?.def.mimic){extra=actor.sheet.get('mimicBank',this.ports.tags(skill.def),this.ports.modifiers(skill));break;}
    return Math.max(1,Math.round(this.rules.bankSize+extra));
  }
  entries(actor:A,time:number):MimicEntry[]{
    const bank=actor.mimicBank;if(!bank)return [];
    if(this.rules.expirySec>0){
      for(let i=bank.length-1;i>=0;i--)if(time-bank[i].at>this.rules.expirySec)bank.splice(i,1);
      if(actor.mimicSel&&!bank.some(entry=>entry.sid===actor.mimicSel))actor.mimicSel=null;
    }
    return bank;
  }
  selected(actor:A,time:number):MimicEntry|null{
    const live=this.entries(actor,time);if(!live.length)return null;
    const selected=actor.mimicSel?live.find(entry=>entry.sid===actor.mimicSel):undefined;
    if(selected)return selected;
    const newest=live[live.length-1];actor.mimicSel=newest.sid;return newest;
  }
  select(actor:A,time:number,pick:string|number):MimicEntry|null{
    const live=this.entries(actor,time);if(!live.length)return null;
    if(typeof pick==='string'){
      const entry=live.find(value=>value.sid===pick);if(entry)actor.mimicSel=entry.sid;
      return entry??this.selected(actor,time);
    }
    const current=this.selected(actor,time),index=current?live.findIndex(entry=>entry.sid===current.sid):-1;
    const next=live[((index+pick)%live.length+live.length)%live.length];actor.mimicSel=next.sid;return next;
  }
  capture(actor:A,source:{readonly defId?:string},definition:D,time:number):boolean{
    if(!this.allowed(definition))return false;
    const kind=source.defId;if(!kind||!this.ports.monsterExists(kind)||!this.ports.studied(actor,kind,this.rules.studyGroup))return false;
    const bank=actor.mimicBank??=[],known=bank.find(entry=>entry.sid===definition.id);
    if(known){known.at=time;known.src=kind;return false;}
    const cap=this.capacity(actor);
    while(bank.length>=cap){const index=bank.findIndex(entry=>entry.sid!==actor.mimicSel);bank.splice(index>=0?index:0,1);}
    bank.push({sid:definition.id,src:kind,at:time});if(!actor.mimicSel)actor.mimicSel=definition.id;return true;
  }
  power(spec?:{readonly powerFactor?:number}):{stat:'damage';kind:'more';value:number}[]{
    const factor=spec?.powerFactor??this.rules.powerFactor;return factor===1?[]:[{stat:'damage',kind:'more',value:factor-1}];
  }
}
