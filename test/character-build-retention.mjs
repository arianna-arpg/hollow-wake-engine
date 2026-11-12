import assert from 'node:assert/strict';

/** Node GC reachability check, separate from portable gameplay contracts.
 * Prior skill objects must be collectible while the latest build stays usable.
 * This checks retained references, not throughput, heap size or device budgets. */
export async function verifyBuildRetention(setup,mode='open'){
  assert.equal(typeof global.gc,'function','Run this course with --expose-gc');
  const {builds,ports,input,learned}=setup();input.learned=[learned()];
  const sources=[],clone=ports.copySkill;
  ports.copySkill=source=>{sources.push(new WeakRef(source));return clone(source);};
  assert(['open','adopt'].includes(mode));
  let current=mode==='adopt'?builds.adopt(input,['bolt',null],{
    sourceOrder:['attributes','class','passives','level'],grants:[],companions:[]
  }):builds.open(input,['bolt',null]);
  for(let n=0;n<32;n++)current=builds.rebuild(current,input);
  assert.equal(sources.length,32);
  // WeakRef targets stay alive until the current JavaScript job ends.
  for(let n=0;n<12;n++){await new Promise(resolve=>setImmediate(resolve));global.gc();}
  const retained=sources.filter(ref=>ref.deref()!==undefined).length;
  assert.equal(retained,0,'Completed build retains preceding skill investment');
  assert.equal(builds.read(current).bar[0].id,'bolt');
  const next=builds.rebuild(current,input);
  assert.deepEqual(builds.read(next),builds.read(current));
  assert.equal(builds.lineages(next).get('learned/bolt'),builds.lineages(current).get('learned/bolt'));
  return {precedingSkills:32,retainedPrecedingSkills:retained,currentBuildReadable:true,nextBuildEquivalent:true};
}
