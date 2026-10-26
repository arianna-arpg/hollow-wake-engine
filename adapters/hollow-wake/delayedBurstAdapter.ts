import type {DelayedBurstPorts} from '@hollow-wake/engine/combat/delayed';
import {vec} from '../core/math';
import {mitigateTyped} from './damage';
import type {DamageType} from './stats';
import type {Actor} from './actor';
import type {World} from './world';

/** One shared table; each World owns its scheduler and existing queue. Keep
 * native methods observable, including death that synchronously loads a zone.
 * Private queue access is guarded by the source integration contract. */
export const delayedBurstPorts=Object.freeze<DelayedBurstPorts<World,Actor,Actor,DamageType>>({
  queue:(w:World)=>w['pendingBursts'],time:(w:World)=>w.time,actors:(w:World)=>w.actors,
  clearQueue(w:World){w['pendingBursts']=[];return undefined;},
  warning(w,b){w.flashes.push({pos:vec(b.at.x,b.at.y),radius:b.fx.radius,color:b.color,life:b.fx.delay,maxLife:b.fx.delay,edgeFrac:0.94});return undefined;},
  flash(w,b){w.flashes.push({pos:vec(b.at.x,b.at.y),radius:b.fx.radius,color:b.color,life:0.3,maxLife:0.3});return undefined;},
  heal:(_w:World,a:Actor,n:number)=>a.healBy(n),
  mitigate:(_w:World,a:Actor,type:DamageType,n:number)=>mitigateTyped(a,{[type]:n}),
  text(w,at,text,color,size){w.text(at,text,color,size);return undefined;},
  shieldBreak(w,a,depth){w.rollOwnProcs(a,'esBreak',{depth});return undefined;},
  sweepDefenses(w,a,depth){w.sweepDefenseEvents(a,depth);return undefined;},
  kill(w,a){w.kill(a);return undefined;},
});
