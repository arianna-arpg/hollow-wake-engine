import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {renderHitStatus} from '../adapters/hollow-wake/integrate-hit-status.mjs';
import {hitEffectsTree} from '../adapters/hollow-wake/hit-effects-tree.mjs';
import {renderHitEffects,integrateHitEffects} from '../adapters/hollow-wake/integrate-hit-effects.mjs';
const source=renderHitStatus(fs.readFileSync(path.join(root,'.reference/src/engine/world.ts'),'utf8')).replaceAll('\r\n','\n');
const t=hitEffectsTree(source),directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-effects-overlay-')),faults=[];
const normal=renderHitEffects(source);
assert.equal(renderHitEffects(source.replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),normal);
assert(normal.includes('this.challenges.beforeEffects(caster, inst, target, dealt, depth);\n    this.engineHitEffects.dispatch(hitStatusFrame, dmgMult, hitEffects);'));
assert(normal.includes('this.engineHitStatuses.applyGranted(hitStatusFrame);'));assert(!normal.includes('const {tags, durScale} = hitStatusFrame;'));
assert.throws(()=>renderHitEffects(normal));
for(const[name,node]of Object.entries({...t.phases,...t.branches})){
 const text=node.getText(t.ast),changed=text.replace(' ',' /* changed */ ');assert.notEqual(text,changed);
 const input=source.slice(0,node.getStart(t.ast))+changed+source.slice(node.end);assert.throws(()=>renderHitEffects(input),e=>e.code==='ERR_ASSERTION',name);faults.push(name);
}
for(const symbol of ['engineHitEffects','bindHitEffects']){assert.throws(()=>renderHitEffects(source+'\n// '+symbol),/binding collision/);faults.push(symbol+'-collision');}
const game=path.join(directory,'game');fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});
const file=path.join(game,'src/engine/world.ts'),binding=path.join(game,'src/engine/hitEffects.ts');
fs.writeFileSync(file,source.replace('const hitStatusFrame =','const /* changed */ hitStatusFrame ='));
const before=sha256(fs.readFileSync(file));assert.throws(()=>integrateHitEffects(game));assert.equal(sha256(fs.readFileSync(file)),before);assert(!fs.existsSync(binding));faults.push('atomic-preflight');
fs.writeFileSync(file,source);fs.writeFileSync(binding,'owned');assert.throws(()=>integrateHitEffects(game),/already exists/);assert.equal(fs.readFileSync(file,'utf8'),source);assert.equal(fs.readFileSync(binding,'utf8'),'owned');faults.push('binding-collision');
const report={passed:true,directory,faults:faults.length,results:faults,lfCrlfEquivalent:true,repeatedInstallRejected:true};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/hit-effects-overlay-verification.json'),report);console.log(report);
