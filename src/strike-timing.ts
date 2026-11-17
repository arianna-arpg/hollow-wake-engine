import {finite} from './validation.js';

export interface StrikeTiming {kind:'perfect'|'timed';bonus?:number;source?:{kind:string;id:string}}
export const STRIKE_TIMING = Object.freeze({perfectStart:.72,perfectBonus:.7,markerMin:.3,markerMax:.85,tolerance:.08,timedBonus:1.2});
/** One owned random draw only when at least one timed discipline is present. */
export function rollStrikeMarker(timings:readonly StrikeTiming[],random:()=>number):number|undefined {
  return timings.some(t=>t.kind==='timed')?STRIKE_TIMING.markerMin+random()*(STRIKE_TIMING.markerMax-STRIKE_TIMING.markerMin):undefined;
}
/** A single input samples all invested windows. Successful MORE bonuses multiply. */
export function resolveStrikeTimings(timings:readonly StrikeTiming[],fraction:number,marker?:number):{successes:StrikeTiming[];multiplier:number}{
  finite(fraction,'Strike fraction');if(marker!==undefined)finite(marker,'Strike marker');
  const successes=timings.filter(t=>t.kind==='perfect'?fraction>=STRIKE_TIMING.perfectStart:marker!==undefined&&Math.abs(fraction-marker)<=STRIKE_TIMING.tolerance);
  return {successes,multiplier:successes.reduce((mult,t)=>mult*(1+finite(t.bonus??(t.kind==='perfect'?STRIKE_TIMING.perfectBonus:STRIKE_TIMING.timedBonus),'Strike bonus')),1)};
}
