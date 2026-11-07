import assert from 'node:assert/strict';
import {advanceConduits} from '@hollow-wake/engine/resources/conduits';
import {ConduitCatalogue} from '@hollow-wake/engine/resources/conduits/catalogue';
import pack from '@hollow-wake/engine/content/conduits.json' with {type:'json'};

// A character has invested Glacial Reservoir on Ice Shield. The game supplies
// the resolved skill build and the raised shield, plus its ordinary gain gates.
const catalogue=new ConduitCatalogue(pack);
const pumps=catalogue.forSkill('ice_shield',[],['glacial_reservoir']);
const iceShield={def:{id:'ice_shield'},pumps,tags:new Set(['guard']),modifiers:[]};
const actor={
  skills:[iceShield],casting:{mode:'guard',held:true,inst:iceShield,shield:49,maxShield:90},
  activeAuras:new Set(),summonToggles:new Set(),life:68,mana:63,es:42,poise:55,ward:36,insight:57,
  maxLife:()=>100,lifeCeiling:()=>90,availableMaxMana:()=>80,maxEs:()=>100,maxPoise:()=>100,maxInsight:()=>100,
  sheet:{get(stat){return stat==='poiseOvercharge'?.25:1;}},
  healBy(amount){this.life=Math.min(this.lifeCeiling(),this.life+amount);},
  gainEs(amount){this.es=Math.min(this.maxEs(),this.es+amount);},
  gainPoise(amount){this.poise=Math.min(this.maxPoise()*(1+this.sheet.get('poiseOvercharge')),this.poise+amount);},
  gainWard(amount){this.ward+=amount;},
  damagePoise(amount){this.poise=Math.max(0,this.poise-amount);},
};
const readers={specs:skill=>skill.pumps,tags:skill=>skill.tags,modifiers:skill=>skill.modifiers};
advanceConduits(actor,.5,readers,catalogue.rules);
assert.equal(actor.mana,61.4);assert.equal(actor.casting.shield,52.2);
actor.casting=null;
advanceConduits(actor,1.5,readers,catalogue.rules);
assert.equal(actor.mana,61.4);
console.log('Glacial Reservoir spent 1.6 mana for 3.2 shield. Lowering the guard stopped the pump.');
