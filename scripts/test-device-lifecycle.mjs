import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {root,sha256,writeJSON} from './reference-utils.mjs';

const [flag,htmlArg,...args]=process.argv.slice(2);
assert(flag==='--html'&&htmlArg&&(args.length===0||(args.length===2&&args[0]==='--electron')));
const html=fs.realpathSync(htmlArg);
const electron=args.length?fs.realpathSync(args[1]):createRequire(path.join(root,'reference/tooling/package.json'))('electron');
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const dir=fs.mkdtempSync(path.join(root,'.artifacts/device-acceptance-'));
const log=path.join(dir,'renderer.txt'),fd=fs.openSync(log,'wx');
let passed=false;
try{
  const result=spawnSync(electron,[path.join(root,'tools/device-lifecycle/check.cjs')],
    {cwd:dir,windowsHide:true,stdio:['ignore',fd,fd],timeout:100000,env:{...process.env,HW_DEVICE_HTML:html,HW_DEVICE_REPORTS:dir}});
  assert(!result.error&&!result.signal);assert.equal(result.status,0,'Device benchmark failed: '+log);
  const outcomes=JSON.parse(fs.readFileSync(path.join(dir,'observed.json')));
  const original=JSON.parse(fs.readFileSync(path.join(root,'evidence/milestone-two/lifecycle-performance.json')));
  for(const row of original.runs){
    const result=outcomes.find(v=>v.count===row.actors);
    assert(result?.download&&result.completions===row.completionsIncludingWarmup&&result.ticks===row.dotTicksIncludingWarmup);
    assert(Math.abs(result.checksum-row.checksum)<=Math.abs(row.checksum)*1e-10);
  }
  const controls=JSON.parse(fs.readFileSync(path.join(dir,'controls.json')));
  assert(controls.wrongExpectedCountRejected&&controls.coarseTimerDetected&&controls.narrow&&controls.noHttpRequests&&controls.cancelled.empty&&controls.cancelled.ready);
  passed=true;
}finally{
  fs.closeSync(fd);
  const report={passed,dir,htmlSha256:sha256(fs.readFileSync(html)),logSha256:sha256(fs.readFileSync(log)),
    scope:'Headless desktop Chromium at a narrow viewport. Three real downloads, interruption and deliberately wrong reference counts. Device performance is not inferred.'};
  writeJSON(path.join(dir,'verification.json'),report);console.log(report);
}
