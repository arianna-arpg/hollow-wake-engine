// Capture the original receiver/method selection before effect arguments run.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet} from '../src/engine/stats';
import {PROCS,procPowerStat,type ProcDef} from '../src/data/procs';
bootSimEngine();const rows:unknown[]=[];
for(const phase of ['maximum','flat','pct']){
  const restore=seedGlobalRandom(42);
  try{
    const w=makeSimWorld('warrior',42),p=w.player,calls:unknown[]=[];
    p.sheet=new StatSheet();p.sheet.setBase('life',100);p.sheet.setBase(procPowerStat('guarded_heart'),1);p.life=50;
    const heal=p.healBy;
    const replace=()=>{p.healBy=function(amount){calls.push(['replacement',amount,this===p]);return 0;};};
    p.healBy=function(amount,silent){calls.push(['original',amount,this===p]);return heal.call(this,amount,silent);};
    if(phase==='maximum'){const maximum=p.maxLife;p.maxLife=function(){replace();return maximum.call(this);};}
    const effect={type:'heal' as const,
      get flat(){if(phase==='flat')replace();return 3;},
      get pctMax(){if(phase==='pct')replace();return 0;}};
    const proc:ProcDef={...PROCS.guarded_heart,effect};
    w['executeProc'](proc,p,null,null,0);
    assert.deepEqual(calls,[['original',3,true]]);assert.equal(p.life,53);
    rows.push({phase,calls,life:p.life});
  }finally{restore();}
}
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,rows,
  scope:'Original proc method selection precedes maximum-life and effect-field evaluation. Synthetic callback/accessor probes; owned content continues to reject accessors.'},null,2)+'\n');
