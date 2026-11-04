import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CLASSES,kitRungs} from '../src/data/classes';
import {classTierId} from '../src/data/classTiers';
import {makeAccount,unlockedClassCount} from '../src/meta/account';
import {resolveClassKit,kitChoicesFor,kitHasOptions} from '../src/meta/classkit';
import {UNLOCK_CATALOG,settleClassUnlocks} from '../src/meta/unlocks';

const account=makeAccount(),observations=[],registered=CLASSES.length;
const allOpen=makeAccount();
for(const cls of CLASSES) {
  allOpen.unlockedClasses.add(cls.id);
  for(const rung of kitRungs(cls))allOpen.unlockedClassTiers.add(classTierId(cls.id,rung.tier));
}
assert.equal(unlockedClassCount(allOpen),registered);
const passes=4000;
function measure(name:string,fn:(i:number)=>number,period=registered){
  const sample=Array.from({length:period},(_,i)=>fn(i));let sum=0;
  for(let i=0;i<10000;i++)fn(i%period);
  const start=process.hrtime.bigint();
  for(let pass=0;pass<passes;pass++)for(let i=0;i<period;i++)sum+=fn(i);
  const nanoseconds=Number(process.hrtime.bigint()-start),calls=passes*period;
  assert.equal(sum,sample.reduce((a,b)=>a+b,0)*passes);
  observations.push({name,calls,nanoseconds,state:sample});
}
for(const [key,owner]of [['starter',account],['all',allOpen]] as const){
  measure(key+'-kit-menu',i=>{const c=kitChoicesFor(owner,CLASSES[i]);return c.slots.reduce((n,s)=>n+s.options.length,0)+c.grants.length;});
  measure(key+'-kit-availability',i=>Number(kitHasOptions(owner,CLASSES[i])));
  measure(key+'-resolve-opening',i=>{const b=resolveClassKit(owner,CLASSES[i]);return b.reduce((n,s)=>n+(s?.length??0),0);});
  measure(key+'-roster-count',()=>unlockedClassCount(owner),1);
}
assert(UNLOCK_CATALOG.length>36);
measure('settle-already-owned',()=>settleClassUnlocks(allOpen).length,1);
fs.writeFileSync(process.argv[2],JSON.stringify(observations)+'\n',{flag:'wx'});
