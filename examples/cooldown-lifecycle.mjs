import {advanceSkillCooldowns,calculateSkillCooldown,stampSkillCooldown,refundSkillCooldown,
  refundCooldownsOnOrb,reduceOtherSkillCooldowns} from '@hollow-wake/engine/combat/cooldown-lifecycle';

const pricePorts={tags:skill=>skill.def.tags,modifiers:()=>undefined,absorbCooldown:()=>undefined,
  read:(_actor,stat,tags)=>stat==='addedCooldown'?2:tags?4:2};
const stampPorts={price:(actor,skill,base)=>calculateSkillCooldown(actor,skill,base,pricePorts),ultimateCap:()=>Infinity};
const recoveryPorts={global:()=>2,hasTagged:()=>true,scoped:(_actor,skill)=>skill.def.id==='dash'?4:2};
const orbPorts={seconds:()=>1};

export function runCooldownCycle() {
  const dash={def:{id:'dash',tags:['movement']}},other={def:{id:'other',tags:['spell']}};
  const actor={skills:[dash,other],cooldowns:new Map(),cooldownTotals:new Map(),position:{x:10,y:3,z:-2}};
  const price=calculateSkillCooldown(actor,dash,10,pricePorts);
  stampSkillCooldown(actor,dash,10,stampPorts);
  actor.cooldowns.set('other',8);actor.cooldownTotals.set('other',8);
  advanceSkillCooldowns(actor,1,recoveryPorts);
  refundCooldownsOnOrb(actor,'life',orbPorts);
  const visited=reduceOtherSkillCooldowns(actor,dash.def,{type:'reduceCooldowns',seconds:2,fraction:0.2});
  refundSkillCooldown(actor,'dash');
  return {price,visited,clocks:[...actor.cooldowns],totals:[...actor.cooldownTotals],position:actor.position};
}
