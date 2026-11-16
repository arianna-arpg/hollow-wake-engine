import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const [flag,input]=process.argv.slice(2);assert(flag==='--runner'&&input&&process.argv.length===4);
const runner=fs.realpathSync(input),owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'m5-browser-owned-'));
let result;
try{
 const electron=createRequire(path.join(root,'reference/tooling/package.json'))('electron');
 const child=spawnSync(electron,[path.join(root,'tools/combat-performance/check-browser.cjs')],{windowsHide:true,encoding:'utf8',timeout:260000,maxBuffer:1024*1024,
  env:{...process.env,HW_COMBAT_RUNNER:runner,HW_COMBAT_BROWSER_WORK:work,TEMP:work,TMP:work,TMPDIR:work}});
 result={passed:false,exitCode:child.status,error:String(child.error??''),output:child.stdout+child.stderr,runnerManifest:JSON.parse(fs.readFileSync(path.join(runner,'manifest.json')))};
 assert(!child.error&&child.status===0,result.output);
 const observation=JSON.parse(fs.readFileSync(path.join(work,'verification.json')));assert(observation.passed);result={...result,...observation};
 fs.copyFileSync(path.join(work,'browser.png'),path.join(owned,'m5-portable-browser.png'));result.screenshotSha256=sha256(fs.readFileSync(path.join(work,'browser.png')));
 console.log({passed:true,courses:observation.report.courses.length,downloadMatched:observation.downloadMatched,narrow:observation.narrow});
}finally{
 if(result)writeJSON(path.join(owned,'m5-portable-browser.json'),{...result,cleaned:false});
 assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,force:true,maxRetries:10,retryDelay:200});if(result)writeJSON(path.join(owned,'m5-portable-browser.json'),{...result,cleaned:true});
}
