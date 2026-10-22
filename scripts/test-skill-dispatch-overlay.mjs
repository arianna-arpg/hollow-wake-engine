import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {integrate} from '../adapters/hollow-wake/integrate.mjs';
import {integrateChargedCasting} from '../adapters/hollow-wake/integrate-charged-casting.mjs';
import {integrateInteractiveCasting} from '../adapters/hollow-wake/integrate-interactive-casting.mjs';
import {integrateAmmunition} from '../adapters/hollow-wake/integrate-ammunition.mjs';
import {integrateChannelCasting} from '../adapters/hollow-wake/integrate-channel-casting.mjs';
import {integrateSkillRequest} from '../adapters/hollow-wake/integrate-skill-request.mjs';
import {dispatchWorld,dispatchMethod,integrateSkillDispatch,renderDispatchWorld} from '../adapters/hollow-wake/integrate-skill-dispatch.mjs';

const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
verifyReference(reference,lock);
const reconstruction=fs.mkdtempSync(path.join(root,'.artifacts/dispatch-prior-'));
fs.mkdirSync(path.join(reconstruction,'src/engine'),{recursive:true});
for(const file of ['src/engine/actor.ts',dispatchWorld]) fs.copyFileSync(path.join(reference,file),path.join(reconstruction,file));
// Reproduce only the accepted transformations that affect useSkill; no retained
// local installation is required by this portable source guard test.
for(const step of [integrate,integrateChargedCasting,integrateInteractiveCasting,
  integrateAmmunition,integrateChannelCasting,integrateSkillRequest]) step(reconstruction);
const prior=fs.readFileSync(path.join(reconstruction,dispatchWorld),'utf8').replaceAll('\r\n','\n');
const reports=[];
for(const newline of ['\n','\r\n']) {
  const game=fs.mkdtempSync(path.join(root,'.artifacts/dispatch-overlay-'));
  fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});
  const file=path.join(game,dispatchWorld),input=(prior+'\n// preserved unrelated marker\n').replaceAll('\n',newline);
  fs.writeFileSync(file,input); integrateSkillDispatch(game,false); assert.equal(fs.readFileSync(file,'utf8'),input);
  for(const [before,after] of [
    ['st.cur < cost','st.cur <= cost'],
    ['if (!targetInfo?.actor)','if (!targetInfo)'],
    ['caster.useLock = 0.12','caster.useLock = 0.3'],
  ]) {
    assert(input.includes(before)); const changed=input.replace(before,after); fs.writeFileSync(file,changed);
    assert.throws(()=>integrateSkillDispatch(game),/Unreviewed/); assert.equal(fs.readFileSync(file,'utf8'),changed);
  }
  fs.writeFileSync(file,input); integrateSkillDispatch(game);
  const output=fs.readFileSync(file,'utf8'); assert.equal(output.includes('\r\n'),newline==='\r\n');
  assert(output.endsWith(newline+'// preserved unrelated marker'+newline));
  const before=dispatchMethod(input),after=dispatchMethod(output);
  const members=tree=>new Map(tree.world.members.map(n=>[n.name?.getText(tree.ast),n.getText(tree.ast)]));
  const old=members(before),now=members(after);
  for(const [name,text] of old) if(name!=='useSkill') assert.equal(now.get(name),text,'Unrelated World member changed: '+name);
  assert.equal(now.size,old.size+1); assert.equal(after.method.body.statements.length,1);
  assert.throws(()=>integrateSkillDispatch(game),/already integrated/);
  reports.push({newline,dryRunPreserved:true,unreviewedMethodsRefused:true,unrelatedMembersPreserved:old.size-1,duplicateRefused:true});
}
assert.throws(()=>renderDispatchWorld(prior+'\n// sdkSkillDispatch\n'),/collision/);
assert.throws(()=>renderDispatchWorld(fs.readFileSync(path.join(reference,dispatchWorld),'utf8')),/Unreviewed/);
verifyReference(reference,lock);
writeJSON(path.join(root,'.artifacts/skill-dispatch-overlay-verification.json'),{reports,reconstructedFromFrozenOriginal:true});
console.log('Dispatch overlay reproduced the accepted method, refused changed inputs and preserved every unrelated World member.');
