export type AuraActivationStat='manaCost'|'durationAuraCap'|'auraEsRecharge'|'auraEsDelay'|'aoeShape'|'effectDuration'|'guardStrength';
export interface AuraActivationSkill<C> {def:{id:string;color:C}}
export interface AuraActivationSpec<M> {radius:number;allyMods?:M[];selfMods?:M[]}
export interface AuraActivationDelivery<F,C> {
 aura:F;mode:'toggle'|'duration';duration?:number;upkeep?:{reserveMana?:number};
 overdrive?:{lane:'mana'|'life'};ledger?:unknown;seal?:unknown;
 shellGuard?:{max:number;side?:'rear'|'front'|'all';arcDeg?:number;regenDelay?:number;regenRate?:number;color?:C;shellVisual?:string};
}
export interface AuraActivationState<S,F,M> {
 inst:S;spec:F;allyMods?:M[];radius:number;shape:number;remaining:number;
 lifeLane?:boolean;reserved:number;pulseTimer:number;affected:Set<number>;since?:number;ledger?:{balance:number};
}
export interface AuraActivationActor<S,F,M,C> {
 life:number;mana:number;reservedLife:number;reservedMana:number;lifeSealAt?:number;
 activeAuras:Map<string,AuraActivationState<S,F,M>>;
 overdrive:{mana?:{inst:S;debt:number;idle:number};life?:{inst:S;debt:number;idle:number}};
 shellGuard?:{side:'rear'|'front'|'all';arcDeg:number;max:number;pool:number;regenDelay:number;regenRate:number;lastHitAt:number;broken:boolean;color:C;shellVisual?:string;fromAura?:string};
}
export interface AuraActivationPorts<A,S,Q,M> {
 /** Capture tags and instance modifiers in their original order. */
 context(inst:S):Q;duration(inst:S):{seconds:number}|undefined;reserveLife(inst:S):boolean;
 stat(actor:A,key:AuraActivationStat,context:Q):number;
 maxLife(actor:A):number;maxMana(actor:A):number;lifeCeiling(actor:A):number;availableMaxMana(actor:A):number;
 laneBusy(actor:A,key:string):void;cannotSustain(actor:A):void;retire(actor:A,key:string):void;
 modifier(stat:'esRechargeRate'|'esRechargeDelay',value:number):M;
 time():number;setSource(actor:A,key:string,mods:M[]):void;
}
/** A synchronous activation command over borrowed content and actor state.
 * Hosts own support admission, stat queries, retirement and presentation.
 * Exceptions retain prior writes; this is not an atomic save transaction. */
export class AuraActivation<A extends AuraActivationActor<S,F,M,C>,S extends AuraActivationSkill<C>,F extends AuraActivationSpec<M>,M,C,Q> {
 constructor(private readonly p:AuraActivationPorts<A,S,Q,M>){}
 activate(actor:A,inst:S,delivery:AuraActivationDelivery<F,C>,aoeScale:number):void {
  if(actor.activeAuras.has(inst.def.id))return;
  if(delivery.overdrive&&actor.overdrive[delivery.overdrive.lane]){this.p.laneBusy(actor,inst.def.id+':lane');return;}
  const context=this.p.context(inst),asDuration=this.p.duration(inst),bloodPact=!asDuration&&this.p.reserveLife(inst);let reserved=0;
  if(delivery.mode==='toggle'&&delivery.upkeep?.reserveMana&&!asDuration){
   reserved=delivery.upkeep.reserveMana*this.p.stat(actor,'manaCost',context);
   if(bloodPact){
    if(actor.reservedLife+reserved>this.p.maxLife(actor)*.9){this.p.cannotSustain(actor);return;}
    actor.reservedLife+=reserved;actor.life=Math.min(actor.life,this.p.lifeCeiling(actor));
   }else{
    if(actor.reservedMana+reserved>this.p.maxMana(actor)){this.p.cannotSustain(actor);return;}
    actor.reservedMana+=reserved;actor.mana=Math.min(actor.mana,this.p.availableMaxMana(actor));
   }
  }
  if(asDuration){
   const cap=Math.max(1,Math.round(this.p.stat(actor,'durationAuraCap',context)));
   const burning=[...actor.activeAuras.entries()].filter(([,row])=>Number.isFinite(row.remaining));
   // Preserve the finite-row snapshot and insertion order without repeated shifts.
   for(let i=0;burning.length-i>=cap;i++)this.p.retire(actor,burning[i]![0]);
  }
  if(delivery.overdrive)actor.overdrive[delivery.overdrive.lane]={inst,debt:0,idle:0};
  let allyMods=delivery.aura.allyMods;
  const recharge=this.p.stat(actor,'auraEsRecharge',context),delay=this.p.stat(actor,'auraEsDelay',context);
  if(recharge>0||delay>0){allyMods=[...(allyMods??[])];if(recharge>0)allyMods.push(this.p.modifier('esRechargeRate',recharge));if(delay>0)allyMods.push(this.p.modifier('esRechargeDelay',-delay));}
  // Map.set reads the key before shape/duration/time callbacks build the row.
  actor.activeAuras.set(inst.def.id,{
   inst,spec:delivery.aura,allyMods,radius:delivery.aura.radius*aoeScale,shape:this.p.stat(actor,'aoeShape',context),
   remaining:asDuration?asDuration.seconds*this.p.stat(actor,'effectDuration',context):delivery.mode==='duration'?(delivery.duration??5)*this.p.stat(actor,'effectDuration',context):Infinity,
   lifeLane:bloodPact||undefined,reserved,pulseTimer:0,affected:new Set(),since:this.p.time(),ledger:delivery.ledger?{balance:0}:undefined,
  });
  if(delivery.seal)actor.lifeSealAt=Math.min(actor.lifeSealAt??Infinity,actor.life);
  if(delivery.aura.selfMods)this.p.setSource(actor,'auraself:'+inst.def.id,delivery.aura.selfMods);
  if(delivery.shellGuard){
   const s=delivery.shellGuard,strength=this.p.stat(actor,'guardStrength',context),max=s.max*strength;
   actor.shellGuard={side:s.side??'rear',arcDeg:s.arcDeg??180,max,pool:max,regenDelay:s.regenDelay??3,regenRate:s.regenRate??max/5,lastHitAt:-999,broken:false,color:s.color??inst.def.color,shellVisual:s.shellVisual,fromAura:inst.def.id};
  }
 }
}
