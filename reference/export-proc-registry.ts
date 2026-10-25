// Original registry and pulse-iteration diagnostics. No new hot-reload contract.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet,STAT_DEFS,mod} from '../src/engine/stats';
import {PROC_LIST,PROCS,registerProc,procStat,procPowerStat,type ProcDef} from '../src/data/procs';
bootSimEngine();const rows:unknown[]=[],a='__m38_registry_a',b='__m38_registry_b';
for(const name of['append-during-dispatch','same-length-trigger-change','pulse-grant-waits-for-next-sweep']){
  const restore=seedGlobalRandom(0xc538),w=makeSimWorld('warrior',0xc538),p=w.player;
  p.sheet=new StatSheet();p.sheet.setBase('life',100);p.life=50;p.ward=0;p.buffs.clear();p.gainEvents=[];
  p.procReadyAt.clear();p.procAttemptAt.clear();p.procFiredAt.clear();p.condRose=[];p.healedSince=0;p.gasped=false;p.gaugeSampleIn=1;w.time=0;
  const first:ProcDef={id:a,name:'First',color:'#ffffff',trigger:'condition',effect:{type:'ward',flat:1}};
  const second:ProcDef={id:b,name:'Second',color:'#ffffff',trigger:'condition',effect:{type:'ward',flat:2}};
  if(name==='pulse-grant-waits-for-next-sweep'){
    first.trigger='pulse';first.every=5;first.effect={type:'buff',buff:{type:'buff',id:'__m38_pulse_grant',duration:10,mods:[mod(procStat(b),'flat',1)]}};
    second.trigger='pulse';second.every=5;second.effect={type:'ward',flat:10};
  }
  const initial=PROC_LIST.length,registered:ProcDef[]=[];
  const register=(proc:ProcDef)=>{assert(!PROCS[proc.id]);registerProc(proc);registered.push(proc);};
  register(first);if(name==='pulse-grant-waits-for-next-sweep')register(second);
  p.sheet.setBase(procStat(a),1);let draws=0;Math.random=()=>{draws++;return 0;};
  const execute=w['executeProc'],calls:string[]=[];
  w['executeProc']=(proc,owner,inst,target,depth,aim)=>{
    calls.push(proc.id);
    if(name==='append-during-dispatch'&&proc.id===a&&!PROCS[b]){register(second);p.sheet.setBase(procStat(b),1);}
    execute.call(w,proc,owner,inst,target,depth,aim);
  };
  const snapshot=()=>({ward:p.ward,calls:[...calls],draws,ready:[...p.procReadyAt],firstTrigger:first.trigger,registered:registered.map(r=>r.id)});
  try{
    const steps=[snapshot()];
    if(name==='append-during-dispatch'){
      w.rollOwnProcs(p,'condition');steps.push(snapshot());assert.deepEqual(calls,[a,b]);assert.equal(p.ward,3);
    }else if(name==='same-length-trigger-change'){
      w.rollOwnProcs(p,'condition');steps.push(snapshot());first.trigger='heal';w.rollOwnProcs(p,'heal');steps.push(snapshot());
      assert.equal(calls.length,1);register(second);w.rollOwnProcs(p,'heal');steps.push(snapshot());assert.deepEqual(calls,[a,a]);assert.equal(p.ward,2);
    }else{
      w['sweepTalentEvents'](p);steps.push(snapshot());assert.deepEqual(calls,[a]);assert.equal(p.ward,0);
      w['sweepTalentEvents'](p);steps.push(snapshot());assert.deepEqual(calls,[a,b]);assert.equal(p.ward,10);
    }
    rows.push({name,steps});
  }finally{
    w['executeProc']=execute;PROC_LIST.splice(initial);for(const proc of registered){delete PROCS[proc.id];delete STAT_DEFS[procStat(proc.id)];delete STAT_DEFS[procPowerStat(proc.id)];}
    p.dead=false;p.sheet=new StatSheet();w.rollOwnProcs(p,'condition');restore();
  }
}
assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Original registry mutation and pulse snapshot diagnostics. These are observations, not a promise of mutable SDK content or hot reload.',courses:rows.length,rows},null,2)+'\n');
