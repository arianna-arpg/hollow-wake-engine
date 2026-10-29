import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {renderHitStatus} from '../adapters/hollow-wake/integrate-hit-status.mjs';
import {renderHitEffects} from '../adapters/hollow-wake/integrate-hit-effects.mjs';
import {renderProcWorld} from '../adapters/hollow-wake/integrate-procs.mjs';
import {renderStatusVoiceProbe} from '../adapters/hollow-wake/integrate-status-effects.mjs';
import {hitPreparationTree} from '../adapters/hollow-wake/hit-preparation-tree.mjs';
import {renderHitPreparation,renderHitPreparationVoiceProbe,integrateHitPreparation} from '../adapters/hollow-wake/integrate-hit-preparation.mjs';
const original=fs.readFileSync(path.join(root,'.reference/src/engine/world.ts'),'utf8').replaceAll('\r\n','\n');
const source=renderHitEffects(renderHitStatus(renderProcWorld(original))),t=hitPreparationTree(source);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-preparation-overlay-')),faults=[];
renderHitPreparation(original,true);
const normal=renderHitPreparation(source);
assert.equal(renderHitPreparation(source.replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),normal);
assert(normal.includes('this.engineHitPreparation.prepare(caster, inst, target, dmgMult, depth, flatBonus, forceDamage, fromFuse, hitEffects, hitOrigin, hitTier);'));
assert(normal.includes('private continuePreparedHit('));assert.throws(()=>renderHitPreparation(normal));
for(let i=0;i<23;i++){
 const node=t.top[i],text=node.getText(t.ast);
 // Place the comment inside the statement so its semantic token span includes it.
 const firstSpace=text.indexOf(' ');assert(firstSpace>=0);const altered=text.slice(0,firstSpace)+' /* changed */'+text.slice(firstSpace);
 const input=source.slice(0,node.getStart(t.ast))+altered+source.slice(node.end);
 assert.throws(()=>renderHitPreparation(input),e=>e.code==='ERR_ASSERTION','statement-'+i);faults.push('statement-'+i);
}
for(const [name,needle]of [['header',t.header],['tail',t.tail],['victim-import',t.retired['./victim'].getText(t.ast)],['tuning-import',t.retired['./tuning'].getText(t.ast)]]){
 assert(source.includes(needle));const changed=needle.replace(' ',' /* changed */ ');
 assert.throws(()=>renderHitPreparation(source.replace(needle,changed)),e=>e.code==='ERR_ASSERTION',name);faults.push(name);
}
for(const symbol of ['engineHitPreparation','bindHitPreparation','continuePreparedHit']){
 assert.throws(()=>renderHitPreparation(source+'\n// '+symbol),/binding collision/);faults.push(symbol+'-collision');
}
const game=path.join(directory,'game');fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});
const file=path.join(game,'src/engine/world.ts'),binding=path.join(game,'src/engine/hitPreparation.ts');
const captured=t.top[1];fs.writeFileSync(file,source.slice(0,captured.getStart(t.ast))+captured.getText(t.ast).replace('const ','const /* changed */ ')+source.slice(captured.end));
const before=sha256(fs.readFileSync(file));assert.throws(()=>integrateHitPreparation(game),/Unreviewed preparation statement 1/);assert.equal(sha256(fs.readFileSync(file)),before);assert(!fs.existsSync(binding));faults.push('atomic-preflight');
const probe=renderStatusVoiceProbe(fs.readFileSync(path.join(root,'.reference/balance/probe_statusvoice.ts'),'utf8')).replaceAll('\r\n','\n');
const probeOutput=renderHitPreparationVoiceProbe(probe);
assert.equal(renderHitPreparationVoiceProbe(probe.replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),probeOutput);
assert.equal(probeOutput.replace(" + '\\n' + readFileSync('src/engine/hitPreparation.ts', 'utf8')",''),probe,'Probe assertions changed');
assert.throws(()=>renderHitPreparationVoiceProbe(probe+'\n// changed'),/Unreviewed preparation voice probe/);faults.push('probe-source');
assert.throws(()=>renderHitPreparationVoiceProbe(probeOutput),/Unreviewed preparation voice probe/);faults.push('probe-repeat');
fs.mkdirSync(path.join(game,'balance'));fs.writeFileSync(file,source);fs.writeFileSync(path.join(game,'balance/probe_statusvoice.ts'),probe+'\n// changed');
assert.throws(()=>integrateHitPreparation(game),/Unreviewed preparation voice probe/);assert.equal(fs.readFileSync(file,'utf8'),source);assert(!fs.existsSync(binding));faults.push('probe-atomic-preflight');
fs.writeFileSync(file,source);fs.writeFileSync(binding,'owned');assert.throws(()=>integrateHitPreparation(game),/already exists/);assert.equal(fs.readFileSync(file,'utf8'),source);assert.equal(fs.readFileSync(binding,'utf8'),'owned');faults.push('binding-collision');
const report={passed:true,directory,faults:faults.length,results:faults,lfCrlfEquivalent:true,repeatedInstallRejected:true};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/hit-preparation-overlay-verification.json'),report);console.log(report);
