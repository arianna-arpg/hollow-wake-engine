import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {integrate} from '../adapters/hollow-wake/integrate.mjs';
import {integrateChargedCasting} from '../adapters/hollow-wake/integrate-charged-casting.mjs';
import {integrateInteractiveCasting} from '../adapters/hollow-wake/integrate-interactive-casting.mjs';
import {integrateChannelCasting} from '../adapters/hollow-wake/integrate-channel-casting.mjs';
import {integrateGuardCasting} from '../adapters/hollow-wake/integrate-guard-casting.mjs';
import {continuationWorld,continuationMethods,renderContinuationWorld,integrateCastingContinuation}
  from '../adapters/hollow-wake/integrate-casting-continuation.mjs';

const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
verifyReference(reference,lock);
const reconstruction=fs.mkdtempSync(path.join(root,'.artifacts/continuation-prior-'));
fs.mkdirSync(path.join(reconstruction,'src/engine'),{recursive:true});
for(const file of ['src/engine/actor.ts','src/engine/skills.ts',continuationWorld])fs.copyFileSync(path.join(reference,file),path.join(reconstruction,file));
for(const step of [integrate,integrateChargedCasting,integrateInteractiveCasting,integrateChannelCasting,integrateGuardCasting])step(reconstruction);
const prior=fs.readFileSync(path.join(reconstruction,continuationWorld),'utf8').replaceAll('\r\n','\n');
const reports=[];
for(const newline of ['\n','\r\n']) {
  const game=fs.mkdtempSync(path.join(root,'.artifacts/continuation-overlay-'));
  fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});
  const file=path.join(game,continuationWorld),input=(prior+'\n// preserved unrelated continuation marker\n').replaceAll('\n',newline);
  fs.writeFileSync(file,input);integrateCastingContinuation(game,false);assert.equal(fs.readFileSync(file,'utf8'),input);
  for(const [name,before,after] of [
    ['updateCasting',"if (cs.mode === 'guard') this.guardArts.lower(a, cs.inst);",'/* missing guard lowering */'],
    ['castPress','this.markSeatActed(caster);','/* missing click activity */'],
    ['updateCasting','cs.losLost >= LOS_CFG.channelGrace','cs.losLost > LOS_CFG.channelGrace'],
  ]) {
    const tree=continuationMethods(input),method=tree.methods[name],text=method.getText(tree.ast);
    assert.equal(text.split(before).length,2);
    const changed=input.slice(0,method.getStart(tree.ast))+text.replace(before,after)+input.slice(method.end);
    fs.writeFileSync(file,changed);
    assert.throws(()=>integrateCastingContinuation(game),/Unreviewed/);assert.equal(fs.readFileSync(file,'utf8'),changed);
  }
  fs.writeFileSync(file,input);integrateCastingContinuation(game);
  const output=fs.readFileSync(file,'utf8');assert.equal(output.includes('\r\n'),newline==='\r\n');
  assert(output.endsWith(newline+'// preserved unrelated continuation marker'+newline));
  const before=continuationMethods(input),after=continuationMethods(output);
  const members=tree=>new Map(tree.world.members.map(n=>[n.name?.getText(tree.ast),n.getText(tree.ast)]));
  const old=members(before),now=members(after);
  for(const [name,text]of old)if(!['updateCasting','castPress'].includes(name))assert.equal(now.get(name),text,'Unrelated member changed: '+name);
  assert.equal(now.size,old.size+1);
  assert.equal(after.methods.updateCasting.body.statements.length,2);
  assert.equal(after.methods.castPress.body.statements.length,1);
  assert.throws(()=>integrateCastingContinuation(game),/already integrated/);
  reports.push({newline,dryRunPreserved:true,changedMethodsRefused:true,unrelatedMembersPreserved:old.size-2,duplicateRefused:true});
}
assert.throws(()=>renderContinuationWorld(prior+'\n// sdkCastingContinuation\n'),/collision/);
assert.throws(()=>renderContinuationWorld(fs.readFileSync(path.join(reference,continuationWorld),'utf8')),/Unreviewed/);
verifyReference(reference,lock);
writeJSON(path.join(root,'.artifacts/casting-continuation-overlay-verification.json'),{reports,reconstructedFromFrozenOriginal:true});
console.log('Continuation overlay reproduced both accepted methods and preserved unrelated members in both newline styles.');
