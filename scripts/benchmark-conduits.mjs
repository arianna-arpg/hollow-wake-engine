import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import os from 'node:os';

export function measure(originalFile,installedFile) {
  const require=createRequire(import.meta.url);
  const factories=[require(originalFile).createWorkload,require(installedFile).createWorkload];
  const result={node:process.version,arch:process.arch,cpu:os.cpus()[0]?.model,actors:24,slots:8,frames:120,workloads:{}};
  const median=values=>{
    const sorted=[...values].sort((a,b)=>a-b);
    return (sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2;
  };
  for(const kind of ['idle','mixed','engaged','worn']){
    const [original,installed]=factories.map(factory=>factory(kind));
    const baseline=original();assert.equal(installed(),baseline);
    const time=fn=>{
      const before=process.hrtime.bigint(),sum=fn(),end=process.hrtime.bigint();
      assert.equal(sum,baseline);
      return Number(end-before)/1e6;
    };
    const pairs=[],control=[],duplicate=factories[0](kind);
    assert.equal(duplicate(),baseline);
    function pair(left,right,round) {
      const forward=round%2===0;
      const first=time(forward?left:right),second=time(forward?right:left);
      return forward?[first,second]:[second,first];
    }
    for(let round=0;round<14;round++){
      const comparison=pair(original,installed,round);
      const noise=pair(original,duplicate,round);
      if(round>=2){pairs.push(comparison);control.push(noise);}
    }
    result.workloads[kind]={checksum:baseline,originalMedianMs:median(pairs.map(p=>p[0])),
      installedMedianMs:median(pairs.map(p=>p[1])),medianInstalledOriginalRatio:median(pairs.map(p=>p[1]/p[0])),
      medianIdenticalBuildRatio:median(control.map(p=>p[1]/p[0])),pairedOriginalInstalledMs:pairs,pairedOriginalControlMs:control};
  }
  return result;
}
