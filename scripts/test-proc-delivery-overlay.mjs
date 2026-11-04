import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {procDeliveryTree} from '../adapters/hollow-wake/proc-delivery-tree.mjs';
import {integrateProcDelivery, renderProcDelivery} from '../adapters/hollow-wake/integrate-proc-delivery.mjs';
import {installWorldBinding} from '../adapters/hollow-wake/install-world-binding.mjs';
import {procDeliveryFaults, applyProcDeliveryFault} from './proc-delivery-observer-faults.mjs';

fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory = fs.mkdtempSync(path.join(root,'.artifacts/proc-delivery-overlay-'));
const sourceFile = path.join(root,'.reference/src/engine/world.ts');
const original = fs.readFileSync(sourceFile,'utf8').replaceAll('\r\n','\n');
const tree = procDeliveryTree(original), accepted = JSON.parse(fs.readFileSync(path.join(root,'baseline/proc-delivery/acceptance.json')));
const boundary = JSON.parse(fs.readFileSync(path.join(root,accepted.sourceBoundary)));
// Only the acquired dispatcher differs between these two guard fixtures. The
// installed game replay separately verifies the complete real predecessor.
const method = tree.methods.executeProc;
const predecessor = original.slice(0,method.getStart(tree.ast)) + boundary.maps.predecessor.methods.executeProc.text + original.slice(method.end);
assert.equal(renderProcDelivery(original,true),original);
assert.throws(()=>renderProcDelivery(original),/Unreviewed proc dispatcher/);
const rendered = renderProcDelivery(predecessor);
assert.equal(renderProcDelivery(predecessor.replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),rendered);
assert(!rendered.includes('procPowerStat'), 'Last dispatcher use should retire its import');
const retained = ts.createSourceFile('world.ts',renderProcDelivery(predecessor+'\nvoid procPowerStat;\n'),ts.ScriptTarget.Latest,true);
assert(retained.statements.filter(ts.isImportDeclaration).some(decl => {
  const names = decl.importClause?.namedBindings;
  return names && ts.isNamedImports(names) && names.elements.some(n => n.name.text === 'procPowerStat');
}), 'Keep a live import');
const guarded = [];
for (const fault of procDeliveryFaults.filter(f => !['castProcPayload','heldSkillInst'].includes(f[1]))) {
  const changed = applyProcDeliveryFault(tree,fault);
  assert.throws(()=>renderProcDelivery(changed,true), e => e.code === 'ERR_ASSERTION', fault[0]);
  guarded.push(fault[0]);
}
for(const symbol of ['bindProcDelivery','engineProcDelivery']) {
  assert.throws(()=>renderProcDelivery(predecessor+'\n// '+symbol),/binding collision/);
  guarded.push(symbol);
}
const game = path.join(directory,'game'), world = path.join(game,'src/engine/world.ts'), target = path.join(game,'src/engine/procDelivery.ts');
fs.mkdirSync(path.dirname(world),{recursive:true});
fs.writeFileSync(world,original); integrateProcDelivery(game,false);
assert.equal(fs.readFileSync(world,'utf8'),original);assert(!fs.existsSync(target));
fs.writeFileSync(world,predecessor); integrateProcDelivery(game);
assert.equal(fs.readFileSync(world,'utf8'),rendered);
assert(fs.readFileSync(target).equals(fs.readFileSync(path.join(root,'adapters/hollow-wake/procDelivery.ts'))));
assert.throws(()=>integrateProcDelivery(game),/already exists/);
// Fail after the binding is written. A failure must leave the old world and
// no binding/staging residue, then the same installation must be retryable.
const retry = path.join(directory,'retry.ts'), name = path.join(directory,'new.ts');
fs.writeFileSync(retry,'old');
const rename = fs.renameSync;
try {
  fs.renameSync = (from,to) => {if(to===retry)throw Error('injected rename failure');return rename(from,to);};
  assert.throws(()=>installWorldBinding(directory,retry,'old','new',name,'binding'),/injected rename failure/);
} finally {fs.renameSync = rename;}
assert.equal(fs.readFileSync(retry,'utf8'),'old');assert(!fs.existsSync(name));
assert(!fs.readdirSync(directory).some(f=>f.startsWith('.engine-binding-')));
const concurrent=path.join(directory,'concurrent.ts');
try {
  fs.renameSync=(from,to)=>{if(to===retry){fs.writeFileSync(concurrent,'another writer');throw Error('publish conflict');}return rename(from,to);};
  assert.throws(()=>installWorldBinding(directory,retry,'old','new',concurrent,'binding'),/publish conflict/);
}finally{fs.renameSync=rename;}
assert.equal(fs.readFileSync(concurrent,'utf8'),'another writer');assert.equal(fs.readFileSync(retry,'utf8'),'old');
const truncated=path.join(directory,'truncated.ts');
try {
  fs.renameSync=(from,to)=>{if(to===retry){fs.truncateSync(truncated,3);throw Error('concurrent truncation');}return rename(from,to);};
  assert.throws(()=>installWorldBinding(directory,retry,'old','new',truncated,'binding'),/concurrent truncation/);
}finally{fs.renameSync=rename;}
assert.equal(fs.readFileSync(truncated,'utf8'),'bin');
const partial=path.join(directory,'partial.ts'), write=fs.writeSync;
try {
  fs.writeSync=(fd,bytes,offset,length,...rest)=>{
    if(Buffer.isBuffer(bytes)&&bytes.toString()==='binding'){
      if(offset===0)return write(fd,bytes,0,2,...rest);
      throw Error('partial write failure');
    }
    return write(fd,bytes,offset,length,...rest);
  };
  assert.throws(()=>installWorldBinding(directory,retry,'old','new',partial,'binding'),/partial write failure/);
}finally{fs.writeSync=write;}
assert(!fs.existsSync(partial));assert.equal(fs.readFileSync(retry,'utf8'),'old');
assert.throws(()=>installWorldBinding(game,retry,'old','new',name,'binding'),/escapes the selected game/);
assert.throws(()=>installWorldBinding(directory,retry,'stale','new',name,'binding'),/World changed/);
installWorldBinding(directory,retry,'old','new',name,'binding');assert.equal(fs.readFileSync(retry,'utf8'),'new');
assert.equal(sha256(fs.readFileSync(sourceFile,'utf8').replaceAll('\r\n','\n')),sha256(original));
const report = {passed:true,directory,guarded,sourceUnchanged:true,preflightWrites:false,repeatRefused:true,failedInstallRestored:true,concurrentBindingPreserved:true};
writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/proc-delivery-overlay-verification.json',report);
console.log({passed:true,directory,guards:guarded.length});
