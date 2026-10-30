import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {renderHitStatus} from '../adapters/hollow-wake/integrate-hit-status.mjs';import {renderHitEffects} from '../adapters/hollow-wake/integrate-hit-effects.mjs';import {renderProcWorld} from '../adapters/hollow-wake/integrate-procs.mjs';import {renderHitPreparation} from '../adapters/hollow-wake/integrate-hit-preparation.mjs';import {renderHitLanding} from '../adapters/hollow-wake/integrate-hit-landing.mjs';
import {hitSustainTree} from '../adapters/hollow-wake/hit-sustain-tree.mjs';import {renderHitSustain,integrateHitSustain} from '../adapters/hollow-wake/integrate-hit-sustain.mjs';
const original=fs.readFileSync(path.join(root,'.reference/src/engine/world.ts'),'utf8').replaceAll('\r\n','\n');
const source=renderHitLanding(renderHitPreparation(renderHitEffects(renderHitStatus(renderProcWorld(original)))));
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-sustain-overlay-')),faults=[];
assert.equal(renderHitSustain(original,true),original);
const normal=renderHitSustain(source);assert.equal(renderHitSustain(source.replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),normal);assert.throws(()=>renderHitSustain(normal));
for(const[input,preflight]of [[original,true],[source,false]]){
 const t=hitSustainTree(input,preflight),label=preflight?'original':'installed';
 for(let i=0;i<3;i++){const node=t.sustain[i],text=node.getText(t.ast),altered=text.replace(' ',' /* changed */ '),changed=input.slice(0,node.getStart(t.ast))+altered+input.slice(node.end);assert.throws(()=>renderHitSustain(changed,preflight),/Unreviewed sustain statement/);faults.push(label+'-statement-'+i);}
 for(const[name,needle]of [['prefix',t.prefix],['continuation',t.suffix]]){const changed=needle.replace(' ',' /* changed */ ');assert.notEqual(changed,needle);assert.throws(()=>renderHitSustain(input.replace(needle,changed),preflight),e=>e.code==='ERR_ASSERTION');faults.push(label+'-'+name);}
}
for(const symbol of ['engineHitSustain','bindHitSustain']){assert.throws(()=>renderHitSustain(source+'\n// '+symbol),/binding collision/);faults.push(symbol+'-collision');}
const game=path.join(directory,'game');fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});const file=path.join(game,'src/engine/world.ts'),binding=path.join(game,'src/engine/hitSustain.ts'),t=hitSustainTree(source),node=t.sustain[0];
fs.writeFileSync(file,source.slice(0,node.getStart(t.ast))+node.getText(t.ast).replace('caster','/* changed */caster')+source.slice(node.end));const before=sha256(fs.readFileSync(file));assert.throws(()=>integrateHitSustain(game),/Unreviewed sustain statement 0/);assert.equal(sha256(fs.readFileSync(file)),before);assert(!fs.existsSync(binding));faults.push('atomic-preflight');
fs.writeFileSync(file,source);fs.writeFileSync(binding,'owned');assert.throws(()=>integrateHitSustain(game),/already exists/);assert.equal(fs.readFileSync(file,'utf8'),source);assert.equal(fs.readFileSync(binding,'utf8'),'owned');faults.push('binding-collision');
const report={passed:true,directory,faults:faults.length,results:faults,lfCrlfEquivalent:true,repeatedInstallRejected:true,prefixAndContinuationTextUnchanged:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-sustain-overlay-verification.json',report);console.log(report);
