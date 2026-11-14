import {QuestRewards} from 'candidate/quest-rewards';
import type {QuestDef,QuestRewardChoice} from '../src/quests/types';
import type {ItemInstance} from '../src/engine/items';
import {questRewardChoices} from '../src/engine/questRewardChoices';
import {mintQuestImbue} from '../src/engine/questImbue';
import {autoPlace,removeFromBag} from '../src/engine/inventory';
import {VOCATIONS} from '../src/data/vocations';
import {BOUNTY_BOARD_CFG,describeBountyPay,type BountyPosting} from '../src/data/bountyboard';
import {questDoneKey,LEDGER_BOUNTY_DONE,bountyDoneKindKey} from '../src/meta/account';
import {saveAccount} from '../src/meta/persistence';import {saveCharacter} from '../src/meta/character';
import type {World} from '../src/engine/world';
export function installQuestRewards(w:World,hooks:{vocation(id:string):void;points(currency:'passive'|'vocation',amount:number):void;runCounter(key:string,amount:number):void;accountCounter(key:string,amount:number):void}){
 const world=w as any;
 const runtime=new QuestRewards<{questId:string;zoneId:string;fieldDone:boolean},QuestDef,QuestRewardChoice,ItemInstance,BountyPosting>({
  activeIndex:a=>w.activeQuests.indexOf(a),noteCompletion:id=>w.odyssey.questCompleted(id),definition:id=>world.questDefOf(id),
  collectionReady:(a,q)=>!!w.meta.items.find(i=>i.questId===q.id&&i.baseId===q.collect!.baseId)&&world.questStanding(a)==='ready'&&world.giverPresent(q.turnIn?.giver??[])!==null,
  shownChoice:()=>world.questRewardShown,requestChoice:q=>{world.questRewardShown=q.id;world.questRewardRequested=true;},
  choice:(q,id)=>questRewardChoices(w.account,q).find(c=>c.id===id),item:(q,id,choice)=>world.questRewardItem(q,id,choice),place:item=>autoPlace(w.meta.items,item),
  noRoom:()=>{world.failNote(w.player,'questReward','Make room in your pack, then choose your reward again.');},
  posting:id=>w.bountyHands.find(h=>h.id===id)??null,consumeCargo:q=>{const cargo=w.meta.items.find(i=>i.questId===q.id&&i.baseId===q.collect!.baseId)!;removeFromBag(w.meta.items,cargo.uid);},
  imbue:q=>{w.questImbues.push(mintQuestImbue(q.id,w.manifest.seed,q.reward.imbue!.level,q.reward.imbue!.choices));world.questRewardRequested=true;},
  feature:id=>{w.account.features.add(id);},accountDirty:()=>{w.accountDirty=true;},experience:amount=>w.grantXp(amount),
  gem:()=>{w.dropGemAt(w.player.pos,undefined,true,'quest');},essence:cost=>{world.dropEssenceAt(w.player.pos,cost);},points:hooks.points,
  announcePoints:(q,currency,amount)=>{const passive=currency==='passive';w.text({x:w.player.pos.x,y:w.player.pos.y-(passive?64:44)},passive?`+${amount} passive point`:`+${amount} vocation point${amount>1?'s':''}`,passive?'#a0e0ff':(q.vocation?VOCATIONS[q.vocation]?.color:undefined)??'#e8c860',16);},
  characterDirty:()=>{world.markMetaDirty(w.localSeat);},vocation:hooks.vocation,runCounter:hooks.runCounter,
  accountWritesAllowed:()=>w.metaProgressionActive(),accountCounter:hooks.accountCounter,
  questKey:questDoneKey,bountyKey:()=>LEDGER_BOUNTY_DONE,bountyKindKey:p=>bountyDoneKindKey(p.kind),
  announceQuest:q=>{w.notice(`Quest complete: ${q.offerLabel}!`,'#ffd700',18,'civic');},
  announceBounty:(q,p)=>{w.notice(`Bounty complete: ${q.offerLabel} — ${describeBountyPay(p.pay)}.`,BOUNTY_BOARD_CFG.accent,18,'civic');},
  rememberCompleted:id=>{w.completedQuests.add(id);},removeActive:index=>{w.activeQuests.splice(index,1);},clientActions:()=>!!w.clientActionHook,
  saveAccount:()=>{saveAccount(w.account);},saveCharacter:()=>{saveCharacter(w);}
 });
 world.onQuestZoneCleared=(entry:{questId:string;zoneId:string;fieldDone:boolean},choiceId?:string)=>runtime.complete(entry,choiceId);
 return runtime;
}
