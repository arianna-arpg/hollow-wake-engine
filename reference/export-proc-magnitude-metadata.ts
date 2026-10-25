import fs from 'node:fs';import assert from 'node:assert/strict';
import {scaleProcEffect,type ProcEffect} from '../src/data/procs';
const encode=(v:any):any=>v===undefined?{$undefined:true}:v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(encode):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]));
const freeze=(v:any):any=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const inputs=[
 {name:'delayed-metadata',effect:{type:'delayedBurst',delay:1,radius:10,at:'self',outer:{id:'outer'},damage:{type:'fire',base:2,perLevel:3,extra:{id:'damage'}},healAllies:{base:4,perLevel:5,extra:{id:'healing'}}}},
 {name:'cast-metadata',effect:{type:'cast',cast:{skill:'firebolt',mult:0,extra:{id:'cast'}},outer:{id:'outer'}}},
 {name:'delayed-absent',effect:{type:'delayedBurst',delay:1,radius:10,at:'self'}},
 {name:'future-diagnostic',effect:{type:'future-effect',base:10,extra:{id:'future'}}},
];
const rows:unknown[]=[];
for(const input of inputs)for(const power of [1,2]){
 const fx=freeze(input.effect)as unknown as ProcEffect,before=JSON.stringify(encode(fx)),out=scaleProcEffect(fx,power)as any;
 assert.equal(JSON.stringify(encode(fx)),before);const same=power===1||input.name==='future-diagnostic';assert.equal(out===fx,same);
 if(input.name==='delayed-metadata'){
  const source=fx as any;assert.equal(out.outer,source.outer);assert.equal(out.damage.extra,source.damage.extra);
  assert.equal(out.damage===source.damage,power===1);assert.equal(out.healAllies===source.healAllies,power===1);
  assert.equal(Object.hasOwn(out.healAllies,'extra'),power===1);assert.equal(out.damage.base,2*power);assert.equal(out.healAllies.base,4*power);
 }
 if(input.name==='cast-metadata'){assert.equal(out.cast.mult,0);assert.equal(out.cast.extra,(fx as any).cast.extra);assert.equal(out.cast===(fx as any).cast,power===1);}
 if(input.name==='delayed-absent'){assert.equal(Object.hasOwn(out,'damage'),power!==1);assert.equal(Object.hasOwn(out,'healAllies'),power!==1);}
 const identity=Object.fromEntries(['outer','damage','healAllies','cast','extra'].filter(k=>Object.hasOwn(fx,k)).map(k=>[k,out[k]===(fx as any)[k]]));
 rows.push({name:input.name,power,input:encode(fx),sameInput:same,identity,keys:Object.keys(out),result:encode(out)});
}
assert.equal(rows.length,8);assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Unaccepted original magnitude metadata observations: frozen inputs, nested retention and omission, explicit undefined keys, and a future-tag diagnostic. No executor support for unknown effects is implied.',courses:rows.length,rows},null,2)+'\n');
