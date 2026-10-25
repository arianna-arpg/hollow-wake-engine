// Private original-only discovery. This is not an accepted baseline.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet,STAT_DEFS,mod} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {PROC_LIST,PROCS,procStat,type ProcDef} from '../src/data/procs';

bootSimEngine();
const restoreSeed=seedGlobalRandom(0xc038),w=makeSimWorld('warrior',0xc038),p=w.player;
const id='__m38_probe_rule',stat=procStat(id),priorDefinition=STAT_DEFS[stat];
const base:ProcDef={id,name:'Private proc rule observation',color:'#ffffff',trigger:'condition',effect:{type:'ward',flat:10}};
STAT_DEFS[stat]={label:'Private proc observation',base:0,min:0};
const rows:any[]=[];
const clocks=()=>({ready:[...p.procReadyAt],attempt:[...p.procAttemptAt],fired:[...p.procFiredAt]});
function reset(){w.time=10;p.sheet=new StatSheet();p.procReadyAt.clear();p.procAttemptAt.clear();p.procFiredAt.clear();p.buffs.clear();p.statuses=[];p.dead=false;p.condRose=[];p.healedSince=0;p.gasped=false;p.gaugeSampleIn=1;}
function near(actual:number,expected:number){assert(Math.abs(actual-expected)<1e-12,`${actual} != ${expected}`);}
try{
 const chances:[string,number,number,number,number|undefined,number|undefined,number][]=[
  ['ordinary',.4,0,0,undefined,undefined,.4],['luck',.4,.5,0,undefined,undefined,.6],
  ['cap',3,0,0,undefined,undefined,.95],['depth-two',.8,0,2,undefined,undefined,.2],
  ['ppm-first',1,0,0,6,undefined,.95],['ppm-same-time',1,0,0,6,10,0],
  ['ppm-one-second',1,0,0,6,9,.1],['ppm-catch-up',.1,0,0,6,-100,.4],
  ['future-attempt-diagnostic',1,0,0,6,11,-.1],['zero-base-no-stamp',0,0,0,6,4,0],
  ['zero-ppm-disables-rate',.4,0,0,0,4,.4],['luck-before-depth-cap',2,.5,2,undefined,undefined,.75],
 ];
 for(const[name,value,luck,depth,ppm,last,expected]of chances){reset();p.sheet.setBase(stat,value);p.sheet.setBase('luck',luck);if(last!==undefined)p.procAttemptAt.set(id,last);const before=clocks();const result=w['procChance'](p,{...base,ppm},depth);near(result,expected);rows.push({name,kind:'chance',input:{value,luck,depth,ppm:ppm??null,last:last??null,time:w.time},before,result,after:clocks()});}
 for(const[name,icd,due,time,expected]of [
  ['absent-icd-ignores-clock',undefined,100,10,true],['zero-icd-ignores-clock',0,100,10,true],
  ['fresh-icd',2,undefined,0,true],['future-icd',2,11,10,false],['equal-icd',2,10,10,true],
 ] as const){reset();w.time=time;if(due!==undefined)p.procReadyAt.set(id,due);const before=clocks();const result=w['procReady'](p,{...base,icd});assert.equal(result,expected);rows.push({name,kind:'ready',input:{icd:icd??null,due:due??null,time},before,result,after:clocks()});}
 const cleave=makeSkillInstance(SKILLS.cleave,1,3);
 const gates:[string,Partial<ProcDef>,boolean,()=>void,boolean][]=[
  ['ungated',{},false,()=>{},true],['skill-without-instance',{skills:['cleave']},false,()=>{},false],
  ['skill-present',{skills:['cleave']},true,()=>{},true],['empty-skills',{skills:[]},true,()=>{},false],
  ['when-absent',{when:'lowLife'},false,()=>{},false],['when-present',{when:'lowLife'},false,()=>p.sheet.setConditions(['lowLife']),true],
  ['unless-present',{unless:'lowLife'},false,()=>p.sheet.setConditions(['lowLife']),false],
  ['empty-buffs',{requireBuff:[]},false,()=>{},false],
  ['required-buff',{requireBuff:['absent','__probe']},false,()=>p.addBuff({type:'buff',id:'__probe',duration:1,mods:[]},1),true],
  ['required-status-absent',{requireStatus:'chill'},false,()=>{},false],
  ['empty-tags-no-instance',{tags:[]},false,()=>{},false],['empty-tags-instance',{tags:[]},true,()=>{},true],
  ['tag-lock',{tags:['melee']},true,()=>{},true],['tag-mismatch',{tags:['spell']},true,()=>{},false],
 ];
 for(const[name,fields,hasInstance,setup,expected]of gates){reset();setup();const result=w['procGates'](p,{...base,...fields},hasInstance?cleave:null);assert.equal(result,expected,name);rows.push({name,kind:'gate',fields,hasInstance,result,after:clocks()});}
 reset();const once={...base,oncePerCast:true} as ProcDef,onceResults=[];for(const time of[10,10,10.01]){w.time=time;onceResults.push({time,result:w['procGates'](p,once,null),clocks:clocks()});}assert.deepEqual(onceResults.map(r=>r.result),[true,false,true]);rows.push({name:'once-per-world-time',kind:'sequence',results:onceResults});
 for(const[value,expected]of [[0,1],[.75,1],[1,2],[1.99,2],[2,3],[100,3]]){reset();p.sheet.setBase('procDepth',value);const result=w['procDepthAllowed'](p);assert.equal(result,expected);rows.push({name:'depth-'+value,kind:'depth',value,result});}
 for(const[name,roll,extra,expected]of [['no-roll',undefined,0,false],['below',.799,0,false],['equal',.8,0,true],['above',.801,0,true],['widened',.7,.1,true]] as const){reset();p.sheet.setBase('highRollWindow',extra);const result=w['rollTopMet'](p,.2,roll);assert.equal(result,expected,name);rows.push({name:'roll-top-'+name,kind:'roll-top',roll:roll??null,extra,result});}
 const originalExecute=w['executeProc'],originalRandom=Math.random;const originalLength=PROC_LIST.length;
 try{
  PROC_LIST.push(base);PROCS[id]=base;
  for(const[name,fields,roll,due,conditional]of [
   ['roll-fails-before-icd',{ppm:6,icd:2,oncePerCast:true},.99,undefined,false],
   ['roll-consumed-while-icd-blocked',{ppm:6,icd:2,oncePerCast:true},0,20,false],
   ['roll-success',{ppm:6,icd:2,oncePerCast:true},0,undefined,false],
   ['armed-zero-chance-stamps-once',{ppm:6,icd:2,oncePerCast:true},0,undefined,true],
  ] as const){
   reset();Object.assign(base,{ppm:undefined,icd:undefined,oncePerCast:undefined},fields);let draws=0,executions=0;
   if(conditional)p.sheet.setSource('probe',[{...mod(stat,'flat',1),when:'lowLife'}]);else p.sheet.setBase(stat,1);
   if(due!==undefined)p.procReadyAt.set(id,due);
   Math.random=()=>{draws++;return roll;};w['executeProc']=()=>{executions++;};
   const before=clocks();w.rollOwnProcs(p,'condition',{condition:'lowLife'});const after=clocks();
   assert.equal(draws,conditional?0:1);assert.equal(executions,name==='roll-success'?1:0);assert.equal(p.procFiredAt.get(id),10);assert.equal(p.procAttemptAt.get(id),conditional?undefined:10);
   if(name==='roll-success')assert.equal(p.procReadyAt.get(id),12);if(due!==undefined)assert.equal(p.procReadyAt.get(id),due);
   rows.push({name,kind:'own-event',before,after,draws,executions});
  }
 }finally{w['executeProc']=originalExecute;Math.random=originalRandom;PROC_LIST.splice(originalLength);delete PROCS[id];}
 const output=process.argv[2];assert(output);fs.writeFileSync(output,JSON.stringify({scope:'Private original-only proc rule discovery; no SDK implementation or accepted baseline.',courses:rows.length,rows},null,2)+'\n');
}finally{restoreSeed();if(priorDefinition===undefined)delete STAT_DEFS[stat];else STAT_DEFS[stat]=priorDefinition;}
