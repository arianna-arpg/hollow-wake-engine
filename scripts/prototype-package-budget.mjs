import fs from 'node:fs';import assert from 'node:assert/strict';
const reviewed=JSON.parse(fs.readFileSync(new URL('../baseline/prototype-parity/package-growth.json',import.meta.url)));
export function prototypeModuleBudget(name,actualBytes){
 assert(Object.hasOwn(reviewed.modules,name),'Unreviewed prototype module: '+name);
 const bound=reviewed.modules[name],growthBytes=Math.max(0,actualBytes-bound.previousBytes);
 assert(growthBytes<=bound.maxGrowthBytes,'Reviewed prototype growth exceeded: '+name);
 return {actualBytes,historicalBytes:actualBytes-growthBytes,growthBytes,budgetBytes:bound.maxGrowthBytes};
}
// Historical component ceilings cover their historical bytes. Reviewed new
// rules have individual small allowances, plus a finite combined allowance.
// Return detached accounting records; actual archive sizes remain untouched.
export function prototypePackageBudget(files){
 const byPath=new Map(files.map(f=>[f.path,f]));assert.equal(byPath.size,files.length);
 const modules={};let growthBytes=0;
 for(const [name,bound]of Object.entries(reviewed.modules)){
  const actual=byPath.get(name);assert(actual?.size>0,'Missing parity runtime: '+name);
  const growth=Math.max(0,actual.size-bound.previousBytes);
  assert(growth<=bound.maxGrowthBytes,'Reviewed prototype growth exceeded: '+name);
  modules[name]={actualBytes:actual.size,previousBytes:bound.previousBytes,growthBytes:growth,budgetBytes:bound.maxGrowthBytes};growthBytes+=growth;
 }
 assert(growthBytes<=reviewed.maxTotalGrowthBytes,'Combined prototype growth exceeded');
 return {growthBytes,budgetBytes:reviewed.maxTotalGrowthBytes,modules,
  historicalFiles:files.map(file=>({...file,size:file.size-(modules[file.path]?.growthBytes??0)}))};
}
