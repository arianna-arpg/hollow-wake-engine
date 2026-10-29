import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {exportedFunctionBody} from './exported-function-body.mjs';
const output=fs.mkdtempSync(path.join(root,'.artifacts/cooldown-mutations-')),
  files={runtime:'dist/cooldowns.js',content:'dist/cooldown-content.js'},original=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,fs.readFileSync(path.join(root,file))]));
const R='applyProcCooldown',C='compileProcCooldownEffect',faults=[
 ['live-iteration','runtime',R,[['[...actor.cooldowns]','actor.cooldowns']],'native cooldown rules: nested-write-keeps-outer-value-snapshot'],
 ['empty-tags-skipped','runtime',R,[['if (effect.tags)','if (effect.tags?.length)']],'native cooldown rules: empty-tags-still-requires-bar'],
 ['empty-skills-skipped','runtime',R,[['if (effect.skills &&','if (effect.skills?.length &&']],'native cooldown rules: empty-skills'],
 ['any-tag','runtime',R,[['effect.tags.every(','effect.tags.some(']],'native cooldown rules: all-tags-required'],
 ['last-bar-instance','runtime',R,[['actor.skills.find(','[...actor.skills].reverse().find(']],'native cooldown rules: first-duplicate-bar-defines-tags'],
 ['rounding-reassociated','runtime',R,[['remaining - (effect.seconds ?? 0) - remaining * (effect.fraction ?? 0)','remaining * (1 - (effect.fraction ?? 0)) - (effect.seconds ?? 0)']],'native cooldown rules: subtraction-order-rounding'],
 ['fraction-on-reduced-clock','runtime',R,[['remaining - (effect.seconds ?? 0) - remaining * (effect.fraction ?? 0)','(remaining - (effect.seconds ?? 0)) * (1 - (effect.fraction ?? 0))']],'native cooldown rules: seconds-and-fraction'],
 ['reset-lost','runtime',R,[['effect.reset ? 0 :','false ? 0 :']],'native cooldown rules: reset-precedes-signed-arithmetic'],
 ['self-filter-lost','runtime',R,[['if (effect.exceptSelf && trigger','if (false && effect.exceptSelf && trigger']],'native cooldown rules: except-trigger'],
 ['zero-clock-retained','runtime',R,[['if (left <= 0)','if (left < 0)']],'native cooldown rules: nonpositive-clocks-delete-without-gain'],
 ['always-signals-gain','runtime',R,[['return changed;','return true;']],'native cooldown rules: empty-effect'],
 ['cached-map','runtime',R,[['let changed = false;','let changed = false; const clocks = actor.cooldowns;'],['actor.cooldowns.delete(id)','clocks.delete(id)'],['actor.cooldowns.set(id, left)','clocks.set(id, left)']],'native cooldown live boundary: map-replaced'],
 ['copied-effect','runtime',R,[['let changed = false;','let changed = false; effect = {...effect};']],'native cooldown live boundary: seconds-replaced'],
 ['cached-trigger','runtime',R,[['let changed = false;','let changed = false; const triggerId = trigger?.def.id;'],['id === trigger.def.id','id === triggerId']],'native cooldown live boundary: trigger-retargeted'],
 ['cached-write-method','runtime',R,[['let changed = false;','let changed = false; const set = actor.cooldowns.set.bind(actor.cooldowns);'],['actor.cooldowns.set(id, left)','set(id, left)']],'native cooldown live boundary: method-replaced'],
 ['swallowed-write-failure','runtime',R,[['actor.cooldowns.set(id, left);','{ try { actor.cooldowns.set(id, left); } catch {} }']],'native cooldown rules: failure-before-first-write-and-continuation'],
 ['borrowed-selector','content',null,[['return Object.freeze(result);','return value;']],'all twelve initialized authored cooldown effects compile unchanged into owned frozen data'],
 ['lost-negative-zero','content',C,[['seconds: fields.seconds','seconds: Math.max(0, fields.seconds)']],'cooldown compilation preserves signed values, empty/duplicate selectors and host-defined IDs'],
 ['schema-discriminator-lost','content',C,[["if (fields.type !== 'cooldown')",'if (false)']],'cooldown records reject unsupported schemas and accessors without executing them'],
 ['false-flags-promoted','content',C,[["fields[key] !== undefined && fields[key] !== true","fields[key] !== undefined && typeof fields[key] !== 'boolean'"]],'cooldown records reject unsupported schemas and accessors without executing them'],
 ['accessor-accepted','content',C,[["!field.enumerable || !('value' in field)",'!field.enumerable']],'cooldown records reject unsupported schemas and accessors without executing them'],
 ['selector-budget-lost','content',null,[['length > COOLDOWN_CONTENT_LIMITS.selectorEntries','false']],'skills selectors have bounded dense string data and independent ownership'],
];
const results=[];
for(const[name,target,method,edits,expectedTest]of faults){
 const source=original[target].toString().replaceAll('\r\n','\n'),{start,end}=method?exportedFunctionBody(source,method):{start:0,end:source.length};let body=source.slice(start,end);
 for(const[before,after]of edits){assert.equal(body.split(before).length,2,'Changed cooldown mutation anchor: '+name);body=body.replace(before,after);}
 const mutant=path.join(output,name+'.mjs'),bytes=source.slice(0,start)+body+source.slice(end);fs.writeFileSync(mutant,bytes,{flag:'wx'});
 const syntax=spawnSync(process.execPath,['--check',mutant],{encoding:'utf8',windowsHide:true});assert.equal(syntax.status,0,syntax.stderr);
 const result=spawnSync(process.execPath,['--test','--test-reporter=tap','test/cooldowns.test.mjs','test/cooldown-content.test.mjs'],{
  cwd:root,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:16*1024*1024,env:{...process.env,[target==='runtime'?'HWE_COOLDOWN_MODULE':'HWE_COOLDOWN_CONTENT_MODULE']:pathToFileURL(mutant).href}});
 const log=result.stdout+result.stderr;fs.writeFileSync(path.join(output,name+'.txt'),log,{flag:'wx'});
 assert.equal(result.error,undefined);assert.notEqual(result.status,0,'Surviving cooldown fault: '+name);assert.match(result.stdout,/# fail [1-9][0-9]*/);
 assert(result.stdout.split('\n').some(line=>/^not ok \d+ - /.test(line)&&line.includes(expectedTest)),'Expected cooldown test did not reject '+name);
 results.push({name,target,rejected:true,expectedTest,mutantSha256:sha256(bytes),logSha256:sha256(log)});
}
for(const[key,file]of Object.entries(files))assert(fs.readFileSync(path.join(root,file)).equals(original[key]));
writeJSON(path.join(root,'.artifacts/cooldown-mutations.json'),{output,count:results.length,results,productionRuntimeUnchanged:true});
console.log('PASS: '+results.length+' cooldown runtime/content faults rejected; production modules unchanged.');
