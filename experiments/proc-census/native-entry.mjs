import {censusFixture,censusSample,originalCount,countProcSummons,countWorldSummons} from './workload.mjs';

export function create({size,density}) {return censusFixture(size,density);}
export function dispatch(fixture,{mode,cycles,warmup}) {
  const count=mode===0?originalCount:mode===2?countWorldSummons:countProcSummons;
  const perCycle=fixture.expected.reduce((a,b)=>a+b,0);
  if(censusSample(fixture,count,warmup)!==warmup*perCycle)throw Error('Warmup mismatch');
  const start=Date.now(),sum=censusSample(fixture,count,cycles),elapsedMs=Date.now()-start;
  if(sum!==cycles*perCycle)throw Error('Timed result mismatch');
  return {sum,elapsedMs,expected:fixture.expected};
}
