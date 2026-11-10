export interface AuraRetirementPayload {skillId:string;scalePerSec?:number;maxScale?:number;missingLifeScale?:number}
export interface AuraRetirementDelivery<L> {type:string;seal?:unknown;onDeactivate?:AuraRetirementPayload;ledger?:L;overdrive?:{lane:'mana'|'life'}}
export interface AuraRetirementDefinition<L> {id:string;delivery:AuraRetirementDelivery<L>}
export interface AuraRetirementSkill<D> {def:D}
export interface AuraRetirementState<S> {inst:S;affected:ReadonlySet<number>;reserved:number;lifeLane?:boolean;since?:number;ledger?:{balance:number}}
export interface AuraRetirementActor<S,U> {
 id:number;dead:boolean;life:number;reservedMana:number;reservedLife:number;lifeSealAt?:number;
 skills:(S|null)[];activeAuras:Map<string,U>;
 shellGuard?:{fromAura?:string;broken:boolean;pool:number};
 overdrive:{mana?:{inst:S;debt:number};life?:{inst:S;debt:number}};
}
export interface AuraRetirementPorts<A,D,S,B,L> {
 actors():readonly A[];removeSource(actor:A,key:string):void;
 bashSpec(inst:S):B|undefined;bash(actor:A,inst:S,spec:B,pool:number):void;
 time():number;maxLife(actor:A):number;skill(id:string):D|undefined;
 level(inst:S):number;makeSkill(def:D,level:number):S;
 /** Dispatch at the current bearer location without cooldown or repeat ownership. */
 payload(actor:A,inst:S,multiplier:number):void;
 settleLedger(actor:A,spec:L,state:{balance:number}):void;
}
/** Ordered immediate retirement over borrowed live or fully detached state.
 * Host effects are synchronous. A failure retains all preceding writes.
 * This service does not acquire bodies, clone worlds, or defer an effect plan. */
export class AuraRetirement<A extends AuraRetirementActor<S,U>,D extends AuraRetirementDefinition<L>,S extends AuraRetirementSkill<D>,U extends AuraRetirementState<S>,B,L> {
 constructor(private readonly p:AuraRetirementPorts<A,D,S,B,L>){}
 retire(bearer:A,skillId:string,quietTreeRelease=false):void {
  const aura=bearer.activeAuras.get(skillId);if(!aura)return;
  if(bearer.shellGuard?.fromAura===skillId){
   const pool=bearer.shellGuard.broken?0:bearer.shellGuard.pool;bearer.shellGuard=undefined;
   const inst=bearer.skills.find(k=>k?.def.id===skillId),bash=inst?this.p.bashSpec(inst):undefined;
   if(inst&&bash&&pool>0&&!quietTreeRelease)this.p.bash(bearer,inst,bash,pool);
  }
  const sourceName='aura:'+skillId+':'+bearer.id;
  for(const actor of this.p.actors())if(aura.affected.has(actor.id))this.p.removeSource(actor,sourceName);
  if(aura.reserved>0){
   if(aura.lifeLane)bearer.reservedLife=Math.max(0,bearer.reservedLife-aura.reserved);
   else bearer.reservedMana=Math.max(0,bearer.reservedMana-aura.reserved);
  }
  {
   const delivery=aura.inst.def.delivery;
   if(delivery.type==='aura'){
    this.p.removeSource(bearer,'auraself:'+skillId);
    if(delivery.seal){
     const otherSeal=[...bearer.activeAuras.values()].some(other=>{const d=other.inst.def.delivery;return other.inst.def.id!==skillId&&d.type==='aura'&&!!d.seal;});
     if(!otherSeal)bearer.lifeSealAt=undefined;this.p.removeSource(bearer,'seal:'+skillId);
    }
    const effect=delivery.onDeactivate;
    if(effect&&!quietTreeRelease&&!bearer.dead&&this.p.skill(effect.skillId)){
     const held=this.p.time()-(aura.since??this.p.time()),missing=1-bearer.life/Math.max(1,this.p.maxLife(bearer));
     const mult=Math.min(effect.maxScale??5,1+(effect.scalePerSec??0)*held)*(1+(effect.missingLifeScale??0)*missing);
     const inst=this.p.makeSkill(this.p.skill(effect.skillId)!,this.p.level(aura.inst));this.p.payload(bearer,inst,mult);
    }
    if(delivery.ledger&&aura.ledger&&!bearer.dead)this.p.settleLedger(bearer,delivery.ledger,aura.ledger);
   }
  }
  const delivery=aura.inst.def.delivery;
  if(delivery.type==='aura'&&delivery.overdrive){
   const debt=bearer.overdrive[delivery.overdrive.lane];
   if(debt&&debt.inst.def.id===skillId){
    if(delivery.overdrive.lane==='mana')bearer.reservedMana=Math.max(0,bearer.reservedMana-debt.debt);
    else bearer.reservedLife=Math.max(0,bearer.reservedLife-debt.debt);
    delete bearer.overdrive[delivery.overdrive.lane];
   }
  }
  bearer.activeAuras.delete(skillId);
 }
}
