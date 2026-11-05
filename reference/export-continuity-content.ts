import fs from 'node:fs';
import {CLASSES,PROGRESSION} from '../src/data/classes';
import {CLASS_BUNDLES,UNLOCK_CATALOG} from '../src/meta/unlocks';
import {STARTER_CLASSES,STARTER_SKILLS,STARTER_SUPPORTS} from '../src/meta/account';
import {CLASS_TIERS,CLASS_WEB_CFG} from '../src/data/classTiers';
import {MERC_CFG} from '../src/meta/mercs';
import {MEMORY_UNLOCK_CFG,MEMORY_UNLOCKS} from '../src/data/memoryUnlocks';
const payload={starters:{classes:STARTER_CLASSES,skills:STARTER_SKILLS,supports:STARTER_SUPPORTS},
 legacy:{enabled:MEMORY_UNLOCK_CFG.legacyGemBundles,target:MEMORY_UNLOCKS.find(r=>r.tier==='discovery')?.id,rows:UNLOCK_CATALOG.filter(r=>r.kind==='skill'||r.kind==='support').map(r=>({id:r.id,kind:r.kind}))},
 classIds:CLASSES.map(c=>c.id),bundles:CLASS_BUNDLES,earned:UNLOCK_CATALOG.filter(r=>r.kind==='class'),tiers:CLASS_TIERS,web:CLASS_WEB_CFG,
 mercenary:{anchor:MERC_CFG.scale.anchor,trackLevel:MERC_CFG.scale.trackLevel,respectGearLevelReq:MERC_CFG.scale.respectGearLevelReq,
 gemLevelCap:MERC_CFG.scale.gemLevelCap.toString(),passiveBudget:MERC_CFG.scale.passiveBudget.toString(),startingPassivePoints:PROGRESSION.startingPassivePoints,passivePointsPerLevel:PROGRESSION.passivePointsPerLevel},
 curves:Array.from({length:4096},(_,i)=>{const level=i+1;return {level,gemCap:MERC_CFG.scale.gemLevelCap(level),passiveBudget:MERC_CFG.scale.passiveBudget(level)};})};
fs.writeFileSync(process.argv[2],JSON.stringify(payload)+'\n',{flag:'wx'});
