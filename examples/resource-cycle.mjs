import {ResourceContent} from '@hollow-wake/engine/resources/content';
import {ChargeRuntime,createChargeState,chargeCostReady} from '@hollow-wake/engine/resources/charges';
import {gaugeEffOf,gaugeAdd,gaugeReady,gaugeSpend} from '@hollow-wake/engine/resources/gauges';
import {StatRules,StatSheet} from '@hollow-wake/engine';

/** A minimal game-owned actor. No renderer, engine object, database or global
 * registry is needed. The host supplies elapsed time and eligible event feeds. */
export function resourceActor(content){
 const sheet=new StatSheet(new StatRules(content.pack.stats)),state=createChargeState();
 const actor={sheet,state,skills:[],events:[],walked:0,channel:undefined};
 actor.gaugeTerms=inst=>gaugeEffOf(inst.def.gauge,sheet.get('gaugeNeed'),sheet.get('gaugeGain'),sheet.get('gaugeLockout'),content.pack.gaugeTuning);
 actor.runtime=new ChargeRuntime(state,{
  definition:id=>content.definition(id),definitions:()=>content.entries,
  capacityBonus:()=>sheet.get('chargeCap'),chargeCapacityBonus:id=>sheet.get('chargeCap_'+id),regenerationBonus:id=>sheet.get('chargeRegen_'+id),
  skills:()=>actor.skills,taps:i=>i.taps??i.def.chargeGain??[],socketTaps:i=>i.sockets??[],
  spentCharge:i=>(i.cost??i.def.chargeCost)?.charge,toggled:i=>!!i.toggled,channelSkillId:()=>actor.channel,
  gaugeTerms:actor.gaugeTerms,walked:()=>actor.walked,clearWalked:()=>{actor.walked=0;},
  gainEventCount:()=>actor.events.length,emitGainEvent:(id,n,inst,depth)=>actor.events.push({id,n,skill:inst?.def.id,depth}),
  setSource:(id,mods)=>sheet.setSource(id,mods),removeSource:id=>sheet.removeSource(id),
 });
 return actor;
}

/** The input is the separately compiled resource pack. This example resolves
 * just its chosen loadout; a full host supplies tree/socket admission policy. */
export function resourceCycle(pack){
 const content=new ResourceContent(pack),actor=resourceActor(content),r=actor.runtime;
 actor.skills=[{def:content.skill('hush_of_the_wake')}];
 for(let i=0;i<4;i++)r.advance(1);
 const wisp=actor.state.charges.get('wisp');
 r.gain('frenzy',3,3);const speed=actor.sheet.get('attackSpeed');
 r.gain('bloodlust',5,20);r.startDrain('bloodlust',2);r.advance(.5);
 const drained=actor.state.charges.get('bloodlust'),drainingSpeed=actor.sheet.get('attackSpeed');
 r.gain('bloodlust',5,20);const blocked=actor.state.charges.get('bloodlust');
 r.advance(2);const released=!r.isDraining('bloodlust');
 const flaskDef=content.skill('life_flask'),node=flaskDef.nodes.find(n=>n.chargeGain?.[0].everySeconds===4);
 const flask={def:flaskDef,taps:[...flaskDef.chargeGain,...node.chargeGain]};actor.skills=[flask];
 r.advance(4);const ready=chargeCostReady(actor.state.charges.get('flask_life')??0,flaskDef.chargeCost),paid=r.pay(flaskDef.chargeCost);
 actor.skills=[];r.advance(0);const retiredTreeClocks=[...actor.state.clocks.keys()].filter(k=>k.startsWith('treeTap:')).length;
 const grave={def:content.skill('grave_tide')},terms=actor.gaugeTerms(grave);actor.skills=[grave];
 // The game has already decided that this event is eligible for this skill.
 const feed=gaugeAdd(grave,3,terms),partialReady=gaugeReady(grave,terms,grave.def.gauge),power=gaugeSpend(grave,grave.def.gauge,terms);
 const duringLock=gaugeAdd(grave,3,terms);r.advance(12);const afterLock=gaugeAdd(grave,1,terms);
 return {wisp,speed,drained,drainingSpeed,blocked,released,ready,paid,retiredTreeClocks,feed,partialReady,power,duringLock,afterLock,flaskRemaining:actor.state.charges.get('flask_life'),contentId:content.pack.contentId};
}
