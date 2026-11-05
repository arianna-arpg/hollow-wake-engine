import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';

const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const worker=process.argv[2]==='--worker',receipt=process.argv[3];assert(receipt&&['--worker','--package'].includes(process.argv[2]));
const pkg=read(receipt);assert(pkg.passed);assert.equal(hash(pkg.sdkArchive),pkg.sdkArchiveSha256);
const module=path.join(pkg.directory,'consumer/node_modules/@hollow-wake/engine/dist/progression-session.js');
if(worker){
  const {ProgressionSession}=await import(pathToFileURL(module));
  const content=read(path.join(pkg.directory,'extra/content.json')),session=new ProgressionSession(content);
  const command=(op,extra={},profile=0)=>session.command({op,profile,...extra});
  assert(command('open',{seed:1}).ok);const account=command('save').save.account;assert(command('close').ok);
  account.credits=1000;account.features=['reliquary'];account.ledger.oracle_reliquary_attuned=1;
  account.reliquary.items=[{uid:1,relicKey:'full',w:6,h:4,payload:{name:'retained'}},{uid:2,relicKey:'overflow',w:1,h:1,payload:{value:42}}];
  account.reliquary.stash.cells.full={page:0,x:0,y:0};assert(command('open',{seed:1,account}).ok);
  const initial=command('save').save;assert(command('close').ok);
  function cycle(){
    assert(command('restore',{save:initial}).ok);
    assert.equal(command('invest',{id:'feat_vendor_wares_1',amount:17}).spent,17);
    assert.equal(command('buy',{id:'feat_vendor_wares_1'}).spent,43);
    assert.equal(command('buy',{id:'relic_stash_2'}).spent,40);
    assert.equal(command('buy',{id:'reliquary_power_1'}).spent,25);
    const first=command('buy',{id:'memory_discovery'});assert.equal(first.spent,30);assert.equal(first.draws,1);
    const saved=command('save').save;assert.equal(saved.account.credits,845);assert.equal(saved.account.reliquary.rank,1);
    assert.equal(saved.account.reliquary.stash.cells.overflow.page,1);assert.equal(saved.account.reliquary.items[0].payload.name,'retained');
    assert(command('restore',{save:saved},1).ok);
    const next=command('buy',{id:'memory_discovery'},1);assert.equal(next.credits,815);assert.equal(next.draws,2);
    assert.equal(next.receipt.sequence,2);assert.notEqual(next.receipt.id,first.receipt.id);
    assert(command('close').ok);assert(command('close',{},1).ok);
  }
  for(let i=0;i<128;i++)cycle();const batches=[];
  for(let batch=0;batch<16;batch++){
    const start=process.hrtime.bigint();for(let i=0;i<128;i++)cycle();
    batches.push(Number(process.hrtime.bigint()-start)/1e6/128);
  }
  console.log(JSON.stringify({passed:true,batchesMsPerCycle:batches,cyclesPerBatch:128,commandsPerCycle:11,warmupCycles:128,
    moduleSha256:hash(module)}));
}else{
  const directory=fs.mkdtempSync(path.join(root,'.artifacts/progression-session-benchmark-')),runs=[];
  for(let index=0;index<4;index++){
    const log=path.join(directory,'worker-'+index+'.txt');
    const result=spawnSync(process.execPath,[path.join(root,'scripts/benchmark-progression-session.mjs'),'--worker',path.resolve(receipt)],
      {cwd:root,windowsHide:true,encoding:'utf8',timeout:120000});
    fs.writeFileSync(log,result.stdout+result.stderr,{flag:'wx'});assert(!result.error&&!result.signal);assert.equal(result.status,0,result.stderr);
    const row=JSON.parse(result.stdout);assert(row.passed);runs.push({...row,logSha256:hash(log)});
  }
  const values=runs.flatMap(row=>row.batchesMsPerCycle).sort((a,b)=>a-b),median=(values[31]+values[32])/2;
  const report={passed:true,directory,node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,
    sdkArchiveSha256:pkg.sdkArchiveSha256,packageReceiptSha256:hash(receipt),scriptSha256:hash(path.join(root,'scripts/benchmark-progression-session.mjs')),
    scope:'Four fresh sequential desktop Node processes; shared content loaded before timing. Each measured cycle includes eleven JSON commands, draft validation, item retention and independent outcome assertions. No device, native-engine, frame-time, allocation-volume or optimization-speedup claim.',
    runs,medianMsPerCycle:median,minMsPerCycle:values[0],maxMsPerCycle:values.at(-1)};
  writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/progression-session-benchmark-latest.json'),{directory,receipt:path.join(directory,'verification.json')});
  console.log({passed:true,directory,medianMsPerElevenCommands:median});
}
