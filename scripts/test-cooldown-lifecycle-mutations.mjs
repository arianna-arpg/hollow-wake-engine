import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const sourceFile=path.join(root,'dist/cooldown-lifecycle.js'),testFile=path.join(root,'test/cooldown-lifecycle.test.mjs'),source=fs.readFileSync(sourceFile,'utf8'),tests=fs.readFileSync(testFile,'utf8');
const directory=fs.mkdtempSync(path.join(root,'.artifacts/clock-runtime-faults-'));
const faults=[
 ['snapshot-elapsed','of actor.cooldowns) {','of [...actor.cooldowns]) {'],
 ['repeat-global-read','let rate = global;','let rate = ports.global(actor);'],
 ['ignore-scoped-rate','rate = ports.scoped(actor, skill);','ports.scoped(actor, skill);'],
 ['ignore-recovery','advanceCooldown(remaining, elapsed, rate)','advanceCooldown(remaining, elapsed, 1)'],
 ['omit-absorb','(ports.absorbCooldown(skill) ?? base)','base'],
 ['price-floor','Math.max(0.1,','Math.max(1,'],
 ['price-multiply','return price / Math.max','return price * Math.max'],
 ['nonpositive-price-reads','if (price <= 0)','if (price < -999999)'],
 ['cap-ordinary','if (skill.def.ultimate)','if (true)'],
 ['omit-total-stamp','actor.cooldownTotals.set(skill.def.id, seconds);','void seconds;'],
 ['omit-total-refund','actor.cooldownTotals.delete(id);','void id;'],
 ['orb-unique-bar','of actor.skills) {','of new Set(actor.skills)) {'],
 ['orb-negative-refund','if (seconds <= 0)\n            continue;','if (seconds === 0)\n            continue;'],
 ['live-skill-effect','of [...actor.cooldowns]) {','of actor.cooldowns) {'],
 ['fraction-after-seconds','remaining * (effect.fraction ?? 0)','(remaining - (effect.seconds ?? 0)) * (effect.fraction ?? 0)'],
 ['changed-only-notification','visited++;','if (left < remaining) visited++;'],
 ['self-included','if (id === definition.id)','if (false)']
];
const results=[];
try {for(const[name,before,after]of faults){
  assert.equal(source.split(before).length,2,'Unique mutation: '+name);
  const dir=path.join(directory,name);fs.mkdirSync(path.join(dir,'test'),{recursive:true});fs.cpSync(path.join(root,'dist'),path.join(dir,'dist'),{recursive:true});writeJSON(path.join(dir,'package.json'),{type:'module'});
  fs.writeFileSync(path.join(dir,'dist/cooldown-lifecycle.js'),source.replace(before,after));fs.writeFileSync(path.join(dir,'test/cooldown-lifecycle.test.mjs'),tests);
  const result=spawnSync(process.execPath,['--test','test/cooldown-lifecycle.test.mjs'],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:30000});const log=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(dir,'test.txt'),log,{flag:'wx'});
  assert(!result.error);assert.equal(result.status,1,name);assert(!/SyntaxError|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND/.test(log),name+' failed for an unrelated reason');assert(/(?:ℹ |# )fail [1-9]/.test(log),name);
  results.push({name,detected:true,logSha256:sha256(log),mutatedSha256:sha256(source.replace(before,after))});
}}finally{assert.equal(fs.readFileSync(sourceFile,'utf8'),source);assert.equal(fs.readFileSync(testFile,'utf8'),tests);writeJSON(path.join(directory,'verification.json'),{passed:results.length===faults.length,results});}
writeJSON(path.join(root,'.artifacts/cooldown-lifecycle-mutations.json'),{passed:true,directory,sourceSha256:sha256(source),testSha256:sha256(tests),results});console.log({passed:true,faults:results.length,directory});
