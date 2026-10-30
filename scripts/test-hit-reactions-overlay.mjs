import {renderHitSustain} from '../adapters/hollow-wake/integrate-hit-sustain.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {renderHitStatus} from '../adapters/hollow-wake/integrate-hit-status.mjs';import {renderHitEffects} from '../adapters/hollow-wake/integrate-hit-effects.mjs';import {renderProcWorld} from '../adapters/hollow-wake/integrate-procs.mjs';import {renderHitPreparation} from '../adapters/hollow-wake/integrate-hit-preparation.mjs';import {renderHitLanding} from '../adapters/hollow-wake/integrate-hit-landing.mjs';
import {hitReactionsTree} from '../adapters/hollow-wake/hit-reactions-tree.mjs';import {renderHitReactions,integrateHitReactions} from '../adapters/hollow-wake/integrate-hit-reactions.mjs';
const original=fs.readFileSync(path.join(root,'.reference/src/engine/world.ts'),'utf8').replaceAll('\r\n','\n');
const source=renderHitSustain(renderHitLanding(renderHitPreparation(renderHitEffects(renderHitStatus(renderProcWorld(original))))));
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-reactions-overlay-')),faults=[];
assert.equal(renderHitReactions(original,true),original);
const normal=renderHitReactions(source);assert.equal(renderHitReactions(source.replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),normal);assert.throws(()=>renderHitReactions(normal));
for(const[input,preflight]of [[original,true],[source,false]]){
 const t=hitReactionsTree(input,preflight),label=preflight?'original':'installed';
 for(let i=0;i<29;i++){const node=t.reactions[i],text=node.getText(t.ast),altered=text.replace(';',' /* changed */;'),changed=input.slice(0,node.getStart(t.ast))+altered+input.slice(node.end);assert.notEqual(altered,text,label+'-'+i);assert.throws(()=>renderHitReactions(changed,preflight),e=>e.code==='ERR_ASSERTION',label+'-'+i);faults.push(label+'-statement-'+i);}
 for(const[name,needle]of [['prefix',t.prefix],['continuation',t.suffix]]){const changed=needle.replace(' ',' /* changed */ ');assert.notEqual(changed,needle);assert.throws(()=>renderHitReactions(input.replace(needle,changed),preflight),e=>e.code==='ERR_ASSERTION');faults.push(label+'-'+name);}
}
for(const symbol of ['engineHitReactions','bindHitReactions']){assert.throws(()=>renderHitReactions(source+'\n// '+symbol),/binding collision/);faults.push(symbol+'-collision');}
const game=path.join(directory,'game');fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});const file=path.join(game,'src/engine/world.ts'),binding=path.join(game,'src/engine/hitReactions.ts'),t=hitReactionsTree(source),node=t.reactions[0];
fs.writeFileSync(file,source.slice(0,node.getStart(t.ast))+node.getText(t.ast).replace('caster','caster /* changed */')+source.slice(node.end));const before=sha256(fs.readFileSync(file));assert.throws(()=>integrateHitReactions(game),e=>e.code==='ERR_ASSERTION');assert.equal(sha256(fs.readFileSync(file)),before);assert(!fs.existsSync(binding));faults.push('atomic-preflight');
fs.writeFileSync(file,source);fs.writeFileSync(binding,'owned');assert.throws(()=>integrateHitReactions(game),/already exists/);assert.equal(fs.readFileSync(file,'utf8'),source);assert.equal(fs.readFileSync(binding,'utf8'),'owned');faults.push('binding-collision');
const report={passed:true,directory,faults:faults.length,results:faults,lfCrlfEquivalent:true,repeatedInstallRejected:true,prefixAndContinuationTextUnchanged:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-reactions-overlay-verification.json',report);console.log(report);
