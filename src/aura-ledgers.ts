export interface AuraLedgerBalance {balance:number}
export interface AuraLedgerSpec<D extends string=string> {
 source:'damageTaken'|'manaRegen';rate:number;
 cap?:{flat?:number;maxLifePct?:number;maxManaPct?:number};
 upkeep?:{base?:number;perPoint:number};lapse:'landDamage'|'ventMana'|'none';
 ventDamage?:{perPoint:number;radius:number;damageType?:D};ventBelowMana?:number;
}
export interface AuraLedgerEntry<L> {inst:{def:{delivery:{type:string;ledger?:L}}};ledger?:AuraLedgerBalance}
export interface AuraLedgerBank<L> {activeAuras:ReadonlyMap<string,AuraLedgerEntry<L>>;ledgerCap(spec:L):number}
export interface AuraLedgerActor<L> {life:number;mana:number;dead:boolean;activeAuras:ReadonlyMap<string,AuraLedgerEntry<L>>}
/** Pool reads remain live even when a present cap has zero coefficients. */
export function auraLedgerCapacity(actor:{maxLife():number;maxMana():number},spec:Pick<AuraLedgerSpec,'cap'>):number {
 if(!spec.cap)return Infinity;
 return(spec.cap.flat??0)+(spec.cap.maxLifePct??0)*actor.maxLife()+(spec.cap.maxManaPct??0)*actor.maxMana();
}
/** Returns the remaining rate; callers own living/standing admission and time.
 * Suppression applies to the skim, including overflow beyond the ledger cap. */
export function bankAuraManaRegeneration<L extends AuraLedgerSpec>(actor:AuraLedgerBank<L>,rate:number,dt:number):number {
 if(rate>0){
  for(const aura of actor.activeAuras.values()){
   const delivery=aura.inst.def.delivery,ledger=delivery.type==='aura'?delivery.ledger:undefined;
   if(!ledger||ledger.source!=='manaRegen'||!aura.ledger)continue;
   const skim=rate*Math.min(1,ledger.rate),room=actor.ledgerCap(ledger)-aura.ledger.balance;
   const banked=Math.max(0,Math.min(skim*dt,room));aura.ledger.balance+=banked;rate-=skim;
  }
 }
 return rate;
}
export interface AuraLedgerPorts<A,L,D,C> {
 availableMaxMana(actor:A):number;
 insufficient(actor:A):void;retire(actor:A,skillId:string):void;
 /** Retains host observation/dispatch of settlement from upkeep. */
 settle(actor:A,spec:L,state:AuraLedgerBalance):void;
 /** Sets the raw-wound cue and announces the debit before the death recheck. */
 arrears(actor:A,due:number):void;kill(actor:A):void;
 damageColor(type:D):C;
 /** Reads current position/team/tier and completes the actual burst. */
 burst(actor:A,radius:number,amount:number,type:D,color:C):void;
 /** Reads current position after the burst and publishes its ledger cue. */
 ventCue(actor:A,radius:number,color:C):void;reclaimed(actor:A,due:number):void;
}
/** Command/tick policies over borrowed state. Live Map iteration is intentional.
 * Host callbacks are synchronous; exceptions retain preceding mutations. */
export class AuraLedgers<A extends AuraLedgerActor<L>,L extends AuraLedgerSpec<D>,D extends string,C> {
 constructor(private readonly p:AuraLedgerPorts<A,L,D,C>,private readonly defaultDamageType:D){}
 update(actor:A,dt:number):void {
  if(!actor.activeAuras.size)return;
  for(const[skillId,aura]of actor.activeAuras){
   const delivery=aura.inst.def.delivery,ledger=delivery.type==='aura'?delivery.ledger:undefined;
   if(!ledger||!aura.ledger)continue;
   if(ledger.upkeep&&aura.ledger.balance>0){
    const bill=((ledger.upkeep.base??0)+ledger.upkeep.perPoint*aura.ledger.balance)*dt;
    if(actor.mana<bill){this.p.insufficient(actor);this.p.retire(actor,skillId);continue;}
    actor.mana-=bill;
   }
   if(ledger.ventBelowMana!==undefined&&ledger.lapse==='ventMana'&&aura.ledger.balance>=1&&actor.mana<ledger.ventBelowMana*this.p.availableMaxMana(actor))this.p.settle(actor,ledger,aura.ledger);
  }
 }
 settle(actor:A,spec:L,state:AuraLedgerBalance):void {
  const due=state.balance;state.balance=0;if(due<.5||actor.dead)return;
  if(spec.lapse==='landDamage'){
   actor.life-=due;this.p.arrears(actor,due);if(actor.life<=0&&!actor.dead)this.p.kill(actor);
  }else if(spec.lapse==='ventMana'){
   actor.mana=Math.min(this.p.availableMaxMana(actor),actor.mana+due);
   const vent=spec.ventDamage;if(vent){
    const color=this.p.damageColor(vent.damageType??this.defaultDamageType);
    this.p.burst(actor,vent.radius,due*vent.perPoint,vent.damageType??this.defaultDamageType,color);
    this.p.ventCue(actor,vent.radius,color);
   }
   this.p.reclaimed(actor,due);
  }
 }
}
