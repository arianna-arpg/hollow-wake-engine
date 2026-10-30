import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {renderProcWorld} from '../adapters/hollow-wake/integrate-procs.mjs';
import {renderHitStatus} from '../adapters/hollow-wake/integrate-hit-status.mjs';
import {renderHitEffects} from '../adapters/hollow-wake/integrate-hit-effects.mjs';
import {renderHitPreparation} from '../adapters/hollow-wake/integrate-hit-preparation.mjs';
import {renderHitLanding} from '../adapters/hollow-wake/integrate-hit-landing.mjs';
import {renderHitSustain} from '../adapters/hollow-wake/integrate-hit-sustain.mjs';
import {renderHitReactions} from '../adapters/hollow-wake/integrate-hit-reactions.mjs';
import {hitAftermathTree} from '../adapters/hollow-wake/hit-aftermath-tree.mjs';
import {renderHitAftermath,integrateHitAftermath} from '../adapters/hollow-wake/integrate-hit-aftermath.mjs';
const original=fs.readFileSync(path.join(root,'.reference/src/engine/world.ts'),'utf8').replaceAll('\r\n','\n');
const source=renderHitReactions(renderHitSustain(renderHitLanding(renderHitPreparation(renderHitEffects(renderHitStatus(renderProcWorld(original)))))));
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-aftermath-overlay-')),faults=[];
assert.equal(renderHitAftermath(original,true),original);
const normal=renderHitAftermath(source);assert.equal(renderHitAftermath(source.replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),normal);assert.throws(()=>renderHitAftermath(normal));
for(const [input,preflight]of [[original,true],[source,false]]) {
 const tree=hitAftermathTree(input,preflight),label=preflight?'original':'installed';
 for(const [section,nodes]of [['damaging',tree.remainder],['common',tree.tail]]) {
  for(const [index,node]of nodes.entries()) {
   const text=node.getText(tree.ast),altered=text.replace(';',' /* changed */;');assert.notEqual(altered,text,label+'/'+section+'/'+index);
   const changed=input.slice(0,node.getStart(tree.ast))+altered+input.slice(node.end);
   assert.throws(()=>renderHitAftermath(changed,preflight),e=>e.code==='ERR_ASSERTION');faults.push(label+'-'+section+'-'+index);
  }
 }
 const start=tree.method.getStart(tree.ast),changed=input.slice(0,start)+input.slice(start).replace('caster','caster /* changed */');
 assert.throws(()=>renderHitAftermath(changed,preflight),e=>e.code==='ERR_ASSERTION');faults.push(label+'-signature');
}
for(const symbol of ['engineHitAftermath','bindHitAftermath']){assert.throws(()=>renderHitAftermath(source+'\n// '+symbol),/binding collision/);faults.push(symbol+'-collision');}
const game=path.join(directory,'game');fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});
const file=path.join(game,'src/engine/world.ts'),binding=path.join(game,'src/engine/hitAftermath.ts'),tree=hitAftermathTree(source),node=tree.remainder[0];
fs.writeFileSync(file,source.slice(0,node.getStart(tree.ast))+node.getText(tree.ast).replace('target','target /* changed */')+source.slice(node.end));
const before=sha256(fs.readFileSync(file));assert.throws(()=>integrateHitAftermath(game),e=>e.code==='ERR_ASSERTION');assert.equal(sha256(fs.readFileSync(file)),before);assert(!fs.existsSync(binding));faults.push('failed-preflight-preserves-files');
fs.writeFileSync(file,source);fs.writeFileSync(binding,'owned');assert.throws(()=>integrateHitAftermath(game),/already exists/);assert.equal(fs.readFileSync(file,'utf8'),source);assert.equal(fs.readFileSync(binding,'utf8'),'owned');faults.push('binding-file-collision');
const report={passed:true,directory,faults:faults.length,results:faults,lfCrlfEquivalent:true,repeatedInstallRejected:true,earlierSustainAndReactionTextUnchanged:true};
writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-aftermath-overlay-verification.json',report);console.log({passed:true,faults:faults.length,directory});
