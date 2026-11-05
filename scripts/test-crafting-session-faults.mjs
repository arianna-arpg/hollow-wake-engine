import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {spawnSync} from 'node:child_process';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';
const accepted=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/crafting-session-package-latest.json')));assert(accepted.passed);
assert.equal(sha256(fs.readFileSync(accepted.archive)),accepted.archiveSha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/crafting-session-faults-')),consumer=path.join(directory,'consumer');fs.cpSync(accepted.consumer,consumer,{recursive:true});
const snapshot=dir=>Object.fromEntries(listFiles(dir).map(file=>[file,sha256(fs.readFileSync(path.join(dir,file)))])),before=snapshot(consumer),acceptedBefore=snapshot(accepted.consumer);
const faults=[
  ['commit-before-admission','crafting-session','this.#validate(draft);','profile.state = draft.state; this.#validate(draft);'],
  ['reset-restored-rng','crafting-session',"Random.restore({ algorithm: 'mulberry32/v1', state: random.state, draws: random.draws })",'new Random(1)'],
  ['reuse-identity','crafting-session','return profile.nextUid++;','return profile.nextUid;'],
  ['lose-overflow','crafting-session','state.overflow.push(item);','void item;'],
  ['ignore-content-identity','crafting-session',"need(JSON.stringify(save.content) === JSON.stringify(this.#identity), 'content-mismatch');",'void save.content;'],
  ['ignore-identity-floor','crafting-session',"need(item.uid < profile.nextUid, 'uid-floor');",'void item.uid;'],
  ['duplicate-transfer','crafting-session','draft.state.overflow.splice(index, 1);','void index;'],
  ['accept-hidden','session-json',"requireSession('value' in d && d.enumerable, 'invalid-property');",'void d;'],
];
function run(label){const file=path.join(directory,label+'.txt'),fd=fs.openSync(file,'wx');let result;
  try{result=spawnSync(process.execPath,['--test','crafting-session.test.mjs'],{cwd:consumer,stdio:['ignore',fd,fd],windowsHide:true,timeout:90000});}finally{fs.closeSync(fd);}
  assert(!result.error);assert.equal(result.signal,null);assert([0,1].includes(result.status));const text=fs.readFileSync(file,'utf8');return {status:result.status,logSha256:sha256(text),assertion:/ERR_ASSERTION|AssertionError/.test(text)};}
const results=[];let passed=false;
try{
  assert.equal(run('clean-control').status,0);
  for(const [name,module,needle,replacement] of faults){
    const file=path.join(consumer,'node_modules/@hollow-wake/engine/dist',module+'.js'),bytes=fs.readFileSync(file),source=bytes.toString();
    assert.equal(source.split(needle).length,2,name+' must target one statement');const changed=source.replace(needle,replacement);
    assert.equal(ts.createSourceFile(file,changed,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0);
    fs.writeFileSync(file,changed);
    try{const result=run(name);assert(result.status===1&&result.assertion,name+' survived or failed outside an assertion');results.push({name,module,...result});}
    finally{fs.writeFileSync(file,bytes);}
  }
  assert.equal(run('restored-control').status,0);passed=true;
}finally{
  assert.deepEqual(snapshot(consumer),before);assert.deepEqual(snapshot(accepted.consumer),acceptedBefore);
  const report={passed,directory,archiveSha256:accepted.archiveSha256,results,sourceRestored:true,acceptedConsumerPreserved:true};
  writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/crafting-session-faults-latest.json'),report);console.log({passed,directory,detected:results.length});
}
