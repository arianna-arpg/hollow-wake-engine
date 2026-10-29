import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const source=fs.readFileSync(path.join(root,'dist/hit-effects.js'),'utf8'),directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-effects-mutations-'));
const mutations=[
 ['live-list',': effects)',': [...effects])'],
 ['effect-order','[...effects, ...delivery]','[...delivery, ...effects]'],
 ['heal-power','target, fx, damageMultiplier','target, fx, 1'],
 ['heal-self','!(fx.excludeCaster && target === caster)','true'],
 ['cleanse-default','fx.count ?? 2','fx.count ?? 1'],
 ['buff-reference','inst, fx, durScale','inst, {...fx}, durScale'],
 ['buff-bond','if (fx.bond)','if (false)'],
 ['rupture-multiplier','fx.mul ?? 1','fx.mul || 1'],
 ['status-frame','ports.status(frame, effect)','ports.status({...frame}, effect)'],
 ['grab-recipient','ports.grab(caster, inst, target, effect)','ports.grab(caster, inst, caster, effect)'],
 ['possess-recipient','ports.possess(caster, inst, target, effect)','ports.possess(caster, inst, caster, effect)'],
 ['buffet-direction','buffet ? ports.randomDirection()','false ? ports.randomDirection()'],
 ['pull-gap','- caster.radius - target.radius - 12','- caster.radius - 12'],
 ['pull-dormant','&& !ports.dormant(target)',''],
 ['absorb-duration','fx.duration * durScale','fx.duration'],
 ['restore-tags','{ tags: def.tags }','{ tags: [] }'],
 ['ward-recipient','target.gainWard(fx.amount)','caster.gainWard(fx.amount)'],
 ['siphon-gate','dealt > 0 && depth === 0 && !caster.construct','dealt > 0 && depth === 0 && !caster.construct && !caster.dead'],
 ['siphon-owner','homeTo: caster.owner ?? caster','homeTo: caster'],
 ['birth-gate','fx.onHit && dealt > 0 && depth === 0 && !caster.dead','dealt > 0 && depth === 0 && !caster.dead'],
 ['birth-position','ports.birth(caster, inst, fx, ports.copyPosition(target.pos)','ports.birth(caster, inst, fx, target.pos'],
 ['spread-limit','fx.maxTargets ?? 8','fx.maxTargets ?? 9'],
 ['spread-edge','ports.distance(target.pos, actor.pos) - actor.radius > radius','ports.distance(target.pos, actor.pos) > radius'],
 ['spread-records','const carried = target.statuses.filter','const carried = target.statuses.map(s=>({...s})).filter'],
 ['transfuse-records','const donors = caster.statuses.filter','const donors = caster.statuses.map(s=>({...s})).filter'],
 ['transfuse-cleanup',"caster.sheet.removeSource('status:' + status.id)","caster.sheet.removeSource('buff:' + status.id)"],
 ['transfuse-flash','fx.splash ?? 60','fx.splash || 60'],
];
const results=[];
for(const[name,needle,replacement]of mutations){
 assert.equal(source.split(needle).length-1,1,'Fault selector '+name);
 const file=path.join(directory,name+'.mjs');fs.writeFileSync(file,source.replace(needle,replacement));
 const result=spawnSync(process.execPath,['--test','--test-reporter=tap',path.join(root,'test/hit-effects.test.mjs')],{cwd:root,encoding:'utf8',env:{...process.env,HWE_HIT_EFFECTS_MODULE:pathToFileURL(file).href},timeout:30000,windowsHide:true});
 const output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,name+'.txt'),output);
 assert(!result.error,name);assert.equal(result.signal,null,name);assert.notEqual(result.status,0,name+' survived');
 assert.match(output,/ERR_ASSERTION/,name+' must fail behavior');assert(!/SyntaxError|TypeError|ReferenceError|ERR_MODULE_NOT_FOUND|ERR_UNSUPPORTED_ESM_URL_SCHEME/.test(output),name+' introduced an unrelated failure');
 results.push({name,detected:true,sha256:sha256(fs.readFileSync(file))});
}
assert.equal(sha256(fs.readFileSync(path.join(root,'dist/hit-effects.js'))),sha256(source));
const report={passed:true,directory,sourceSha256:sha256(source),faults:results.length,results};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/hit-effects-mutation-verification.json'),report);console.log({passed:true,directory,faults:results.length});
