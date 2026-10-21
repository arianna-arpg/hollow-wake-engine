import fs from 'node:fs';import path from 'node:path';import {makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {PROGRESSION} from '../src/data/classes';import {CLASS_LEVEL_MILESTONES} from '../src/meta/account';import {catalogClassLevelMilestones,catalogLevelMilestones} from '../src/meta/unlocks';
const restore=seedGlobalRandom(182010),w=makeSimWorld('warrior',182010),p=w.player,m=w.meta;
const defaults={starting:PROGRESSION.startingPassivePoints,points:PROGRESSION.passivePointsPerLevel,life:PROGRESSION.lifePerLevel,mana:PROGRESSION.manaPerLevel};
const standing=CLASS_LEVEL_MILESTONES as number[],general=catalogLevelMilestones(),classLevels=catalogClassLevelMilestones('warrior'),before={standing:[...standing],general:[...general],classLevels:[...classLevels]},rows:any[]=[];
const record=(name:string,amount:number)=>{w.grantXp(amount);rows.push({name,level:p.level,xp:m.xp,xpNeeded:m.xpNeeded,points:m.passivePoints,budget:PROGRESSION.passivePointsAtLevel(12),growth:p.sheet.getSourceMods('level'),life:p.life,mana:p.mana,ledger:Object.entries(w.ledger)});};
try{
 record('initial-policy',45);
 PROGRESSION.passivePointsPerLevel=3;PROGRESSION.lifePerLevel=7;PROGRESSION.manaPerLevel=2;record('numeric-tuning-after-cache',m.xpNeeded);
 PROGRESSION.startingPassivePoints=6;record('starting-budget-after-cache',0);
 general.push(3);record('general-milestone-array-edit',0);
 standing.push(3);record('standing-class-array-edit',0);
 classLevels.push(2);record('catalog-class-array-edit',0);
 general.splice(0,general.length,...before.general);standing.splice(0,standing.length,...before.standing);classLevels.splice(0,classLevels.length,...before.classLevels);
 PROGRESSION.startingPassivePoints=defaults.starting;PROGRESSION.passivePointsPerLevel=defaults.points;PROGRESSION.lifePerLevel=defaults.life;PROGRESSION.manaPerLevel=defaults.mana;
 record('restored-tuning-and-milestones',m.xpNeeded);
}finally{
 general.splice(0,general.length,...before.general);standing.splice(0,standing.length,...before.standing);classLevels.splice(0,classLevels.length,...before.classLevels);
 PROGRESSION.startingPassivePoints=defaults.starting;PROGRESSION.passivePointsPerLevel=defaults.points;PROGRESSION.lifePerLevel=defaults.life;PROGRESSION.manaPerLevel=defaults.mana;restore();
}
fs.mkdirSync(process.argv[2],{recursive:true});fs.writeFileSync(path.join(process.argv[2],'progression-refresh.json'),JSON.stringify(rows)+'\n');console.log(`Observed ${rows.length} live progression content revisions.`);
