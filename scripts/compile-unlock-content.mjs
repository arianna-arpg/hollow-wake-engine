import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
import {progressionGatePack} from './compile-progression-gates.mjs';
import {memoryRewardPack} from './compile-memory-rewards.mjs';
import {compileUnlockPredicate} from './compile-unlock-predicates.mjs';
import {ProgressionGateContent} from '../dist/progression-gate-content.js';
import {MemoryRewardContent} from '../dist/memory-reward-content.js';
import {UnlockContent} from '../dist/unlock-content.js';
import {testUnlockPredicate,validateUnlockPredicate} from '../dist/unlock-predicates.js';

export function unlockContentPack(){
const record=read('baseline/unlock-lifecycle/supplement-acceptance.json').fixtures.content;
const compressed=fs.readFileSync(path.join(root,record.file));assert.equal(sha256(compressed),record.compressedSha256);
const bytes=gunzipSync(compressed);assert.equal(sha256(bytes),record.sha256);const source=JSON.parse(bytes);
// These encoder expressions were reviewed against the pinned original source.
assert.deepEqual(record.encoders,{classBundleId:'(classId:string):string=>`class_${classId}`',resurrectUnlockId:'(charId:string):string=>`resurrect_${charId}`'});
const accepted=read('baseline/unlock-lifecycle/acceptance.json');
const policyBytes=gunzipSync(fs.readFileSync(path.join(root,accepted.fixtures.policy.file)));
assert.equal(sha256(policyBytes),accepted.fixtures.policy.sha256);
const policy=JSON.parse(policyBytes);assert.deepEqual(source.data.catalog,policy.definitions);
const predicates=new Map(source.predicates.map(row=>[row.id,compileUnlockPredicate(row.source)]));
const decode=value=>JSON.parse(JSON.stringify(value),(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length===1&&typeof row.number==='string'?Number(row.number):row);
let predicateCases=0;
for(const row of source.predicates){
 const compiled=predicates.get(row.id);validateUnlockPredicate(compiled);
 for(const observation of row.observations){
  const input=decode(observation.input),reads=[];
  const account={get level(){reads.push('account.level');return input.level;}};
  const ledger=new Proxy(input.ledger,{get(target,key,receiver){if(typeof key==='string')reads.push('ledger.'+key);return Reflect.get(target,key,receiver);}});
  assert.equal(testUnlockPredicate(compiled,{account,ledger}),observation.result,row.id+' '+input.name);
  assert.deepEqual(reads,observation.reads,row.id+' '+input.name+' read order');predicateCases++;
 }
}
const memories=new MemoryRewardContent(memoryRewardPack()),gates=new ProgressionGateContent(progressionGatePack());
const s=source.data;
const keys={classPrefix:s.keySamples.find(r=>r.id==='').classId,resurrectPrefix:s.keySamples.find(r=>r.id==='').resurrectId};
for(const row of s.keySamples){assert.equal(keys.classPrefix+row.id,row.classId);assert.equal(keys.resurrectPrefix+row.id,row.resurrectId);}
const data={schemaVersion:1,capability:'unlock-lifecycle/v1',dependencies:{gates:gates.pack.contentId,memories:memories.pack.contentId},keys,
 catalog:s.catalog,classBundles:s.classBundles.map(({classId,skillIds,supportIds=[]})=>({classId,skillIds,supportIds})),
 classes:s.classes,starterSkills:s.starterSkills,slotTiers:s.slotTiers,tabs:s.tabs,kindLabels:s.kindLabels,shelfConfig:s.shelfConfig,investConfig:s.investConfig,
 classWeb:s.classWeb,memoryConfig:s.memoryConfig,reliquaryFeature:s.reliquaryFeature,
 reliquaryConfig:Object.fromEntries(['maxRank','attunement','costBase','powerPerRank','xpPenaltyPerCell'].map(key=>[key,s.reliquaryConfig[key]])),
 relicStash:s.relicStash,commissionNeed:s.commissionNeed,awakeningRefusal:s.awakeningRefusal,alphabet:s.alphabet,
 packages:s.packages.map(({unlock,tiers,...rest})=>({...rest,
  unlock:{id:unlock.id,label:unlock.label,predicate:predicates.get(unlock.predicateId)},
  tiers:tiers.map(({predicateId,...tier})=>({...tier,predicate:predicates.get(predicateId)}))})),
};
const pack={...data,contentId:'hollow-wake-unlocks:sha256:'+sha256(JSON.stringify(data))};
const content=new UnlockContent(pack,{gates,memories});let runeReveals=0;
for(const row of source.runeObservations){
 assert.equal(content.runes.encipher(row.text),row.cipher);assert.equal(content.runes.decipher(row.cipher),row.plain);
 for(const reveal of row.reveals){assert.equal(content.runes.reveal(row.text,decode(reveal.fraction)),reveal.value,row.text);runeReveals++;}
}
for(const row of source.runeLetters)assert.equal(content.runes.runeOf(row.letter),row.rune);
for(const row of source.reverseRunes)assert.equal(content.runes.runeLetterOf(row.rune),row.letter);
return content.pack;
}

export function buildUnlockContent(destination) {
 const pack=unlockContentPack();
 fs.mkdirSync(destination,{recursive:true});
 const bytes=JSON.stringify(pack,null,2)+'\n';
 fs.writeFileSync(path.join(destination,'unlocks.json'),bytes);
 writeJSON(path.join(destination,'package.json'),{
  name:'@hollow-wake/unlocks',version:'0.1.0',private:true,type:'module',license:'PolyForm-Noncommercial-1.0.0',
  exports:{'./unlocks.json':'./unlocks.json','./manifest.json':'./manifest.json'},files:['unlocks.json','manifest.json','LICENSE.md','NOTICE.md','README.md']});
 writeJSON(path.join(destination,'manifest.json'),{schemaVersion:1,capability:'unlock-lifecycle/v1',contentId:pack.contentId,sha256:sha256(bytes),bytes:Buffer.byteLength(bytes)});
 for(const file of ['LICENSE.md','NOTICE.md'])fs.copyFileSync(path.join(root,file),path.join(destination,file));
 fs.writeFileSync(path.join(destination,'README.md'),"# Hollow Wake unlock content\n\nThe authored unlock catalogue, class bundles, slots, shelves, package prerequisites and rune alphabet. Load once with @hollow-wake/engine/progression/unlock-content and the matching progression-gate and memory-content packs named by dependencies. Create an UnlockLifecycle with content.context(relicServices); the host owns accounts, authority, persistence and item operations. No source expressions are executed at runtime.\n");
 return pack;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const pack=buildUnlockContent(path.join(root,'.artifacts/unlocks-content'));console.log({contentId:pack.contentId});
}
