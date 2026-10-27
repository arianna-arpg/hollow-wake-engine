import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const file=path.join(root,'dist/life-recovery.js'),original=fs.readFileSync(file),source=original.toString().replaceAll('\r\n','\n'),
  output=fs.mkdtempSync(path.join(root,'.artifacts/life-recovery-mutations-'));
const faults=[
  ['zero-is-not-early','amount <= 0 || actor.dead','amount < 0 || actor.dead'],
  ['dead-heals','amount <= 0 || actor.dead','amount <= 0'],
  ['seal-ignored','Math.min(ports.ceiling(actor), actor.lifeSealAt)','ports.ceiling(actor)'],
  ['ceiling-ignored','Math.min(cap, actor.life + amount * ports.rate(actor))','actor.life + amount * ports.rate(actor)'],
  ['rate-ignored','amount * ports.rate(actor)','amount'],
  ['rate-before-life','actor.life + amount * ports.rate(actor)','amount * ports.rate(actor) + actor.life'],
  ['landed-is-request','const landed = actor.life - before;','const landed = amount;'],
  ['silent-stamps','if (!silent)','if (true)'],
  ['silent-suppresses-observer','ports.observed?.(actor, landed, silent);','if (!silent) ports.observed?.(actor, landed, silent);'],
  ['tap-omitted','ports.tapped?.(actor, landed);',''],
  ['ledger-overwritten','actor.healedSince += landed;','actor.healedSince = landed;'],
  ['ledger-before-recency','ports.recent(actor);\n            actor.healedSince += landed;','actor.healedSince += landed;\n            ports.recent(actor);'],
  ['refill-is-conditional','actor.life = ports.maximumLife(actor);','if (actor.life < 50) actor.life = ports.maximumLife(actor);'],
  ['refill-not-silent','actor.life - before, true','actor.life - before, false'],
  ['proc-skip-flat-maximum','(effect.pctMax ?? 0) * ports.maximumLife(actor)','(effect.pctMax ? effect.pctMax * ports.maximumLife(actor) : 0)'],
  ['proc-reresolves-method','invokeHeal(method, actor,','invokeHeal(actor.heal, actor,'],
  ['proc-consults-call-property','invokeHeal(method, actor,','method.call(actor,'],
];
const results=[];
for(const[name,before,after]of faults){
  assert.equal(source.split(before).length-1,1,'Mutation anchor: '+name);
  const mutant=path.join(output,name+'.mjs');fs.writeFileSync(mutant,source.replace(before,after),{flag:'wx'});
  const syntax=spawnSync(process.execPath,['--check',mutant],{encoding:'utf8',windowsHide:true});assert.equal(syntax.status,0,syntax.stderr);
  const result=spawnSync(process.execPath,['--test','--test-reporter=tap','test/life-recovery.test.mjs'],{
    cwd:root,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:32*1024*1024,
    env:{...process.env,HOLLOW_WAKE_LIFE_RECOVERY_MODULE:pathToFileURL(mutant).href}});
  assert.equal(result.error,undefined);assert.notEqual(result.status,0,'Surviving mutation: '+name);
  assert.match(result.stdout,/# fail [1-9][0-9]*/,'Expected assertions, not a loader failure: '+name);
  const log=result.stdout+result.stderr;fs.writeFileSync(path.join(output,name+'.txt'),log,{flag:'wx'});
  results.push({name,rejected:true,logSha256:sha256(log)});
}
assert(fs.readFileSync(file).equals(original));
writeJSON(path.join(root,'.artifacts/life-recovery-mutations.json'),{output,count:results.length,results,productionRuntimeUnchanged:true});
console.log('PASS: '+results.length+' recovery faults rejected; production runtime unchanged.');
