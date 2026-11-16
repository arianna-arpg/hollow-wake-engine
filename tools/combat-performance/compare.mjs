import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert(['--baseline','--candidate','--out','--rounds','--budgets','--label'].includes(args[i])&&args[i+1]&&!options[args[i]]);options[args[i]]=args[i+1];}
for(const key of ['--baseline','--candidate','--out'])assert(options[key],key+' required');
const out=path.resolve(options['--out']),rounds=Number(options['--rounds']??7);assert(Number.isInteger(rounds)&&rounds>=1&&rounds<=30);assert(!fs.existsSync(out),'Choose a new report directory');
assert(!options['--budgets']||rounds===7,'Budget acceptance requires seven pairs; omit --budgets for an exploratory shorter run');
const variants={baseline:path.resolve(options['--baseline']),candidate:path.resolve(options['--candidate'])},read=file=>JSON.parse(fs.readFileSync(file));
const manifests=Object.fromEntries(Object.entries(variants).map(([key,dir])=>[key,read(path.join(dir,'manifest.json'))]));
assert.equal(manifests.baseline.sources['tools/combat-performance/workload.mjs'],manifests.candidate.sources['tools/combat-performance/workload.mjs'],'Different workload definitions');
assert.equal(manifests.baseline.files['run.mjs'].sha256,manifests.candidate.files['run.mjs'].sha256,'Different measurement implementations');
fs.mkdirSync(out);const report={schemaVersion:1,passed:false,manifests,rounds,startedAt:new Date().toISOString(),checks:{},pairs:[],comparison:[]};
const run=(variant,mode,suffix)=>{
 const file=path.join(out,variant+'-'+suffix+'.json');
 const result=spawnSync(process.execPath,[path.join(variants[variant],'run.mjs'),'--mode',mode,'--rounds','1','--out',file,'--label',options['--label']??'desktop reference',
  '--conditions','Alternating fresh processes; compile cache disabled; no concurrent verification or profiling'],{stdio:'inherit',windowsHide:true,timeout:900000,
   env:{...process.env,NODE_DISABLE_COMPILE_CACHE:'1'}});
 assert(!result.error&&result.status===0,'Failed '+variant+' '+mode+': '+String(result.error));const data=read(file);assert(data.passed);return data;
};
const receipts=data=>data.courses.map(c=>({name:c.name,runs:c.runs.map(r=>({receiptSha256:r.receiptSha256,...(r.traceSha256?{traceSha256:r.traceSha256}:{}),counters:r.counters}))}));
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
try{
 for(const variant of Object.keys(variants))report.checks[variant]=run(variant,'check','check');
 assert.deepEqual(receipts(report.checks.candidate),receipts(report.checks.baseline),'Before/after output or state mismatch');
 for(let i=0;i<rounds;i++){
  const order=i%2?['candidate','baseline']:['baseline','candidate'],pair={order,runs:{}};
  for(const variant of order)pair.runs[variant]=run(variant,'timing','round-'+(i+1));
  assert.deepEqual(receipts(pair.runs.candidate),receipts(pair.runs.baseline),'Timed work differs');
  report.pairs.push(pair);console.log('Completed pair '+(i+1)+'/'+rounds);
 }
 for(const name of report.checks.baseline.specification.courses){
  const row={name};for(const variant of Object.keys(variants))row[variant]=Object.fromEntries(['median','p95','p99'].map(key=>[key,median(report.pairs.map(p=>p.runs[variant].courses.find(c=>c.name===name).runs[0].operationMs[key]))]));
  row.medianRatio=row.candidate.median/row.baseline.median;report.comparison.push(row);
 }
 if(options['--budgets']){
  report.budgets=read(options['--budgets']);report.budgetFailures=[];
  for(const row of report.comparison)for(const [key,limit] of Object.entries(report.budgets.operationMs[row.name]))if(row.candidate[key]>limit)report.budgetFailures.push(`${row.name}.${key}: ${row.candidate[key]} > ${limit}`);
  const startup=median(report.pairs.map(p=>p.runs.candidate.contentImportMs));if(startup>report.budgets.contentImportMs)report.budgetFailures.push(`contentImportMs: ${startup}`);
  assert.equal(report.budgetFailures.length,0,report.budgetFailures.join('\n'));
 }
 report.passed=true;
}catch(error){report.failure=String(error.stack??error);process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({passed:report.passed,comparison:report.comparison,failure:report.failure},null,2));
