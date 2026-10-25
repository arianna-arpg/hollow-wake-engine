import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';
const temp=fs.mkdtempSync(path.join(root,'.artifacts/proc-mutations-'));
fs.cpSync(path.join(root,'dist'),path.join(temp,'dist'),{recursive:true});fs.mkdirSync(path.join(temp,'test'));
for(const file of ['proc-content.test.mjs','proc-runtime.test.mjs'])fs.copyFileSync(path.join(root,'test',file),path.join(temp,'test',file));
fs.cpSync(path.join(root,'baseline/milestone-thirty-eight'),path.join(temp,'baseline/milestone-thirty-eight'),{recursive:true});
writeJSON(path.join(temp,'package.json'),{type:'module'});
const sources=new Map(['proc-runtime.js','proc-content.js'].map(file=>[file,fs.readFileSync(path.join(root,'dist',file),'utf8')])),results=[];
for(const [name,file,before,after]of [
  ['inclusive-random','proc-runtime.js','return value < chance;','return value <= chance;'],
  ['closed-random-range','proc-runtime.js','value < 0 || value >= 1','value < 0 || value > 1'],
  ['exclusive-cooldown','proc-runtime.js','p.time() < (actor.procReadyAt.get(proc.id) ?? 0)','p.time() <= (actor.procReadyAt.get(proc.id) ?? 0)'],
  ['duplicate-once','proc-runtime.js','if (proc.oncePerCast)','if (false)'],
  ['unbounded-ppm','proc-runtime.js','Math.min(mean * this.#config.ppmCatchup, last === undefined ? mean : p.time() - last)','(last === undefined ? mean : p.time() - last)'],
  ['uncapped-chance','proc-runtime.js','return Math.min(.95, value);','return value;'],
  ['missing-depth-falloff','proc-runtime.js','Math.pow(this.#config.depthFalloff, depth)','1'],
  ['nested-proc-rejected','proc-runtime.js','const depth = event?.depth ?? 0;','const depth = event?.depth ? 100 : 0;'],
  ['grant-snapshot','proc-runtime.js','for (const proc of s.candidates(trigger)) {','for (const proc of s.candidates(trigger).filter(row => p.armed(actor, s.allIds(), event?.extra).includes(row.id))) {'],
  ['cooldown-before-draw','proc-runtime.js','chance <= 0 || !this.#roll(chance) || !this.ready(actor, proc)','chance <= 0 || !this.ready(actor, proc) || !this.#roll(chance)'],
  ['pulse-live-grants','proc-runtime.js','for (const id of p.armed(actor, s.allIds())) {','for (const id of s.allIds()) {'],
  ['condition-edges-cleared','proc-runtime.js','actor.condRose = [];','actor.condRose.length = 0;'],
  ['zero-icd-court','proc-runtime.js','proc.icd === undefined &&',''],
  ['true-kill-court','proc-runtime.js',"&& !(proc.trigger === 'kill' && event.lethal)",''],
  ['callback-receiver','proc-runtime.js','fn.bind(ports)','fn'],
  ['mutable-owned-content','proc-content.js','this.pack = freeze(pack);','this.pack = pack;'],
  ['borrowed-trigger-refresh','proc-content.js','rows === this.#rows && rows.length === this.#length','false'],
]){
  const source=sources.get(file),target=path.join(temp,'dist',file);assert(source.includes(before),'Fault anchor changed: '+name);
  fs.writeFileSync(target,source.replace(before,after));
  const run=spawnSync(process.execPath,['--test','test/proc-content.test.mjs','test/proc-runtime.test.mjs'],{cwd:temp,encoding:'utf8'}),output=run.stdout+run.stderr;
  fs.writeFileSync(target,source);fs.writeFileSync(path.join(temp,name+'.txt'),output);
  assert(run.status!==0&&/AssertionError/.test(output)&&!/ERR_MODULE_NOT_FOUND|SyntaxError/.test(output),'Fault not behaviorally detected: '+name);
  results.push({name,detected:true});console.log('Rejected proc fault: '+name);
}
for(const [file,source]of sources)assert.equal(fs.readFileSync(path.join(root,'dist',file),'utf8'),source);
writeJSON(path.join(root,'.artifacts/proc-mutation-verification.json'),{faults:results.length,results,productionUnchanged:true});
