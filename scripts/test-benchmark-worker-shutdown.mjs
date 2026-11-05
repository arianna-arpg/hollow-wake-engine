import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';
import {stopBenchmarkWorker} from './stop-benchmark-worker.mjs';

fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/benchmark-worker-shutdown-'));
const worker=path.join(directory,'worker.mjs');
fs.writeFileSync(worker,`import fs from 'node:fs';
const [mode,marker]=process.argv.slice(2);
process.on('disconnect',()=>{
  fs.writeFileSync(marker,'disconnected');
  if(mode==='cooperative')process.exit(0);
});
process.on('SIGTERM',()=>{});
setInterval(()=>{},1000);
process.send({ready:true});
`);
const children=[],results=[];
let passed=false;
try {
  for(const mode of ['cooperative','stubborn']) {
    const marker=path.join(directory,mode+'.txt');
    const child=fork(worker,[mode,marker],{execArgv:[],stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
    children.push(child);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Shutdown test worker startup timed out')),15000);
      child.once('message',message=>{clearTimeout(timer);assert(message.ready);resolve();});
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',()=>{clearTimeout(timer);reject(Error('Shutdown test worker exited before ready'));});
    });
    const outcome=await stopBenchmarkWorker(child,250);
    assert.equal(outcome.forced,mode==='stubborn');
    assert.equal(fs.readFileSync(marker,'utf8'),'disconnected');
    assert(child.exitCode!==null||child.signalCode!==null);
    assert.equal(child.connected,false);
    assert.deepEqual(await stopBenchmarkWorker(child,250),{forced:false});
    results.push({mode,forced:outcome.forced,reaped:true,repeatedClose:true});
  }
  passed=true;
} finally {
  await Promise.all(children.map(child=>stopBenchmarkWorker(child,250)));
  const report={passed,directory,results};
  writeJSON(path.join(directory,'verification.json'),report);
  writeJSON('.artifacts/benchmark-worker-shutdown-latest.json',report);
  console.log(report);
}
