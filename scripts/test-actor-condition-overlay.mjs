import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {renderGaugeActor} from '../adapters/hollow-wake/integrate-channel-banks.mjs';
import {conditionPaths,conditionTree,integrateActorConditions} from '../adapters/hollow-wake/integrate-actor-conditions.mjs';
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),reference=path.join(root,'.reference');verifyReference(reference,lock);
// Prior adapter changes inside other Actor members do not touch this boundary.
const base=renderGaugeActor(fs.readFileSync(path.join(reference,conditionPaths.actor),'utf8'));
const reports=[];
for(const ending of ['\n','\r\n']){
  const game=fs.mkdtempSync(path.join(root,'.artifacts/condition-overlay-'));fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});
  const file=path.join(game,conditionPaths.actor),binding=path.join(game,conditionPaths.binding),source=(base+'\n// unrelated condition test marker\n').replaceAll('\n',ending);
  fs.writeFileSync(file,source);integrateActorConditions(game,false);assert.equal(fs.readFileSync(file,'utf8'),source);assert(!fs.existsSync(binding));
  for(const [before,after]of [['this.life < maxLife','this.life <= maxLife'],['this.condMask !== -1','this.condMask !== 0'],['private condMask = -1;','private condMask = 0;'],['this.strideDist = 0; this.strideSpent = false;','this.strideDist = 1; this.strideSpent = false;']]){
    assert(source.includes(before));const changed=source.replace(before,after);fs.writeFileSync(file,changed);assert.throws(()=>integrateActorConditions(game),/Unreviewed/);assert.equal(fs.readFileSync(file,'utf8'),changed);assert(!fs.existsSync(binding));fs.writeFileSync(file,source);
  }
  for(const access of ['a.condMask','a["condSheet"]']){
    const changed=source+'\nfunction foreign(a:Actor){return '+access+';}\n';fs.writeFileSync(file,changed);assert.throws(()=>integrateActorConditions(game),/Unreviewed condition state caller/);assert.equal(fs.readFileSync(file,'utf8'),changed);assert(!fs.existsSync(binding));fs.writeFileSync(file,source);
  }
  fs.writeFileSync(binding,'host-owned existing binding');assert.throws(()=>integrateActorConditions(game),/already exists/);assert.equal(fs.readFileSync(file,'utf8'),source);fs.unlinkSync(binding);
  integrateActorConditions(game);const output=fs.readFileSync(file,'utf8');assert.equal(output.includes('\r\n'),ending==='\r\n');assert(output.endsWith(ending+'// unrelated condition test marker'+ending));
  const members=text=>{const t=conditionTree(text.replaceAll('\r\n','\n'));return new Map(t.type.members.map(n=>[n.name?.getText(t.ast),n.getText(t.ast)]));};
  const before=members(source),after=members(output);assert.equal(before.size,after.size);
  for(const [name,text]of before)if(!['condMask','condSheet','refreshConditions','conditionHolds'].includes(name))assert.equal(after.get(name),text,'Unrelated member: '+name);
  assert.throws(()=>integrateActorConditions(game),/already integrated/);
  reports.push({ending,dryRunPreserved:true,sourceFaultsRejected:6,collisionRejectedBeforeWrites:true,unrelatedMembersPreserved:true,duplicateRejected:true});
}
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/actor-condition-overlay-verification.json'),{reports,originalUnchanged:true});
console.log('Condition overlay preserves unrelated Actor members and timer phases in both newline styles; twelve source faults and both collisions refused.');
