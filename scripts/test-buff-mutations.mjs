import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const runtime=fs.readFileSync(path.join(root,'dist/buffs.js'),'utf8'),content=fs.readFileSync(path.join(root,'dist/buff-content.js'),'utf8');
const output=fs.mkdtempSync(path.join(root,'.artifacts/buff-mutations-')),results=[];
const faults=[
 ['runtime','gain-cap-off-by-one','owner.gainEvents.length < BUFF_LIMITS.gainEvents','owner.gainEvents.length < BUFF_LIMITS.gainEvents - 1'],
 ['runtime','release-omitted','this.ports.release(owner, buff.def, id, Math.min(count, buff.stacks));','void 0;'],
 ['runtime','release-after-subtraction','this.ports.release(owner, buff.def, id, Math.min(count, buff.stacks));','buff.stacks -= count; this.ports.release(owner, buff.def, id, Math.min(count, buff.stacks)); buff.stacks += count;'],
 ['runtime','spent-clocks-restored','if (buff.expiries && count > 0)','if (false)'],
 ['runtime','newest-applications-spent','clocks[i - spent] = clocks[i];','clocks[i - spent] = clocks[i - spent];'],
 ['runtime','spent-duration-not-recomputed','if (clocks.length)\n                    buff.remaining = longest(clocks);','if (clocks.length)\n                    buff.remaining = buff.remaining;'],
 ['runtime','independent-definition-replaced','const clocks = buff.expiries ??= [];','const clocks = buff.expiries ??= []; buff.def = def;'],
 ['runtime','shared-unbounded-grant-reset','existing.remaining = duration;','existing.stacks = 1; existing.remaining = duration;'],
 ['runtime','spend-uses-live-map','for (const [id, buff] of [...owner.buffs])','for (const [id, buff] of owner.buffs)'],
 ['runtime','expiry-uses-snapshot','for (const [id, buff] of owner.buffs)','for (const [id, buff] of [...owner.buffs])'],
 ['runtime','zero-independent-clock-survives','if (remaining <= 0)','if (remaining < 0)'],
 ['runtime','zero-shared-clock-survives','if (buff.remaining <= 0)','if (buff.remaining < 0)'],
 ['runtime','compaction-corrupts-order','clocks[write++] = remaining;','clocks[length - 1 - write++] = remaining;'],
 ['runtime','detached-record-cleared','if (!write) {','if (!write) { buff.stacks = 0; buff.remaining = 0;'],
 ['runtime','modifiers-not-stacked','value: mod.value * buff.stacks','value: mod.value'],
 ['runtime','source-removal-skipped','this.ports.removeSource(owner, source);','void 0;'],
 ['runtime','advance-guard-not-cleared','active.owner = previous;','void owner;'],
 ['runtime','same-owner-reentry-admitted','if (active.owner !== undefined && (active.owner === owner || active.parents?.includes(owner)))','if (false)'],
 ['runtime','ancestor-reentry-admitted','active.owner === owner || active.parents?.includes(owner)','active.owner === owner'],
 ['runtime','outer-guard-not-restored','active.owner = previous;','active.owner = undefined;'],
 ['runtime','unwound-ancestor-not-released','active.parents.pop();','void previous;'],
 ['runtime','nesting-budget-off-by-one','this.nesting >= BUFF_LIMITS.nesting','this.nesting > BUFF_LIMITS.nesting'],
 ['runtime','visit-budget-off-by-one','++visits > BUFF_LIMITS.visits','++visits > BUFF_LIMITS.visits + 1'],
 ['runtime','host-consume-dispatch-bypassed','this.ports.consume(owner, id, 1);','this.consume(owner, id, 1);'],
 ['content','unknown-stat-admitted','if (!Object.hasOwn(rules.definitions, stat))','if (false)'],
 ['content','unknown-fields-ignored',"if (typeof key !== 'string' || !keys.includes(key))",'if (false)'],
 ['content','array-limit-removed','if (length > maximum)','if (false)'],
 ['content','tag-arrays-mutable','Object.freeze(result);\n    return result;','void result;\n    return result;'],
 ['content','modifier-objects-mutable','return Object.freeze(result);','return result;'],
];
for(const [kind,name,before,after] of faults){
 const source=kind==='runtime'?runtime:content;assert.equal(source.split(before).length,2,'Fault anchor must match once: '+name);
 let changed=source.replace(before,after);
 if(kind==='content')changed=changed.replace(/from '(\.\/[^']+)'/g,(_all,relative)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'dist',relative)).href));
 const file=path.join(output,name+'.mjs');fs.writeFileSync(file,changed,{flag:'wx'});
 const files=kind==='runtime'?['test/buffs.test.mjs','test/buff-native.test.mjs','test/buff-reentry.test.mjs']:['test/buff-content.test.mjs'];
 const variable=kind==='runtime'?'HOLLOW_WAKE_BUFF_MODULE':'HOLLOW_WAKE_BUFF_CONTENT_MODULE';
 const run=spawnSync(process.execPath,['--test',...files],{cwd:root,encoding:'utf8',timeout:30_000,env:{...process.env,[variable]:pathToFileURL(file).href}}),log=run.stdout+run.stderr;
 fs.writeFileSync(path.join(output,name+'.txt'),log,{flag:'wx'});
 assert(!run.error&&run.status!==0&&/AssertionError/.test(log)&&!/ERR_MODULE_NOT_FOUND|SyntaxError/.test(log),'Fault not behaviorally rejected: '+name);
 results.push({kind,name,detected:true});console.log('Rejected buff fault: '+name);
}
assert.equal(fs.readFileSync(path.join(root,'dist/buffs.js'),'utf8'),runtime);assert.equal(fs.readFileSync(path.join(root,'dist/buff-content.js'),'utf8'),content);
writeJSON(path.join(root,'.artifacts/buff-mutation-verification.json'),{faults:results.length,results,runtimeSha256:sha256(runtime),contentSha256:sha256(content),productionUnchanged:true,output});
