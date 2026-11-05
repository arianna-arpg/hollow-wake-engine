import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {spawnSync} from 'node:child_process';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';
import {craftingRuntimeFaults} from './crafting-runtime-faults.mjs';
const accepted=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/crafting-package-latest.json')));assert(accepted.passed);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/crafting-mutations-')),consumer=path.join(directory,'consumer');fs.cpSync(accepted.consumer,consumer,{recursive:true});
const snapshot=dir=>Object.fromEntries(listFiles(dir).map(file=>[file,sha256(fs.readFileSync(path.join(dir,file)))])),before=snapshot(consumer),acceptedBefore=snapshot(accepted.consumer);
function run(label){const file=path.join(directory,label+'.txt'),fd=fs.openSync(file,'wx');let result;
 try{result=spawnSync(process.execPath,['--test','crafting.test.mjs','crafting-actions.test.mjs'],{cwd:consumer,stdio:['ignore',fd,fd],windowsHide:true,timeout:90000});}finally{fs.closeSync(fd);}
 assert(!result.error);assert.equal(result.signal,null);assert([0,1].includes(result.status));const text=fs.readFileSync(file,'utf8');return {status:result.status,logSha256:sha256(text),assertion:/ERR_ASSERTION|AssertionError/.test(text)};}
const results=[];let passed=false;
try{
 assert.equal(run('clean-control').status,0);
 for(const [name,module,needle,replacement]of craftingRuntimeFaults){
  const file=path.join(consumer,'node_modules/@hollow-wake/engine/dist',module+'.js'),bytes=fs.readFileSync(file),source=bytes.toString();assert(source.includes(needle),name);
  const changed=source.replace(needle,replacement);assert.notEqual(source,changed);
  assert.equal(ts.createSourceFile(file,changed,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0);
  fs.writeFileSync(file,changed);try{const result=run(name);assert(result.status===1&&result.assertion,name+' survived or failed outside an outcome assertion');results.push({name,module,...result});}finally{fs.writeFileSync(file,bytes);}
  writeJSON(path.join(directory,'progress.json'),{results});
 }
 assert.equal(run('restored-control').status,0);passed=true;
}finally{
 assert.deepEqual(snapshot(consumer),before);assert.deepEqual(snapshot(accepted.consumer),acceptedBefore);
 const report={passed,directory,archiveSha256:accepted.archives[0].sha256,results,sourceRestored:true,acceptedConsumerPreserved:true};
 writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/crafting-mutations-latest.json'),report);console.log({passed,directory,detected:results.length});
}
