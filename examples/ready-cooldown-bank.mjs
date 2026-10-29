import {refundReadyCooldown,consumeReadyCooldownBank,publishReadyCooldownBank} from '@hollow-wake/engine/combat/ready-cooldown-bank';

const policy={enabled:()=>true,price:()=>8,maxExtra:()=>4};
const presentation={clear:actor=>{actor.bankDisplay=undefined;},publish:(actor,hits,progress)=>{actor.bankDisplay={hits,progress};}};

export function runReadyBankCycle(){
  const host={def:{id:'command'}};
  const actor={cooldowns:new Map(),cooldownTotals:new Map([['command',8]]),bankDisplay:undefined,position:{x:10,y:3,z:-2}};
  const bank={owner:actor,host,bank:0};
  refundReadyCooldown(actor,host,bank,17,policy);
  publishReadyCooldownBank(bank,policy,presentation);
  const ready=actor.bankDisplay;
  const extraUses=consumeReadyCooldownBank(actor,host,bank,false,policy);
  actor.cooldowns.set('command',4);
  refundReadyCooldown(actor,host,bank,9,policy);
  publishReadyCooldownBank(bank,policy,presentation);
  return {extraUses,credit:bank.bank,ready,after:actor.bankDisplay,clocks:[...actor.cooldowns],totals:[...actor.cooldownTotals],position:actor.position};
}
