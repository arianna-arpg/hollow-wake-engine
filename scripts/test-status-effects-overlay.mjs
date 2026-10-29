import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {statusEffectsTree} from '../adapters/hollow-wake/status-effects-tree.mjs';
import {renderStatusEffects,renderStatusVoiceProbe,integrateStatusEffects} from '../adapters/hollow-wake/integrate-status-effects.mjs';
const source=fs.readFileSync(path.join(root,'.reference/src/engine/world.ts'),'utf8').replaceAll('\r\n','\n');
const directory=fs.mkdtempSync(path.join(root,'.artifacts/status-effects-overlay-')),t=statusEffectsTree(source),faults=[];
const normal=renderStatusEffects(source);assert.match(normal,/engineStatusEffects\.propagateDeathStatuses/);assert.match(normal,/engineStatusEffects\.applyProcStatus/);
assert.equal(renderStatusEffects(source.replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),normal);
assert.throws(()=>renderStatusEffects(normal));
for(const[name,node]of Object.entries({...t.methods,...t.phases})){
 const text=node.getText(t.ast),bad=text.replace('(','(/* unreviewed */');assert.notEqual(text,bad);
 const input=source.slice(0,node.getStart(t.ast))+bad+source.slice(node.end);assert.throws(()=>renderStatusEffects(input),/Unreviewed status effect source/);faults.push(name);
}
const game=path.join(directory,'preflight');fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});const file=path.join(game,'src/engine/world.ts');
fs.writeFileSync(file,source.replace('private transplantStatus(','private transplantStatus(/* unreviewed */'));const before=sha256(fs.readFileSync(file));assert.throws(()=>integrateStatusEffects(game),/Unreviewed/);assert.equal(sha256(fs.readFileSync(file)),before);assert(!fs.existsSync(path.join(game,'src/engine/statusEffects.ts')));faults.push('atomic-preflight');
const probe=fs.readFileSync(path.join(root,'.reference/balance/probe_statusvoice.ts'),'utf8').replaceAll('\r\n','\n');assert.equal(renderStatusVoiceProbe(probe.replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),renderStatusVoiceProbe(probe));
fs.mkdirSync(path.join(game,'balance'));fs.writeFileSync(path.join(game,'balance/probe_statusvoice.ts'),probe+'\n// unreviewed\n');fs.writeFileSync(file,source);assert.throws(()=>integrateStatusEffects(game),/Unreviewed status voice probe/);assert.equal(fs.readFileSync(file,'utf8'),source);assert(!fs.existsSync(path.join(game,'src/engine/statusEffects.ts')));faults.push('probe-atomic-preflight');
fs.writeFileSync(file,source);fs.writeFileSync(path.join(game,'src/engine/statusEffects.ts'),'owned');assert.throws(()=>integrateStatusEffects(game),/already exists/);assert.equal(fs.readFileSync(file,'utf8'),source);faults.push('binding-collision');
const report={passed:true,directory,faults: faults.length,results:faults,lfCrlfEquivalent:true,repeatedInstallRejected:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/status-effects-overlay-verification.json'),report);console.log(report);
