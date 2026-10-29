import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const source=fs.readFileSync(path.join(root,'dist/hit-status.js'),'utf8'),directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-status-mutations-'));
const mutations=[
 ['random-zero','ports.random() < value','value > 0 && ports.random() < value'],
 ['linked-first',"other.def.effects.find(f => f.type === 'status')","other.def.effects.findLast(f => f.type === 'status')"],
 ['linked-duration','0) * hexLink;', '0) * (hexLink + 1);'],
 ['rider-all-tags','rider.tags.every(t => packet.tags.has(t))','rider.tags.some(t => packet.tags.has(t))'],
 ['rider-snapshot','of [...caster.buffs]','of caster.buffs'],
 ['rider-baseline','rider.statusScale ?? 1.5','rider.statusScale ?? 1'],
 ['rider-proc-depth','caster, inst, target, 1);','caster, inst, target, depth);'],
 ['rider-spend','caster.consumeBuffStacks(bid, 1);','caster.consumeBuffStacks(bid, 2);'],
 ['resistance','shrug > 0 && chance(shrug)','false && chance(shrug)'],
 ['incidental-tuning','fx.chance * rule.incidentalScale','fx.chance'],
 ['carry','(dealt + afflictionCarry)','dealt'],
 ['duration-floor','hexDmg / Math.max(.5, durScale)','hexDmg / Math.max(.05, durScale)'],
 ['fixed-duration','fx.durationOverride !== undefined','false'],
 ['critical-dps','dpsOut *= cm;','dpsOut *= 1;'],
 ['critical-rupture','rupture *= cm;','rupture *= 1;'],
 ['taunt-owner',"fx.status === 'taunted' && caster.summonShell && caster.owner ? caster.owner.id : caster.id","caster.id"],
 ['stack-rounding',"Math.round(f.caster.sheet.get('ailmentStacks'","Math.floor(f.caster.sheet.get('ailmentStacks'"],
 ['authored-power',"power: ports.definition(fx.status)?.dotType ? undefined : potencyFor(f, fx.status)","power: undefined"],
 ['wet-order',"ports.statusIds().filter(id => applyArmed.includes(id) || wetArmed.includes(id))","[...new Set([...applyArmed,...wetArmed])]"],
 ['stat-pool','dps * (ports.definition(sid)?.duration ?? 0) * durScale','dpsOut2 * (ports.definition(sid)?.duration ?? 0) * durScale'],
 ['stat-doom','armed * caster.sheet.get(\'doomDot\', tags, extra)','armed * durScale * caster.sheet.get(\'doomDot\', tags, extra)'],
 ['held-discharge','s.holdDischarge || !ports.definition(s.id)?.dischargeOnHit','!ports.definition(s.id)?.dischargeOnHit'],
 ['matching-discharge','ports.definition(s.id)?.dischargeMatchingType &&','false &&'],
 ['impale-source',"x.id === 'impaled' && !x.sourceKey","x.id === 'impaled'"],
 ['impale-rolled','+ phys * ip','+ dealt * ip'],
];
const importNeedle="'./status-lifecycle.js'";assert(source.includes(importNeedle));const results=[];
for(const[name,needle,replacement]of mutations){assert.equal(source.split(needle).length-1,1,'Fault selector '+name);
 const file=path.join(directory,name+'.mjs');fs.writeFileSync(file,source.replace(needle,replacement).replace(importNeedle,JSON.stringify(pathToFileURL(path.join(root,'dist/status-lifecycle.js')).href)));
 const result=spawnSync(process.execPath,['--test',path.join(root,'test/hit-status.test.mjs')],{cwd:root,encoding:'utf8',env:{...process.env,HWE_HIT_STATUS_MODULE:file},timeout:30000});const output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,name+'.txt'),output);
 assert(!result.error,name);assert.equal(result.signal,null,name);assert.notEqual(result.status,0,name+' survived');assert.match(output,/ERR_ASSERTION/,name+' must fail behavior');assert(!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(output),name);results.push({name,detected:true,sha256:sha256(fs.readFileSync(file))});
}
const report={passed:true,directory,sourceSha256:sha256(source),faults:results.length,results};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/hit-status-mutation-verification.json'),report);console.log({passed:true,directory,faults:results.length});
