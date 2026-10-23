// Private original-only trace discovery. No accepted baseline or SDK policy.
// Course setup follows probe_talents C and probe_legends E; explicit grants,
// enemy vitals, positions and clocks are recorded as harness setup.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine, makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {vec} from '../src/core/math';
import type {World} from '../src/engine/world';
import type {Actor} from '../src/engine/actor';
import {CONDITION_IDS, mod} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {RECENT_CFG} from '../src/engine/recency';
import {SKILLS} from '../src/data/skills';
import {procStat} from '../src/data/procs';
import {rollItem} from '../src/engine/itemgen';

bootSimEngine();
function observe(p: Actor) {
  return {
    life:p.life, mana:p.mana, es:p.es, ward:p.ward, dead:p.dead,
    maxLife:p.maxLife(), damage:p.sheet.get('damage'), addedPhysical:p.sheet.get('addedPhysical'),
    actorConditions:CONDITION_IDS.filter(id=>p.conditionHolds(id)),
    sheetConditions:CONDITION_IDS.filter(id=>p.sheet.hasCondition(id)),
    mask:p['condMask'], rose:[...p.condRose], sheetMarkerCurrent:p['condSheet']===p.sheet,
    since:[...p.since], strideDist:p.strideDist, strideSpent:p.strideSpent,
    comboLeft:p.comboCondLeft, comboBits:p.comboCondBits,
    desperateWardReadyAt:p.procReadyAt.get('desperate_ward')??null,
  };
}
function trace(w: World, p: Actor) {
  const folds:{time:number,before:ReturnType<typeof observe>,after:ReturnType<typeof observe>}[]=[];
  const conditionEvents:{time:number,condition:string|null,queuedAtDispatch:number,wardBefore:number,wardAfter:number}[]=[];
  const checkpoints:{name:string,time:number,state:ReturnType<typeof observe>}[]=[];
  const originalRefresh=p['refreshConditions'].bind(p);
  p['refreshConditions']=()=>{
    const before=observe(p); originalRefresh();
    folds.push({time:w.time,before,after:observe(p)});
  };
  const originalProc=w.rollOwnProcs.bind(w);
  w.rollOwnProcs=(owner,trigger,options)=>{
    if(owner!==p||trigger!=='condition'){originalProc(owner,trigger,options);return;}
    const event={time:w.time,condition:options?.condition??null,queuedAtDispatch:owner.condRose.length,wardBefore:p.ward,wardAfter:0};
    originalProc(owner,trigger,options);event.wardAfter=p.ward;conditionEvents.push(event);
  };
  return {folds,conditionEvents,checkpoints,checkpoint(name:string){checkpoints.push({name,time:w.time,state:observe(p)});}};
}
function step(w:World,dt:number,count=1){for(let i=0;i<count;i++)w.update(dt);}
function dummy(w:World,p:Actor,dx:number,life:number){
  const z=w.createMonster('zombie',3,'enemy');z.pos=vec(p.pos.x+dx,p.pos.y);w.actors.push(z);
  z.sheet.setSource('trace-target',[mod('evasion','flat',-1e6),mod('armor','flat',-1e6)]);
  z.sheet.setBase('life',life);z.life=life;z.brain=undefined;return z;
}
const courses=[];
{
  const seed=0xc001,restore=seedGlobalRandom(seed);
  try {
    const w=makeSimWorld('warrior',seed),p=w.player;
    p.pos=w.clampPos(vec(w.arena.w/2,w.arena.h/2),p.radius);
    p.skills[0]=makeSkillInstance(SKILLS.cleave,1,3);
    p.sheet.setSource('trace-base',[mod('evasion','flat',-1e6),mod('critChance','flat',-1)]);
    const record=trace(w,p);step(w,.05,2);record.checkpoint('before-hit');
    assert(p.sheet.hasCondition('notHurtRecently'));assert(!p.sheet.hasCondition('recentlyKilled'));
    const z=dummy(w,p,40,5);p.mana=p.maxMana();
    assert(w.useSkill(p,p.skills[0],vec(z.pos.x,z.pos.y)));step(w,.05,24);
    record.checkpoint('after-native-kill');
    assert(z.dead||z.life<=0);assert(p.sheet.hasCondition('recentlyKilled'));assert(p.sheet.hasCondition('recentlyHit'));
    step(w,.1,Math.ceil((RECENT_CFG.windowSec+.5)/.1));record.checkpoint('after-recency-expiry');
    assert(!p.sheet.hasCondition('recentlyKilled'));assert(!p.sheet.hasCondition('recentlyHit'));
    const attacker=w.createMonster('zombie',3,'enemy');attacker.pos=vec(p.pos.x+30,p.pos.y);attacker.brain=undefined;w.actors.push(attacker);
    attacker.sheet.setSource('trace-attacker',[mod('accuracy','flat',1e6)]);
    const claw=attacker.skills.find(s=>s!==null)!;const lifeBefore=p.life;
    let attempts=0;while(attempts<80&&p.life>=lifeBefore){w.useSkill(attacker,claw,vec(p.pos.x,p.pos.y));step(w,.05);attempts++;}
    assert(p.life<lifeBefore);record.checkpoint('hurt-stamped-before-next-fold');
    step(w,.05);record.checkpoint('hurt-condition-published');
    assert(p.sheet.hasCondition('recentlyHurt'));assert(!p.sheet.hasCondition('notHurtRecently'));
    p.sheet.setSource('trace-proc',[mod(procStat('desperate_ward'),'flat',1)]);p.ward=0;p.life=p.maxLife()*.1;
    record.checkpoint('low-life-seeded');step(w,.05,2);record.checkpoint('native-low-life-proc');assert(p.ward>0);
    const wardAfter=p.ward,eventCount=record.conditionEvents.filter(e=>e.condition==='lowLife').length;
    p.life=p.maxLife()*.1;step(w,.05,2);record.checkpoint('held-low-life');
    assert(p.ward<=wardAfter+1e-6);assert.equal(record.conditionEvents.filter(e=>e.condition==='lowLife').length,eventCount);
    assert(record.conditionEvents.every(e=>e.queuedAtDispatch===0));
    courses.push({name:'native-hit-kill-hurt-condition-proc',seed,setup:'Original talent probe C actions. Seeded accuracy/evasion, target life and direct authored proc grant; low life deliberately seeded. Real request, hit, kill, timer folds and proc sweep execute through World.update. No claim of acquiring the proc through items/passives.',attempts,folds:record.folds,conditionEvents:record.conditionEvents,checkpoints:record.checkpoints});
  } finally {restore();}
}
{
  const seed=0x1ea1,restore=seedGlobalRandom(seed);
  try {
    const w=makeSimWorld('warrior',seed),seat=w.localSeat,p=seat.actor,baseDamage=p.sheet.get('damage');
    const boots=rollItem({ilvl:20,uniqueId:'wanderers_wake'});assert(boots);seat.meta.equipped.boots=boots;w.recalcSeat(seat);
    const reach=p.sheet.get('strideReach');assert(reach>0);
    const record=trace(w,p);record.checkpoint('boots-equipped-before-walking');assert.equal(p.strideDist,0);
    let moves=0;while(p.strideDist<reach&&moves<400){w.moveActor(p,moves%40<20?1:-1,0,.05);moves++;}
    record.checkpoint('walk-completed-before-fold');p.updateTimers(.016);record.checkpoint('stride-published-by-actor-timer');
    assert(p.conditionHolds('strided'));assert(p.sheet.get('damage')>baseDamage+.3);assert(p.sheet.get('addedPhysical')>=8);
    const z=dummy(w,p,30,1000),lifeBefore=z.life,walked=p.strideDist,cleave=p.skills.find(s=>s?.def.id==='cleave')!;
    p.mana=p.maxMana();assert(w.useSkill(p,cleave,vec(z.pos.x,z.pos.y)));
    let frames=0;while(z.life>=lifeBefore&&frames<30){step(w,.05);frames++;}
    assert(z.life<lifeBefore);record.checkpoint('landed-hit-marks-stride-spent');assert(p.strideSpent);
    step(w,.016);record.checkpoint('next-world-frame-spends-before-fold');
    assert(p.strideDist<walked*.05);assert(!p.strideSpent);assert(!p.conditionHolds('strided'));
    delete seat.meta.equipped.boots;w.recalcSeat(seat);p.strideDist=0;
    for(let i=0;i<20;i++)w.moveActor(p,1,0,.05);
    record.checkpoint('unequipped-walk-does-not-accrue');assert.equal(p.strideDist,0);
    courses.push({name:'authored-boots-walk-hit-stride-spend',seed,setup:'Original legend probe E paths, independently seeded. Boots rolled by original item rules, directly placed in the equipment map and applied by recalcSeat. Initial fold uses Actor.updateTimers explicitly; landed blow and next-frame spend use World.update. No inventory transfer or physical-input acceptance.',reach,moves,frames,folds:record.folds,conditionEvents:record.conditionEvents,checkpoints:record.checkpoints});
  } finally {restore();}
}
fs.writeFileSync(process.argv[2],JSON.stringify({schema:'private-native-condition-traces/v1',courses},null,2)+'\n',{flag:'wx'});
