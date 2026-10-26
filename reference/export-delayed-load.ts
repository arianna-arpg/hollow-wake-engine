// Controlled authored-contact workload, not production-player telemetry.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {StatSheet} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';import {SKILLS} from '../src/data/skills';
import {PROCS,PROC_LIST,procStat} from '../src/data/procs';
bootSimEngine();const rows:unknown[]=[],ids=['radiant_reprisal','radiant_cascade','sainted_ash'];
const loaded=PROC_LIST.filter(p=>p.effect.type==='delayedBurst');assert.deepEqual(loaded.map(p=>p.id),[...ids,'native_parting_blessing','native_song_of_return']);
for(const targets of [1,8,32])for(const interval of [.25,.75]){
 const restore=seedGlobalRandom(0xc044),w=makeSimWorld('warrior',0xc044),p=w.player;
 try{p.sheet=new StatSheet();p.sheet.setBase('life',1000);p.sheet.setBase('critChance',0);p.sheet.setBase('accuracy',1000000);p.sheet.setBase('killProcOnHit',1);p.life=500;p.es=0;p.poise=0;p.ward=0;p.level=5;p.pos={x:700,y:700};p.skills=[];p.statuses=[];p.charges.clear();p.buffs.clear();p.healedSince=0;p.procReadyAt.clear();p.procAttemptAt.clear();p.procFiredAt.clear();
  for(const id of ids)p.sheet.setBase(procStat(id),1);
  const victims=Array.from({length:targets},(_,i)=>{const a=new Actor('victim-'+i,'enemy',{x:710+i*.5,y:700});a.sheet=new StatSheet();a.sheet.setBase('life',1000000);a.life=1000000;a.es=0;a.poise=0;a.ward=0;a.insight=0;a.endurance=0;a.absorb=0;a.tier=0;a.radius=10;a.rarity='rare';return a;});w.actors=[p,...victims];w.time=10;w.flashes=[];
  const inst=makeSkillInstance(SKILLS.sanctified_strike);assert.equal(inst.def,SKILLS.sanctified_strike);
  let draws=0;Math.random=()=>{draws++;return .5;};
  const native=w['executeProc'],executions:{id:string;time:number}[]=[];
  w['executeProc']=(...args)=>{executions.push({id:args[0].id,time:w.time});return native.apply(w,args);};
  const stages:unknown[]=[];let peak=0;
  for(let batch=0;batch<4;batch++){
    w.time=10+batch*interval;const before=w['pendingBursts'].length,start=executions.length;
    for(const victim of victims){const life=victim.life;w['resolveHit'](p,inst,victim);assert(victim.life<life);assert(!victim.dead);}
    const count=Object.fromEntries(ids.map(id=>[id,executions.slice(start).filter(e=>e.id===id).length]));
    assert.deepEqual(count,{radiant_reprisal:1,radiant_cascade:targets,sainted_ash:targets});
    const queued=w['pendingBursts'].length;assert.equal(queued,before+1+2*targets);peak=Math.max(peak,queued);
    w['updatePendingBursts']();stages.push({batch,time:w.time,before,queued,after:w['pendingBursts'].length,executions:count,ownerLife:p.life,enemyLives:victims.map(a=>a.life),draws});
  }
  w.time+=.5;w['updatePendingBursts']();assert.equal(w['pendingBursts'].length,0);assert.equal(executions.length,4*(1+2*targets));
  rows.push({name:'authored-contacts-'+targets+'-interval-'+interval,targets,interval,skill:inst.def.id,authored:ids.map(id=>PROCS[id]),phase:'Explicit native contacts then native drain at each supplied time; no full World.update, AI, input or cast-cadence acceptance.',peakQueued:peak,stages,final:{time:w.time,ownerLife:p.life,enemyLives:victims.map(a=>a.life),pending:0,executions:executions.length,draws}});
 }finally{restore();}
}
assert.equal(rows.length,6);assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Unaccepted authored workload occupancy. The original Sanctified Strike definition and the three hit-compatible delayed proc definitions are unchanged. Native resolveHit, proc selection, scheduling, mitigation, healing and draining all run. One, eight and thirty-two rare victims receive four contact batches; accelerated and ordinary-sized intervals test overlap. This is controlled workload evidence, not actual player telemetry, capacity sizing or a performance result.',courses:rows.length,loadedDelayedDefinitions:loaded,rows},null,2)+'\n');
