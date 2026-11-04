import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
import {prepareVocationObserver,checkVocationObserverTypes} from './vocation-reference.mjs';

const [flag,filename]=process.argv.slice(2);assert.equal(flag,'--location');
const location=JSON.parse(fs.readFileSync(path.resolve(filename)));
assert(location.characterRulesDecision);
const ref=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
verifyReference(ref,lock);
const dir=fs.mkdtempSync(path.join(root,'.artifacts/character-kit-allocation-'));
const helper='reference/profile-character-kits.ts',helperSha256=sha256(fs.readFileSync(path.join(root,helper))),entries={};
for(const [name,game]of [['original',ref],['installed',location.game]]){
  entries[name]=prepareVocationObserver(name,game,dir,{[name]:{helper,helperSha256}});
}
checkVocationObserverTypes(dir,Object.values(entries));
const observations=[];
for(let round=0;round<4;round++)for(const scenario of ['starter','all']){
  const result={round,scenario};
  for(const name of round%2?['installed','original']:['original','installed']){
    const file=path.join(dir,round+'-'+scenario+'-'+name+'.json'),fd=fs.openSync(file+'.txt','wx');
    try{
      execFileSync(process.execPath,['--expose-gc','--import','tsx',entries[name],file,scenario],
        {cwd:ref,stdio:['ignore',fd,fd],timeout:180000,windowsHide:true});
    }finally{fs.closeSync(fd);}
    result[name]=JSON.parse(fs.readFileSync(file));
  }
  assert.equal(result.original.calls,result.installed.calls);
  assert.equal(result.original.truePerRoster,result.installed.truePerRoster);
  observations.push(result);
}
verifyReference(ref,lock);
const report={passed:true,dir,helperSha256,node:process.version,archiveSha256:sha256(fs.readFileSync(location.archive)),observations,
  methodology:'V8 sampling with an 8192-byte interval, including objects discarded by major and minor GC. Each fresh process must detect a released 4 MiB calibration allocation. Sums weighted self sizes under the named query loop and includes roster iteration. Estimates allocations in the warmed Node process. Does not measure live heap, device memory, or a whole frame.'};
writeJSON(path.join(dir,'verification.json'),report);
console.log({passed:true,dir,observations:observations.map(r=>[r.scenario,r.original.estimatedBytesPerCall,r.installed.estimatedBytesPerCall])});
