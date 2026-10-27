// Read-only discovery, not accepted fixtures or SDK implementation.
import fs from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet} from '../src/engine/stats';
import type {Actor} from '../src/engine/actor';
import type {ProcDef} from '../src/data/procs';
import assert from 'node:assert/strict';
import {PROC_LIST,procPowerStat} from '../src/data/procs';
type Resource='life'|'mana'|'es'|'poise';
interface Input {name:string;amount?:number;kind?:'instant'|'proc';resource?:Resource;maximum?:number;overcharge?:number;current?:number;dead?:boolean;reserved?:number;broken?:boolean;filled?:boolean;eventCount?:number;override?:number;callThrough?:boolean;proc?:ProcDef;power?:number;resetEsDelay?:boolean;noEvent?:boolean}
const destination=process.argv[2];
// Diagnostic-only records intentionally omit the original optional-at-runtime color.
function diagnosticProc(value:Omit<ProcDef,'color'> & {chance?:number}):ProcDef {return value as ProcDef;}
bootSimEngine();
const authored=PROC_LIST.filter(p=>p.effect.type==='restore');
const actorInputs:(Input & {amount:number})[]=[
  {name:'ordinary',amount:20},{name:'zero',amount:0},{name:'negative',amount:-10},
  {name:'dead',amount:20,dead:true},{name:'zero-maximum',amount:20,maximum:0},
  {name:'full',amount:20,current:100},{name:'above-cap',amount:20,current:125},
  {name:'overcharge',amount:120,overcharge:0.5},{name:'broken',amount:120,broken:true},
  {name:'just-below-threshold',amount:0.0004,current:99.9985},
  {name:'cross-threshold',amount:0.0006,current:99.9985},
  {name:'already-at-threshold',amount:0.0002,current:100-0.001},
  {name:'filled-flag-retained',amount:1,filled:true},
];
const calls:(Input & {kind:'instant'|'proc';resource:Resource;amount:number})[]=[
  ...(['life','mana','es','poise'] as const).map(resource=>({name:'instant-'+resource,kind:'instant' as const,resource,amount:20})),
  {name:'instant-reserved-mana',kind:'instant',resource:'mana',amount:60,reserved:40},
  {name:'instant-negative-mana',kind:'instant',resource:'mana',amount:-10},
  {name:'instant-dead-mana',kind:'instant',resource:'mana',amount:20,dead:true},
  {name:'instant-zero-es-delay-reset',kind:'instant',resource:'es',amount:0,resetEsDelay:true},
  {name:'instant-dead-es-delay-reset',kind:'instant',resource:'es',amount:20,resetEsDelay:true,dead:true},
  {name:'instant-no-event',kind:'instant',resource:'mana',amount:20,noEvent:true},
  {name:'instant-event-limit-minus-one',kind:'instant',resource:'mana',amount:20,eventCount:63},
  {name:'instant-event-limit',kind:'instant',resource:'mana',amount:20,eventCount:64},
  {name:'instant-return-positive-without-gain',kind:'instant',resource:'es',amount:20,override:1},
  {name:'instant-return-zero-after-gain',kind:'instant',resource:'es',amount:20,override:0,callThrough:true},
  {name:'proc-return-positive-without-gain',kind:'proc',resource:'es',amount:20,override:1},
  {name:'proc-return-zero-after-gain',kind:'proc',resource:'es',amount:20,override:0,callThrough:true},
  {name:'proc-negative-mana',kind:'proc',resource:'mana',amount:-10},
  {name:'proc-dead-mana',kind:'proc',resource:'mana',amount:20,dead:true},
  {name:'proc-zero-es-delay-reset',kind:'proc',resource:'es',amount:0,resetEsDelay:true},
];
const rows:unknown[]=[];
function state(p:Actor){return structuredClone({life:p.life,mana:p.mana,es:p.es,poise:p.poise,
  esJustFilled:p.esJustFilled,esDelay:p.esDelay,esRecharging:p.esRecharging,
  poiseBroken:p.poiseBroken,healedSince:p.healedSince,gainEvents:p.gainEvents,
  restoreGains:p.restoreGains,procCuePulses:p.procCuePulses,procPopEvents:p.procPopEvents});}
function observe(input:Input,run:(world:ReturnType<typeof makeSimWorld>,actor:Actor)=>unknown){
  const restore=seedGlobalRandom(0xc043);
  try{
    const w=makeSimWorld('warrior',0xc043),p=w.player;
    p.sheet=new StatSheet();
    for(const key of ['life','mana','energyShield','poise'])p.sheet.setBase(key,input.maximum??100);
    p.sheet.setBase('healTaken',1);p.sheet.setBase('poiseOvercharge',input.overcharge??0);
    p.life=p.mana=p.es=p.poise=input.current??40;p.dead=input.dead??false;
    p.reservedMana=input.reserved??0;p.poiseBroken=input.broken??false;
    p.esJustFilled=input.filled??false;p.esDelay=5;p.esRecharging=false;
    p.healedSince=0;p.gainEvents=[];p.restoreGains=[];p.procCuePulses=[];p.procPopEvents=[];
    w.actors=[p];w.time=10;
    for(let i=0;i<(input.eventCount??0);i++)p.gainEvents.push({kind:'restore',id:'mana',depth:0,n:1});
    if(input.override!==undefined){
      const original=p.gainEs.bind(p),override=input.override;
      p.gainEs=amount=>{if(input.callThrough)original(amount);return override;};
    }
    if(input.proc){assert(input.power!==undefined);p.sheet.setBase(procPowerStat(input.proc.id),input.power);}
    const before=state(p);let result:unknown,error:string|null=null;
    try{result=run(w,p);}catch(e){error=String(e);}
    rows.push({input,before,result,error,after:state(p)});
  }finally{restore();}
}
for(const resource of ['es','poise'] as const)for(const input of actorInputs)
  observe({...input,name:resource+'-'+input.name,resource},(_w,p)=>resource==='es'?p.gainEs(input.amount):p.gainPoise(input.amount));
for(const input of calls)observe(input,(w,p)=>{
  if(input.kind==='instant')return w['applyRestore'](p,{resource:input.resource,amount:input.amount,resetEsDelay:input.resetEsDelay},{noEvent:input.noEvent});
  assert(input.resource!=='life');
  // Synthetic diagnostic metadata retains the original omitted presentation color.
  return w['executeProc'](diagnosticProc({id:'discovery-restore',name:'Discovery Restore',trigger:'block',chance:1,
    effect:{type:'restore',resource:input.resource,flat:input.amount,resetEsDelay:input.resetEsDelay}}),p,null,null,0);
});
for(const proc of authored)for(const power of [0,1,2])observe({name:proc.id+'-power-'+power,proc,power},
  (w,p)=>w['executeProc'](proc,p,null,null,0));
fs.writeFileSync(destination,JSON.stringify({schemaVersion:1,stage:'Exploratory only; not an accepted baseline',
  scope:'Native gain gates, instant restoration versus proc restoration, actual cue/event state, and every restore proc loaded at startup. Direct host calls, not physical input.',
  authored:authored.map(p=>({id:p.id,trigger:p.trigger,effect:p.effect})),courses:rows.length,rows},
  (_k,v)=>v===undefined?{$undefined:true}:typeof v==='number'&&!Number.isFinite(v)?{$number:String(v)}:v,2)+'\n',{flag:'wx'});
