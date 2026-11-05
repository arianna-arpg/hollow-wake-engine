import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';

const [previousFlag,previousFile,currentFlag,currentFile,...extra]=process.argv.slice(2);
assert(previousFlag==='--previous'&&currentFlag==='--location'&&extra.length===0);
const read=file=>JSON.parse(fs.readFileSync(file));
const previous=read(path.resolve(previousFile)),current=read(path.resolve(currentFile));
assert(previous.characterRulesDecision&&current.characterContinuityDecision);
const reference=path.join(root,'.reference'),lock=read(path.join(root,'baseline/source-lock.json'));
verifyReference(reference,lock);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/class-settlement-benchmark-'));
const helper=fs.readFileSync(path.join(root,'reference/benchmark-class-settlement.ts'),'utf8'),entries={};
for(const [name,game]of [['original',reference],['published',previous.game],['proposal',current.game],['control',previous.game]]){
  const entry=path.join(directory,name+'.ts');
  fs.writeFileSync(entry,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_all,_quote,id)=>JSON.stringify(pathToFileURL(path.join(game,'src',id+'.ts')).href)));
  entries[name]=entry;
}
const orders=[
  ['original','published','control','proposal'],
  ['published','proposal','original','control'],
  ['proposal','control','published','original'],
  ['control','original','proposal','published']
];
const report={passed:false,directory,helperSha256:sha256(helper),previousArchiveSha256:sha256(fs.readFileSync(previous.archive)),archiveSha256:sha256(fs.readFileSync(current.archive)),rounds:[]};
for(let roundIndex=0;roundIndex<8;roundIndex++){
  const round={};
  for(const name of orders[roundIndex%orders.length]){
    const output=path.join(directory,roundIndex+'-'+name+'.json'),fd=fs.openSync(output+'.txt','wx');
    try{
      execFileSync(process.execPath,['--import','tsx',entries[name],output],{cwd:reference,stdio:['ignore',fd,fd],timeout:240000,windowsHide:true});
    }finally{fs.closeSync(fd);}
    round[name]=read(output);assert(round[name].every(row=>row.nanoseconds>0&&row.calls===65000));
  }
  const state=rows=>rows.map(row=>[row.name,row.state,row.calls]);
  for(const rows of Object.values(round))assert.deepEqual(state(rows),state(round.original));
  report.rounds.push(round);
}
function median(values){const sorted=values.slice().sort((a,b)=>a-b);return (sorted[3]+sorted[4])/2;}
report.summary=report.rounds[0].original.map((row,index)=>{
  const samples=Object.fromEntries(Object.keys(entries).map(name=>[name,report.rounds.map(round=>round[name][index].nanoseconds/row.calls)]));
  return {name:row.name,ns:Object.fromEntries(Object.entries(samples).map(([name,values])=>[name,median(values)])),
    proposalVsPublished:median(samples.proposal.map((value,i)=>value/samples.published[i])),
    publishedVsOriginal:median(samples.published.map((value,i)=>value/samples.original[i])),
    controlVsPublished:median(samples.control.map((value,i)=>value/samples.published[i]))};
});
verifyReference(reference,lock);report.passed=true;
report.scope='Warm desktop Node settlement calls through real game entry points. Eight balanced four-process rotations include the previous SDK twice as a control. Captured state and zero awards must agree. Physical devices and complete frame timing are outside this workload.';
writeJSON(path.join(directory,'verification.json'),report);
writeJSON(path.join(root,'.artifacts/class-settlement-benchmark-latest.json'),report);
console.log({passed:true,directory,summary:report.summary});
