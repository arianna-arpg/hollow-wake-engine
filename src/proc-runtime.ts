import {finite} from './validation.js';
import {procConfiguration,type ProcActor,type ProcConfiguration,type ProcDefinition,type ProcRiderDefinition,type ProcSource,type ProcSkill,
  type ProcTrigger,type ProcTalentState,type ProcGainEvent,type ProcOwnEvent,type ProcHitEvent,type ProcPorts} from './proc-types.js';
export * from './proc-types.js';
export {ProcContent,BorrowedProcRegistry,type ProcContentPack,type BorrowedProcPorts} from './proc-content.js';

function includes<T>(filter:T|readonly T[],value:T):boolean {return Array.isArray(filter)?filter.includes(value):filter===value;}
/** Ordered proc decisions over borrowed actor clocks. Synchronous effects may
 * reenter at a deeper causal depth. Exceptions retain previous commits. */
export class ProcRuntime<A extends ProcActor,I extends ProcSkill,D extends ProcDefinition=ProcDefinition,
  R extends ProcRiderDefinition=ProcRiderDefinition,T extends ReadonlySet<string>=ReadonlySet<string>,E=unknown,Aim=unknown> {
  readonly #source:ProcSource<D,R>;readonly #ports:ProcPorts<A,I,D,R,T,E,Aim>;readonly #config:ProcConfiguration;
  constructor(source:ProcSource<D,R>,ports:ProcPorts<A,I,D,R,T,E,Aim>){
    this.#source=source;this.#config=procConfiguration(source.configuration);
    const bound={} as ProcPorts<A,I,D,R,T,E,Aim>;
    for(const key of ['time','random','stat','condition','armed','tags','extra','carryTags','carryCourt','victim','execute','castRider','bankStatus','lastGasp'] as const){
      const fn=ports[key];if(typeof fn!=='function')throw new Error('Missing proc '+key+' port');
      Object.defineProperty(bound,key,{value:fn.bind(ports),enumerable:true});
    }
    this.#ports=Object.freeze(bound);
    // A derived constructor has not initialized its fields yet. Freezing here
    // also rejects private fields in hosts implementing nonextensible private
    // elements. Derived classes own freezing after their initialization.
    if(new.target===ProcRuntime)Object.freeze(this);
  }
  #roll(chance:number):boolean {
    const value=finite(this.#ports.random(),'Proc random sample');if(value<0||value>=1)throw new Error('Proc random sample must be in [0, 1)');return value<chance;
  }
  ready(actor:A,proc:D):boolean {
    if(!proc.icd)return true;const p=this.#ports;
    if(p.time()<(actor.procReadyAt.get(proc.id)??0))return false;
    actor.procReadyAt.set(proc.id,p.time()+proc.icd);return true;
  }
  gates(actor:A,proc:D,inst:I|null):boolean {
    const p=this.#ports;
    if(proc.skills&&(!inst||!proc.skills.includes(inst.def.id)))return false;
    if(proc.when&&!p.condition(actor,proc.when))return false;
    if(proc.unless&&p.condition(actor,proc.unless))return false;
    if(proc.requireBuff!==undefined){
      const filter=proc.requireBuff;let found=false;
      if(typeof filter==='string')found=actor.buffs.has(filter);else for(const id of filter)if(actor.buffs.has(id)){found=true;break;}
      if(!found)return false;
    }
    if(proc.requireStatus!==undefined&&!actor.statuses.some(st=>st.stacks>0&&includes(proc.requireStatus!,st.id)))return false;
    if(proc.tags){if(!inst)return false;for(const tag of proc.tags)if(!p.tags(inst).has(tag))return false;}
    if(proc.oncePerCast){if(actor.procFiredAt.get(proc.id)===p.time())return false;actor.procFiredAt.set(proc.id,p.time());}
    return true;
  }
  depthAllowed(actor:A):number {return 1+Math.min(this.#config.maxExtraDepth,Math.floor(this.#ports.stat(actor,'procDepth')));}
  rollTop(actor:A,fraction:number,roll:number|undefined,tags?:T,extra?:readonly E[]):boolean {
    if(roll===undefined)return false;return roll>=1-(fraction+this.#ports.stat(actor,'highRollWindow',tags,extra));
  }
  chance(actor:A,proc:D,depth:number,tags?:T,extra?:readonly E[]):number {
    const p=this.#ports;let value=p.stat(actor,'proc_'+proc.id,tags,extra);if(value<=0)return 0;
    if(proc.ppm){const mean=60/proc.ppm,last=actor.procAttemptAt.get(proc.id);
      const dt=Math.min(mean*this.#config.ppmCatchup,last===undefined?mean:p.time()-last);
      actor.procAttemptAt.set(proc.id,p.time());value=value*proc.ppm*dt/60;
    }
    value*=1+p.stat(actor,'luck',tags,extra);if(depth>0)value*=Math.pow(this.#config.depthFalloff,depth);return Math.min(.95,value);
  }
  own(actor:A,trigger:ProcTrigger,event?:ProcOwnEvent<A,I,T,E,Aim>):void {
    if(actor.dead)return;const p=this.#ports,s=this.#source,want=s.triggerIds(trigger);if(!want?.size)return;
    let armed=false;for(const id of p.armed(actor,s.allIds(),event?.extra))if(want.has(id)){armed=true;break;}if(!armed)return;
    const depth=event?.depth??0;if(depth>=this.depthAllowed(actor))return;
    for(const proc of s.candidates(trigger)){
      if(proc.trigger!==trigger)continue;
      if(proc.bracket!==undefined&&(event?.bracket===undefined||!includes(proc.bracket,event.bracket)))continue;
      if(proc.condition!==undefined&&proc.condition!==event?.condition)continue;
      if(proc.receivedTypes&&!proc.receivedTypes.some(type=>(event?.receivedAmounts?.[type]??0)>0))continue;
      if(proc.crit&&!event?.crit||proc.noCrit&&event?.crit)continue;
      if(proc.vs&&(!event?.target||!p.victim(proc.vs,event.target,actor)))continue;
      if(!this.gates(actor,proc,event?.inst??null))continue;
      const chance=this.chance(actor,proc,depth,event?.tags,event?.extra);
      if(chance<=0||!this.#roll(chance)||!this.ready(actor,proc))continue;
      p.execute(proc,actor,event?.inst??null,event?.target??null,depth,event?.aim);
    }
  }
  gain(actor:A,event:ProcGainEvent):void {
    if(actor.dead||event.depth>=this.depthAllowed(actor))return;
    if(event.kind!=='charge'&&event.kind!=='buff'&&event.kind!=='orb')return;
    const trigger=event.kind==='charge'?'chargeGain':event.kind==='buff'?'buffGain':'orbPickup';
    for(const proc of this.#source.candidates(trigger)){
      if(proc.trigger!==trigger)continue;const filter=event.kind==='charge'?proc.charge:event.kind==='buff'?proc.buff:proc.orb;
      if(filter!==undefined&&!includes(filter,event.id)||!this.gates(actor,proc,null))continue;
      const chance=this.chance(actor,proc,event.depth);if(chance<=0||!this.#roll(chance)||!this.ready(actor,proc))continue;
      this.#ports.execute(proc,actor,null,null,event.depth);
    }
  }
  status(actor:A,inst:I,target:A,status:string,tags:T,extra:readonly E[],depth:number):void {
    this.#ports.bankStatus(actor,inst,target,status);if(depth>=this.depthAllowed(actor))return;
    for(const proc of this.#source.candidates('statusApply')){
      if(proc.trigger!=='statusApply'||proc.status!==undefined&&!includes(proc.status,status)||!this.gates(actor,proc,inst))continue;
      const chance=this.chance(actor,proc,depth,tags,extra);if(chance<=0||!this.#roll(chance)||!this.ready(actor,proc))continue;
      this.#ports.execute(proc,actor,inst,target,depth);
    }
  }
  collision(actor:A,inst:I,target:A):void {
    if(target.dead)return;const p=this.#ports,tags=p.tags(inst),extra=p.extra(inst);
    for(const proc of this.#source.candidates('collision')){
      if(proc.trigger!=='collision'||!this.gates(actor,proc,inst))continue;
      const chance=this.chance(actor,proc,0,tags,extra);if(chance<=0||!this.#roll(chance)||!this.ready(actor,proc))continue;
      p.execute(proc,actor,inst,target,0);
    }
  }
  surface(actor:A):void {
    for(const proc of this.#source.candidates('surface')){
      if(proc.trigger!=='surface'||!this.gates(actor,proc,null))continue;
      const chance=this.chance(actor,proc,0);if(chance<=0||!this.#roll(chance)||!this.ready(actor,proc))continue;
      this.#ports.execute(proc,actor,null,null,0);
    }
  }
  #hitRows(actor:A,inst:I,target:A,event:ProcHitEvent<T,E>,tags:T|undefined,extra:readonly E[]|undefined,eliteFactor:number,court:number|undefined):void {
    for(const proc of this.#source.hitCandidates()){
      if(court!==undefined&&!proc.minionCarry)continue;
      if(proc.trigger!=='hit'&&proc.trigger!=='kill')continue;
      if(proc.crit&&!event.crit||proc.noCrit&&event.crit)continue;
      if(proc.hitType&&proc.hitType!==event.dominantType)continue;
      if(proc.vs&&!this.#ports.victim(proc.vs,target,actor))continue;
      if(proc.rollTop!==undefined&&!this.rollTop(actor,proc.rollTop,event.rollT,tags,extra)||!this.gates(actor,proc,inst))continue;
      let chance=this.chance(actor,proc,event.depth,tags,extra);
      if(proc.trigger==='kill'&&!event.lethal){if(eliteFactor<=0)continue;chance*=eliteFactor;}
      if(court!==undefined&&!proc.ppm&&proc.icd===undefined&&!(proc.trigger==='kill'&&event.lethal))chance/=court;
      if(chance<=0||!this.#roll(chance)||!this.ready(actor,proc))continue;
      this.#ports.execute(proc,actor,inst,target,event.depth);
    }
  }
  hit(actor:A,inst:I,target:A,event:ProcHitEvent<T,E>):void {
    if(!(event.dealt>0)||event.depth>=this.depthAllowed(actor))return;
    const eliteFactor=event.elite?this.#ports.stat(actor,'killProcOnHit',event.tags,event.extra):0;
    this.#hitRows(actor,inst,target,event,event.tags,event.extra,eliteFactor,undefined);
  }
  /** Host supplies the resolved minion owner and summoning instance. Returns
   * entry eligibility so host kill rewards can follow without another depth read. */
  carry(owner:A,inst:I,target:A,event:ProcHitEvent<T,E>):boolean {
    if(!(event.dealt>0)||owner.dead||event.depth>=this.depthAllowed(owner))return false;
    const p=this.#ports,tags=p.carryTags(inst),extra=p.extra(inst);
    const eliteFactor=event.elite?p.stat(owner,'killProcOnHit',tags,extra):0;
    const court=Math.max(1,p.carryCourt(owner,inst));this.#hitRows(owner,inst,target,event,tags,extra,eliteFactor,court);return true;
  }
  pulses(actor:A):void {
    const s=this.#source,p=this.#ports,want=s.triggerIds('pulse');if(!want?.size)return;
    for(const id of p.armed(actor,s.allIds())){
      if(!want.has(id))continue;const proc=s.definition(id);if(!proc)throw new Error('Incoherent proc registry: '+id);
      const every=proc.every??0;if(every<=0||p.time()<(actor.procReadyAt.get(proc.id)??0))continue;
      actor.procReadyAt.set(proc.id,p.time()+every);if(!this.gates(actor,proc,null))continue;
      const chance=this.chance(actor,proc,0);if(chance<=0||!this.#roll(chance))continue;p.execute(proc,actor,null,null,0);
    }
  }
  /** Returns whether the actor entered alive; later death does not cancel the
   * host's following gauge phase. Exceptions still stop the caller. */
  talents(actor:A&ProcTalentState):boolean {
    if(actor.dead){if(actor.condRose.length)actor.condRose.length=0;actor.healedSince=0;actor.gasped=false;return false;}
    if(actor.condRose.length){const rose=actor.condRose;actor.condRose=[];for(const condition of rose)this.own(actor,'condition',{condition});}
    if(actor.healedSince>0){actor.healedSince=0;this.own(actor,'heal');}
    if(actor.gasped){actor.gasped=false;this.#ports.lastGasp(actor);this.own(actor,'lastGasp');}
    this.pulses(actor);return true;
  }
  riders(proc:D,actor:A,inst:I|null,target:A|null,depth:number):void {
    const riders=this.#source.riders();if(!riders.length||actor.dead)return;const p=this.#ports,tags=inst?p.tags(inst):undefined,extra=inst?p.extra(inst):undefined;
    for(const rider of riders){
      if(!includes(rider.proc,proc.id))continue;let chance=p.stat(actor,'procRider_'+rider.id,tags,extra);if(chance<=0)continue;
      chance*=1+p.stat(actor,'luck',tags,extra);if(!this.#roll(Math.min(.95,chance)))continue;p.castRider(actor,inst,target,depth+1,rider.cast);
    }
  }
}
