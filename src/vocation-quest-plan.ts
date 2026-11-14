import {QuestRewards,type QuestRewardDefinition} from './quest-rewards.js';
import type {RunCheckpointAction} from './durable-run-owner.js';
export type VocationQuestProgressionAction=Readonly<Extract<RunCheckpointAction,{kind:'experience'|'points'|'vocation'|'run-ledger'|'account-counter'}>>;

/** Progression compilation for an already authorized, admitted vocation turn-in.
 * It records owed gem count but does not mint loot or own the quest book. Those
 * obligations still have to join the durable transaction before production use. */
export function planVocationQuestProgression(quest:QuestRewardDefinition,characterKey:string,accountWrites:boolean,questKey:(id:string)=>string){
 if(!quest.reward.grantVocation||quest.collect||quest.reward.choices?.length||quest.reward.skillChoice||quest.reward.imbue||quest.reward.features?.length||quest.reward.essence?.length)throw Error('Unsupported vocation progression payout');
 const gems=quest.reward.gems??0;if(!Number.isSafeInteger(gems)||gems<0||gems>256)throw Error('Invalid quest gem count');
 const actions:VocationQuestProgressionAction[]=[];let owedGems=0;
 const add=(action:VocationQuestProgressionAction)=>{if(actions.length===16)throw Error('Quest progression batch limit');actions.push(Object.freeze(action));};
 const unsupported=():never=>{throw Error('Unexpected vocation progression effect');};
 const effects=new QuestRewards({
  activeIndex:()=>0,noteCompletion:()=>{},definition:()=>quest,collectionReady:unsupported,shownChoice:unsupported,requestChoice:unsupported,
  choice:unsupported,item:unsupported,place:unsupported,noRoom:unsupported,posting:()=>null,consumeCargo:unsupported,imbue:unsupported,
  feature:unsupported,accountDirty:()=>{},experience:amount=>add({kind:'experience',characterKey,amount}),gem:()=>{owedGems++;},essence:unsupported,
  points:(currency,amount)=>add({kind:'points',characterKey,currency,amount}),announcePoints:()=>{},characterDirty:()=>{},
  vocation:id=>add({kind:'vocation',characterKey,id}),runCounter:(key,amount)=>add({kind:'run-ledger',characterKey,key,amount}),
  accountWritesAllowed:()=>accountWrites,accountCounter:(key,amount)=>add({kind:'account-counter',characterKey,key,amount,mode:'add'}),
  questKey,bountyKey:unsupported,bountyKindKey:unsupported,announceQuest:()=>{},announceBounty:unsupported,
  rememberCompleted:()=>{},removeActive:()=>{},clientActions:()=>false,saveAccount:unsupported,saveCharacter:unsupported
 });
 effects.complete({questId:quest.id});
 return Object.freeze({questId:quest.id,characterKey,actions:Object.freeze(actions),owedGems});
}
