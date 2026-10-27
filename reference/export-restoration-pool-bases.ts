import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet} from '../src/engine/stats';
import type {ProcDef} from '../src/data/procs';
import {PROC_LIST,procPowerStat} from '../src/data/procs';
const destination=process.argv[2];
bootSimEngine();
interface Input {name:string;id:string;reserved?:number;power?:number;current?:number;overcharge?:number;mutate?:'maxMana'|'availableMaxMana';to?:number;zero?:boolean}
const cases:Input[]=[
  {name:'reserved-mana',id:'desperate_reserves',reserved:40},
  {name:'reserved-mana-double-power',id:'desperate_reserves',reserved:40,power:2},
  {name:'fully-reserved-mana-drains',id:'desperate_reserves',reserved:100,current:10},
  {name:'overcharged-poise-percentage-base',id:'shield_lesson',current:120,overcharge:.5},
  {name:'overcharged-poise-cap',id:'shield_lesson',current:140,overcharge:.5},
  {name:'mana-query-mutates-current',id:'desperate_reserves',mutate:'maxMana',to:5},
  {name:'available-query-mutates-current',id:'desperate_reserves',mutate:'availableMaxMana',to:95},
  {name:'zero-explicit-amount-query-gain-cue',id:'desperate_reserves',mutate:'maxMana',to:5,zero:true},
];
const rows:{input:Input;originalEffect:ProcDef['effect'];before:unknown;events:unknown[];after:{mana:number;poise:number;cues:unknown[]}}[]=[];
for(const input of cases){
  const restore=seedGlobalRandom(0xc043);
  try{
    const world=makeSimWorld('warrior',0xc043),actor=world.player,events:unknown[]=[];
    actor.sheet=new StatSheet();for(const id of ['life','mana','energyShield','poise'])actor.sheet.setBase(id,100);
    actor.sheet.setBase('poiseOvercharge',input.overcharge??0);actor.sheet.setBase(procPowerStat(input.id),input.power??1);
    actor.life=100;actor.mana=actor.es=actor.poise=input.current??0;actor.reservedMana=input.reserved??0;
    actor.gainEvents=[];actor.restoreGains=[];actor.procCuePulses=[];
    const state=()=>structuredClone({mana:actor.mana,poise:actor.poise,es:actor.es,
      events:actor.gainEvents,cues:actor.procCuePulses});
    let fired=false;
    for(const key of ['maxMana','availableMaxMana','maxPoise','maxEs'] as const){
      const native=actor[key].bind(actor);
      actor[key]=()=>{
        events.push({phase:key+':before',state:state()});
        if(!fired&&input.mutate===key){fired=true;assert(input.to!==undefined);actor.mana=input.to;}
        const result=native();events.push({phase:key+':after',result,state:state()});return result;
      };
    }
    const original=PROC_LIST.find(p=>p.id===input.id);assert(original);
    const proc:ProcDef=input.zero?{...original,effect:{type:'restore',resource:'mana',flat:0}}:original;
    const before=state();world['executeProc'](proc,actor,null,null,0);
    rows.push({input,originalEffect:original.effect,before,events,after:state()});
  }finally{restore();}
}
assert.deepEqual(rows.map(r=>r.after.mana),[10,20,0,120,140,15,100,5]);
assert.equal(rows[3].after.poise,140);assert.equal(rows[4].after.poise,150);assert(rows[7].after.cues.length>0);
fs.writeFileSync(destination,JSON.stringify({schemaVersion:1,stage:'Exploratory only; not accepted fixtures',
  scope:'Real proc percentages use total maxima before applying available-mana and overcharge ceilings; live query ordering and zero-explicit-amount growth cues remain observable.',
  courses:rows.length,rows},(_k,v)=>v===undefined?{$undefined:true}:v,2)+'\n',{flag:'wx'});
