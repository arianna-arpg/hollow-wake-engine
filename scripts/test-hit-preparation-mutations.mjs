import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';import {root,sha256,writeJSON} from './reference-utils.mjs';
const source=fs.readFileSync(path.join(root,'dist/hit-preparation.js'),'utf8'),directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-preparation-mutations-'));
const mutations=[
 ['depth','Math.max(depth, inst.procChainDepth ?? 0)','depth'],
 ['definition-capture','const def = inst.def;','let def = inst.def;'],
 ['fuse-delay',"fuse.delay * caster.sheet.get('fuseDelay', tags, ports.modifiers(inst))",'fuse.delay'],
 ['fuse-queue-receiver','ports.fuseQueue().push({','((record) => ports.fuseQueue().push(record))({'],
 ['fuse-flat','flat: flatBonus','flat: flatBonus ? {...flatBonus} : flatBonus'],
 ['fuse-origin','ports.copyPosition(hitOrigin ?? caster.pos)','hitOrigin ?? caster.pos'],
 ['fuse-tier','hitTier: hitTier ?? caster.tier','hitTier: hitTier || caster.tier'],
 ['fuse-latch','target.segHitPending = undefined;','target.segHitPending = 0;'],
 ['fuse-bypass','if (!fromFuse)','if (true)'],
 ['guise-self','&& target !== caster',''],
 ['guise-repeat','&& !caster.possession.guiseBroken',''],
 ['noise','if (noise > 0)','if (noise >= 0)'],
 ['shatter-stacks','consumedStacks += status.stacks','consumedStacks += 1'],
 ['shatter-source',"'status:' + status.id","'buff:' + status.id"],
 ['shatter-multiplier','1 + (def.shatterStatus.mult - 1) * consumedStacks','def.shatterStatus.mult * consumedStacks'],
 ['ambush-awareness','target.aiTargetId !== caster.id &&',''],
 ['ambush-team','target.team !== caster.team &&',''],
 ['ambush-alert','ports.time() >= target.alertUntil','ports.time() > target.alertUntil'],
 ['ambush-bonus','if (ambush > 0)','if (ambush >= 0)'],
 ['rear-threshold',') > 2.0',') >= 2.0'],
 ['rear-absolute','Math.abs(ports.rearAngle(target, caster))','ports.rearAngle(target, caster)'],
 ['rear-multiplier','def.backstabMult > 1','def.backstabMult > 0'],
 ['proximity-radius','/ ports.proximityRadius()','/ (ports.proximityRadius() * 2)'],
 ['owner-affinity','breakable.affinityMult ?? 2','breakable.affinityMult || 2'],
 ['owner-gate','&& target.owner === caster',''],
 ['victim-scope','ports.victimScopeArmed(caster, extra) ?','true ?'],
 ['packet-scale','packet.amounts[type] *= dmgMult','packet.amounts[type] *= Math.max(0, dmgMult)'],
 ['tone-gate','target.tune ? ports.tone(packet.amounts) : null','ports.tone(packet.amounts)'],
 ['affliction-clamp',"Math.min(1, Math.max(0, caster.sheet.get('hitToAffliction', ports.instanceTags(inst), extra)))","Math.max(0, caster.sheet.get('hitToAffliction', ports.instanceTags(inst), extra))"],
 ['affliction-carry','forgone * caster.sheet.get','(forgone + 1) * caster.sheet.get'],
 ['guard-gate','raw > 0 && ports.guard','raw >= 0 && ports.guard'],
 ['guard-origin','ports.guard(target, caster, caster.pos, raw)','ports.guard(target, caster, target.pos, raw)'],
 ['shell-origin','ports.shell(target, caster.pos, packet, caster)','ports.shell(target, target.pos, packet, caster)'],
 ['packet-reference','def, extra, packet, rearHit','def, extra, {...packet}, rearHit'],
 ['continuation-result','return ports.continue(','ports.continue('],
];
const results=[];
for(const[name,needle,replacement]of mutations){
 assert.equal(source.split(needle).length-1,1,'Fault selector '+name);
 let changed=source.replace(needle,replacement);
 if(name==='definition-capture')changed=changed.replace('const extra = ports.modifiers(inst);','def = inst.def;\n        const extra = ports.modifiers(inst);');
 const file=path.join(directory,name+'.mjs');fs.writeFileSync(file,changed);
 const result=spawnSync(process.execPath,['--test','--test-reporter=tap',path.join(root,'test/hit-preparation.test.mjs')],{cwd:root,encoding:'utf8',env:{...process.env,HWE_HIT_PREPARATION_MODULE:pathToFileURL(file).href},timeout:30000,windowsHide:true});
 const output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,name+'.txt'),output);
 assert(!result.error,name);assert.equal(result.signal,null,name);assert.notEqual(result.status,0,name+' survived');
 assert.match(output,/ERR_ASSERTION/,name+' must fail behavior');assert(!/SyntaxError|TypeError|ReferenceError|ERR_MODULE_NOT_FOUND|ERR_UNSUPPORTED_ESM_URL_SCHEME/.test(output),name+' introduced an unrelated failure');
 results.push({name,detected:true,sha256:sha256(fs.readFileSync(file))});
}
assert.equal(sha256(fs.readFileSync(path.join(root,'dist/hit-preparation.js'))),sha256(source));
const report={passed:true,directory,sourceSha256:sha256(source),faults:results.length,results};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/hit-preparation-mutation-verification.json'),report);console.log({passed:true,directory,faults:results.length});
