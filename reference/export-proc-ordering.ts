// Original-only ordering and callback diagnostics. No accepted contract yet.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet,STAT_DEFS,mod} from '../src/engine/stats';
import {PROC_LIST,PROCS,registerProc,procStat,procPowerStat,type ProcDef} from '../src/data/procs';
import type {Actor} from '../src/engine/actor';import type {World} from '../src/engine/world';
bootSimEngine();const courses:any[]=[];
const state=(p:Actor)=>({dead:p.dead,ward:p.ward,buffs:[...p.buffs.keys()],ready:[...p.procReadyAt],attempt:[...p.procAttemptAt],fired:[...p.procFiredAt]});
const definition=(id:string,effect:ProcDef['effect'],extra:Partial<ProcDef>={}):ProcDef=>({id,name:id,color:'#ffffff',trigger:'condition',effect,...extra});
function run(name:string,rows:ProcDef[],action:(w:World,p:Actor,draws:()=>number)=>any){
 const restore=seedGlobalRandom(0xc138),w=makeSimWorld('warrior',0xc138),p=w.player,initialLength=PROC_LIST.length;
 p.sheet=new StatSheet();p.sheet.setBase('life',100);p.ward=0;p.procReadyAt.clear();p.procAttemptAt.clear();p.procFiredAt.clear();p.buffs.clear();p.gainEvents=[];w.time=0;
 for(const row of rows){assert(!PROCS[row.id]);assert(!STAT_DEFS[procStat(row.id)]);registerProc(row);}
 let draws=0;Math.random=()=>{draws++;return 0;};
 try{courses.push({name,definitions:rows,result:action(w,p,()=>draws)});}
 finally{PROC_LIST.splice(initialLength);for(const row of rows){delete PROCS[row.id];delete STAT_DEFS[procStat(row.id)];delete STAT_DEFS[procPowerStat(row.id)];}p.dead=false;p.sheet=new StatSheet();w.rollOwnProcs(p,'condition');restore();}
}
const later='__m38_order_later',earlier='__m38_order_earlier';
const grant=(id:string,target:string)=>definition(id,{type:'buff',buff:{type:'buff',id:'__m38_grant',duration:3,mods:[mod(procStat(target),'flat',1)]}});
run('grant-enables-later-row',[grant(earlier,later),definition(later,{type:'ward',flat:10})],(w,p,draws)=>{
 p.sheet.setBase(procStat(earlier),1);const before=state(p);w.rollOwnProcs(p,'condition');assert.equal(p.ward,10);assert.equal(draws(),2);return {before,after:state(p),draws:draws()};
});
run('grant-cannot-revisit-earlier-row',[definition(earlier,{type:'ward',flat:10}),grant(later,earlier)],(w,p,draws)=>{
 p.sheet.setBase(procStat(later),1);const before=state(p);w.rollOwnProcs(p,'condition');const first=state(p);assert.equal(p.ward,0);assert.equal(draws(),1);w.rollOwnProcs(p,'condition');assert.equal(p.ward,10);assert.equal(draws(),3);return {before,first,second:state(p),draws:draws()};
});
run('removal-disables-later-row',[definition(earlier,{type:'removeBuff',buff:'__m38_grant'}),definition(later,{type:'ward',flat:10})],(w,p,draws)=>{
 p.sheet.setBase(procStat(earlier),1);p.addBuff({type:'buff',id:'__m38_grant',duration:3,mods:[mod(procStat(later),'flat',1)]});const before=state(p);w.rollOwnProcs(p,'condition');assert.equal(p.ward,0);assert.equal(draws(),1);assert(!p.buffs.has('__m38_grant'));return {before,after:state(p),draws:draws()};
});
run('owner-death-during-execution-diagnostic',[definition(earlier,{type:'ward',flat:10},{icd:2}),definition(later,{type:'ward',flat:10},{icd:2})],(w,p,draws)=>{
 p.sheet.setBase(procStat(earlier),1);p.sheet.setBase(procStat(later),1);const execute=w['executeProc'],events:any[]=[];
 w['executeProc']=(proc,caster,inst,target,depth,aim)=>{events.push({id:proc.id,deadAtEntry:caster.dead});if(proc.id===earlier)caster.dead=true;execute.call(w,proc,caster,inst,target,depth,aim);};
 try{w.rollOwnProcs(p,'condition');assert.equal(draws(),2);assert.deepEqual(events,[{id:earlier,deadAtEntry:false},{id:later,deadAtEntry:true}]);assert.equal(p.ward,0);assert.equal(p.procReadyAt.get(later),2);return {events,after:state(p),draws:draws()};}finally{w['executeProc']=execute;}
});
run('same-owner-depth-bounded-reentry-diagnostic',[definition(earlier,{type:'ward',flat:10})],(w,p,draws)=>{
 p.sheet.setBase(procStat(earlier),1);p.sheet.setBase('procDepth',2);const execute=w['executeProc'],depths:number[]=[];
 w['executeProc']=(_proc,caster,_inst,_target,depth=0)=>{depths.push(depth);w.rollOwnProcs(caster,'condition',{depth:depth+1});};
 try{w.rollOwnProcs(p,'condition');assert.deepEqual(depths,[0,1,2]);assert.equal(draws(),3);return {depths,after:state(p),draws:draws()};}finally{w['executeProc']=execute;}
});
run('throwing-execution-keeps-clock-diagnostic',[definition(earlier,{type:'ward',flat:10},{icd:2,ppm:6})],(w,p,draws)=>{
 p.sheet.setBase(procStat(earlier),1);const execute=w['executeProc'];let calls=0;w['executeProc']=()=>{calls++;throw new Error('Injected sink failure');};
 try{assert.throws(()=>w.rollOwnProcs(p,'condition'),/Injected sink failure/);const failed=state(p);assert.equal(p.procReadyAt.get(earlier),2);w.rollOwnProcs(p,'condition');const immediateRetry=state(p);assert.equal(calls,1);assert.equal(draws(),1);w.time=1;w.rollOwnProcs(p,'condition');assert.equal(calls,1);assert.equal(draws(),2);assert.equal(p.procAttemptAt.get(earlier),1);return {failed,immediateRetry,laterRetry:state(p),laterRetryTime:w.time,calls,draws:draws()};}finally{w['executeProc']=execute;}
});
assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Private original-only order and callback diagnostics; no acceptance or new recovery policy.',courses:courses.length,rows:courses},null,2)+'\n');
