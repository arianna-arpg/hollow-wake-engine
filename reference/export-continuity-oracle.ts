import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Actor} from '../src/engine/actor';
import {CLASSES} from '../src/data/classes';
import {UNLOCK_CATALOG,claimClassUnlock,acknowledgeClassUnlock} from '../src/meta/unlocks';
import {makeAccount,isSkillUnlockedForDrop} from '../src/meta/account';
import {serializeCharacter} from '../src/meta/character';
import {revengeQuestDefs} from '../src/quests/revenge';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {NullInput} from '../src/net/intent';

bootSimEngine();
const restore=seedGlobalRandom(2769);
try{
 const w=makeSimWorld('warrior',2769);Object.assign(w.account,makeAccount());w.loadZone('lastlight');
 const quest=revengeQuestDefs().find(q=>q.reward.skillChoice)!;
 const row=UNLOCK_CATALOG.find(q=>q.kind==='class'&&q.payload.classId==='ranger')!;
 w.account.ledger['deed:distant_projectile_hits']=180;
 assert(claimClassUnlock(w.account,row));assert(w.account.pendingClassUnlocks.has('ranger'));
 const wanted='piercing_arrow';assert(isSkillUnlockedForDrop(w.account,wanted));
 const field={questId:quest.id,zoneId:'observed-field',fieldDone:true};w.activeQuests.push(field);
 for(const a of w.actors)if(a.defId==='townsfolk_oracle')a.pos={x:18000,y:18000};
 const away=w.claimQuestReward(quest.id,wanted);
 const giver=new Actor('Oracle witness','player',{...w.player.pos});giver.defId='townsfolk_oracle';w.actors.push(giver);
 const offered=()=>w.questRewardOffers().find(q=>q.questId===quest.id)?.choices.map(c=>c.id)??[];
 const pending=offered(),denied=w.claimQuestReward(quest.id,wanted);assert(!denied&&!pending.includes(wanted));
 const xpBefore=w.meta.xp,pointsBefore=w.meta.passivePoints,bagBefore=new Set(w.meta.items.map(i=>i.uid));
 const active=acknowledgeClassUnlock(w.account,row);assert(active);
 const available=offered();assert(available.includes(wanted));
 const guest=w.addSeat('other',CLASSES[1],new NullInput(),{startingCompanions:false,startingFlasks:false});const guestDenied=w.claimQuestReward(quest.id,wanted,guest);
 const actual=w.claimQuestReward(quest.id,wanted),repeat=w.claimQuestReward(quest.id,wanted);const items=w.meta.items.filter(i=>!bagBefore.has(i.uid));
 const gem=items.find(i=>i.gem?.kind==='skill'&&i.gem.skillId===wanted);assert(gem?.gem?.kind==='skill');
 const saved=serializeCharacter(w);const output={quest:quest.id,away,pending,denied,active,available,guestDenied,actual,repeat,questLeft:w.activeQuests.includes(field),item:{base:gem.baseId,kind:gem.gem.kind,id:gem.gem.skillId,rarity:gem.gem.rarity,level:gem.gem.level},
  savedItems:(saved.items??[]).filter(i=>i.gem?.kind==='skill'&&i.gem.skillId===wanted).length,pointsBefore,pointsAfter:w.meta.passivePoints,xpBefore,xpAfter:w.meta.xp,heroLevel:w.player.level,
  credit:w.ledger.oracle_commander_done,completion:w.ledger.quests_completed};
 assert(!away&&!guestDenied&&actual&&!repeat&&!output.questLeft);assert.equal(output.savedItems,1);
 fs.writeFileSync(process.argv[2],JSON.stringify(output)+'\n',{flag:'wx'});
}finally{restore();}
