// Original World.update observations, with actual gain/ward payload execution.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet,STAT_DEFS} from '../src/engine/stats';
import {PROC_LIST,PROCS,registerProc,procStat,procPowerStat,type ProcDef} from '../src/data/procs';
bootSimEngine();const rows:unknown[]=[];
for(const purchasedDepth of[0,2]){
  const restore=seedGlobalRandom(0xc338),w=makeSimWorld('warrior',0xc338),p=w.player;
  p.sheet=new StatSheet();p.sheet.setBase('life',100);p.life=50;p.ward=0;p.skills=[];p.charges.clear();p.buffs.clear();
  p.procReadyAt.clear();p.procAttemptAt.clear();p.procFiredAt.clear();p.gainEvents=[];p.healedSince=0;p.gasped=false;
  p.sheet.setBase('procDepth',purchasedDepth);p['refreshConditions']();p.condRose=['lowLife'];p.gaugeSampleIn=1;
  w.actors=[p];w.time=10;
  const definitions:ProcDef[]=[
    {id:'__m38_frame_a',name:'Frame charge',color:'#ffffff',trigger:'condition',condition:'lowLife',oncePerCast:true,effect:{type:'gainCharge',charge:'fury',amount:1,max:3}},
    {id:'__m38_frame_b',name:'Frame buff',color:'#ffffff',trigger:'chargeGain',charge:'fury',effect:{type:'buff',buff:{type:'buff',id:'__m38_frame_buff',duration:3,mods:[]}}},
    {id:'__m38_frame_c',name:'Frame ward',color:'#ffffff',trigger:'buffGain',buff:'__m38_frame_buff',effect:{type:'ward',flat:10}},
  ];
  const initial=PROC_LIST.length;for(const proc of definitions){assert(!PROCS[proc.id]);registerProc(proc);p.sheet.setBase(procStat(proc.id),1);}
  let draws=0;Math.random=()=>{draws++;return 0;};
  const execute=w['executeProc'],calls:unknown[]=[];
  w['executeProc']=(proc,owner,inst,target,depth,aim)=>{calls.push({time:w.time,id:proc.id,depth});execute.call(w,proc,owner,inst,target,depth,aim);};
  const snapshot=()=>({time:w.time,ward:p.ward,charges:[...p.charges],buffs:[...p.buffs.keys()],gains:p.gainEvents.map(e=>({kind:e.kind,id:e.id,depth:e.depth,n:e.n??null})),calls:[...calls],draws});
  try{
    const steps=[snapshot()];for(let i=0;i<3;i++){w.update(1/60);steps.push(snapshot());}
    assert.equal(steps[1].charges.find(([key])=>key==='fury')?.[1],1);
    assert.equal(steps[1].ward,0);
    if(purchasedDepth===2){
      assert.deepEqual(steps[1].buffs,['__m38_frame_buff']);
      assert.deepEqual(steps[1].gains,[{kind:'buff',id:'__m38_frame_buff',depth:2,n:null}]);
      assert.equal(steps[1].calls.length,2);assert.equal(steps[2].calls.length,3);
      assert.equal(steps[2].ward,10);assert.equal(steps[2].gains.length,0);
    }else{assert.equal(steps[1].buffs.length,0);assert.equal(steps[1].gains.length,0);assert.equal(steps[2].calls.length,1);assert.equal(steps[2].ward,0);}
    rows.push({name:'native-gain-chain-depth-'+purchasedDepth,purchasedDepth,definitions,steps});
  }finally{
    w['executeProc']=execute;PROC_LIST.splice(initial);
    for(const proc of definitions){delete PROCS[proc.id];delete STAT_DEFS[procStat(proc.id)];delete STAT_DEFS[procPowerStat(proc.id)];}
    p.dead=false;p.sheet=new StatSheet();w.rollOwnProcs(p,'condition');restore();
  }
}
assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Original World.update frame observations with actual payloads. No renderer or target-device claim.',courses:rows.length,rows},null,2)+'\n');
