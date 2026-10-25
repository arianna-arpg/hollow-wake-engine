// Original resolveHit observations. The complete hit runs; selected proc delivery is observed.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {StatSheet,STAT_DEFS,mod} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';import {SKILLS} from '../src/data/skills';
import {PROC_LIST,PROCS,registerProc,procStat,procPowerStat,type ProcDef} from '../src/data/procs';
bootSimEngine();const rows:unknown[]=[],id='__m38_hit';
interface Course {name:string;fields?:Partial<ProcDef>;roll?:number;critical?:boolean;lethal?:boolean;elite?:boolean;eliteFactor?:number;range?:boolean;window?:number;depth?:number;purchasedDepth?:number;carry?:number;deadOwner?:boolean;missingSummon?:'fallback'|'none';contextGrant?:boolean;expected:number;}
const courses:Course[]=[
  {name:'plain-hit',expected:1},
  {name:'chance-cap-equality-misses',roll:.95,expected:0},
  {name:'requires-critical',fields:{crit:true},expected:0},
  {name:'critical-hit',fields:{crit:true},critical:true,expected:1},
  {name:'noncritical-rejects-critical',fields:{noCrit:true},critical:true,expected:0},
  {name:'dominant-type-matches',fields:{hitType:'physical'},expected:1},
  {name:'dominant-type-mismatch',fields:{hitType:'fire'},expected:0},
  {name:'roll-top-equality',fields:{rollTop:.5},range:true,expected:1},
  {name:'roll-top-below',fields:{rollTop:.49},range:true,expected:0},
  {name:'roll-top-context-window',fields:{rollTop:.4},window:.1,range:true,expected:1},
  {name:'roll-top-no-live-range',fields:{rollTop:.5},expected:0},
  {name:'depth-without-investment',depth:1,expected:0},
  {name:'depth-invested',depth:1,purchasedDepth:1,roll:.25,expected:1},
  {name:'nonlethal-kill-stamps-attempt',fields:{trigger:'kill',ppm:6,icd:2,oncePerCast:true},expected:0},
  {name:'true-kill',fields:{trigger:'kill'},lethal:true,expected:1},
  {name:'elite-kill-lane-small',fields:{trigger:'kill'},elite:true,eliteFactor:.4,expected:0},
  {name:'elite-kill-lane-large',fields:{trigger:'kill'},elite:true,eliteFactor:.8,expected:1},
  {name:'carry-single',fields:{minionCarry:true},carry:1,roll:.25,expected:1},
  {name:'carry-court-normalized',fields:{minionCarry:true},carry:4,roll:.25,expected:0},
  {name:'carry-unflagged',carry:1,roll:.25,expected:0},
  {name:'carry-zero-icd-exempts-normalizer',fields:{minionCarry:true,icd:0},carry:4,roll:.25,expected:1},
  {name:'carry-timed-icd',fields:{minionCarry:true,icd:2},carry:4,roll:.25,expected:1},
  {name:'carry-timed-ppm',fields:{minionCarry:true,ppm:6},carry:4,roll:.25,expected:1},
  {name:'carry-true-kill-exempts-normalizer',fields:{minionCarry:true,trigger:'kill'},carry:4,lethal:true,roll:.25,expected:1},
  {name:'carry-elite-kill-normalized',fields:{minionCarry:true,trigger:'kill'},carry:4,elite:true,eliteFactor:1,roll:.25,expected:0},
  {name:'carry-dead-owner',fields:{minionCarry:true},carry:1,deadOwner:true,roll:.25,expected:0},
  {name:'carry-summon-bar-fallback',fields:{minionCarry:true},carry:1,missingSummon:'fallback',roll:.25,expected:1},
  {name:'carry-no-summon-instance',fields:{minionCarry:true},carry:1,missingSummon:'none',roll:.25,expected:0},
  {name:'carry-summoning-context',fields:{minionCarry:true},carry:1,contextGrant:true,roll:.25,expected:1},
  {name:'carry-owner-depth-investment',fields:{minionCarry:true},carry:4,depth:1,purchasedDepth:1,roll:.1,expected:1},
];
for(const course of courses){
  const restore=seedGlobalRandom(0xc438),w=makeSimWorld('warrior',0xc438),p=w.player;
  p.sheet=new StatSheet();p.sheet.setBase('life',10000);p.life=10000;p.pos={x:700,y:700};p.skills=[];
  p.sheet.setBase('critChance',course.critical?1:0);p.sheet.setBase('procDepth',course.purchasedDepth??0);
  p.sheet.setBase('highRollWindow',course.window??0);p.sheet.setBase('killProcOnHit',course.eliteFactor??0);
  p.procReadyAt.clear();p.procAttemptAt.clear();p.procFiredAt.clear();p.dead=course.deadOwner??false;
  const target=new Actor('hit victim','enemy',{x:730,y:700});target.sheet=new StatSheet();target.sheet.setBase('life',10000);
  target.life=course.lethal?1:10000;if(course.elite)target.rarity='rare';
  const inst=makeSkillInstance({...SKILLS.cleave,id:'__m38_strike',tags:['spell','physical'],baseDamage:{physical:course.range?[10,20]:[10,10]},requirements:undefined});
  const summon=makeSkillInstance({...SKILLS.cleave,id:'__m38_summon',tags:['spell','minion'],requirements:undefined,
    innateMods:course.contextGrant?[mod(procStat(id),'flat',1,['minion'])]:undefined});
  const court:Actor[]=[];
  for(let i=0;i<(course.carry??0);i++){
    const body=new Actor('court '+i,'player',{x:700,y:700});body.sheet=new StatSheet();body.sheet.setBase('life',100);body.life=100;
    body.sheet.setBase('critChance',0);body.owner=p;body.sourceSkillId=summon.def.id;
    if(!course.missingSummon)body.summonInst=summon;court.push(body);
  }
  if(course.carry&&course.missingSummon!=='none')p.skills=[summon];
  const caster=court[0]??p;w.actors=[p,target,...court];w.time=10;
  const initial=PROC_LIST.length,proc:ProcDef={id,name:'Hit observation',color:'#ffffff',trigger:'hit',effect:{type:'ward',flat:10},...course.fields};
  assert(!PROCS[id]);registerProc(proc);p.sheet.setBase(procStat(id),course.contextGrant?0:1);
  let draws=0;Math.random=()=>{draws++;return course.roll??.5;};
  const execute=w['executeProc'],chance=w['procChance'],calls:unknown[]=[],attempts:unknown[]=[];
  w['executeProc']=(selected,owner,skill,victim,depth)=>{calls.push({id:selected.id,ownerIdentity:owner===p,skill:skill?.def.id??null,targetIdentity:victim===target,depth});};
  w['procChance']=(owner,selected,depth,tags,extra)=>{
    const value=chance.call(w,owner,selected,depth,tags,extra);
    if(selected.id===id)attempts.push({owner:owner===p?'owner':'minion',depth,tags:tags?[...tags]:null,extra:extra?.filter(m=>m.stat===procStat(id))??[],value});return value;
  };
  try{
    const lifeBefore=target.life;w['resolveHit'](caster,inst,target,1,course.depth??0);
    assert(target.life<lifeBefore,'A real damaging hit must land: '+course.name);
    assert.equal(calls.length,course.expected,course.name);
    if(calls.length){const call=calls[0] as {ownerIdentity:boolean;targetIdentity:boolean;skill:string};assert(call.ownerIdentity&&call.targetIdentity);assert.equal(call.skill,course.carry?summon.def.id:inst.def.id);}
    if(course.name==='nonlethal-kill-stamps-attempt'){assert.equal(p.procAttemptAt.get(id),10);assert.equal(p.procFiredAt.get(id),10);assert.equal(p.procReadyAt.size,0);}
    if(course.carry){assert(!caster.procReadyAt.has(id));assert(!caster.procAttemptAt.has(id));assert(!caster.procFiredAt.has(id));}
    rows.push({name:course.name,input:course,definition:proc,calls,attempts,draws,lifeBefore,lifeAfter:target.life,dead:target.dead,
      clocks:{ready:[...p.procReadyAt],attempt:[...p.procAttemptAt],fired:[...p.procFiredAt]},
      casterClocks:{ready:[...caster.procReadyAt],attempt:[...caster.procAttemptAt],fired:[...caster.procFiredAt]}});
  }finally{
    w['executeProc']=execute;w['procChance']=chance;PROC_LIST.splice(initial);delete PROCS[id];delete STAT_DEFS[procStat(id)];delete STAT_DEFS[procPowerStat(id)];
    p.dead=false;p.sheet=new StatSheet();w.rollOwnProcs(p,'condition');restore();
  }
}
assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Original complete resolveHit with observed proc delivery ports. Target damage, chance context, owner clocks and dispatch checked; payload execution is covered separately.',courses:rows.length,rows},null,2)+'\n');
