import quests from 'candidate/quest-reward-data';
import kinds from 'candidate/memory-kind-data';
/** Test-host key convention. The original-World course supplies and compares
 * the original key encoder independently. Eligibility remains a host policy. */
export const questDoneKey=id=>'quest_done:'+id;
export const vocationQuestDefs=()=>quests.quests;
export const MEMORY_KINDS=kinds;
