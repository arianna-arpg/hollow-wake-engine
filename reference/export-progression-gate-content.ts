import fs from 'node:fs';
import {
  reachedLevelKey,classLevelLedgerKey,vocationUnlockKey,questDoneKey,
  LEDGER_VOCATION_PREFIX,LEDGER_QUEST_DONE_PREFIX,LEDGER_QUESTS_COMPLETED,FEATURE
} from '../src/meta/account';
import {CLASSES} from '../src/data/classes';
import {UNLOCK_CATALOG} from '../src/meta/unlocks';

const classToken='__gate_class__';
const ids=['',classToken,'other_class','__proto__','a:level_0','α'];
const levels=[0,1,5,10,99,100,4096,-1,.5,Number.MAX_SAFE_INTEGER,NaN,Infinity];
const encoders={reachedLevelKey,classLevelLedgerKey,vocationUnlockKey,questDoneKey};
const output={
  classToken,
  levelZero:reachedLevelKey(0),
  classZero:classLevelLedgerKey(classToken,0),
  vocationPrefix:LEDGER_VOCATION_PREFIX,
  questDonePrefix:LEDGER_QUEST_DONE_PREFIX,
  questsCompletedKey:LEDGER_QUESTS_COMPLETED,
  encoderSources:Object.fromEntries(Object.entries(encoders).map(([name,fn])=>[name,fn.toString()])),
  classes:CLASSES.map(row=>({id:row.id,name:row.name})),
  unlockIds:UNLOCK_CATALOG.map(row=>row.id),
  featureIds:Object.values(FEATURE),
  levels:levels.map(level=>({level,key:reachedLevelKey(level)})),
  classLevels:ids.flatMap(id=>levels.map(level=>({id,level,key:classLevelLedgerKey(id,level)}))),
  vocations:ids.map(id=>({id,key:vocationUnlockKey(id)})),
  quests:ids.map(id=>({id,key:questDoneKey(id)}))
};
const encode=(_key:string,value:unknown)=>typeof value==='number'&&!Number.isFinite(value)?{number:String(value)}:value;
fs.writeFileSync(process.argv[2],JSON.stringify(output,encode)+'\n',{flag:'wx'});
