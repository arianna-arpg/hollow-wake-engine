import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {readCatalogue} from './catalogue-tools.mjs';
import {CharacterContinuityContent} from '../dist/character-continuity-content.js';

export function characterContinuityPack() {
  const contract=JSON.parse(fs.readFileSync(path.join(root,'baseline/character-continuity/acceptance.json'))).fixtures.content;
  const bytes=fs.readFileSync(path.join(root,contract.file));
  assert.equal(sha256(bytes),contract.compressedSha256);
  const raw=gunzipSync(bytes);assert.equal(sha256(raw),contract.sha256);
  const source=JSON.parse(raw),tuning=source.mercenary,catalogue=readCatalogue();
  assert.equal(tuning.gemLevelCap,'level=>Math.max(1,Math.ceil(level/5)+1)','Recompile changed cap rules explicitly');
  assert.equal(tuning.passiveBudget,'level=>PROGRESSION.passivePointsAtLevel(level)','Recompile changed passive rules explicitly');
  const keys=table=>new Set(catalogue.tables[table].map(row=>row.id));
  const classes=keys('classes'),skills=keys('skills'),supports=keys('supports');
  assert.deepEqual([...classes].sort(),[...source.classIds].sort());
  const data={schemaVersion:1,capability:'character-continuity/v1',classes:source.classIds,
    starterClasses:source.starters.classes,starterSkills:source.starters.skills,starterSupports:source.starters.supports,
    rewards:source.bundles.map(row=>({classId:row.classId,skillIds:row.skillIds,supportIds:row.supportIds??[]})),legacy:source.legacy,
    mercenary:{anchor:tuning.anchor,trackLevel:tuning.trackLevel,respectGearLevelReq:tuning.respectGearLevelReq,
      gemLevel:{divisor:5,offset:1,minimum:1},passiveBudget:{starting:tuning.startingPassivePoints,perLevel:tuning.passivePointsPerLevel}}};
  for(const id of data.starterSkills)assert(skills.has(id),id);
  for(const id of data.starterSupports)assert(supports.has(id),id);
  for(const row of data.rewards){
    assert(classes.has(row.classId));for(const id of row.skillIds)assert(skills.has(id),id);for(const id of row.supportIds)assert(supports.has(id),id);
    const earned=source.earned.find(e=>e.payload.classId===row.classId);assert(earned);
    assert.deepEqual(earned.payload.skillIds,row.skillIds);assert.deepEqual(earned.payload.supportIds,row.supportIds);
  }
  const pack={...data,contentId:'hollow-wake-character-continuity:sha256:'+sha256(JSON.stringify(data))};
  const policy=new CharacterContinuityContent(pack);
  for(const row of source.curves){assert.equal(policy.gemLevelCap(row.level),row.gemCap);assert.equal(policy.passiveBudget(row.level),row.passiveBudget);}
  return policy.pack;
}
export function buildCharacterContinuity(destination) {
  const pack=characterContinuityPack();fs.mkdirSync(destination,{recursive:true});
  const bytes=JSON.stringify(pack,null,2)+'\n';fs.writeFileSync(path.join(destination,'character.json'),bytes);
  writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/character-continuity',version:'0.1.0',private:true,type:'module',license:'PolyForm-Noncommercial-1.0.0',
    exports:{'./character.json':'./character.json','./manifest.json':'./manifest.json'},files:['character.json','manifest.json','LICENSE.md','NOTICE.md','README.md']});
  writeJSON(path.join(destination,'manifest.json'),{schemaVersion:1,contentId:pack.contentId,capability:pack.capability,sha256:sha256(bytes),bytes:Buffer.byteLength(bytes)});
  for(const name of ['LICENSE.md','NOTICE.md'])fs.copyFileSync(path.join(root,name),path.join(destination,name));
  fs.writeFileSync(path.join(destination,'README.md'),'# Hollow Wake character continuity\n\nValidated starter pools, 36 class reward bundles, and hired-character gem and passive-budget tuning. Class, skill and support IDs are checked against the separate catalogue. Two pinned source policies are translated into explicit data and compared at 4,096 levels. Source text is never evaluated. Load the data once with @hollow-wake/engine/character/content and keep mutable accounts in the host.\n');
  return pack;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const data=buildCharacterContinuity(path.join(root,'.artifacts/character-continuity-content'));
  console.log({classes:data.classes.length,rewards:data.rewards.length,contentId:data.contentId});
}
