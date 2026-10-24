import {ActorConditions} from '@hollow-wake/engine/stats/conditions';
import {StatSheet,StatRules} from '@hollow-wake/engine';

/** The host reports a wound, samples before its clock tick, then dispatches
 * queued effects. The SDK owns condition evaluation and ordered rising edges. */
export function conditionCycle(){
  const sheet=new StatSheet(new StatRules({life:{base:100},mana:{base:100},damage:{base:1},lowLifeLine:{base:.35}}));
  sheet.setSource('desperate-strength',[{stat:'damage',kind:'more',value:1,when:'lowLife'}]);
  const actor={sheet,life:100,mana:50,es:0,poise:0,poiseBroken:false,esRecharging:false,
    plantFor:0,idleFor:1,strideDist:0,comboWatch:false,comboCondLeft:0,comboCondBits:0,
    since:new Float64Array(9).fill(999),condMask:-1,condSheet:null,condRose:[],ward:0};
  const policy=new ActorConditions({maxLife:a=>a.sheet.get('life'),maxMana:a=>a.sheet.get('mana'),maxEs:()=>0,
    lowLifeFraction:a=>a.sheet.get('lowLifeLine'),strideReach:()=>0});
  policy.refresh(actor);const birthEvents=actor.condRose.length,damage=[sheet.get('damage')];
  actor.life=20;actor.since[3]=0;policy.refresh(actor);damage.push(sheet.get('damage'));
  // Example host effect; this does not claim to implement native proc rules.
  const events=actor.condRose;actor.condRose=[];
  for(const event of events)if(event==='lowLife')actor.ward+=30;
  actor.since[3]=4;policy.refresh(actor);const expired=!policy.holds(actor,'recentlyHurt');
  actor.life=100;policy.refresh(actor);damage.push(sheet.get('damage'));
  return {birthEvents,damage,events,ward:actor.ward,expired,final:actor.condRose};
}
