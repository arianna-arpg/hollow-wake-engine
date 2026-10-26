// The two delayed effects registered by native passive content at boot.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {StatSheet} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';import {SKILLS} from '../src/data/skills';
import {PROCS,procStat} from '../src/data/procs';
bootSimEngine();const rows:unknown[]=[];
for(const id of ['native_parting_blessing','native_song_of_return']){
 const restore=seedGlobalRandom(0xc045),w=makeSimWorld('warrior',0xc045),p=w.player;
 try{const proc=PROCS[id];assert.equal(proc.effect.type,'delayedBurst');assert(proc.effect.type==='delayedBurst');const delay=proc.effect.delay;
  p.sheet=new StatSheet();p.sheet.setBase('life',1000);p.sheet.setBase(procStat(id),1);p.life=500;p.es=0;p.poise=0;p.ward=0;p.level=5;p.tier=0;p.pos={x:700,y:700};p.skills=[];p.statuses=[];p.charges.clear();p.buffs.clear();p.healedSince=0;p.procReadyAt.clear();p.procAttemptAt.clear();p.procFiredAt.clear();w.actors=[p];w.time=10;
  let draws=0;Math.random=()=>{draws++;return .5;};const events:unknown[]=[];const execute=w['executeProc'];w['executeProc']=(...args)=>{events.push({id:args[0].id,time:w.time,target:args[3]?.name??null,skill:args[2]?.def.id??null,depth:args[4]??0});return execute.apply(w,args);};
  let occurrence=0;const deliver=()=>{occurrence++;if(id==='native_parting_blessing'){const child=new Actor('fallen-summon-'+occurrence,'player',{x:720,y:700});child.owner=p;child.tier=0;child.life=0;w.actors.push(child);w.kill(child);assert(child.dead);}else{w.executeSkill(p,makeSkillInstance(SKILLS.versicle),{x:800,y:700});}};
  const snapshot=()=>({time:w.time,life:p.life,pending:w['pendingBursts'].map(b=>({when:b.when,at:{...b.at},depth:b.depth,tier:b.tier,fx:b.fx})),ready:p.procReadyAt.get(id)??null,draws});
  const steps=[snapshot()];deliver();steps.push(snapshot());assert.equal(w['pendingBursts'].length,1);assert.equal(p.procReadyAt.get(id),10+proc.icd!);deliver();steps.push(snapshot());assert.equal(w['pendingBursts'].length,1);assert.equal(events.length,1);
  w.time=10+delay;w['updatePendingBursts']();steps.push(snapshot());const amount=id==='native_parting_blessing'?8:7;assert.equal(p.life,500+amount);assert.equal(w['pendingBursts'].length,0);
  w.time=10+proc.icd!;deliver();steps.push(snapshot());assert.equal(w['pendingBursts'].length,1);assert.equal(events.length,2);w.time+=delay;w['updatePendingBursts']();steps.push(snapshot());assert.equal(p.life,500+2*amount);assert.equal(w['pendingBursts'].length,0);
  rows.push({name:id,definition:proc,occurrence:id==='native_parting_blessing'?'Native kill of owner-bound summons':'Native executeSkill of unchanged Versicle; admission/payment/input are outside this course',steps,events});
 }finally{restore();}
}
assert.equal(rows.length,2);assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Unaccepted passive-derived delayed effects. Native summon death and native completed song execution select the original definitions, enforce their cooldowns, enqueue and heal. No direct call to the proc executor, fixture rewriting or device-performance claim.',courses:rows.length,rows},null,2)+'\n');
