import {bankAuraManaRegeneration,type AuraLedgerBank,type AuraLedgerSpec} from './aura-ledgers.js';
export interface RegenerationSkill {def:{delivery:{type:string;overdrive?:{recoveryPct?:number;recoveryFlat?:number;regenFactor?:number}}}}
export interface RegenerationActor<I,L extends AuraLedgerSpec,Tag,M> extends AuraLedgerBank<L>{
  dead:boolean;downed:boolean;life:number;mana:number;reservedLife:number;reservedMana:number;es:number;esDelay:number;esRecharging:boolean;esRechargeJustStarted:boolean;esJustFilled:boolean;
  poise:number;poiseCalm:number;poiseDelay:number;poiseBroken:boolean;poiseJustRearmed:boolean;insight:number;endurance:number;enduranceDelay:number;
  overdrive:Partial<Record<'mana'|'life',{inst:I;idle:number;debt:number}>>;sheet:{get(stat:string,tags?:Tag,mods?:M,base?:number):number};
  maxLife():number;availableMaxMana():number;maxEs():number;maxPoise():number;maxInsight():number;maxEndurance():number;insightMomentum():number;
  healBy(amount:number,silent?:boolean):number;gainEs(amount:number):number;stanceRead():{tags:Tag;extra:M}|null|undefined;
}
export interface RegenerationPorts<I,Tag,M>{tags(skill:I):Tag;modifiers(skill:I):M;poiseOverDecay:number}
/** Original final actor phase: ordered regeneration, ledger skims, debt repayment
 * and defensive rearming. Time is admitted by the enclosing actor clock. */
export function advanceActorRegeneration<A extends RegenerationActor<I,L,Tag,M>,I extends RegenerationSkill,L extends AuraLedgerSpec,Tag,M>(a:A,dt:number,p:RegenerationPorts<I,Tag,M>):void{
  if(a.dead||a.downed)return;
  const maxLife=a.maxLife(),maxMana=a.availableMaxMana(),regen=a.sheet.get('lifeRegen')+a.sheet.get('lifeRegenPct')*maxLife;
  let manaRegen=a.sheet.get('manaRegen')+a.sheet.get('manaRegenPct')*maxMana;
  manaRegen=bankAuraManaRegeneration(a,manaRegen,dt);
  const toEs=Math.min(1,Math.max(0,a.sheet.get('lifeRegenToEs')));
  a.healBy(regen*(1-toEs)*dt,true);a.mana=Math.min(maxMana,a.mana+manaRegen*dt);
  for(const lane of ['mana','life'] as const){
    const od=a.overdrive[lane];if(!od)continue;od.idle-=dt;if(od.debt<=0)continue;
    const tags=p.tags(od.inst),extra=p.modifiers(od.inst),spec=od.inst.def.delivery.type==='aura'?od.inst.def.delivery.overdrive:undefined;
    const flowing=od.idle<=0?1:a.sheet.get('overdriveFlow',tags,extra);if(flowing<=0)continue;
    const rate=lane==='mana'?od.debt*a.sheet.get('overdriveRecovery',tags,extra,spec?.recoveryPct??.15)+a.sheet.get('overdriveRecoveryFlat',tags,extra,spec?.recoveryFlat??2)
      :regen*a.sheet.get('overdriveLifeFactor',tags,extra,spec?.regenFactor??.75)*a.sheet.get('attackSpeed')*a.sheet.get('overdriveRecovery',tags,extra,1);
    const repaid=Math.min(od.debt,rate*flowing*dt);od.debt-=repaid;
    if(lane==='mana')a.reservedMana=Math.max(0,a.reservedMana-repaid);else a.reservedLife=Math.max(0,a.reservedLife-repaid);
  }
  const maxEs=a.maxEs();
  if(maxEs>0){
    if(toEs>0)a.gainEs(regen*toEs*dt);if(a.esDelay>0)a.esDelay-=dt;
    if(a.esDelay<=0&&a.es<maxEs-.001){
      if(!a.esRecharging){a.esRecharging=true;a.esRechargeJustStarted=true;}
      a.es=Math.min(maxEs,a.es+maxEs*a.sheet.get('esRechargeRate')*dt);
      if(a.es>=maxEs-.001){a.es=maxEs;a.esRecharging=false;a.esJustFilled=true;}
    }else a.esRecharging=false;
  }else if(a.es>0||a.esRecharging){a.es=0;a.esRecharging=false;}
  if(a.es>maxEs)a.es=maxEs;
  const maxPoise=a.maxPoise();
  if(maxPoise>0){
    a.poiseCalm+=dt;const stance=a.stanceRead(),rate=maxPoise*a.sheet.get('poiseRegenPct',stance?.tags,stance?.extra)*dt;
    if(a.poiseBroken){
      if(a.poiseDelay>0)a.poiseDelay-=dt;else if(a.poise<maxPoise)a.poise=Math.min(maxPoise,a.poise+rate);
      if(a.poise>=maxPoise*a.sheet.get('poiseRearmAt')-.001){a.poiseBroken=false;a.poiseJustRearmed=true;a.poiseDelay=0;}
    }else if(a.poise<maxPoise&&a.poiseCalm>=a.sheet.get('poiseCalmDelay'))a.poise=Math.min(maxPoise,a.poise+rate);
    if(a.poise>maxPoise){const ceil=maxPoise*(1+a.sheet.get('poiseOvercharge'));a.poise=Math.min(ceil,Math.max(maxPoise,a.poise-(a.poise-maxPoise)*p.poiseOverDecay*dt));}
  }else if(a.poise>0||a.poiseBroken){a.poise=0;a.poiseBroken=false;}
  const maxInsight=a.maxInsight();
  if(maxInsight>0){const momentum=a.insightMomentum();if(momentum>0&&a.insight<maxInsight)a.insight=Math.min(maxInsight,a.insight+maxInsight*a.sheet.get('insightRegenPct')*momentum*dt);if(a.insight>maxInsight)a.insight=maxInsight;}
  else if(a.insight>0)a.insight=0;
  const maxEnd=a.maxEndurance();
  if(maxEnd>0){if(a.enduranceDelay>0)a.enduranceDelay-=dt;else if(a.endurance<maxEnd)a.endurance=Math.min(maxEnd,a.endurance+maxEnd*a.sheet.get('enduranceRegenPct')*dt);if(a.endurance>maxEnd)a.endurance=maxEnd;}
  else if(a.endurance>0)a.endurance=0;
}
