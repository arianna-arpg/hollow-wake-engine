import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const source=fs.readFileSync(path.join(root,'dist/delayed-bursts.js'),'utf8'),output=fs.mkdtempSync(path.join(root,'.artifacts/delayed-mutations-')),results=[];
const faults=[
 ['reentry-accepted','if (this.active)','if (false)'],
 ['guard-not-released','finally {\n            this.active = false;','finally {\n            this.active = true;'],
 ['reset-token-not-invalidated','this.generation = {};','this.generation = this.generation;'],
 ['reset-token-too-late','this.generation = {};\n        this.ports.clearQueue(host);','this.ports.clearQueue(host);\n        this.generation = {};'],
 ['replacement-not-detected','generation !== this.generation || queue !== this.ports.queue(host)','generation !== this.generation'],
 ['due-equality-skipped','ports.time(host) < burst.when','ports.time(host) <= burst.when'],
 ['removed-work-retained','queue.splice(i, 1);','/* entry incorrectly retained */'],
 ['level-sampled-per-target','burst.fx.healAllies.perLevel * level','burst.fx.healAllies.perLevel * Math.max(0, burst.owner.level - 1)'],
 ['tangent-rejected','- actor.radius > burst.fx.radius','- actor.radius >= burst.fx.radius'],
 ['invulnerability-ignored','landed <= 0 || actor.invulnerable','landed <= 0'],
 ['shield-flag-not-cleared','actor.esBroke = false;','/* flag incorrectly retained */'],
 ['half-point-text-emitted','if (healed > 0.5)','if (healed >= 0.5)'],
 ['unknown-fields-accepted',"!keys.includes(key)",'false'],
 ['nonfinite-accepted','!Number.isFinite(value)','false'],
 ['negative-duration-accepted','delay < 0 || radius < 0','false'],
 ['magnitude-not-frozen','damage = Object.freeze({','damage = Object.assign({'],
];
for(const [name,call,indent]of [
 ['flash','ports.flash(host, burst);',16],
 ['heal','const healed = ports.heal(host, actor, burst.fx.healAllies.base + burst.fx.healAllies.perLevel * level);',28],
 ['heal-text',"ports.text(host, actor.pos, '+' + Math.round(healed), '#8ae0a8', 11);",32],
 ['mitigate','const landed = ports.mitigate(host, actor, burst.fx.damage.type, burst.fx.damage.base + burst.fx.damage.perLevel * level);',24],
 ['damage-text','ports.text(host, actor.pos, Math.round(landed).toString(), burst.color, 12);',24],
 ['shield-break','ports.shieldBreak(host, actor, burst.depth);',28],
 ['sweep','ports.sweepDefenses(host, actor, burst.depth);',24],
 ['kill','ports.kill(host, actor);',28],
])faults.push(['cancellation-missing-after-'+name,call+'\n'+' '.repeat(indent)+'if (this.cancelled(host, queue, generation))\n'+' '.repeat(indent+4)+'return;',call]);
for(const [name,before,after]of faults){
 assert(source.includes(before),'Fault anchor changed: '+name);const file=path.join(output,name+'.mjs');fs.writeFileSync(file,source.replace(before,after));
 const run=spawnSync(process.execPath,['--test','test/delayed-bursts.test.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,HOLLOW_WAKE_DELAYED_MODULE:pathToFileURL(file).href}}),text=run.stdout+run.stderr;
 fs.writeFileSync(path.join(output,name+'.txt'),text);assert(run.status!==0&&/AssertionError/.test(text)&&!/ERR_MODULE_NOT_FOUND|SyntaxError/.test(text),'Fault not behaviorally detected: '+name);
 results.push({name,detected:true});console.log('Rejected delayed-effect fault: '+name);
}
assert.equal(fs.readFileSync(path.join(root,'dist/delayed-bursts.js'),'utf8'),source);
writeJSON(path.join(root,'.artifacts/delayed-mutation-verification.json'),{faults:results.length,results,sourceSha256:sha256(source),productionUnchanged:true,output});
