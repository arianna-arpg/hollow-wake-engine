import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {CLASSES,PROGRESSION} from '../src/data/classes';
import {CLASS_LEVEL_MILESTONES} from '../src/meta/account';
import {catalogLevelMilestones,catalogClassLevelMilestones} from '../src/meta/unlocks';
import {NullInput} from '../src/net/intent';
import {forgeItem} from '../src/engine/itemgen';
import type {Seat} from '../src/engine/world';

bootSimEngine();
const wire=(v:unknown):any=>JSON.parse(JSON.stringify(v));
const authored={
  startingPassivePoints:PROGRESSION.startingPassivePoints,passivePointsPerLevel:PROGRESSION.passivePointsPerLevel,
  lifePerLevel:PROGRESSION.lifePerLevel,manaPerLevel:PROGRESSION.manaPerLevel,
  classMilestones:[...CLASS_LEVEL_MILESTONES],catalogMilestones:[...catalogLevelMilestones()],
  classes:CLASSES.map(c=>({id:c.id,milestones:[...catalogClassLevelMilestones(c.id)]})),
};
const curves=Array.from({length:4096},(_,i)=>({level:i+1,xp:PROGRESSION.xpForLevel(i+1),points:PROGRESSION.passivePointsAtLevel(i+1)}));
type World=ReturnType<typeof makeSimWorld>;
const scenarios:any[]=[];
function observe(w:World){
  const hero=(s:Seat)=>w.seatHero(s);
  const snapshot=()=>wire({seats:w.seats.map(s=>{const p=hero(s);return {id:s.id,classId:s.meta.classDef.id,
    local:s===w.localSeat,couch:!!s.couch,merc:!!s.merc,dead:s.actor.dead,home:!!s.home,controlledLevel:s.actor.level,
    level:p.level,downed:!!p.downed,xp:s.meta.xp,xpNeeded:s.meta.xpNeeded,points:s.meta.passivePoints,
    life:p.life,mana:p.mana,maxLife:p.maxLife(),maxMana:p.maxMana(),levelMods:p.sheet.getSourceMods('level'),
    attributes:s.meta.attrs,relicEnabled:s.meta.relicEnabled,controlledPosition:s.actor.pos};}),
    ledger:Object.entries(w.ledger),dirty:[...w.metaDirty],blessing:w.mireilleXpBuff});
  let events:any[]=[];
  const anyWorld:any=w;
  for(const name of ['markMetaDirty','recalcSeat','text','resyncMercenary']){
    const method=anyWorld[name];anyWorld[name]=function(...args:any[]){
      events.push({name,phase:'before',seat:args[0]?.id,...(name==='text'?{position:wire(args[0]),text:args[1],color:args[2],size:args[3]}:{}),state:snapshot()});
      const result=method.apply(this,args);events.push({name,phase:'after',state:snapshot()});return result;
    };
  }
  for(const seat of w.seats){const p=hero(seat),fill=p.fillResources;p.fillResources=function(){events.push({name:'fillResources',phase:'before',seat:seat.id,state:snapshot()});const result=fill.call(this);events.push({name:'fillResources',phase:'after',state:snapshot()});return result;};}
  const rows:any[]=[];
  return {rows,snapshot,step(name:string,amount:number){w.metaDirty.clear();events=[];const before=snapshot();w.grantXp(amount);rows.push(wire({name,amount,before,after:snapshot(),events}));}};
}
for(const [index,cls] of CLASSES.entries()){
 const restore=seedGlobalRandom(180000+index);
 try{
  const w=makeSimWorld(cls.id,180000+index),p=w.player,m=w.meta,course=observe(w);
  course.step('zero-does-not-mint-points',0);
  course.step('below-first-threshold',m.xpNeeded-.25);course.step('exact-first-threshold',.25);
  course.step('two-levels-one-award',m.xpNeeded+PROGRESSION.xpForLevel(p.level+1));
  course.step('negative-adjustment',-.5);course.step('fractional-adjustment',.25);
  p.downed=true;p.life=0;p.mana=0;course.step('downed-level-does-not-fill',m.xpNeeded-m.xp);assert.equal(p.life,0);assert.equal(p.mana,0);
  p.downed=false;course.step('zero-after-revive-no-fill',0);
  w.mireilleXpBuff=1;course.step('blessing-rounds-before-bank',10);w.mireilleXpBuff=0;
  const relic=forgeItem({baseId:'relic_charm',ilvl:1,rarity:'magic',quality:1,affixes:[]})!;assert(relic);m.containers.reliquary=[relic];m.relicEnabled=true;
  course.step('relic-fraction',1);w.mireilleXpBuff=1;course.step('blessing-before-relic',10);w.mireilleXpBuff=0;m.containers.reliquary=[];
  for(const level of [9,14,49,99,100]){
   p.level=level;m.xp=PROGRESSION.xpForLevel(level)-.25;m.xpNeeded=PROGRESSION.xpForLevel(level);m.passivePoints=PROGRESSION.passivePointsAtLevel(level);w.recalcSeat(w.localSeat);
   course.step('cross-level-'+level,.25);
  }
  assert.equal(p.level,101,'Observe actual lack of a level-100 cap');
  course.step('repeat-does-not-double-stamp',0);
  // Existing nonzero ledger counters survive; explicit zero keys are earned.
  w.ledger.reached_level_5=7;w.ledger.reached_level_100=0;course.step('existing-milestone-counters',0);
  scenarios.push({name:'class-'+cls.id,rows:course.rows});
 }finally{restore();}
}
for(const mode of ['party','couch-only','remote-only','possession','controlled-dead','hero-dead','live-tuning']){
 const restore=seedGlobalRandom(181000+scenarios.length);
 try{
  const w=makeSimWorld('warrior',181000+scenarios.length),local=w.localSeat;
  const add=(id:string,classId:string)=>w.addSeat(id,CLASSES.find(c=>c.id===classId)!,new NullInput(),{startingCompanions:false,startingFlasks:false});
  const couch=add('couch','magician');couch.couch={pad:1,side:'right'};
  add('remote','warrior');const merc=add('merc','warrior'),dead=add('dead','magician'),down=add('downed','magician');
  merc.merc={name:'Observed hire'};dead.actor.dead=true;down.actor.downed=true;down.actor.life=0;down.actor.mana=0;
  if(mode==='couch-only'||mode==='remote-only')for(const s of w.seats)if(s.id!==(mode==='couch-only'?'couch':'remote'))s.actor.dead=true;
  if(['possession','controlled-dead','hero-dead'].includes(mode)){
   local.home=local.actor;local.actor=w.createMonster('dire_wolf',23,'player');local.actor.pos={x:91,y:37};
   if(mode==='controlled-dead')local.actor.dead=true;if(mode==='hero-dead')local.home.dead=true;
  }
  const course=observe(w),defaults={points:PROGRESSION.passivePointsPerLevel,life:PROGRESSION.lifePerLevel,mana:PROGRESSION.manaPerLevel};
  try{
   if(mode==='live-tuning'){PROGRESSION.passivePointsPerLevel=3;PROGRESSION.lifePerLevel=7;PROGRESSION.manaPerLevel=2;}
   for(const amount of [0,44.75,.25,4000,-.25,0])course.step('award-'+amount,amount);
   if(mode==='couch-only')assert(w.ledger.reached_level_5);
   if(mode==='remote-only')assert(!w.ledger.reached_level_5);
   if(mode==='possession')assert.equal(local.actor.level,23);
   scenarios.push({name:mode,rows:course.rows});
  }finally{PROGRESSION.passivePointsPerLevel=defaults.points;PROGRESSION.lifePerLevel=defaults.life;PROGRESSION.manaPerLevel=defaults.mana;}
 }finally{restore();}
}
const output=process.argv[2];fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'character-progression.json'),JSON.stringify({authored,curves,scenarios})+'\n');
console.log(`Observed ${curves.length} curve levels, ${scenarios.length} original Worlds and ${scenarios.reduce((n,s)=>n+s.rows.length,0)} XP transitions with ordered callbacks.`);
