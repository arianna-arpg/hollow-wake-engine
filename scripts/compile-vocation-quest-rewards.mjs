import assert from 'node:assert/strict';
import {accepted,readVocationFixture} from './vocation-reference.mjs';
import {sha256} from './reference-utils.mjs';
/** Project the already-accepted original chain data. This pack covers final
 * vocation turn-in payouts only. The existing vocation compiler retains all
 * 92 chain steps and their offer gates; neither is redefined by this owner. */
export function vocationQuestRewardPack(){
 const survey=JSON.parse(readVocationFixture('survey'));assert.equal(survey.generated.length,accepted.steps);assert.equal(survey.vocations,accepted.vocations);
 const quests=survey.generated.filter(q=>q.reward.grantVocation).map(q=>({id:q.id,offerLabel:q.offerLabel,vocation:q.vocation,reward:q.reward}));
 assert.equal(quests.length,accepted.vocations);assert.equal(new Set(quests.map(q=>q.id)).size,quests.length);
 for(const q of quests){
  assert.equal(q.vocation,q.reward.grantVocation);assert(Object.keys(q.reward).every(k=>['xp','gems','passivePoints','vocationPoints','grantVocation','ledger'].includes(k)));
  for(const key of ['xp','gems','passivePoints','vocationPoints'])if(q.reward[key]!==undefined)assert(Number.isSafeInteger(q.reward[key])&&q.reward[key]>=0);
  assert((q.reward.gems??0)<=64);for(const value of Object.values(q.reward.ledger??{}))assert(Number.isSafeInteger(value)&&value>=0);
 }
 const data={schemaVersion:1,capability:'vocation-quest-rewards/diagnostic',quests};
 return{...data,contentId:'hollow-wake-vocation-quest-rewards:sha256:'+sha256(JSON.stringify(data))};
}
