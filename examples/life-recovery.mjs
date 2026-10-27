import {healLife,refillLife,applyProcHeal} from '@hollow-wake/engine/combat/recovery';
import {compileProcHealingEffect} from '@hollow-wake/engine/combat/recovery-content';

export function recoveryExample(){
  let stamps=0;
  const ports=Object.freeze({ceiling:()=>100,maximumLife:()=>100,rate:()=>1,recent:()=>{stamps++;}});
  const actor={life:50,dead:false,healedSince:0,heal(amount){return healLife(this,amount,ports);}};
  const effect=compileProcHealingEffect({type:'heal',flat:10,pctMax:.1});
  const signalled=applyProcHeal(actor,effect,ports,actor.heal),afterHeal=actor.life;
  refillLife(actor,ports);
  return {signalled,afterHeal,refilled:actor.life,eventTotal:actor.healedSince,stamps};
}
