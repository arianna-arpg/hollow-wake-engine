import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const source=fs.readFileSync(path.join(root,'dist/proc-effects.js'),'utf8'),output=fs.mkdtempSync(path.join(root,'.artifacts/proc-effects-mutations-')),results=[];
for(const [name,before,after]of [
 ['zero-power-clears-effect','pw === 1 || !(pw > 0)','pw === 1 || pw < 0'],
 ['unscaled-identity-lost','return fx;','return { ...fx };'],
 ['damage-not-scaled','damageScale: fx.damageScale * pw','damageScale: fx.damageScale'],
 ['ward-percent-not-scaled','pctMaxLife: fx.pctMaxLife === undefined ? undefined : fx.pctMaxLife * pw','pctMaxLife: fx.pctMaxLife'],
 ['healing-metadata-retained','healAllies: fx.healAllies ? { base:','healAllies: fx.healAllies ? { ...fx.healAllies, base:'],
 ['zero-cast-defaulted','fx.cast.mult ?? 1','fx.cast.mult || 1'],
 ['dead-admission-removed','amount <= 0 || actor.dead','amount <= 0'],
 ['eager-rate-query','if (amount <= 0 || actor.dead)\n        return 0;\n    const gained = amount * ports.rate(actor);','const sampled = ports.rate(actor);\n    if (amount <= 0 || actor.dead) return 0;\n    const gained = amount * sampled;'],
 ['pool-snapshot-before-rate','const gained = amount * ports.rate(actor);\n    actor.ward += gained;','const before = actor.ward;\n    const gained = amount * ports.rate(actor);\n    actor.ward = before + gained;'],
 ['resource-capped','const gained = amount * ports.rate(actor);','const gained = Math.min(100, amount * ports.rate(actor));'],
 ['effect-snapshot-before-life','const amount = (fx.flat ?? 0) + (fx.pctMaxLife ?? 0) * ports.maximumLife(actor);\n    const before = actor.ward;','const before = actor.ward;\n    const amount = (fx.flat ?? 0) + (fx.pctMaxLife ?? 0) * ports.maximumLife(actor);'],
 ['nonpositive-gain-called','if (amount > 0)','if (true)'],
 ['growth-not-observed','return actor.ward > before;','return amount > 0;'],
]){
  assert(source.includes(before),'Fault anchor changed: '+name);const file=path.join(output,name+'.mjs');fs.writeFileSync(file,source.replace(before,after));
  const run=spawnSync(process.execPath,['--test','test/proc-effects.test.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,HOLLOW_WAKE_PROC_EFFECTS_MODULE:pathToFileURL(file).href}}),text=run.stdout+run.stderr;
  fs.writeFileSync(path.join(output,name+'.txt'),text);assert(run.status!==0&&/AssertionError/.test(text)&&!/ERR_MODULE_NOT_FOUND|SyntaxError/.test(text),'Fault not behaviorally detected: '+name);
  results.push({name,detected:true});console.log('Rejected effect fault: '+name);
}
assert.equal(fs.readFileSync(path.join(root,'dist/proc-effects.js'),'utf8'),source);
writeJSON(path.join(root,'.artifacts/proc-effects-mutation-verification.json'),{faults:results.length,results,sourceSha256:sha256(source),productionUnchanged:true,output});
