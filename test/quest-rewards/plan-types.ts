import {planVocationQuestProgression,type VocationQuestProgressionAction} from '../../src/vocation-quest-plan.js';
const quest={id:'quest',offerLabel:'Quest',reward:{grantVocation:'vocation'}},key=(id:string)=>'quest_done:'+id;
const plan=planVocationQuestProgression(quest,'hero',true,key),first=plan.actions[0];
// @ts-expect-error Persistent character identity is a string.
planVocationQuestProgression(quest,1,true,key);
// @ts-expect-error A transient profile handle cannot replace durable identity.
planVocationQuestProgression(quest,{profile:1},true,key);
// @ts-expect-error Account-write authorization is explicit.
planVocationQuestProgression(quest,'hero','yes',key);
// @ts-expect-error Compilation does not await host effects.
planVocationQuestProgression(quest,'hero',true,async id=>'quest_done:'+id);
// @ts-expect-error The compiled sequence cannot grow.
plan.actions.push(first);
// @ts-expect-error Completion identity is immutable.
plan.questId='other';
// @ts-expect-error Owed gem count cannot be rewritten.
plan.owedGems=9;
if(first.kind==='points'){
 // @ts-expect-error Planned currency cannot be rewritten.
 first.amount=100;
}
// @ts-expect-error Planned command kind is immutable.
first.kind='vocation';
// @ts-expect-error Planned owner identity is immutable.
first.characterKey='other';
// @ts-expect-error Profile addresses are not a persistent reward target.
const transient:VocationQuestProgressionAction={kind:'vocation',profile:1,id:'vocation'};
// @ts-expect-error General account replacement is not a compiled reward.
const replacement:VocationQuestProgressionAction={kind:'account',command:{op:'observe'}};
void [transient,replacement];
