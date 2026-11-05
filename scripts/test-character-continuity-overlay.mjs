import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
import {integrateCharacterContinuity} from '../adapters/hollow-wake/integrate-character-continuity.mjs';

const reference=path.join(root,'.reference');
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
verifyReference(reference,lock);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/character-continuity-overlay-'));
const files=['src/engine/world.ts','src/meta/account.ts','src/meta/character.ts','src/meta/unlocks.ts'];
const results=[];
for(const scenario of ['install','unreviewed-reward','local-import','second-file-locked','editor-during-rollback','locked-rollback','retry','installer-lock']){
  const game=path.join(directory,scenario);
  for(const file of files){
    const target=path.join(game,file);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(path.join(reference,file),target);
  }
  const paths=files.map(file=>path.join(game,file)),get=()=>paths.map(f=>fs.readFileSync(f));
  const localNote='\n// Local game notes survive the character adapter.\n';
  fs.appendFileSync(paths[0],localNote);
  if(scenario==='unreviewed-reward')fs.writeFileSync(paths[3],fs.readFileSync(paths[3],'utf8').replace('if (STARTER_SKILLS.includes(id) || a.explicitSkillUnlocks.has(id)) return true;', 'if (STARTER_SKILLS.includes(id)) return true;'));
  if(scenario==='local-import')fs.appendFileSync(paths[3],'\nexport const localAccess = isClassUnlocked;\n');
  const before=get(),scratch=path.join(game,'.hollow-wake-character-install');
  if(scenario==='installer-lock'){fs.mkdirSync(scratch);fs.writeFileSync(path.join(scratch,'other'),'retain');}
  if(scenario==='unreviewed-reward'){
    assert.throws(()=>integrateCharacterContinuity(game,false),/Unreviewed continuity method/);
  }else{
    assert.deepEqual(integrateCharacterContinuity(game,false).files,files);
  }
  assert.deepEqual(get(),before);
  const rename=fs.renameSync;
  if(['second-file-locked','editor-during-rollback','locked-rollback','retry'].includes(scenario)){
    fs.renameSync=(source,target)=>{
      if(source.endsWith('1.candidate')){
        if(scenario==='editor-during-rollback')fs.writeFileSync(paths[0],'independent edit');
        throw Error('injected destination lock');
      }
      if(scenario==='locked-rollback'&&source.endsWith('0.original'))throw Error('injected restore lock');
      return rename(source,target);
    };
  }
  try{
    if(['install','local-import'].includes(scenario))integrateCharacterContinuity(game);
    else assert.throws(()=>integrateCharacterContinuity(game));
  }finally{fs.renameSync=rename;}
  if(scenario==='retry'){assert.deepEqual(get(),before);integrateCharacterContinuity(game);}
  if(['install','local-import','retry'].includes(scenario)){
    const after=get();
    assert(after.every((b,i)=>!b.equals(before[i])));
    assert(after[0].toString().endsWith(localNote));assert(!fs.existsSync(scratch));
    if(scenario==='local-import')assert(after[3].toString().includes('STARTER_SKILLS, isClassUnlocked, bossSlainKey'));
    assert.throws(()=>integrateCharacterContinuity(game));assert.deepEqual(get(),after);
  }else if(['editor-during-rollback','locked-rollback'].includes(scenario)){
    assert(fs.readFileSync(path.join(scratch,'0.original')).equals(before[0]));
    assert.deepEqual(get().slice(1),before.slice(1));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(scratch,'sources.json'))),files);
    if(scenario==='editor-during-rollback')assert.equal(fs.readFileSync(paths[0],'utf8'),'independent edit');
  }else{
    assert.deepEqual(get(),before);
    if(scenario==='installer-lock')assert.equal(fs.readFileSync(path.join(scratch,'other'),'utf8'),'retain');
    else assert(!fs.existsSync(scratch));
  }
  results.push(scenario);
}
verifyReference(reference,lock);
writeJSON(path.join(directory,'verification.json'),{passed:true,directory,results,sourceLockSha256:sha256(fs.readFileSync(path.join(root,'baseline/source-lock.json')))});
console.log({passed:true,directory,results});
