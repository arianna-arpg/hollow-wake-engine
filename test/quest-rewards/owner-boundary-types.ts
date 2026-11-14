import type {DurableMintedVocationQuestOwner,MintedVocationQuestOptions} from '../../src/minted-vocation-quest-owner.js';
import type {CharacterMemoryDelivery} from 'candidate/memory-delivery';
declare const owner:DurableMintedVocationQuestOwner<object>,options:MintedVocationQuestOptions<object>,drops:CharacterMemoryDelivery[];
void owner.settleTrusted('voc_warbringer_3');
// @ts-expect-error Player commands cannot complete a quest.
void owner.submit([{kind:'quest',questId:'voc_warbringer_3'}]);
// @ts-expect-error Callers cannot inject either sealed Memory rewards or bare gems.
void owner.settleTrusted('voc_warbringer_3',[{kind:'skill',gem:{}}]);
// @ts-expect-error Quest authorization must be synchronous.
options.authorize=async()=>true;
// @ts-expect-error Account policy must be synchronous.
options.accountWrites=async()=>true;
// @ts-expect-error Publication cannot be asynchronous.
options.live.publish=async()=>{};
// @ts-expect-error Quest completion requires a stable authored ID.
void owner.settleTrusted(7);
// @ts-expect-error No character handle may override the fixed journey owner.
void owner.settleTrusted('voc_warbringer_3',drops,42);
// @ts-expect-error Quest books cannot restore transient profile handles.
options.characterKey=7;
