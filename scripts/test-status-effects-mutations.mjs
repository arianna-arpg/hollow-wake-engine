import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const source=fs.readFileSync(path.join(root,'dist/status-effects.js'),'utf8'),directory=fs.mkdtempSync(path.join(root,'.artifacts/status-effects-mutations-'));
const mutations=[
 ['field','s.challengeField !== undefined','s.challengeField === undefined'],
 ['floor','Math.max(.05, s.remaining)','Math.max(.5, s.remaining)'],
 ['fractional-stacks','const n = Math.max(1, s.stacks);','const n = Math.floor(Math.max(1, s.stacks));'],
 ['ring-modifiers','value: m.value * s.stacks','value: m.value'],
 ['ring-time','s.remaining *= 1 - portion;','s.remaining *= portion;'],
 ['shed-source','value: m.value * (def.modsPerStack ? status.stacks : 1)','value: m.value'],
 ['bank-spend','s.dps *= 1 - f;','s.dps *= f;'],
 ['bank-attacker','{ attacker: caster, tags, extra }','{ tags, extra }'],
 ['bank-flash','ports.flash(victim.pos, victim.radius + 18, def.color, .3);','if (taken > 0) ports.flash(victim.pos, victim.radius + 18, def.color, .3);'],
 ['rupture-story','!ports.sameStory(e, victim)','false'],
 ['rupture-edge','ports.distance(victim.pos, e.pos) - e.radius > radius','ports.distance(victim.pos, e.pos) > radius'],
 ['rupture-resistance','amount *= 1 - ports.resistValue(e, type);','amount *= ports.resistValue(e, type);'],
 ['doom-equality','armed >= target.life','armed > target.life'],
 ['proc-tags','ports.skillContextTags(inst, [def.dotType])','ports.skillContextTags(inst)'],
 ['proc-live-definition','def.dotType && inst ?','inst ?'],
 ['proc-power',"power: def.dotType ? undefined : caster.sheet.get('statusMagnitude', tags, extra)","power: undefined"],
 ['expiry-gate','!actor.dead && !ports.definition(s.id)?.dischargeMatchingType','!actor.dead'],
 ['zap-clock','s.zapAt = ports.time() + zn.interval;','s.zapAt = s.zapAt + zn.interval;'],
 ['zap-stacks','baseline(s.id) * zn.factor * s.stacks','baseline(s.id) * zn.factor'],
 ['lash-tie','distance <= best','distance < best'],
 ['lash-stun','|| actor.isStunned()','|| false'],
 ['capture-identity','actor.statuses.filter(s => s.propagates && s.dps > 0)','actor.statuses.filter(s => s.propagates && s.dps > 0).map(s => ({...s}))'],
 ['spread-cap','spread >= 6','spread >= 7'],
];
const importNeedle="'./status-lifecycle.js'";assert(source.includes(importNeedle));const results=[];
for(const[name,needle,replacement]of mutations){assert.equal(source.split(needle).length-1,1,'Fault selector '+name);
 const file=path.join(directory,name+'.mjs');fs.writeFileSync(file,source.replace(needle,replacement).replace(importNeedle,JSON.stringify(pathToFileURL(path.join(root,'dist/status-lifecycle.js')).href)));
 const result=spawnSync(process.execPath,['--test',path.join(root,'test/status-effects.test.mjs')],{cwd:root,encoding:'utf8',env:{...process.env,HWE_STATUS_EFFECTS_MODULE:file},timeout:30000});const output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,name+'.txt'),output);
 assert(!result.error,name);assert.equal(result.signal,null,name);assert.notEqual(result.status,0,name+' survived');assert.match(output,/ERR_ASSERTION/,name+' must fail behavior');assert(!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(output),name);results.push({name,detected:true,sha256:sha256(fs.readFileSync(file))});
}
const report={passed:true,directory,sourceSha256:sha256(source),faults:results.length,results};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/status-effects-mutation-verification.json'),report);console.log({passed:true,directory,faults:results.length});
