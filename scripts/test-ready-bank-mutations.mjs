import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {exportedFunctionBody} from './exported-function-body.mjs';
const sourceFile='dist/ready-cooldown-bank.js',testFile='test/ready-cooldown-bank.test.mjs',source=fs.readFileSync(sourceFile,'utf8'),tests=fs.readFileSync(testFile,'utf8');
const directory=fs.mkdtempSync(path.join(root,'.artifacts/ready-bank-mutations-'));
const faults=[
 ['bank-running','refundReadyCooldown','left <= 0 &&','true &&'],
 ['omit-delete','refundReadyCooldown','actor.cooldowns.delete(skill.def.id);','void actor;'],
 ['ignore-enablement','refundReadyCooldown','ports.enabled(skill)','true'],
 ['ignore-cap','refundReadyCooldown','ports.price(actor, skill) * ports.maxExtra()','Infinity'],
 ['discard-credit','refundReadyCooldown','bank.bank + amount','amount'],
 ['command-floor','consumeReadyCooldownBank','Math.max(0.1,','Math.max(1,'],
 ['recall-spends','consumeReadyCooldownBank','!recall &&','true &&'],
 ['omit-spend','consumeReadyCooldownBank','if (!recall)','if (false)'],
 ['round-up-credit','consumeReadyCooldownBank','Math.floor(','Math.ceil('],
 ['ignore-command-cap','consumeReadyCooldownBank','ports.maxExtra(),','Infinity,'],
 ['discard-fraction','consumeReadyCooldownBank','Math.max(0, bank.bank - extra * unit)','0'],
 ['omit-clear','publishReadyCooldownBank','presentation.clear(bank.owner);','void bank;'],
 ['ignore-display-enablement','publishReadyCooldownBank','!ports.enabled(bank.host)','false'],
 ['projection-floor','publishReadyCooldownBank','Math.max(0.1,','Math.max(1,'],
 ['wrong-full-progress','publishReadyCooldownBank','? 1 :','? 0 :'],
 ['omit-publication','publishReadyCooldownBank','presentation.publish(bank.owner, 1 + extra, extra >= ports.maxExtra() ? 1 : (bank.bank / unit) % 1);','void extra;'],
];
const results=[];
try{for(const[name,fn,before,after]of faults){
  const region=exportedFunctionBody(source,fn),body=source.slice(region.start,region.end);assert.equal(body.split(before).length,2,name);
  const changed=source.slice(0,region.start)+body.replace(before,after)+source.slice(region.end),dir=path.join(directory,name);
  fs.mkdirSync(path.join(dir,'test'),{recursive:true});fs.cpSync('dist',path.join(dir,'dist'),{recursive:true});writeJSON(path.join(dir,'package.json'),{type:'module'});fs.writeFileSync(path.join(dir,sourceFile),changed);fs.writeFileSync(path.join(dir,testFile),tests);
  const r=spawnSync(process.execPath,['--test',testFile],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:30000});const log=(r.stdout??'')+(r.stderr??'');fs.writeFileSync(path.join(dir,'test.txt'),log,{flag:'wx'});
  assert(!r.error);assert.equal(r.status,1,name);assert(!/SyntaxError|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND/.test(log),name);assert(/(?:ℹ |# )fail [1-9]/.test(log),name);results.push({name,detected:true,logSha256:sha256(log),mutationSha256:sha256(changed)});
}}finally{assert.equal(fs.readFileSync(sourceFile,'utf8'),source);assert.equal(fs.readFileSync(testFile,'utf8'),tests);writeJSON(path.join(directory,'verification.json'),{passed:results.length===faults.length,results});}
const report={passed:true,directory,moduleSha256:sha256(source),testSha256:sha256(tests),results};writeJSON('.artifacts/ready-bank-mutations.json',report);console.log({passed:true,faults:results.length,directory});
