import {finite} from './validation.js';
import {gaugeTick,type GaugeInstance,type GaugeSpec,type GaugeTerms} from './resource-gauges.js';

export interface ChargeModifier {value:number}
export interface ChargeDefinition<M extends ChargeModifier=ChargeModifier> {
  label:string;color:string;perCharge?:readonly M[];modsWhileDraining?:true;
  decay?:{perSec:number;delay?:number};baseCap?:number;regen?:number;regenNeedsSpender?:true;hud?:'slot';
}
export interface ChargeTap {
  charge:string;amount:number;max:number;on:string;perDistance?:number;everySeconds?:number;whileToggled?:boolean;
}
export interface ChargeCost {charge:string;amount:number|'all';minimum?:number;damagePerCharge?:number;projectilesPerCharge?:number;repeatsPerCharge?:number;optional?:boolean}
export interface ChargePayment {mult:number;consumed:number}
function validateCost(cost:ChargeCost):void{
  id(cost.charge);if(cost.amount!=='all')nonnegative(cost.amount,'Skill charge cost');
  if(cost.minimum!==undefined)nonnegative(cost.minimum,'Skill charge minimum');
  if(cost.damagePerCharge!==undefined)finite(cost.damagePerCharge,'Damage per charge');
}
export function chargeCostReady(have:number,cost:ChargeCost|undefined):boolean{
  if(!cost)return true;validateCost(cost);finite(have,'Held skill charges');if(cost.optional)return true;
  const need=cost.amount==='all'?(cost.minimum??1):Math.max(cost.amount,cost.minimum??0);return have>=need;
}
/** A payment quote, not a gate. Fractional legacy overdraw may yield a negative
 * consumed amount; applying that receipt clears the negative bank to zero. */
export function chargePayment(have:number,cost:ChargeCost|undefined):ChargePayment{
  if(!cost)return {mult:1,consumed:0};validateCost(cost);finite(have,'Held skill charges');
  const consumed=cost.amount==='all'?have:Math.min(have,cost.amount);
  return {mult:cost.damagePerCharge&&consumed>0?finite(1+cost.damagePerCharge*consumed,'Charge damage multiplier'):1,consumed};
}
export interface ChargeSkill extends GaugeInstance {def:{id:string;chargeGain?:readonly ChargeTap[];gauge?:GaugeSpec}}
export interface ChargeClock {idle:number;acc:number;tick:number;drain?:number}
export interface ChargeState {charges:Map<string,number>;clocks:Map<string,ChargeClock>;modifierCounts:Map<string,number>}
export function createChargeState():ChargeState{return {charges:new Map(),clocks:new Map(),modifierCounts:new Map()};}

/** Observations are borrowed and coherent during each synchronous operation.
 * Reads must be pure; sinks must not throw, mutate rule/state inputs or reenter.
 * The host keeps event delivery, skill resolution and world timing authority. */
export interface ChargePorts<I extends ChargeSkill,M extends ChargeModifier> {
  definition(id:string):ChargeDefinition<M>|undefined;
  definitions():Iterable<readonly [string,ChargeDefinition<M>]>;
  capacityBonus(inst:I|undefined):number;chargeCapacityBonus(id:string):number;regenerationBonus(id:string):number;
  skills():readonly (I|null)[];taps(inst:I):readonly ChargeTap[];
  socketTaps(inst:I):readonly {def:{chargeGain?:readonly ChargeTap[]}}[];
  spentCharge(inst:I):string|undefined;toggled(inst:I):boolean;channelSkillId():string|undefined;
  gaugeTerms(inst:I):GaugeTerms;walked():number;clearWalked():void;
  gainEventCount():number;emitGainEvent(id:string,amount:number,inst:I|undefined,depth:number):void;
  setSource(id:string,mods:M[]):void;removeSource(id:string):void;
}

function id(value:string):void{
  if(typeof value!=='string'||!value||value.length>256||value==='__regen'||value.includes(':'))throw new Error('Charge identifiers must be nonempty, at most 256 characters and outside clock namespaces');
}
function nonnegative(value:number,name:string):number{if(finite(value,name)<0)throw new Error(`${name} must be nonnegative`);return value;}
const clock=():ChargeClock=>({idle:0,acc:0,tick:0});

/** Hollow Wake's explicit frame policy, including retained regeneration debt.
 * State is supplied (and not copied) so hosts may retain their existing maps.
 * An update is an ordered sequence of phase commits, not an atomic transaction.
 * Invalid borrowed data or a meter exceeding 65,536 iterations aborts at that
 * meter; earlier phases remain committed. Validate authored inputs on ingress.
 * Invalid public numeric arguments fail before any state write. */
export class ChargeRuntime<I extends ChargeSkill,M extends ChargeModifier=ChargeModifier> {
  readonly state:ChargeState;
  readonly #ports:ChargePorts<I,M>;
  readonly #treeKeys=new Set<string>();
  #busy=false;
  constructor(state:ChargeState,ports:ChargePorts<I,M>){
    if(!(state?.charges instanceof Map)||!(state.clocks instanceof Map)||!(state.modifierCounts instanceof Map))throw new Error('Charge state requires three maps');
    if(state.charges===state.modifierCounts||(state.clocks as unknown)===state.charges||(state.clocks as unknown)===state.modifierCounts)throw new Error('Charge state maps must be distinct');
    this.state=state;const bound={} as ChargePorts<I,M>;
    for(const key of ['definition','definitions','capacityBonus','chargeCapacityBonus','regenerationBonus','skills','taps','socketTaps','spentCharge','toggled','channelSkillId','gaugeTerms','walked','clearWalked','gainEventCount','emitGainEvent','setSource','removeSource'] as const){
      const fn=ports[key];if(typeof fn!=='function')throw new Error(`Charge ${key} port is required`);
      Object.defineProperty(bound,key,{value:fn.bind(ports),enumerable:true});
    }
    this.#ports=bound;
  }
  #enter():void{if(this.#busy)throw new Error('Reentrant charge operation');this.#busy=true;}
  #capacity(charge:string,max:number,inst:I|undefined):number{
    const p=this.#ports;return Math.max(0,Math.round(finite(max+finite(p.capacityBonus(inst),'Skill charge capacity')+finite(p.chargeCapacityBonus(charge),'Named charge capacity'),'Combined charge capacity')));
  }
  capFor(charge:string,inst?:I):number{
    id(charge);let base=0;
    if(inst)for(const tap of this.#ports.taps(inst))if(tap.charge===charge)base=Math.max(base,finite(tap.max,'Charge tap capacity'));
    if(base<=0)base=finite(this.#ports.definition(charge)?.baseCap??0,'Base charge capacity');
    return this.#capacity(charge,base,inst);
  }
  isDraining(charge:string):boolean{return this.state.clocks.get(charge)?.drain!==undefined;}
  spendsCharge(charge:string):boolean{
    for(const inst of this.#ports.skills())if(inst&&this.#ports.spentCharge(inst)===charge)return true;return false;
  }
  gain(charge:string,amount:number,max:number,inst?:I,depth=0):void{
    id(charge);finite(amount,'Charge gain');finite(max,'Charge maximum');nonnegative(depth,'Charge chain depth');
    this.#enter();try{this.#gain(charge,amount,max,inst,depth);}finally{this.#busy=false;}
  }
  #gain(charge:string,amount:number,max:number,inst:I|undefined,depth:number):void{
    const {charges,clocks}=this.state,p=this.#ports,st=clocks.get(charge);if(st?.drain!==undefined)return;
    const cap=this.#capacity(charge,max,inst),cur=finite(charges.get(charge)??0,'Charge count');
    const next=Math.min(cap,finite(cur+amount,'Charge gain sum'));
    charges.set(charge,next);const state=st??clock();
    if(next>cur){state.idle=0;if(p.gainEventCount()<64)p.emitGainEvent(charge,next-cur,inst,depth);}
    clocks.set(charge,state);this.#sync(charge);
  }
  spend(charge:string,amount:number):void{
    id(charge);finite(amount,'Charge spend');this.#enter();
    try{const charges=this.state.charges,next=Math.max(0,finite((charges.get(charge)??0)-amount,'Charge remainder'));charges.set(charge,next);this.#sync(charge);}finally{this.#busy=false;}
  }
  pay(cost:ChargeCost|undefined):ChargePayment{
    if(!cost)return {mult:1,consumed:0};
    const receipt=chargePayment(this.state.charges.get(cost.charge)??0,cost);this.spend(cost.charge,receipt.consumed);return receipt;
  }
  startDrain(charge:string,perSec:number):void{
    id(charge);nonnegative(perSec,'Charge drain');this.#enter();
    try{const state=this.state.clocks.get(charge)??clock();state.drain=perSec;this.state.clocks.set(charge,state);}finally{this.#busy=false;}
  }
  syncModifiers(charge:string):void{id(charge);this.#enter();try{this.#sync(charge);}finally{this.#busy=false;}}
  #sync(charge:string):void{
    const p=this.#ports,def=p.definition(charge),per=def?.perCharge;if(!per)return;
    const count=def.modsWhileDraining&&!this.isDraining(charge)?0:finite(this.state.charges.get(charge)??0,'Charge modifier count');
    if(this.state.modifierCounts.get(charge)===count)return;
    const mods=count<=0?undefined:per.map(m=>({...m,value:finite(m.value*count,'Charge modifier value')}));
    this.state.modifierCounts.set(charge,count);
    if(mods)p.setSource('charge:'+charge,mods);else p.removeSource('charge:'+charge);
  }
  clearTreeClocks(skillId:string):void{
    if(typeof skillId!=='string'||!skillId||skillId.length>256)throw new Error('Invalid skill identifier');
    this.#enter();try{const prefix='treeTap:'+skillId+':';for(const key of this.state.clocks.keys())if(key.startsWith(prefix))this.state.clocks.delete(key);}finally{this.#busy=false;}
  }
  #meter(value:number,unit=1):number{
    nonnegative(value,'Charge meter');if(finite(unit,'Charge meter interval')<=0)throw new Error('Charge meter interval must be positive');
    if(value/unit>65536)throw new Error('Charge meter exceeds 65536-step work limit');return value;
  }
  advance(dt:number):void{
    nonnegative(dt,'Charge elapsed time');this.#enter();try{this.#advance(dt);}finally{this.#treeKeys.clear();this.#busy=false;}
  }
  #advance(dt:number):void{
    const p=this.#ports,{charges,clocks}=this.state;
    // Phase 1: unattended decay. Crossing the delay charges the full frame.
    for(const [key,def] of p.definitions()){
      if(!def.decay||(charges.get(key)??0)<=0)continue;
      const st=clocks.get(key)??clock();
      if(st.drain===undefined){const idle=finite(st.idle+dt,'Charge idle time');const acc=idle>=(def.decay.delay??0)?this.#meter(st.acc+nonnegative(def.decay.perSec,'Charge decay rate')*dt):st.acc;st.idle=idle;st.acc=acc;}
      clocks.set(key,st);
    }
    // Phase 2: drain/decay whole units and synchronize source order.
    for(const [key,st] of clocks){
      const acc=this.#meter(st.drain!==undefined?st.acc+nonnegative(st.drain,'Charge drain rate')*dt:st.acc);st.acc=acc;
      while(st.acc>=1){st.acc-=1;const cur=charges.get(key)??0;if(cur>0)charges.set(key,cur-1);}
      if(st.drain!==undefined&&(charges.get(key)??0)<=0){st.drain=undefined;st.acc=0;}
      this.#sync(key);
    }
    // Phase 3: one regeneration sample per update, retaining excess tick debt.
    const rst=clocks.get('__regen')??clock();rst.tick=finite(rst.tick+dt,'Charge regeneration clock');clocks.set('__regen',rst);
    if(rst.tick>=1){rst.tick-=1;
      for(const [key,def] of p.definitions()){
        const base=def.regen&&(!def.regenNeedsSpender||this.spendsCharge(key))?def.regen:0;
        const q=finite(p.regenerationBonus(key)+base,'Charge regeneration rate');if(q<=0)continue;
        const st=clocks.get(key+':regen')??clock(),acc=this.#meter(st.acc+q/10);st.acc=acc;clocks.set(key+':regen',st);
        while(st.acc>=1){st.acc-=1;this.#gain(key,1,def.baseCap??0,undefined,0);}
      }
    }
    // Phase 4: the owner's skill gauges. Regeneration uses clipped lockout time.
    for(const inst of p.skills()){
      const spec=inst?.def.gauge;if(!inst||!spec||(!spec.regen&&!inst.state?.gaugeLock))continue;
      gaugeTick(inst,spec,p.gaugeTerms(inst),dt);
    }
    // Phase 5: equipped meters; each movement tap sees the same walked distance.
    const walked=nonnegative(p.walked(),'Walked distance'),treeKeys=this.#treeKeys;
    for(const inst of p.skills()){
      if(!inst)continue;
      for(const spec of p.taps(inst)){
        if(spec.on!=='second'&&spec.on!=='move'&&spec.on!=='channelSecond')continue;
        if(spec.whileToggled&&!p.toggled(inst))continue;
        id(spec.charge);nonnegative(spec.amount,'Charge tap gain');finite(spec.max,'Charge tap capacity');
        const tree=!(inst.def.chargeGain??[]).includes(spec)&&!p.socketTaps(inst).some(s=>s.def.chargeGain?.includes(spec));
        const key=tree?'treeTap:'+inst.def.id+':'+JSON.stringify(spec):spec.charge+':'+spec.on+':'+inst.def.id;
        const st=clocks.get(key)??clock(),unit=spec.on==='move'?(spec.perDistance??60):(spec.everySeconds??1);
        const elapsed=spec.on==='channelSecond'?(p.channelSkillId()===inst.def.id?dt:0):spec.on==='second'?dt:walked;
        const tick=this.#meter(st.tick+elapsed,unit);st.tick=tick;clocks.set(key,st);if(tree)treeKeys.add(key);
        while(st.tick>=unit){st.tick-=unit;this.#gain(spec.charge,spec.amount,spec.max,inst,0);}
      }
    }
    for(const key of clocks.keys())if(key.startsWith('treeTap:')&&!treeKeys.has(key))clocks.delete(key);
    p.clearWalked();
  }
}
