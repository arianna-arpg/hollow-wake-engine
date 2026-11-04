import fs from 'node:fs';
import assert from 'node:assert/strict';
import {VOCATION_CFG,VOCATION_LIST,vocationLedgerKey,vocationStepKey,vocationRootId} from '../src/data/vocations';
import {odysseyMilestoneKey} from '../src/data/powerProgression';
import {vocationStepQuestId} from '../src/quests/vocations';
import {QUESTS} from '../src/quests/defs';
import {Actor} from '../src/engine/actor';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
const result=[];
for(const sealed of [false,true]){
  const reset=seedGlobalRandom(0x7617);
  try {
    const w=makeSimWorld('warrior',0x7617),hero=w.player,def=VOCATION_LIST.find(v=>v.classId==='warrior'&&!v.secret)!;
    const giver=new Actor('Test quartermaster','player',{...hero.pos});giver.defId=VOCATION_CFG.giver;w.actors.push(giver);
    hero.level=60;w.meta.modeId=sealed?'immortal':'mortal';w.meta.modeStage=sealed?1:0;
    w.account.ledger[odysseyMilestoneKey(1)]=1;
    for(const q of Object.values(QUESTS))if(q.vocation!==def.id)w.completedQuests.add(q.id);
    assert.equal(w['giverPresent'](VOCATION_CFG.giver),giver);
    const key=vocationLedgerKey(def.id),steps=def.quest.steps.map((_,i)=>vocationStepQuestId(def.id,i+1));
    const state=()=>({menu:w.vocationMenuOffers(),vocations:[...w.meta.vocations],root:w.meta.allocated.has(vocationRootId(def.id)),
      active:w.activeQuests.map(e=>[e.questId,e.fieldDone]),completed:steps.filter(id=>w.completedQuests.has(id)),
      run:key in w.ledger?w.ledger[key]:null,account:key in w.account.ledger?w.account.ledger[key]:null,
      stepKeys:steps.map((_,i)=>w.ledger[vocationStepKey(def.id,i+1)]??null),
      accountStepKeys:steps.map((_,i)=>w.account.ledger[vocationStepKey(def.id,i+1)]??null),
      points:w.meta.vocationPoints,questsCompleted:w.ledger.quests_completed??null});
    const events:any[]=[{name:'offer',state:state()}];
    assert.deepEqual(w.vocationMenuOffers().map(x=>x.questId),[steps[0]]);
    assert(w.acceptVocationQuest(steps[0]));assert.equal(w.acceptVocationQuest(steps[0]),false);
    for(const [i,id]of steps.entries()){
      if(i){w['updateQuestGiver'](10);assert(w.activeQuests.some(q=>q.questId===id),'Engaged chain should auto-accept '+id);}
      const aq=w.activeQuests.find(q=>q.questId===id)!;
      events.push({name:'accepted',id,state:state()});
      // Enter the reward boundary with a completed field objective. Zone
      // objectives themselves remain the quest/generation system's concern.
      aq.fieldDone=true;
      const before=w.completedQuests.has(id);w['updateQuestGiver'](10);
      assert(!before&&w.completedQuests.has(id),'Turn-in should pay '+id);
      events.push({name:'paid',id,state:state()});
      w['onQuestZoneCleared'](aq);
      assert.deepEqual(state(),events.at(-1).state,'Replayed turn-in paid twice');
    }
    assert.deepEqual(w.meta.vocations,[def.id]);assert.equal(w.ledger[key],1);assert.equal(w.account.ledger[key]??null,sealed?null:1);
    result.push({sealed,vocation:def.id,steps,events});
  } finally {reset();}
}
fs.writeFileSync(process.argv[2],JSON.stringify(result)+'\n',{flag:'wx'});
console.log({chains:result.length,steps:result.map(r=>r.steps.length)});
