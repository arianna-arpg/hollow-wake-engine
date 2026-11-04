import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';

const [flag,file]=process.argv.slice(2);assert.equal(flag,'--location');
const ref=path.join(root,'.reference'),game=fs.realpathSync(JSON.parse(fs.readFileSync(path.resolve(root,file))).game);
assert.notEqual(ref,game);verifyReference(ref,JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))));
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});const directory=fs.mkdtempSync(path.join(root,'.artifacts/vocation-site-benchmark-'));
const helper=fs.readFileSync(path.join(root,'reference/benchmark-vocation-sites.ts'),'utf8'),entries={};
for(const [name,base] of [['original',ref],['installed',game]]){
  const entry=path.join(directory,name+'.ts');
  fs.writeFileSync(entry,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_all,_quote,id)=>JSON.stringify(pathToFileURL(path.join(base,'src',id+'.ts')).href)));
  entries[name]=entry;
}
const rounds=[],median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
for(let i=0;i<7;i++){
  const phases=i%2?['installed','original']:['original','installed'],round={};
  for(const name of phases){
    const out=path.join(directory,i+'-'+name+'.json'),fd=fs.openSync(out+'.txt','wx');
    try{execFileSync(process.execPath,['--import','tsx',entries[name],out],{cwd:ref,stdio:['ignore',fd,fd],timeout:180000,windowsHide:true});}finally{fs.closeSync(fd);}
    round[name]=JSON.parse(fs.readFileSync(out));assert(round[name].every(row=>row.nanoseconds>0&&row.calls===250000));
  }
  assert.deepEqual(round.original.map(r=>[r.name,r.state]),round.installed.map(r=>[r.name,r.state]));
  rounds.push(round);writeJSON(path.join(directory,'progress.json'),{rounds:rounds.length});
}
const summary=rounds[0].original.map(({name},i)=>{
  const perUpdate=variant=>median(rounds.map(r=>r[variant][i].nanoseconds/r[variant][i].calls));
  const originalNs=perUpdate('original'),installedNs=perUpdate('installed');
  return {name,originalNs,installedNs,differenceNs:installedNs-originalNs};
});
const report={passed:true,directory,node:process.version,platform:process.platform,cpu:os.cpus()[0].model,helperSha256:sha256(helper),rounds,summary,
  scope:'Desktop Node wall-clock time for a single World proximity update on unchanged state. Initialization is excluded. This does not measure a complete frame, an in-engine/native host or a physical handheld.'};
writeJSON(path.join(directory,'verification.json'),report);console.log({passed:true,directory,summary});
