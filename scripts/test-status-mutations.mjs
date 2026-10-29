import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const source=fs.readFileSync(path.join(root,'dist/status-lifecycle.js'),'utf8'),directory=fs.mkdtempSync(path.join(root,'.artifacts/status-mutations-'));
const mutations=[
 ['immunity',"actor.sheet.get('debuffImmunity') > 0","actor.sheet.get('debuffImmunity') > 1000"],
 ['relay','&& actor.statusRelay(actor,','&& false && actor.statusRelay(actor,'],
 ['poise','actor.poise > 0.5','actor.poise >= 0.5'],
 ['cast-cancel','actor.casting = null;','actor.casting = actor.casting;'],
 ['expiry','baseDur * durationScale / expiry','baseDur * durationScale * expiry'],
 ['bank-wet','dps *= def.bank.wetMul;','dps *= 1;'],
 ['bank-cap','peak * def.bank.capMul','peak * 1'],
 ['buildup','actor.applyStatus(def.buildup.into,','actor.applyStatus(id,'],
 ['strongest','if (dps > existing.dps)','if (dps >= existing.dps)'],
 ['fixed-fuse','existing.rupture !== undefined;','!!existing.rupture;'],
 ['source-scope','s.sourceKey === opts?.sourceKey','true'],
 ['power-stack','(def.modsPerStack ? existing.stacks : 1)','1'],
 ['first-caster','existing.casterId ?? opts.casterId','opts.casterId'],
 ['pop-debt','owed * frac','owed * frac * 2'],
 ['curve','2 * (1 - prog)','1 - prog'],
 ['full-frame','const tick = s.dps * s.stacks * curve * dt;','const tick = s.remaining <= 0 ? 0 : s.dps * s.stacks * curve * dt;'],
 ['clock',"definition(s.id)?.timeScale !== undefined ? chronoDt : dt","definition(s.id)?.timeScale !== undefined ? dt : dt"],
 ['leech','tick * s.leech','tick * 0'],
 ['pop-reset','s.popAcc = 0;','s.popAcc = 1;'],
 ['flight','actor.touchdown = true;','actor.touchdown = false;'],
 ['cleanse','stripped < count','stripped + 1 <= count'],
 ['baseline','baseline.perLevel * Math.max(0, level - 1)','baseline.perLevel * level'],
];
const results=[];for(const[name,needle,replacement]of mutations){assert.equal(source.split(needle).length-1,1,'Fault selector '+name);const file=path.join(directory,name+'.mjs');fs.writeFileSync(file,source.replace(needle,replacement));
 const result=spawnSync(process.execPath,['--test',path.join(root,'test/status-lifecycle.test.mjs')],{cwd:root,encoding:'utf8',env:{...process.env,HWE_STATUS_MODULE:file},timeout:30000});const text=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,name+'.txt'),text);
 assert(!result.error,name);assert.equal(result.signal,null,name);assert.notEqual(result.status,0,name+' survived');assert.match(text,/ERR_ASSERTION/,name+' must fail behavior');assert(!/SyntaxError/.test(text),name);results.push({name,detected:true,sha256:sha256(fs.readFileSync(file))});}
const report={passed:true,directory,sourceSha256:sha256(source),faults:results.length,results};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/status-mutation-verification.json'),report);console.log({passed:true,directory,faults:results.length});
