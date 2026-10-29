import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
const args=process.argv.slice(2);assert(args.length===2&&args[0]==='--location');const locationFile=path.resolve(root,args[1]),location=JSON.parse(fs.readFileSync(locationFile)),game=fs.realpathSync(location.game);
assert(game.startsWith(path.join(root,'.artifacts')+path.sep));const installed=fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine'));assert(installed.startsWith(path.join(root,'.artifacts')+path.sep));
const snapshot=d=>Object.fromEntries(listFiles(d).map(f=>[f,sha256(fs.readFileSync(path.join(d,f)))])),before=snapshot(path.join(game,'src')),pkg=snapshot(installed),directory=fs.mkdtempSync(path.join(root,'.artifacts/status-effects-diagnostics-')),results=[];
const binding=path.join(game,'src/engine/statusLifecycle.ts'),actor=path.join(game,'src/engine/actor.ts'),runtime=path.join(installed,'dist/status-effects.js'),saved=new Map([binding,actor,runtime].map(f=>[f,fs.readFileSync(f)]));
function run(label,cwd,command,expected,pattern){const result=spawnSync(process.execPath,command,{cwd,encoding:'utf8',timeout:300000,maxBuffer:64*1024*1024,windowsHide:true}),output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,label+'.txt'),output);assert(!result.error,label);assert.equal(result.signal,null,label);assert.equal(result.status,expected,label);assert.match(output,pattern,label);assert(!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(output),label);results.push({label,passed:true,exitCode:result.status});}
let passed=false;
try{
 run('relay-control',root,['scripts/run-status-relay-reference.mjs','--game',game],0,/passed: true/);
 const source=saved.get(binding).toString('utf8');assert.equal(source.split('if(changed)').length-1,1);fs.writeFileSync(binding,source.replace('if(changed)','if(false && changed)'));
 run('stale-relay-fault',root,['scripts/run-status-relay-reference.mjs','--game',game],1,/trace differs from accepted original/);fs.writeFileSync(binding,saved.get(binding));
 run('voice-control',game,['--import','tsx','balance/probe_statusvoice.ts'],0,/ALL PASS/);
 const js=saved.get(runtime).toString('utf8'),caption="'cleansed', '#a8e8d8', 12, 'combat'";assert.equal(js.split(caption).length-1,1);fs.writeFileSync(runtime,js.replace(caption,"'cleansed', '#a8e8d8', 12, 'critical'"));
 run('caption-kind-fault',game,['--import','tsx','balance/probe_statusvoice.ts'],1,/FAIL  D2.*cleansed/);fs.writeFileSync(runtime,saved.get(runtime));
 run('registration-control',root,['scripts/test-game-passive-grants.mjs','--location',locationFile],0,/Actual game rebuilds match all grant observations/);
 const original=saved.get(actor).toString('utf8'),line="import {statusLifecycle} from './statusLifecycle';";assert.equal(original.split(line).length-1,1);fs.writeFileSync(actor,line+'\n'+original.replace(line,''));
 run('registration-order-fault',root,['scripts/test-game-passive-grants.mjs','--location',locationFile],1,/Actual game grant rebuild differs from original/);fs.writeFileSync(actor,saved.get(actor));passed=true;
}finally{
 for(const[f,bytes]of saved)fs.writeFileSync(f,bytes);assert.deepEqual(snapshot(path.join(game,'src')),before);assert.deepEqual(snapshot(installed),pkg);
 const report={passed,directory,game,results,adapterFaults:results.filter(r=>r.exitCode===1).length,sourceAndPackageRestored:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/status-effects-diagnostics-verification.json'),report);console.log({passed,directory,adapterFaults:report.adapterFaults});
}
