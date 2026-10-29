import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {renderStatusActor,renderStatusHelpers,integrateStatusLifecycle,statusTree} from '../adapters/hollow-wake/integrate-status-lifecycle.mjs';
const directory=fs.mkdtempSync(path.join(root,'.artifacts/status-overlay-')),source=fs.readFileSync(path.join(root,'.reference/src/engine/actor.ts'),'utf8'),helpers=fs.readFileSync(path.join(root,'.reference/src/engine/status.ts'),'utf8'),contract=JSON.parse(fs.readFileSync(path.join(root,'adapters/hollow-wake/status-boundary.json'))),results=[];
for(const line of ['\n','\r\n']){const input=source.replaceAll('\r\n','\n').replaceAll('\n',line),output=renderStatusActor(input);assert(output.includes('statusLifecycle.tickStatuses'));assert(output.includes('statusLifecycle.applyStatus'));assert.throws(()=>renderStatusActor(output));const h=renderStatusHelpers(helpers.replaceAll('\r\n','\n').replaceAll('\n',line));assert(h.includes('engineBankFracOf(s, def)'));}
const tree=statusTree(source);for(const name of Object.keys(contract.methods)){const node=tree.member(name),input=tree.input.slice(0,node.body.getStart(tree.ast)+1)+'/*unreviewed*/'+tree.input.slice(node.body.getStart(tree.ast)+1);assert.throws(()=>renderStatusActor(input),/Unreviewed status method/);results.push(name);}
// Reproduce only the two previously accepted status delegates. Their exact
// hashes are separately guarded; other Actor overlays do not touch this boundary.
const tag=tree.member('tagsForbidden');
let prior=tree.input.slice(0,tag.body.getStart(tree.ast))+'{ return sdkSkillAdmission.tagsForbidden(this, inst); }'+tree.input.slice(tag.body.end);
prior=contract.predecessor.import+'\n'+prior;
prior=prior.replace('if (dps > existing.dps) {',"if (id === 'burn') replaceStrongerDot(existing, dps, duration);\n      else if (dps > existing.dps) {");
prior=prior.replace('s.remaining -= STATUS_DEFS[s.id]?.timeScale !== undefined ? chronoDt : dt;',"const burnTick = s.id === 'burn' ? advanceDotFrame(s, dt) : undefined;\n      if (burnTick === undefined) s.remaining -= STATUS_DEFS[s.id]?.timeScale !== undefined ? chronoDt : dt;");
prior=prior.replace('const tick = s.dps * s.stacks * curve * dt;','const tick = burnTick ?? s.dps * s.stacks * curve * dt;');
for(const newline of ['\n','\r\n']){const output=renderStatusActor(prior.replaceAll('\n',newline));assert(!output.includes('advanceDotFrame'));assert(!output.includes('replaceStrongerDot'));assert(output.includes('statusLifecycle.tagsForbidden'));}
assert.throws(()=>renderStatusActor(prior.replace('burnTick ??','burnTick ||')),/Unreviewed status tick/);results.push('prior-burn');
assert.throws(()=>renderStatusActor(prior.replace('sdkSkillAdmission.tagsForbidden(this, inst)','false')),/Unreviewed status method/);results.push('prior-admission');
assert.throws(()=>renderStatusActor(tree.input.replace('s.dps * s.stacks * curve * dt','s.dps * s.stacks * curve * dt * 2')),/Unreviewed status tick/);results.push('tick');
assert.throws(()=>renderStatusActor("const statusLifecycle = {};\n"+source),/collision/);results.push('collision');
assert.throws(()=>renderStatusHelpers(helpers+'\n//unreviewed content\n'),/Unreviewed status definitions/);results.push('content');
const game=path.join(directory,'game');fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});fs.writeFileSync(path.join(game,'src/engine/actor.ts'),source);fs.writeFileSync(path.join(game,'src/engine/status.ts'),helpers+'\n//changed\n');
assert.throws(()=>integrateStatusLifecycle(game),/Unreviewed status definitions/);assert.equal(fs.readFileSync(path.join(game,'src/engine/actor.ts'),'utf8'),source);assert(!fs.existsSync(path.join(game,'src/engine/statusLifecycle.ts')));results.push('atomic-preflight');
fs.writeFileSync(path.join(game,'src/engine/status.ts'),helpers);integrateStatusLifecycle(game);const before=sha256(fs.readFileSync(path.join(game,'src/engine/actor.ts')));assert.throws(()=>integrateStatusLifecycle(game),/already exists/);assert.equal(sha256(fs.readFileSync(path.join(game,'src/engine/actor.ts'))),before);results.push('repeat');
const report={passed:true,directory,faults:results.length,results,lineEndings:['LF','CRLF']};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/status-overlay-verification.json'),report);console.log(report);
