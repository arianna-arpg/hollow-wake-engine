import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {renderHitStatus} from '../adapters/hollow-wake/integrate-hit-status.mjs';
import {renderHitEffects} from '../adapters/hollow-wake/integrate-hit-effects.mjs';
import {renderProcWorld} from '../adapters/hollow-wake/integrate-procs.mjs';
import {renderHitPreparation} from '../adapters/hollow-wake/integrate-hit-preparation.mjs';
import {hitLandingTree} from '../adapters/hollow-wake/hit-landing-tree.mjs';
import {renderHitLanding,integrateHitLanding} from '../adapters/hollow-wake/integrate-hit-landing.mjs';
const original=fs.readFileSync(path.join(root,'.reference/src/engine/world.ts'),'utf8').replaceAll('\r\n','\n');
const source=renderHitPreparation(renderHitEffects(renderHitStatus(renderProcWorld(original)))),t=hitLandingTree(source);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-landing-overlay-')),faults=[];
assert.equal(renderHitLanding(original,true),original);
const normal=renderHitLanding(source);assert.equal(renderHitLanding(source.replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),normal);
assert(normal.includes('this.engineHitLanding.land(caster, inst, target, dmgMult, depth, forceDamage, hitEffects, hitOrigin, hitTier, def, extra, packet, rearHit, struckTone, afflictionCarry);'));
assert(normal.includes('private continueLandedHit('));assert.throws(()=>renderHitLanding(normal));
for(const[label,nodes]of [['admission',t.admission],['landing',t.landing.slice(0,18)]])for(let i=0;i<nodes.length;i++){
 const node=nodes[i],text=node.getText(t.ast),space=text.indexOf(' ');assert(space>=0);
 const altered=text.slice(0,space)+' /* changed */'+text.slice(space),input=source.slice(0,node.getStart(t.ast))+altered+source.slice(node.end);
 assert.throws(()=>renderHitLanding(input),e=>e.code==='ERR_ASSERTION',label+'-'+i);faults.push(label+'-'+i);
}
for(const[name,needle]of [['header',t.header],['damage-tail',t.damageTail],['after-tail',t.afterTail],['damage-import',t.damageImport.getText(t.ast)],['perception-import',t.perceptionImport.getText(t.ast)]]){
 const changed=needle.replace(' ',' /* changed */ ');assert(source.includes(needle));assert.throws(()=>renderHitLanding(source.replace(needle,changed)),e=>e.code==='ERR_ASSERTION',name);faults.push(name);
}
for(const symbol of ['engineHitLanding','bindHitLanding','continueLandedHit']){assert.throws(()=>renderHitLanding(source+'\n// '+symbol),/binding collision/);faults.push(symbol+'-collision');}
const game=path.join(directory,'game');fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});
const file=path.join(game,'src/engine/world.ts'),binding=path.join(game,'src/engine/hitLanding.ts'),node=t.landing[4];
fs.writeFileSync(file,source.slice(0,node.getStart(t.ast))+node.getText(t.ast).replace('caster','/* changed */caster')+source.slice(node.end));const before=sha256(fs.readFileSync(file));
assert.throws(()=>integrateHitLanding(game),/Unreviewed landing statement 4/);assert.equal(sha256(fs.readFileSync(file)),before);assert(!fs.existsSync(binding));faults.push('atomic-preflight');
fs.writeFileSync(file,source);fs.writeFileSync(binding,'owned');assert.throws(()=>integrateHitLanding(game),/already exists/);assert.equal(fs.readFileSync(file,'utf8'),source);assert.equal(fs.readFileSync(binding,'utf8'),'owned');faults.push('binding-collision');
const report={passed:true,directory,faults:faults.length,results:faults,lfCrlfEquivalent:true,repeatedInstallRejected:true,continuationTextUnchanged:true};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/hit-landing-overlay-verification.json'),report);console.log(report);
