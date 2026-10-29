import {applyProcCooldown} from '@hollow-wake/engine/combat/cooldowns';
import {compileProcCooldownEffect} from '@hollow-wake/engine/combat/cooldown-content';

export function cooldownExample(){
  const authored={type:'cooldown',seconds:1,fraction:.25,tags:['movement'],exceptSelf:true};
  const effect=compileProcCooldownEffect(authored);
  const create=()=>({cooldowns:new Map([['dash',8],['meteor',4],['unslotted',2]]),
    skills:[{def:{id:'dash',tags:['movement']}},{def:{id:'meteor',tags:['spell']}}]});
  const actor=create(),other=create(),changed=applyProcCooldown(actor,effect,actor.skills[1]);
  // An explicitly named timer remains addressable after its skill leaves a bar.
  applyProcCooldown(actor,compileProcCooldownEffect({type:'cooldown',skills:['unslotted'],reset:true}));
  return {changed,clocks:[...actor.cooldowns],otherClocks:[...other.cooldowns],
    selectorsOwned:effect.tags!==authored.tags&&Object.isFrozen(effect.tags)};
}
