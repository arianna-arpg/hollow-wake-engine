import type {DurableMintedVocationQuestOwner,MintedVocationQuestOptions,MintedVocationQuestCheckpoint} from '../../src/minted-vocation-quest-owner.js';
import {prepareQuestMemories,type QuestMemoryFactory,type QuestMemoryContext,type QuestMemoryServices,type QuestMemoryPlacement} from 'candidate/quest-memory-mint';
import type {RandomState} from '../../src/types.js';
declare const owner:DurableMintedVocationQuestOwner<object>,options:MintedVocationQuestOptions<object>,snapshot:RandomState,context:QuestMemoryContext,services:QuestMemoryServices,checkpoint:MintedVocationQuestCheckpoint;
void owner.settleTrusted('voc_warbringer_3');
// @ts-expect-error The owner mints rewards; callers cannot inject units.
void owner.settleTrusted('voc_warbringer_3',[]);
// @ts-expect-error Quest identity is stable text.
void owner.settleTrusted(7);
// @ts-expect-error Player commands cannot complete a quest.
void owner.submit([{kind:'quest',questId:'voc_warbringer_3'}]);
// @ts-expect-error Mint context must be prepared synchronously.
options.mint=async()=>context;
// @ts-expect-error A roll callback cannot return a promise.
services.rollSkill=async()=>({});
// @ts-expect-error Deferred presentation data cannot return a promise.
services.presentation=async()=>({});
// @ts-expect-error Random continuation is structured, not a loose seed string.
checkpoint.mint='42';
// @ts-expect-error A factory must supply admitted host roll services.
options.mint=()=>({worldKey:'world',at:{x:0,y:0}});
const factory:QuestMemoryFactory=scope=>{
 // @ts-expect-error The owner-provided random service cannot be replaced.
 scope.random=()=>0;
 return context;
};
// @ts-expect-error The payout count is numeric.
void prepareQuestMemories(snapshot,'six',factory);
// @ts-expect-error Random algorithm identities are explicit.
void prepareQuestMemories({algorithm:'native-random',state:1,draws:0},6,factory);
// @ts-expect-error A spatial story is numeric when present.
const invalidPlacement:QuestMemoryPlacement={worldKey:'world',pos:{x:0,y:0},at:{x:0,y:0},bob:0,tier:'upper'};void invalidPlacement;
