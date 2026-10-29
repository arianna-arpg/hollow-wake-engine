import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {hitStatusTree} from '../adapters/hollow-wake/hit-status-tree.mjs';
import {renderHitStatus,integrateHitStatus} from '../adapters/hollow-wake/integrate-hit-status.mjs';

const source=fs.readFileSync(path.join(root,'.reference/src/engine/world.ts'),'utf8').replaceAll('\r\n','\n');
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-status-overlay-'));
const tree=hitStatusTree(source),faults=[];
const normal=renderHitStatus(source);
assert(normal.includes('bindHitStatuses(this, () => STATUS_IDS)'));
assert.equal(normal.split('const STATUS_IDS = Object.keys(STATUS_DEFS);').length-1,1,'Keep original vocabulary initialization');
for(const method of ['prepare','applyRiders','applyAuthored','applyGranted','dischargeOnHit','plantImpale'])assert(normal.includes('this.engineHitStatuses.'+method+'('));
assert.equal(renderHitStatus(source.replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),normal);
assert.throws(()=>renderHitStatus(normal));
for(const[name,node]of Object.entries({...tree.prepare,...tree.phases})){
  const original=node.getText(tree.ast),changed=original.replace(' ',' /* unreviewed */ ');
  assert.notEqual(original,changed,name);
  const input=source.slice(0,node.getStart(tree.ast))+changed+source.slice(node.end);
  assert.throws(()=>renderHitStatus(input),error=>error.code==='ERR_ASSERTION',name);
  faults.push(name);
}
const game=path.join(directory,'preflight');fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});
const file=path.join(game,'src/engine/world.ts'),binding=path.join(game,'src/engine/hitStatuses.ts');
fs.writeFileSync(file,source.replace('const stacksBonusFor =','const /* unreviewed */ stacksBonusFor ='));
assert.notEqual(fs.readFileSync(file,'utf8'),source);
const before=sha256(fs.readFileSync(file));assert.throws(()=>integrateHitStatus(game),/Unreviewed/);
assert.equal(sha256(fs.readFileSync(file)),before);assert(!fs.existsSync(binding));faults.push('atomic-preflight');
fs.writeFileSync(file,source);fs.writeFileSync(binding,'owned');
assert.throws(()=>integrateHitStatus(game),/already exists/);assert.equal(fs.readFileSync(file,'utf8'),source);assert.equal(fs.readFileSync(binding,'utf8'),'owned');faults.push('binding-collision');
for(const symbol of ['engineHitStatuses','bindHitStatuses','hitStatusFrame']){
  assert.throws(()=>renderHitStatus(source+'\n// '+symbol),/binding collision/);faults.push(symbol+'-collision');
}
const report={passed:true,directory,faults:faults.length,results:faults,lfCrlfEquivalent:true,repeatedInstallRejected:true};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/hit-status-overlay-verification.json'),report);console.log(report);
