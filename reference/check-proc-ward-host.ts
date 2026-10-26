// Independent native hook/cue assertions, run unchanged on original and adapter.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {StatSheet} from '../src/engine/stats';import {procPowerStat,type ProcDef} from '../src/data/procs';
bootSimEngine();const rows:unknown[]=[];
const cases=[
 {name:'ordinary',ward:35,cues:1,calls:['life','gain:60','rate','riders:0']},
 {name:'suppressed',ward:5,cues:0,calls:['life','gain:60','rate','riders:0']},
 {name:'negative',ward:5,cues:0,calls:['life','riders:0']},
 {name:'positive-return-without-growth',ward:5,cues:0,calls:['life','gain:60','riders:0']},
 {name:'zero-return-with-growth',ward:65,cues:1,calls:['life','gain:60','riders:0']},
 {name:'pool-change-during-life',ward:50,cues:0,calls:['life','gain:60','rate','riders:0']},
 {name:'gain-replaced-during-life',ward:8,cues:1,calls:['life','replacement:60','riders:0']},
];
for(const row of cases){
 const w=makeSimWorld('warrior',0xd139),p=w.player,calls:string[]=[];p.sheet=new StatSheet();p.ward=5;p.dead=false;p.procCuePulses=[];
 const proc:ProcDef={id:'__m39_host_ward',name:'Ward host',color:'#abcdef',trigger:'hit',effect:row.name==='negative'?{type:'ward',flat:-10}:{type:'ward',flat:10,pctMaxLife:.1}};
 p.sheet.setBase(procPowerStat(proc.id),1);const native=p.gainWard.bind(p),stat=p.sheet.get.bind(p.sheet);
 p.sheet.get=(id,...args)=>{if(id!=='wardGain')return stat(id,...args);calls.push('rate');return row.name==='suppressed'||row.name==='pool-change-during-life'?0:.5;};
 p.gainWard=amount=>{calls.push('gain:'+amount);if(row.name==='positive-return-without-growth')return 123;if(row.name==='zero-return-with-growth'){p.ward+=amount;return 0;}return native(amount);};
 p.maxLife=()=>{calls.push('life');if(row.name==='pool-change-during-life')p.ward=50;if(row.name==='gain-replaced-during-life')p.gainWard=amount=>{calls.push('replacement:'+amount);p.ward+=3;return 0;};return 500;};
 w['fireProcRiders']=(_proc,_caster,_inst,_target,depth)=>{calls.push('riders:'+depth);};w['executeProc'](proc,p,null,null,0);
 assert.equal(p.ward,row.ward,row.name);assert.equal(p.procCuePulses.length,row.cues,row.name);assert.deepEqual(calls,row.calls,row.name);
 if(row.cues)assert.equal(p.procCuePulses[0].phase,'gain');rows.push({name:row.name,ward:p.ward,cues:p.procCuePulses,calls});
}
assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({courses:rows.length,rows},null,2)+'\n');
