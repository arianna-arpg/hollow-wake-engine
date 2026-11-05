import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {readVocationFixture} from './vocation-reference.mjs';
import {unlockContentPack} from './compile-unlock-content.mjs';
import {memoryRewardPack} from './compile-memory-rewards.mjs';
import {progressionGatePack} from './compile-progression-gates.mjs';
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
export function prepareUnlockNativeInputs(){
const accepted=read('baseline/unlock-lifecycle/acceptance.json'),repaired=read('baseline/unlock-lifecycle/repairs/acceptance.json');
const capture=read('baseline/unlock-lifecycle/supplement-acceptance.json'),compiled=read('baseline/unlock-lifecycle/compiled-content.json');
const policyBytes=readVocationFixture('policy',accepted.fixtures),policy=JSON.parse(policyBytes);
const transactionBytes=readVocationFixture('transactions',repaired.fixtures),transactions=JSON.parse(transactionBytes);
const contentBytes=readVocationFixture('content',capture.fixtures),source=JSON.parse(contentBytes);
const pack=unlockContentPack(),gates=progressionGatePack(),memories=memoryRewardPack();
for(const [name,data]of [['unlocks',pack],['gates',gates],['memories',memories]]){
 assert.equal(data.contentId,compiled.packs[name].contentId);
 assert.equal(sha256(JSON.stringify(data,null,2)+'\n'),compiled.packs[name].sha256);
}
const directory=fs.mkdtempSync(path.join(root,'.artifacts/unlock-native-inputs-'));
const requests=[],responses=[],names=[];
function append(name,request,response){names.push(name);requests.push(request);responses.push(response);}
for(const row of policy.observations){
 const config=Object.fromEntries(['legacyGemBundles','showDebugCodex','proseRevealFrac'].map(key=>[key,row[key]]));
 append('policy/'+row.name,{op:'profile',name:row.name,before:row.before,view:row.view,config},{result:row,after:row.before});
}
append('metadata',{op:'metadata',classes:policy.milestones.map(row=>row.id),kinds:policy.seats.map(row=>row.kind),lookups:policy.classLookup.map(row=>row.id)},
 {...Object.fromEntries(['definitions','packageRows','objectives','objectiveKeys','levels','milestones','kindOrder','seats','classLookup'].map(key=>[key,policy[key]])),
  levelCache:true,classCaches:policy.milestones.map(()=>true)});
let purchaseOperations=0;
for(const row of transactions.traces){
 append('purchase/'+row.name,{op:'purchase',config:{legacyGemBundles:row.legacy},before:row.steps[0].before.state,definition:row.definition,roll:row.randomValue,
  actions:row.steps.map(step=>({name:step.name,amount:row.requestedAmount}))},row.steps);purchaseOperations+=row.steps.length;
}
for(const row of transactions.masterySteps)for(const step of [row.partial,row.finish,row.repeat]){
 const name=step.name==='partial'?'invest':'apply';
 append('mastery/'+row.definition.id+'/'+step.name,{op:'purchase',before:step.before.state,definition:row.definition,roll:.375,
  actions:[{name,amount:step.name==='partial'?Math.max(0,row.definition.cost-1):undefined}]},[{...step,name}]);purchaseOperations++;
}
let predicateCases=0;
for(const row of source.predicates)for(const observation of row.observations){
 append('predicate/'+row.id+'/'+observation.input.name,{op:'predicate',id:row.id,input:observation.input},{result:observation.result,reads:observation.reads});predicateCases++;
}
for(const row of source.runeObservations)append('rune/'+row.text,{op:'rune',text:row.text,cipher:row.cipher,fractions:row.reveals.map(r=>r.fraction)},
 {cipher:row.cipher,plain:row.plain,reveals:row.reveals});
append('alphabet',{op:'alphabet',letters:source.runeLetters.map(row=>row.letter),runes:source.reverseRunes.map(row=>row.rune)},
 {letters:source.runeLetters,runes:source.reverseRunes});
writeJSON(path.join(directory,'content.json'),{unlocks:pack,gates,memories});
for(const [name,rows]of [['requests',requests],['expected',responses]])fs.writeFileSync(path.join(directory,name+'.jsonl'),rows.map(row=>JSON.stringify(row)).join('\n')+'\n',{flag:'wx'});
writeJSON(path.join(directory,'names.json'),names);
const report={passed:true,directory,requests:requests.length,purchaseOperations,predicateCases,runeReveals:source.runeObservations.reduce((sum,row)=>sum+row.reveals.length,0),
 expectedSha256:sha256(fs.readFileSync(path.join(directory,'expected.jsonl'))),requestSha256:sha256(fs.readFileSync(path.join(directory,'requests.jsonl'))),
 contentSha256:sha256(fs.readFileSync(path.join(directory,'content.json'))),policySha256:sha256(policyBytes),transactionSha256:sha256(transactionBytes),sourceContentSha256:sha256(contentBytes),contentId:pack.contentId};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/unlock-native-inputs-latest.json'),report);return report;
}
