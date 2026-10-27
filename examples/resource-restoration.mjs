import {gainEnergyShield,gainPoise,applyInstantRestoration,applyProcRestoration} from '@hollow-wake/engine/combat/restoration';
import {compileInstantRestorationEffect,compileProcRestorationEffect} from '@hollow-wake/engine/combat/restoration-content';
import {healLife} from '@hollow-wake/engine/combat/recovery';

const recovery=Object.freeze({ceiling:()=>100,rate:()=>1,recent:()=>undefined});
const ports=Object.freeze({maximumShield:()=>100,maximumPoise:()=>80,maximumMana:()=>100,
  poiseOvercharge:()=>.5,availableMana:a=>100-a.reservedMana,
  restoreLife:(a,e)=>a.healBy(e.amount),restoreShield:(a,e)=>a.gainEs(e.amount),restorePoise:(a,e)=>a.gainPoise(e.amount),
  gainShield:(a,n)=>a.gainEs(n),gainPoise:(a,n)=>a.gainPoise(n),
  noteGain:(a,resource,amount,cue)=>{a.notices.push({resource,amount,cue});},
});
function actor(){
  return {dead:false,life:40,mana:40,es:40,poise:20,reservedMana:40,healedSince:0,esDelay:5,esJustFilled:false,
    gainEvents:[],notices:[],healBy(n){return healLife(this,n,recovery);},
    gainEs(n){return gainEnergyShield(this,n,ports);},gainPoise(n){return gainPoise(this,n,ports);}};
}
export function restorationExample(){
  const hero=actor(),other=actor(),tags=['spell'];
  const shield=compileInstantRestorationEffect({type:'restore',resource:'es',amount:30,resetEsDelay:true});
  const mana=compileProcRestorationEffect({type:'restore',resource:'mana',pctMax:.4});
  const shieldGain=applyInstantRestoration(hero,shield,ports,{tags});
  const poiseGain=hero.gainPoise(100),procGrew=applyProcRestoration(hero,mana,ports);
  return {shieldGain,poiseGain,mana:hero.mana,events:hero.gainEvents.length,procGrew,
    sharedTags:hero.gainEvents[0].tags===tags,otherMana:other.mana,notices:hero.notices.length};
}
