import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';

const [flag,file,...rest]=process.argv.slice(2);
assert.equal(flag,'--location');
assert(new Set(rest).size===rest.length&&rest.every(flag=>['--control','--continuity','--gates'].includes(flag)));
const continuity=rest.includes('--continuity');
const gates=rest.includes('--gates');
assert(!(continuity&&gates),'Choose one workload');
const location=JSON.parse(fs.readFileSync(path.resolve(file)));
assert(location.characterRulesDecision);
if(continuity)assert(location.characterContinuityDecision);
if(gates)assert(location.progressionGateDecision);
const ref=path.join(root,'.reference'),game=fs.realpathSync(location.game),control=rest.includes('--control');
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
verifyReference(ref,lock);
const workload=gates?'progression-gates':continuity?'character-continuity':'character-rules';
const directory=fs.mkdtempSync(path.join(root,'.artifacts/'+workload+'-benchmark-'));
const template=fs.readFileSync(path.join(root,'reference/benchmark-'+workload+'.ts'),'utf8'),entries={};
for(const [name,base]of [['original',control?game:ref],['installed',game]]){
  const entry=path.join(directory,name+'.ts');
  fs.writeFileSync(entry,template.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_all,_quote,id)=>JSON.stringify(pathToFileURL(path.join(base,'src',id+'.ts')).href)));
  entries[name]=entry;
}
const rounds=[];
for(let i=0;i<8;i++){
  const round={};
  for(const name of i%2===0?['original','installed']:['installed','original']){
    const output=path.join(directory,i+'-'+name+'.json'),fd=fs.openSync(output+'.txt','wx');
    try{execFileSync(process.execPath,['--import','tsx',entries[name],output],{cwd:ref,stdio:['ignore',fd,fd],timeout:180000,windowsHide:true});}
    finally{fs.closeSync(fd);}
    round[name]=JSON.parse(fs.readFileSync(output));
    assert(round[name].every(r=>r.nanoseconds>0&&r.calls>=4000));
  }
  assert.deepEqual(round.original.map(r=>[r.name,r.calls,r.state]),round.installed.map(r=>[r.name,r.calls,r.state]));
  rounds.push(round);
}
function median(values){
  const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
const summary=rounds[0].original.map((row,index)=>{
  const perCall=variant=>rounds.map(r=>r[variant][index].nanoseconds/row.calls);
  const original=perCall('original'),installed=perCall('installed');
  return {name:row.name,originalNs:median(original),installedNs:median(installed),pairedRatio:median(original.map((n,i)=>installed[i]/n))};
});
verifyReference(ref,lock);
const report={passed:true,directory,control,continuity,gates,node:process.version,cpu:os.cpus()[0].model,archiveSha256:sha256(fs.readFileSync(location.archive)),helperSha256:sha256(template),rounds,summary,
  scope:'Warm desktop Node calls using game entry points. Each pair runs in a fresh process with a balanced order. Includes selected query and return-value work. The continuity suite checks reward selection and class settlement. The gate suite combines membership, row progress and label work for each authored group. Excludes rendering, disk I/O, complete frames, native hosts and physical devices.'};
writeJSON(path.join(directory,'verification.json'),report);
console.log({passed:true,directory,control,summary});
