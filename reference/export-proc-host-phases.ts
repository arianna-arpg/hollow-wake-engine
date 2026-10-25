// Independent host-phase assertions. Run unchanged against the pinned original,
// retained predecessor and installed candidate; expected results are not SDK output.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {StatSheet,STAT_DEFS} from '../src/engine/stats';import {GAUGE_CFG} from '../src/engine/gauges';
import {makeSkillInstance} from '../src/engine/skills';import {SKILLS} from '../src/data/skills';
import {PROC_LIST,PROCS,registerProc,procStat,procPowerStat,type ProcDef} from '../src/data/procs';
bootSimEngine();const checks:unknown[]=[];
for(const kind of ['alive','dead-at-entry','death-during-proc','throw-during-proc']){
 const restore=seedGlobalRandom(0xc638),w=makeSimWorld('warrior',0xc638),p=w.player;
 p.sheet=new StatSheet();p.sheet.setBase('life',100);p.life=50;p.dead=kind==='dead-at-entry';p.condRose=[];p.healedSince=0;p.gasped=false;p.gaugeSampleIn=0;p.gaugeReferenced=()=>false;
 p.procReadyAt.clear();p.procAttemptAt.clear();p.procFiredAt.clear();w.time=0;Math.random=()=>0;
 let calls=0,failure:string|null=null;const queue=p.condRose;
 if(kind==='death-during-proc'||kind==='throw-during-proc'){p.sheet.setBase(procStat('desperate_ward'),1);p.condRose.push('lowLife');}
 w['executeProc']=()=>{calls++;if(kind==='throw-during-proc')throw new Error('phase-failure');p.dead=true;};
 try{
  try{w['sweepTalentEvents'](p);}catch(error){failure=(error as Error).message;}
  const sampled=kind==='alive'||kind==='death-during-proc';assert.equal(p.gaugeSampleIn,sampled?GAUGE_CFG.cadence:0,kind);
  assert.equal(calls,kind.includes('during')?1:0);assert.equal(failure,kind==='throw-during-proc'?'phase-failure':null);
  assert.equal(p.condRose.length,0);assert.equal(p.condRose===queue,!kind.includes('during'));
  checks.push({name:'gauge-'+kind,sampled,dead:p.dead,calls,failure,queueIdentity:p.condRose===queue});
 }finally{restore();}
}
for(const kind of ['no-proc-fires','owner-dies-during-proc','depth-rejected']){
 const restore=seedGlobalRandom(0xc738),w=makeSimWorld('warrior',0xc738),p=w.player,id='__m38_phase_carry';
 p.sheet=new StatSheet();p.sheet.setBase('life',10000);p.life=10000;p.dead=false;p.skills=[];p.pos={x:700,y:700};
 const strike=makeSkillInstance({...SKILLS.cleave,id:'__m38_phase_strike',tags:['spell','physical'],baseDamage:{physical:[10,10]},requirements:undefined});
 const summon=makeSkillInstance({...SKILLS.cleave,id:'__m38_phase_summon',tags:['spell','minion'],requirements:undefined,chargeGain:[{charge:'fury',on:'kill',amount:1,max:3}]});
 const body=new Actor('phase minion','player',{x:700,y:700});body.sheet=new StatSheet();body.sheet.setBase('life',100);body.life=100;body.owner=p;body.summonInst=summon;body.sourceSkillId=summon.def.id;body.sheet.setBase('critChance',0);
 const target=new Actor('phase victim','enemy',{x:730,y:700});target.sheet=new StatSheet();target.sheet.setBase('life',100);target.life=1;
 const proc:ProcDef={id,name:'Phase carry',color:'#ffffff',trigger:'hit',minionCarry:true,effect:{type:'ward',flat:1}};
 const initial=PROC_LIST.length;assert(!PROCS[id]);registerProc(proc);p.sheet.setBase(procStat(id),kind==='owner-dies-during-proc'?1:0);
 p.skills=[summon];w.actors=[p,body,target];w.time=10;Math.random=()=>0;
 const taps:unknown[]=[],rewards:string[]=[];let executions=0;
 p.gainCharge=(charge,amount,max,inst)=>{taps.push({charge,amount,max,sameInstance:inst===summon});};
 w['rollKillOrbs']=(owner)=>{if(owner===p)rewards.push('orbs');};w['rollKillRemnants']=(owner)=>{if(owner===p)rewards.push('remnants');};
 w['executeProc']=(selected,owner)=>{assert.equal(selected.id,id);assert.equal(owner,p);executions++;p.dead=true;};
 try{
  w['resolveHit'](body,strike,target,1,kind==='depth-rejected'?1:0);assert(target.life<=0,'Actual killing hit required');
  assert.deepEqual(taps,kind==='depth-rejected'?[]:[{charge:'fury',amount:1,max:3,sameInstance:true}],kind);
  assert.deepEqual(rewards,kind==='depth-rejected'?[]:['orbs','remnants'],kind);assert.equal(executions,kind==='owner-dies-during-proc'?1:0);
  checks.push({name:'carry-'+kind,taps,rewards,executions,ownerDead:p.dead});
 }finally{PROC_LIST.splice(initial);delete PROCS[id];delete STAT_DEFS[procStat(id)];delete STAT_DEFS[procPowerStat(id)];p.dead=false;p.sheet=new StatSheet();w.rollOwnProcs(p,'condition');restore();}
}
assert.equal(checks.length,7);assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({checks},null,2)+'\n');
