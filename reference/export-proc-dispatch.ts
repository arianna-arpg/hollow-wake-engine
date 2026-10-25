// Original-only dispatch discovery. Payload ports are observed, not reimplemented.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor,type GainEvent} from '../src/engine/actor';
import type {World} from '../src/engine/world';
import {StatSheet,STAT_DEFS,mod,type SkillTag} from '../src/engine/stats';
import {makeSkillInstance,type SkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {PROC_LIST,PROCS,PROC_RIDER_LIST,registerProc,procStat,procPowerStat,procRiderStat,type ProcDef} from '../src/data/procs';
import {PASSIVE_NODES} from '../src/data/passives';

bootSimEngine();
const rows:unknown[]=[];
const id='__m38_dispatch';
const definition=(fields:Partial<ProcDef>):ProcDef=>({id,name:'Dispatch observation',color:'#ffffff',trigger:'condition',effect:{type:'ward',flat:10},...fields});
type OwnOptions=NonNullable<Parameters<World['rollOwnProcs']>[2]>;
interface Rig {w:World;p:Actor;target:Actor;inst:SkillInstance;calls:unknown[];draws:()=>number;random:(value:number)=>void;}
function run(name:string,fields:Partial<ProcDef>,action:(rig:Rig)=>unknown){
  const restore=seedGlobalRandom(0xc238),w=makeSimWorld('warrior',0xc238),p=w.player;
  const target=new Actor('probe victim','enemy',{x:760,y:700});
  p.sheet=new StatSheet();p.sheet.setBase('life',100);p.life=50;p.pos={x:700,y:700};
  p.procReadyAt.clear();p.procAttemptAt.clear();p.procFiredAt.clear();p.gainEvents=[];
  target.sheet=new StatSheet();target.sheet.setBase('life',100);target.life=10;
  const inst=makeSkillInstance(SKILLS.cleave,1,3),before=PROC_LIST.length,proc=definition(fields);
  assert(!PROCS[id]);registerProc(proc);p.sheet.setBase(procStat(id),1);
  w.time=10;w.actors=[p,target];let draws=0,value=0;
  const calls:unknown[]=[],execute=w['executeProc'];
  w['executeProc']=(row,owner,skill,victim,depth,aim)=>{
    calls.push({id:row.id,owner:owner===p?'owner':'other',skill:skill?.def.id??null,target:victim===target?'victim':victim===null?'none':'other',depth,aim:aim??null});
  };
  Math.random=()=>{draws++;return value;};
  try{const observation=action({w,p,target,inst,calls,draws:()=>draws,random:v=>{value=v;}});
    rows.push({name,definition:proc,result:observation,calls,draws,clocks:{ready:[...p.procReadyAt],attempt:[...p.procAttemptAt],fired:[...p.procFiredAt]}});
  }finally{
    w['executeProc']=execute;PROC_LIST.splice(before);delete PROCS[id];delete STAT_DEFS[procStat(id)];delete STAT_DEFS[procPowerStat(id)];
    p.dead=false;p.sheet=new StatSheet();w.rollOwnProcs(p,'condition');restore();
  }
}
const ownCases:[string,Partial<ProcDef>,OwnOptions,boolean][]=[
  ['bracket-equal',{bracket:.5},{bracket:.5},true],
  ['bracket-list',{bracket:[.25,.5]},{bracket:.5},true],
  ['bracket-missing',{bracket:.5},{},false],
  ['bracket-empty',{bracket:[]},{bracket:.5},false],
  ['condition-match',{condition:'lowLife'},{condition:'lowLife'},true],
  ['condition-mismatch',{condition:'lowLife'},{condition:'fullLife'},false],
  ['received-positive-any',{receivedTypes:['fire','cold']},{receivedAmounts:{fire:0,cold:1}},true],
  ['received-nonpositive',{receivedTypes:['fire','cold']},{receivedAmounts:{fire:0,cold:-1}},false],
  ['received-missing',{receivedTypes:['fire']},{},false],
  ['received-empty',{receivedTypes:[]},{receivedAmounts:{fire:1}},false],
  ['critical-required',{crit:true},{},false],
  ['critical-present',{crit:true},{crit:true},true],
  ['noncritical-present',{noCrit:true},{},true],
  ['noncritical-rejects-critical',{noCrit:true},{crit:true},false],
  ['contradictory-critical-gates',{crit:true,noCrit:true},{crit:true},false],
  ['victim-empty-requires-body',{vs:[]},{},false],
];
for(const[name,fields,opts,expected]of ownCases)run('own-'+name,fields,({w,p,calls,draws})=>{
  w.rollOwnProcs(p,'condition',opts);assert.equal(calls.length,Number(expected));assert.equal(draws(),Number(expected));return {options:opts,expected};
});
for(const[name,fields,status,expected]of [
  ['empty-victim-list',{vs:[]},false,true],['victim-all-match',{vs:['lowLife','chill']},true,true],
  ['victim-missing-status',{vs:['lowLife','chill']},false,false],['unknown-victim-condition',{vs:['__unknown']},false,false],
] as [string,Partial<ProcDef>,boolean,boolean][])run('own-'+name,fields,({w,p,target,calls})=>{
  if(status)target.applyStatus('chill',0,1,'probe');
  w.rollOwnProcs(p,'condition',{target});assert.equal(calls.length,Number(expected));return {targetLife:target.life,statuses:target.statuses.map(s=>({id:s.id,stacks:s.stacks}))};
});
for(const stacks of[0,1])run('positive-status-gate-'+stacks,{requireStatus:['absent','chill']},({w,p,calls})=>{
  p.applyStatus('chill',0,1,'probe');const status=p.statuses.find(s=>s.id==='chill');assert(status);status.stacks=stacks;
  w.rollOwnProcs(p,'condition');assert.equal(calls.length,stacks);return {stacks};
});
run('own-extra-only-context-and-delivery',{trigger:'cast'},({w,p,target,inst,calls})=>{
  p.sheet.setBase(procStat(id),0);const aim={x:12,y:34};
  const extra=[mod(procStat(id),'flat',1,['spell'])];
  w.rollOwnProcs(p,'cast',{inst,target,aim,extra,tags:new Set<SkillTag>(['spell'])});
  assert.equal(calls.length,1);return {aim,extra,context:['spell'],skill:inst.def.id};
});
run('own-unarmed-skips-once-stamp',{oncePerCast:true},({w,p,calls,draws})=>{
  p.sheet.setBase(procStat(id),0);w.rollOwnProcs(p,'condition');assert.equal(calls.length,0);assert.equal(draws(),0);assert.equal(p.procFiredAt.size,0);return null;
});

const gains:[string,GainEvent,Partial<ProcDef>,boolean][]=[
  ['charge-any',{kind:'charge',id:'fury',depth:0},{trigger:'chargeGain'},true],
  ['charge-filter',{kind:'charge',id:'fury',depth:0},{trigger:'chargeGain',charge:['absent','fury']},true],
  ['charge-mismatch',{kind:'charge',id:'fury',depth:0},{trigger:'chargeGain',charge:'tempo'},false],
  ['charge-empty',{kind:'charge',id:'fury',depth:0},{trigger:'chargeGain',charge:[]},false],
  ['buff',{kind:'buff',id:'rage',depth:0},{trigger:'buffGain',buff:'rage'},true],
  ['orb',{kind:'orb',id:'life',depth:0},{trigger:'orbPickup',orb:['mana','life']},true],
  ['restore-not-listened',{kind:'restore',id:'mana',depth:0},{trigger:'chargeGain'},false],
  ['heal-not-listened',{kind:'heal',id:'life',depth:0},{trigger:'buffGain'},false],
  ['depth-equality-blocks',{kind:'charge',id:'fury',depth:1},{trigger:'chargeGain'},false],
];
for(const[name,event,fields,expected]of gains)run('gain-'+name,fields,({w,p,calls,draws})=>{
  w['rollGainProcs'](p,event);assert.equal(calls.length,Number(expected));assert.equal(draws(),Number(expected));return {event};
});
run('gain-no-grant-stamps-once',{trigger:'chargeGain',oncePerCast:true},({w,p,calls,draws})=>{
  p.sheet.setBase(procStat(id),0);w['rollGainProcs'](p,{kind:'charge',id:'fury',depth:0});
  assert.equal(calls.length,0);assert.equal(draws(),0);assert.equal(p.procFiredAt.get(id),10);return null;
});
run('gain-dead-owner-rejected',{trigger:'chargeGain',oncePerCast:true},({w,p,calls,draws})=>{
  p.dead=true;w['rollGainProcs'](p,{kind:'charge',id:'fury',depth:0});
  assert.equal(calls.length,0);assert.equal(draws(),0);assert.equal(p.procFiredAt.size,0);return null;
});

for(const[name,status,depth,expected]of [['matches',['absent','chill'],0,true],['empty',[],0,false],['mismatch','bleed',0,false],['deep-bank-only','chill',1,false]] as [string,string|string[],number,boolean][])run('status-'+name,{trigger:'statusApply',status},({w,p,target,inst,calls,draws})=>{
  const bank=w['bankStatusTriggers'],banks:unknown[]=[];
  w['bankStatusTriggers']=(actor,statusId,at,chain,source)=>{banks.push({statusId,at,chain,ownerIdentity:actor===p,sourceIdentity:source===inst});};
  try{w['rollStatusProcs'](p,inst,target,'chill',new Set<SkillTag>(['melee']),[],depth);}
  finally{w['bankStatusTriggers']=bank;}
  assert.equal(banks.length,1);assert.equal(calls.length,Number(expected));assert.equal(draws(),Number(expected));return {banks,depth};
});
for(const dead of[false,true])run('collision-target-dead-'+dead,{trigger:'collision'},({w,p,target,inst,calls})=>{
  target.dead=dead;w['rollCollisionProcs'](p,inst,target);assert.equal(calls.length,Number(!dead));return {targetDead:dead};
});
run('collision-dead-caster-diagnostic',{trigger:'collision'},({w,p,target,inst,calls})=>{
  p.dead=true;w['rollCollisionProcs'](p,inst,target);assert.equal(calls.length,1);return {casterDead:true};
});
run('surface-dead-caster-diagnostic',{trigger:'surface'},({w,p,calls})=>{
  p.dead=true;w['rollSurfaceProcs'](p);assert.equal(calls.length,1);return {casterDead:true};
});

const rider=PROC_RIDER_LIST.find(r=>r.id==='static_shrapnel');assert(rider);
for(const[name,mode,roll,depth,expected]of [
  ['authored-spell','spell',.7,0,true],['authored-attack','attack',0,0,false],
  ['ungranted','none',0,0,false],['luck-capped-miss','luck',.95,0,false],
  ['luck-capped-hit','luck',.94,0,true],['deeper-delivery','flat',0,3,true],
  ['dead-owner','dead',0,0,false],['wrong-host','wrong',0,0,false],
] as const)run('rider-'+name,{},({w,p,target,inst,random})=>{
  const cast=w['castProcPayload'],delivered:unknown[]=[];random(roll);
  const spell=makeSkillInstance({...SKILLS.cleave,tags:['spell']});
  if(mode==='spell'||mode==='attack'){const passive=PASSIVE_NODES.cl_gam_shrapnel;assert(passive.mods);p.sheet.setSource('rider-passive',passive.mods);}
  else if(mode!=='none')p.sheet.setBase(procRiderStat(rider.id),mode==='luck'?.75:1);
  if(mode==='luck')p.sheet.setBase('luck',1);if(mode==='dead')p.dead=true;
  w['castProcPayload']=(caster,source,victim,nextDepth,payload)=>{delivered.push({ownerIdentity:caster===p,skill:source?.def.id??null,targetIdentity:victim===target,depth:nextDepth,payload,payloadIdentity:payload===rider.cast});return true;};
  try{w['fireProcRiders'](mode==='wrong'?PROCS.brutal_strike:PROCS.thunderstruck,p,mode==='spell'?spell:inst,target,depth);}
  finally{w['castProcPayload']=cast;}
  assert.equal(delivered.length,Number(expected));if(expected)assert.equal((delivered[0] as {depth:number}).depth,depth+1);
  return {mode,roll,depth,delivered};
});
assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Original-only dispatch and delivery-port observations. No standalone payload implementation or new recovery guarantee.',courses:rows.length,rows},null,2)+'\n');
