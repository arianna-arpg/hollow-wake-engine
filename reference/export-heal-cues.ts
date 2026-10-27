// Capture actual pulse storage and derived HUD rows, not just the display override.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet} from '../src/engine/stats';
import {PROCS,procPowerStat,type ProcDef} from '../src/data/procs';
import {procCueRows,tickProcCues} from '../src/engine/procCues';
bootSimEngine();
interface Input {name:string;life?:number;dead?:boolean;reserved?:number;rate?:number;returned?:number;disabled?:boolean;failure?:boolean;repeat?:boolean;expiry?:boolean;kill?:boolean}
const cases:Input[]=[{name:'positive'},{name:'full',life:100},{name:'above-cap',life:120},{name:'dead',dead:true},
  {name:'reserved-full',reserved:50},{name:'zero-rate',rate:0},{name:'return-zero-after-growth',returned:0},
  {name:'return-positive-without-growth',life:100,returned:1},{name:'cue-disabled',disabled:true},{name:'observer-failure',failure:true},
  {name:'repeated-gain',repeat:true},{name:'expiry',expiry:true},{name:'death-clears-pulses',kill:true}];
const rows:unknown[]=[];
for(const input of cases){
  const restore=seedGlobalRandom(0xc042);
  try{
    const w=makeSimWorld('warrior',0xc042),p=w.player,events:unknown[]=[];
    p.sheet=new StatSheet();p.sheet.setBase('life',100);p.sheet.setBase('healTaken',input.rate??1);p.sheet.setBase(procPowerStat('guarded_heart'),1);
    p.life=input.life??50;p.dead=input.dead??false;p.reservedLife=input.reserved??0;p.healedSince=0;
    p.procCues=undefined;p.procCuePulses=[];p.procPopEvents=[];w.actors=[p];w.time=10;
    const proc:ProcDef={...PROCS.guarded_heart,effect:{type:'heal',flat:3},...(input.disabled?{procCue:false as const}:{})};
    const heal=p.healBy,observer=p.onLifeHealed,riders=w['fireProcRiders'].bind(w);
    p.healBy=function(amount,silent){const landed=heal.call(this,amount,silent);return input.returned??landed;};
    p.onLifeHealed=function(amount,silent){events.push({phase:'observer',amount,silent,receiver:this===p});if(input.failure)throw Error('observer-failure');observer?.call(this,amount,silent);};
    w['fireProcRiders']=(...args)=>{events.push({phase:'riders',proc:args[0].id,depth:args[4]});return riders(...args);};
    const state=()=>structuredClone({life:p.life,dead:p.dead,healedSince:p.healedSince,pulses:p.procCuePulses,pops:p.procPopEvents,rows:procCueRows(p)});
    const before=state();let error:string|null=null;
    try{w['executeProc'](proc,p,null,null,0);if(input.repeat)w['executeProc'](proc,p,null,null,0);}catch(e){error=(e as Error).message;}
    assert.equal(error,input.failure?'observer-failure':null);
    const after=state(),gains=p.procCuePulses.filter(c=>c.phase==='gain');
    const shouldGain=!input.dead&&!input.disabled&&!input.failure&&(input.returned??(p.life-before.life))>0;
    assert.equal(gains.length,shouldGain?1:0,input.name);
    if(input.expiry)tickProcCues(p,.2);const advanced=state();
    if(input.expiry)tickProcCues(p,10);if(input.kill){p.dead=true;tickProcCues(p,0);}
    const final=state();if(input.expiry||input.kill)assert.equal(p.procCuePulses.length,0);
    rows.push({input,before,error,after,advanced,final,events});
  }finally{restore();}
}
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,rows,
  scope:'Actual native healing pulse storage, pop events and derived cue rows, including return-value gates, coalescing, expiration and death. Controlled executor inputs; no renderer or physical-input claim.'},null,2)+'\n');
