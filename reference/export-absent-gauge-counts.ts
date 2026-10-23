// Compatibility addendum from the original publisher. These sparse records
// reproduce fields omitted by the accepted admission courses; no SDK oracle.
import fs from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
bootSimEngine();
const results:any[]=[];
for(const kind of ['status','reserve'] as const){const restore=seedGlobalRandom(360041);try{
 const world=makeSimWorld('magician',360041),actor=world.player;
 actor.statuses=[];actor.charges.clear();actor.brims=undefined;actor.reserves=undefined;actor.derivedGauges=null;
 const record:any=kind==='status'?{id:'poison',remaining:10,magnitude:1,source:actor}:{cur:1,ventUntil:0};
 if(kind==='status')actor.statuses.push(record);else actor.reserves=new Map([['investigation',record]]);
 const field=kind==='status'?'stacks':'pips',key=kind==='status'?'status:poison':'reserve:investigation';
 const publications:any[]=[],publish=actor.sheet.setGauges.bind(actor.sheet);
 actor.sheet.setGauges=entries=>{publications.push(entries.map(entry=>[...entry]));publish(entries);};
 const steps:any[]=[];
 for(const operation of ['missing','stable-missing','positive','removed','stable-removed']){
  if(operation==='positive')record[field]=2;
  if(operation==='removed')delete record[field];
  const start=publications.length;actor['refreshConditions']();
  steps.push({operation,hasCount:Object.hasOwn(record,field),count:record[field]??null,gauge:actor.sheet.gauge(key),publications:publications.slice(start)});
 }
 results.push({name:kind+'-absent-count',steps});
}finally{restore();}}
fs.writeFileSync(process.argv[2],JSON.stringify({schema:'hollow-wake-absent-gauge-counts/v1',courses:results.length,transitions:results.reduce((n,r)=>n+r.steps.length,0),results},null,2)+'\n');
