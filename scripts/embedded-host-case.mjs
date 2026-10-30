import assert from 'node:assert/strict';

export const embeddedProbeCases = [
  ['success',0,null,'encode'],['invalid-json',2,/SyntaxError:/,'input'],
  ['sdk-error',2,/TypeError:/,'observe'],['interrupt',2,/InternalError: interrupted/,'interrupt'],
  ['memory',2,/InternalError: out of memory/,'allocation'],['load-memory',2,null,'bundle'],
  ['startup-memory',3,null,null],['stack',2,/RangeError: Maximum call stack size exceeded/,'stack'],
];

/** Shared verdict for the real native probe and its deliberate fault variants. */
export function verifyEmbeddedHostCase({mode,exitCode,stderr,stdout}) {
  const specification=embeddedProbeCases.find(c=>c[0]===mode);assert(specification,'Unknown native probe mode');
  const [,expectedCode,errorPattern,phase]=specification;assert.equal(exitCode,expectedCode,mode);
  const lines=stderr.trim().split(/\r?\n/),stats=lines.filter(line=>line.startsWith('{')).map(JSON.parse),errors=lines.filter(line=>line.startsWith('exception:'));
  assert.equal(stats.length,3,mode);assert.equal(errors.length,expectedCode===2?3:0,mode);
  if(errorPattern)for(const error of errors)assert.match(error,errorPattern);
  for(const [iteration,entry]of stats.entries()) {
    assert.equal(entry.mode,mode);assert.equal(entry.iteration,iteration);assert.equal(entry.code,expectedCode);
    assert.equal(entry.liveRequestedBytesAfterDispose,0);assert.equal(entry.liveBlocksAfterDispose,0);
    assert(entry.peakRequestedBytes>0&&entry.allocationRequests>0);
    assert.equal(entry.interruptCalls,mode==='interrupt'?2:0);
    if(mode==='startup-memory')assert(['runtime','context'].includes(entry.phase),'Startup must fail while constructing the VM');
    else assert.equal(entry.phase,phase);
    const budget=mode==='memory'||mode==='load-memory'?1024*1024:mode==='startup-memory'?32768:256*1024*1024;
    assert.equal(entry.heapLimitBytes,budget);assert(entry.peakRequestedBytes<=budget);
    assert.equal(entry.allocationProbeBytes,mode==='memory'?2*1024*1024:0);
  }
  if(mode!=='success')assert.equal(stdout,'');
  return {stats,errors};
}
