import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const args=process.argv.slice(2);assert(args.length===2&&args[0]==='--location');
const location=path.resolve(root,args[1]),source=fs.readFileSync(path.join(root,'reference/benchmark-hit-worker.ts'),'utf8'),runner=fs.readFileSync(path.join(root,'scripts/benchmark-hit-paired.mjs'),'utf8');
const control=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/hit-paired-benchmark-verification.json')));assert(control.passed&&control.controls.length===2);assert.equal(control.helperSha256,sha256(source));
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-paired-observer-')),results=[];let passed=false;
try{for(const[name,needle,replacement,message]of [
 ['skip-hit','i<count;i++)damageSum+=one()','i<count-1;i++)damageSum+=one()','previous/plain damage'],
 ['alter-draws','check:{damageSum,draws,','check:{damageSum,draws:draws+1,','previous/plain state'],
]){
 assert.equal(source.split(needle).length-1,1,name);const helper=path.join(directory,name+'.ts'),script=path.join(directory,name+'.mjs');fs.writeFileSync(helper,source.replace(needle,replacement),{flag:'wx'});
 let text=runner.replace("from './reference-utils.mjs'",'from '+JSON.stringify(pathToFileURL(path.join(root,'scripts/reference-utils.mjs')).href));
 const lookup="path.join(root,'reference/benchmark-hit-worker.ts')";assert.equal(text.split(lookup).length-1,2);text=text.replaceAll(lookup,JSON.stringify(helper));
 const reportPath="'.artifacts/hit-paired-benchmark-verification.json'";assert.equal(text.split(reportPath).length-1,1);text=text.replace(reportPath,JSON.stringify(path.join(directory,name+'-verification.json')));fs.writeFileSync(script,text,{flag:'wx'});
 const result=spawnSync(process.execPath,[script,'--previous',location,'--location',location],{cwd:root,encoding:'utf8',timeout:480000,windowsHide:true}),output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,name+'.txt'),output);
 assert(!result.error,result.error?.message);assert.notEqual(result.status,0,name);assert.match(output,/ERR_ASSERTION/);assert(output.includes(message));assert.doesNotMatch(output,/SyntaxError|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND/);
 const proof=JSON.parse(fs.readFileSync(path.join(directory,name+'-verification.json')));assert.equal(proof.passed,false);assert.equal(proof.results.length,5);assert.equal(proof.controls.length,0);assert(proof.inputsUnchanged&&proof.identicalInputs);results.push({name,detected:true,proof});
 }passed=true;
}finally{assert.equal(fs.readFileSync(path.join(root,'reference/benchmark-hit-worker.ts'),'utf8'),source);assert.equal(fs.readFileSync(path.join(root,'scripts/benchmark-hit-paired.mjs'),'utf8'),runner);const report={passed,directory,controlDirectory:control.directory,helperSha256:sha256(source),runnerSha256:sha256(runner),results};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-paired-observer-verification.json',report);console.log({passed,directory,faults:results.length});}
