import {finite} from './validation.js';

export interface GaugeSpec {
  need:number;regen?:number;lockoutSec?:number;bankMult?:number;unit?:string;
  partial?:{minFrac?:number;floorPower?:number};overflow?:true;cooldownPer?:number;
}
export interface GaugeTuning {defaultLockoutSec:number;defaultBankMult:number;noteGathering:string;noteLocked:string}
export interface GaugeTerms {need:number;gain:number;lockoutSec:number;cap:number}
export interface GaugeState {gauge?:number;gaugeLock?:number;gaugePower?:number}
export interface GaugeInstance {state?:GaugeState}

function terms(eff:GaugeTerms):void{
  if(finite(eff.need,'Gauge requirement')<1||finite(eff.gain,'Gauge gain')<0||finite(eff.lockoutSec,'Gauge lockout')<0||finite(eff.cap,'Gauge ceiling')<0)throw new Error('Invalid effective gauge terms');
}
/** Tuning is supplied by the content owner; there is no process-wide registry. */
export function gaugeEffOf(spec:GaugeSpec,needMul:number,gainMul:number,lockMul:number,tuning:Pick<GaugeTuning,'defaultLockoutSec'|'defaultBankMult'>):GaugeTerms{
  const need=Math.max(1,Math.round(finite(finite(spec.need,'Gauge need')*finite(needMul,'Gauge need multiplier'),'Scaled gauge need')));
  const gain=Math.max(0,finite(gainMul,'Gauge gain multiplier'));
  const lockoutSec=Math.max(0,finite(finite(spec.lockoutSec??tuning.defaultLockoutSec,'Gauge lockout')*finite(lockMul,'Gauge lockout multiplier'),'Scaled gauge lockout'));
  const cap=finite(need*finite(spec.bankMult??tuning.defaultBankMult,'Gauge bank multiplier'),'Gauge ceiling');
  const result={need,gain,lockoutSec,cap};terms(result);return result;
}
export function gaugeFill(inst:GaugeInstance):number{return finite(inst.state?.gauge??0,'Gauge fill');}
export function gaugeLocked(inst:GaugeInstance):boolean{return finite(inst.state?.gaugeLock??0,'Gauge lockout')>0;}
export function gaugeLockLeft(inst:GaugeInstance):number{return Math.max(0,finite(inst.state?.gaugeLock??0,'Gauge lockout'));}
export function gaugeFloor(spec:GaugeSpec,eff:GaugeTerms):number{
  terms(eff);if(!spec.partial)return eff.need;
  return Math.max(1,Math.ceil(finite(eff.need*finite(spec.partial.minFrac??0,'Partial gauge fraction'),'Partial gauge floor')));
}
export function gaugeReady(inst:GaugeInstance,eff:GaugeTerms,spec?:GaugeSpec):boolean{
  terms(eff);return gaugeFill(inst)>=(spec?gaugeFloor(spec,eff):eff.need);
}
export function gaugePowerOf(spec:GaugeSpec,eff:GaugeTerms,fill:number):number{
  terms(eff);finite(fill,'Gauge fill');
  if(spec.overflow)return Math.max(0,finite(fill/eff.need,'Overflow gauge power'));
  if(fill>=eff.need||!spec.partial)return 1;
  const floor=gaugeFloor(spec,eff),fp=finite(spec.partial.floorPower??floor/eff.need,'Partial floor power');
  if(eff.need<=floor)return 1;
  const t=finite((fill-floor)/(eff.need-floor),'Partial gauge position');
  return Math.max(0,Math.min(1,finite(fp+(1-fp)*t,'Partial gauge power')));
}
export function gaugeFrac(inst:GaugeInstance,eff:GaugeTerms):number{
  terms(eff);return Math.max(0,Math.min(1,gaugeFill(inst)/eff.need));
}
function nextFill(cur:number,amount:number,eff:GaugeTerms):number{
  return Math.min(eff.cap,finite(cur+finite(amount*eff.gain,'Scaled gauge gain'),'Gauge sum'));
}
/** Existing state is borrowed. Unrelated state properties and identity survive. */
export function gaugeAdd(inst:GaugeInstance,amount:number,eff:GaugeTerms):number{
  finite(amount,'Gauge gain');terms(eff);if(amount<=0||gaugeLocked(inst))return 0;
  const cur=gaugeFill(inst),next=nextFill(cur,amount,eff),difference=finite(next-cur,'Banked gauge gain');
  (inst.state??={}).gauge=next;return difference;
}
/** This is payment, not admission. Hosts check readiness before authorizing a press. */
export function gaugeSpend(inst:GaugeInstance,spec:GaugeSpec,eff:GaugeTerms):number{
  const fill=gaugeFill(inst),power=gaugePowerOf(spec,eff,fill);
  const next=(spec.overflow||(spec.partial&&fill<eff.need))?0:Math.max(0,finite(fill-eff.need,'Remaining gauge'));
  const st=inst.state??={};st.gauge=next;st.gaugeLock=eff.lockoutSec;st.gaugePower=power;return power;
}
/** Lockout consumes the start of the frame; regeneration sees only its remainder.
 * Numeric validation finishes before changing the caller's state. */
export function gaugeTick(inst:GaugeInstance,spec:GaugeSpec,eff:GaugeTerms,dt:number):void{
  if(finite(dt,'Gauge elapsed time')<0)throw new Error('Gauge elapsed time must be nonnegative');
  terms(eff);const oldLock=finite(inst.state?.gaugeLock??0,'Gauge lockout');let nextLock:number|undefined;
  if(oldLock>0){const left=finite(oldLock-dt,'Gauge lock remainder');if(left>0){(inst.state??={}).gaugeLock=left;return;}nextLock=0;dt=-left;}
  let next:number|undefined;
  const regen=finite(spec.regen??0,'Gauge regeneration');
  if(regen&&dt>0){const amount=finite(regen*dt,'Gauge frame gain');if(amount>0)next=nextFill(gaugeFill(inst),amount,eff);}
  const st=inst.state??={};if(nextLock!==undefined)st.gaugeLock=nextLock;if(next!==undefined)st.gauge=next;
}
export function gaugeNote(inst:GaugeInstance,spec:GaugeSpec,eff:GaugeTerms,tuning:Pick<GaugeTuning,'noteGathering'|'noteLocked'>):string{
  terms(eff);if(gaugeLocked(inst))return tuning.noteLocked;
  return `${Math.floor(gaugeFill(inst))}/${eff.need} ${spec.unit??tuning.noteGathering}`;
}
export function gaugeShaveSec(spec:GaugeSpec,eff:GaugeTerms,amount:number):number{
  terms(eff);finite(amount,'Gauge haste amount');
  return spec.cooldownPer?Math.max(0,finite(amount*eff.gain*finite(spec.cooldownPer,'Gauge cooldown shave'),'Gauge haste seconds')):0;
}
