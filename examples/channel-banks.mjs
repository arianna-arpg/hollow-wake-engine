import {ChannelBanks} from '@hollow-wake/engine/casting/banks';
import {ActorGaugePublisher} from '@hollow-wake/engine/stats/gauges';
import {StatSheet,StatRules} from '@hollow-wake/engine';

/** Host-supplied fill demonstrates bank custody and gauge sampling phases.
 * Actual channel advancement is a separate casting capability. */
export function bankCycle(){
 const actor={statuses:[],charges:new Map([['spell',1]]),casting:null};
 const skill={id:'spell',hostData:{name:'Stored light'}};
 const banks=new ChannelBanks({key:inst=>inst.id,decayMultiplier:()=>1});
 const gauges=new ActorGaugePublisher(),sheet=new StatSheet(new StatRules({damage:{base:1}}));
 sheet.setSource('affixes',[{stat:'damage',kind:'increased',value:1,gauge:'charge:spell'},{stat:'damage',kind:'increased',value:4,gauge:'brim:spell'}]);
 gauges.refresh(actor,sheet);const damage=[sheet.get('damage')];
 const bank=banks.bind(actor,skill,{decay:.25});bank.fill=.25;
 actor.charges.clear();gauges.refresh(actor,sheet);damage.push(sheet.get('damage'));
 banks.decay(actor,.75);damage.push(sheet.get('damage'));
 gauges.refresh(actor,sheet);damage.push(sheet.get('damage'));
 banks.decay(actor,.5);
 return {damage,bankDeleted:banks.lookup(actor,skill)===undefined,detachedFill:bank.fill,retainedInstance:bank.inst===skill,stable:gauges.refresh(actor,sheet)===false};
}
