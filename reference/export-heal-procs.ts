// Observe the real proc executor, cue publication and event sweep. Hooks call through.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet} from '../src/engine/stats';
import {SIM_TAP} from '../src/engine/tap';
import {PROC_LIST,procPowerStat,procStat,type ProcDef} from '../src/data/procs';

bootSimEngine();
const authored=PROC_LIST.filter(p=>p.effect.type==='heal');
assert.deepEqual(authored.map(p=>p.id),['parasite_sip','guarded_heart','second_wind','native_field_patch','weave_break_for_breath']);
interface Course {
  name:string;proc:ProcDef;power?:number;life?:number;seal?:number;reserved?:number;
  rate?:number;dead?:boolean;returned?:number;throwObserver?:boolean;earned?:boolean;
}
const cases:Course[]=authored.flatMap(proc=>[0,1,2].map(power=>({name:proc.id+'-power-'+power,proc,power})));
const guarded=authored[1];
cases.push(
  {name:'already-full',proc:guarded,life:1000},
  {name:'above-fallen-cap',proc:guarded,life:1200},
  {name:'sealed',proc:guarded,seal:510},
  {name:'reserved',proc:guarded,reserved:490},
  {name:'zero-rate',proc:guarded,rate:0},
  {name:'dead',proc:guarded,dead:true},
  {name:'return-zero-after-growth',proc:guarded,returned:0},
  {name:'return-positive-without-growth',proc:guarded,life:1000,returned:1},
  {name:'observer-throws',proc:guarded,throwObserver:true},
  {name:'cue-disabled',proc:{...guarded,procCue:false}},
  {name:'name-disabled',proc:{...guarded,announceName:false}},
  ...authored.slice(0,3).map(proc=>({name:'earned-'+proc.id,proc,earned:true})),
);
const rows:unknown[]=[];
for(const input of cases){
  const restore=seedGlobalRandom(0xc042),oldTap=SIM_TAP.current;
  try{
    const w=makeSimWorld('warrior',0xc042),p=w.player;
    p.sheet=new StatSheet();p.sheet.setBase('life',1000);p.sheet.setBase('healTaken',input.rate??1);
    p.sheet.setBase(procPowerStat(input.proc.id),input.power??1);
    p.life=input.life??500;p.dead=input.dead??false;p.lifeSealAt=input.seal;p.reservedLife=input.reserved??0;
    p.healedSince=0;p.condRose=[];p.gasped=false;p.procCues=undefined;p.procReadyAt.clear();w.actors=[p];w.time=10;
    const events:unknown[]=[];
    const state=()=>structuredClone({life:p.life,dead:p.dead,healedSince:p.healedSince,since:[...p.since],
      cues:p.procCues,ready:[...p.procReadyAt],conditionQueue:p.condRose});
    const record=(phase:string,details?:unknown)=>events.push({phase,details,state:state()});
    const maximum=p.maxLife.bind(p),heal=p.healBy.bind(p),observer=p.onLifeHealed,
      riders=w['fireProcRiders'].bind(w),own=w.rollOwnProcs.bind(w);
    p.maxLife=()=>{record('maximum');return maximum();};
    p.healBy=(amount,silent)=>{record('heal-before',{amount,silent});const landed=heal(amount,silent);
      const result=input.returned??landed;record('heal-return',{landed,returned:result});return result;};
    p.onLifeHealed=function(amount,silent){assert.equal(this,p);record('observer',{amount,silent});
      if(input.throwObserver)throw new Error('observer-failure');observer?.call(this,amount,silent);};
    SIM_TAP.current={onHeal:(a,amount)=>{assert.equal(a,p);record('tap',{amount});}};
    w['fireProcRiders']=(...args)=>{record('riders',{proc:args[0].id,owner:args[1]===p,
      skill:args[2]?.def.id??null,target:args[3]===null?null:args[3]===p?'owner':'other',depth:args[4]});return riders(...args);};
    w.rollOwnProcs=(owner,trigger,event)=>{record('own-trigger',{owner:owner===p,trigger,event});return own(owner,trigger,event);};
    let draws=0;const random=Math.random;Math.random=()=>{draws++;return random();};
    if(input.earned)p.sheet.setBase(procStat(input.proc.id),1);
    const before=state();let error:string|null=null,attempts=0;
    try{
      if(input.earned){
        while(p.healedSince===0){assert(attempts++<10,'Seeded proc admission failed');w.rollOwnProcs(p,input.proc.trigger);}
      }else w['executeProc'](input.proc,p,null,null,0);
    }catch(failure){error=(failure as Error).message;}
    assert.equal(error,input.throwObserver?'observer-failure':null,input.name);
    const after=state();
    if(!error)w['sweepTalentEvents'](p);
    rows.push({input,before,error,after,afterSweep:state(),events,draws,attempts});
  }finally{SIM_TAP.current=oldTap;restore();}
}
assert.equal(rows.length,29);
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,
  scope:'All five loaded heal procs, including two generated during boot: scaled executor calls and native cue/rider order. Three common proc triggers also exercise granted admission; every successful course uses the real post-heal event sweep. Controlled life and rate inputs; no rendered-input or device claim.',
  courses:rows.length,rows},(_key,value)=>value===undefined?{$undefined:true}:typeof value==='number'&&!Number.isFinite(value)?{$number:String(value)}:value,2)+'\n');
