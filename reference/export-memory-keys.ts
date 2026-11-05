import fs from 'node:fs';
import {FEATURE,LEDGER_GEMDROP_PREFIX,gemDropKey} from '../src/meta/account';
import {POWER_PROGRESSION,odysseyMilestoneKey,powerProgressionOpen} from '../src/data/powerProgression';
import {memoryKey} from '../src/meta/memoryUnlocks';
const ids=['','a','a:b','__proto__','constructor','toString','old skill','a.b','日本語'];
const stages=[0,1,2,3,9,99];
const output={
 unlockAllFeature:FEATURE.UNLOCK_ALL_GEMS,gemDropPrefix:LEDGER_GEMDROP_PREFIX,
 awakeningStage:POWER_PROGRESSION.awakening.odysseyStage,
 gemDrops:ids.map(id=>({id,key:gemDropKey(id)})),
 memoryKeys:ids.flatMap(id=>(['skill','support'] as const).map(kind=>({kind,id,key:memoryKey(kind,id)}))),
 milestones:stages.map(stage=>({stage,key:odysseyMilestoneKey(stage)})),
 progression:stages.flatMap(stage=>[0,.5,1,2].map(count=>{
  const ledger={[odysseyMilestoneKey(stage)]:count};
  return {ledger,open:powerProgressionOpen(ledger,'awakening')};
 })),
};
fs.writeFileSync(process.argv[2],JSON.stringify(output)+'\n',{flag:'wx'});
