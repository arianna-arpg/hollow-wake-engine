import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {exportedFunctionBody} from './exported-function-body.mjs';
const sourceFile='dist/sequence-recovery.js',testFile='test/sequence-recovery.test.mjs',source=fs.readFileSync(sourceFile,'utf8'),tests=fs.readFileSync(testFile,'utf8');
const directory=fs.mkdtempSync(path.join(root,'.artifacts/sequence-recovery-mutations-'));
const faults=[
  [
    "omit-lock",
    "lockSequenceRecovery",
    "state.owner.skillRecoveryLocks.add(state.host.def.id);",
    "void state;"
  ],
  [
    "zero-hold",
    "lockSequenceRecovery",
    "state.owner.cooldowns.set(state.host.def.id, 1);",
    "state.owner.cooldowns.set(state.host.def.id, 0);"
  ],
  [
    "omit-hold-total",
    "lockSequenceRecovery",
    "state.owner.cooldownTotals.set(state.host.def.id, 1);",
    "void state;"
  ],
  [
    "omit-unlock",
    "releaseSequenceRecovery",
    "state.owner.skillRecoveryLocks.delete(state.host.def.id);",
    "void state;"
  ],
  [
    "omit-clock-clear",
    "releaseSequenceRecovery",
    "state.owner.cooldowns.delete(state.host.def.id);",
    "void state;"
  ],
  [
    "omit-miss",
    "releaseSequenceRecovery",
    "miss &&",
    "false &&"
  ],
  [
    "wrong-total",
    "releaseSequenceRecovery",
    "state.owner.cooldownTotals.set(state.host.def.id, state.spec.recovery.missCooldown);",
    "state.owner.cooldownTotals.set(state.host.def.id, 1);"
  ],
  [
    "ignore-pending",
    "settleSequenceRecoveries",
    "const pending = ports.pending(cast);",
    "ports.pending(cast); const pending = false;"
  ],
  [
    "ignore-airborne",
    "settleSequenceRecoveries",
    "!objects.some(object => object.airborne)",
    "true"
  ],
  [
    "ignore-done",
    "settleSequenceRecoveries",
    "&& !cast.done",
    "&& true"
  ],
  [
    "ignore-caught",
    "settleSequenceRecoveries",
    "!cast.caught &&",
    "true &&"
  ],
  [
    "omit-bank-reset",
    "settleSequenceRecoveries",
    "state.caught = 0;",
    "void state;"
  ],
  [
    "ignore-pickups",
    "settleSequenceRecoveries",
    "!objects.length",
    "true"
  ],
  [
    "omit-active-removal",
    "settleSequenceRecoveries",
    "active.delete(cast);",
    "void cast;"
  ],
  [
    "ignore-siblings",
    "settleSequenceRecoveries",
    "![...active].some(other => other.state === state)",
    "true"
  ],
  [
    "live-iteration",
    "settleSequenceRecoveries",
    "for (const cast of [...active])",
    "for (const cast of active)"
  ]
];
const results=[];
try{for(const[name,fn,before,after]of faults){
  const region=exportedFunctionBody(source,fn),body=source.slice(region.start,region.end);assert.equal(body.split(before).length,2,name);
  const changed=source.slice(0,region.start)+body.replace(before,after)+source.slice(region.end),dir=path.join(directory,name);
  fs.mkdirSync(path.join(dir,'test'),{recursive:true});fs.cpSync('dist',path.join(dir,'dist'),{recursive:true});writeJSON(path.join(dir,'package.json'),{type:'module'});fs.writeFileSync(path.join(dir,sourceFile),changed);fs.writeFileSync(path.join(dir,testFile),tests);
  const r=spawnSync(process.execPath,['--test',testFile],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:30000});const log=(r.stdout??'')+(r.stderr??'');fs.writeFileSync(path.join(dir,'test.txt'),log,{flag:'wx'});
  assert(!r.error);assert.equal(r.status,1,name);assert(!/SyntaxError|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND/.test(log),name);assert(/(?:ℹ |# )fail [1-9]/.test(log),name);results.push({name,detected:true,logSha256:sha256(log),mutationSha256:sha256(changed)});
}}finally{assert.equal(fs.readFileSync(sourceFile,'utf8'),source);assert.equal(fs.readFileSync(testFile,'utf8'),tests);writeJSON(path.join(directory,'verification.json'),{passed:results.length===faults.length,results});}
const report={passed:true,directory,moduleSha256:sha256(source),testSha256:sha256(tests),results};writeJSON('.artifacts/sequence-recovery-mutations.json',report);console.log({passed:true,faults:results.length,directory});
