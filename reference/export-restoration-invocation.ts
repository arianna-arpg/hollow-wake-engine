// Separate exploratory observations. Accepted fixtures are not rewritten.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {StatSheet} from '../src/engine/stats';
import {Actor} from '../src/engine/actor';
import type {ProcDef} from '../src/data/procs';

const destination=process.argv[2];
// Diagnostic-only records intentionally omit the original optional-at-runtime color.
function diagnosticProc(value:Omit<ProcDef,'color'> & {chance?:number}):ProcDef {return value as ProcDef;}
bootSimEngine();
const lanes=[['instant','life','healBy','maxLife'],['instant','es','gainEs','maxEs'],
  ['instant','poise','gainPoise','maxPoise'],['proc','es','gainEs','maxEs'],['proc','poise','gainPoise','maxPoise']] as const;
const rows:unknown[]=[];
const state=(a:Actor)=>structuredClone({life:a.life,es:a.es,poise:a.poise,healedSince:a.healedSince,
  esJustFilled:a.esJustFilled,gainEvents:a.gainEvents,restoreGains:a.restoreGains,procCuePulses:a.procCuePulses});
for(const[kind,resource,method,maximum]of lanes)for(const scenario of ['replace-method','custom-call-property','bound-receiver']){
  const restore=seedGlobalRandom(0xc043);
  try{
    const world=makeSimWorld('warrior',0xc043),actor=world.player,other=new Actor('other','player',{x:0,y:0}),events:{phase:string;receiver?:string;amount?:number}[]=[];
    for(const a of [actor,other]){
      a.sheet=new StatSheet();for(const stat of ['life','energyShield','poise'])a.sheet.setBase(stat,100);
      a.sheet.setBase('healTaken',1);a.life=a.es=a.poise=40;a.healedSince=0;
      a.gainEvents=[];a.restoreGains=[];a.procCuePulses=[];
    }
    world.actors=[actor];world.time=10;
    const native=actor[method];
    function selected(this:Actor,amount:number){
      assert(this===actor||this===other);events.push({phase:'original',receiver:this===actor?'owner':'other',amount});
      return Reflect.apply(native,this,[amount]);
    }
    function replacement(this:Actor,amount:number){
      assert.equal(this,actor);events.push({phase:'replacement',amount});return 7;
    }
    if(scenario==='custom-call-property')Object.defineProperty(selected,'call',{get(){throw new Error('Unexpected custom .call read');}});
    actor[method]=scenario==='bound-receiver'?selected.bind(other):selected;
    const effect={resource,amount:10};
    if(scenario==='replace-method'&&kind==='instant')Object.defineProperty(effect,'amount',{get(){
      events.push({phase:'amount'});actor[method]=replacement;return 10;
    }});
    if(scenario==='replace-method'&&kind==='proc'){
      const nativeMaximum=actor[maximum].bind(actor);
      actor[maximum]=()=>{events.push({phase:'maximum'});actor[method]=replacement;return nativeMaximum();};
    }
    const before={owner:state(actor),other:state(other)};let result:unknown,error:string|null=null;
    try{
      if(kind==='instant')result=world['applyRestore'](actor,effect);
      else result=world['executeProc'](diagnosticProc({id:'selection-'+resource,name:'Selection',trigger:'block',chance:1,
        effect:{type:'restore',resource,flat:10}}),actor,null,null,0);
    }catch(e){error=String(e);}
    assert.equal(error,null);
    assert.equal(events.find(e=>e.phase==='original'||e.phase==='replacement')?.phase,
      scenario==='replace-method'&&kind==='proc'?'replacement':'original');
    rows.push({kind,resource,method,scenario,before,result,error,events,after:{owner:state(actor),other:state(other)}});
  }finally{restore();}
}
fs.writeFileSync(destination,JSON.stringify({schemaVersion:1,stage:'Exploratory only; not accepted fixtures',
  scope:'Instant gain-method selection precedes amount evaluation; proc gain-method selection follows maximum evaluation. Native own-call-property and bound-receiver semantics are observed on real actors.',
  courses:rows.length,rows},(_k,v)=>v===undefined?{$undefined:true}:v,2)+'\n',{flag:'wx'});
