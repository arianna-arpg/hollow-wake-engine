import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Session} from 'node:inspector/promises';
import type {HeapProfiler} from 'node:inspector';
import {CLASSES,kitRungs} from '../src/data/classes';
import {makeAccount} from '../src/meta/account';
import {kitHasOptions} from '../src/meta/classkit';
import {classTierId} from '../src/data/classTiers';

const account=makeAccount(),scenario=process.argv[3];assert(['starter','all'].includes(scenario));
if(scenario==='all')for(const def of CLASSES)for(const rung of kitRungs(def))account.unlockedClassTiers.add(classTierId(def.id,rung.tier));
const target=CLASSES.reduce((sum,c)=>sum+Number(kitHasOptions(account,c)),0);
function queryLoop(rounds:number){let total=0;for(let r=0;r<rounds;r++)for(const cls of CLASSES)if(kitHasOptions(account,cls))total++;return total;}
const rounds=2000;assert.equal(queryLoop(400),target*400);
let calibrationSink:number[][]|null=null;
function calibrateAllocations(){calibrationSink=[];for(let i=0;i<512;i++)calibrationSink.push(new Array<number>(1024).fill(i));}
const session=new Session();session.connect();
async function sample(fn:()=>void,frame:string){
  const settings={samplingInterval:8192,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true};
  await session.post('HeapProfiler.startSampling',settings);
  let profile: HeapProfiler.SamplingHeapProfile;
  try{fn();global.gc!();}finally{profile=(await session.post('HeapProfiler.stopSampling')).profile;}
  let bytes=0;
  function visit(node:HeapProfiler.SamplingHeapProfileNode,active:boolean){active ||= node.callFrame.functionName===frame;if(active)bytes+=node.selfSize;for(const child of node.children??[])visit(child,active);}
  visit(profile.head,false);
  return {bytes};
}
try{
  const calibration=await sample(()=>{calibrateAllocations();assert.equal(calibrationSink!.at(-1)?.[0],511);calibrationSink=null;},'calibrateAllocations');
  assert(calibration.bytes>2*1024*1024,'Sampling discarded allocations is unavailable');
  const query=await sample(()=>{assert.equal(queryLoop(rounds),target*rounds);},'queryLoop');
  fs.writeFileSync(process.argv[2],JSON.stringify({scenario,classes:CLASSES.length,calls:rounds*CLASSES.length,truePerRoster:target,calibration,query,interval:8192,estimatedBytesPerCall:query.bytes/(rounds*CLASSES.length)})+'\n',{flag:'wx'});
}finally{session.disconnect();}
