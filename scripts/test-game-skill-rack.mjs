import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';

const args=process.argv.slice(2);assert(!args.length||(args.length===2&&args[0]==='--location'));
const loc=JSON.parse(fs.readFileSync(args[1]??path.join(root,'.artifacts/adapter-location.json')));
assert(loc.skillRackDecision,'Prepare an isolated game with skill rack integration first');
const installed=path.join(loc.game,'node_modules/@hollow-wake/engine/dist/skill-rack.js');
assert(fs.readFileSync(installed).equals(fs.readFileSync(path.join(root,'dist/skill-rack.js'))));
assert(fs.readFileSync(path.join(loc.game,'src/meta/character.ts'),'utf8').includes('engineRestoreLearnedSeatIds(save.bar,'));
const expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/skill-rack/observations.json.gz')));
const acceptance=JSON.parse(fs.readFileSync(path.join(root,'baseline/skill-rack/acceptance.json')));
assert.equal(sha256(expected),acceptance.sha256);
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'hwe-rack-')),key=path.basename(scratch);
const observer=path.join(loc.game,'balance',key+'.ts'),fault=path.join(loc.game,'balance',key+'.mjs');
const owned=[];
function create(file,bytes){fs.writeFileSync(file,bytes,{flag:'wx'});owned.push([file,Buffer.from(bytes)]);}
try{
  create(observer,fs.readFileSync(path.join(root,'reference/export-skill-rack.ts')));
  const result=path.join(scratch,'installed.json');
  execFileSync(process.execPath,['--import','tsx',observer,result],{cwd:loc.game,stdio:'inherit',windowsHide:true});
  assert(fs.readFileSync(result).equals(expected),'Installed World differs from the original rack or support path');
  const resume=path.join(loc.game,'balance',key+'-resume.ts');
  create(resume,fs.readFileSync(path.join(root,'reference/export-skill-rack-resume.ts')));
  const restored=path.join(scratch,'restored.json');
  execFileSync(process.execPath,['--import','tsx',resume,restored],{cwd:loc.game,stdio:'inherit',windowsHide:true});
  const saved=path.join(root,'baseline/skill-rack-resume');
  const legacy=gunzipSync(fs.readFileSync(path.join(saved,'observations.json.gz')));
  const resumeProof=JSON.parse(fs.readFileSync(path.join(saved,'acceptance.json')));
  assert.equal(sha256(legacy),resumeProof.sha256);
  assert(fs.readFileSync(restored).equals(legacy),'Saved rack continuation differs from the original character loader');
  // Override the imported class only inside a disposable child process. The
  // package and the game remain usable even if the negative control fails.
  create(fault,`import {SkillRackActions} from '@hollow-wake/engine/skills/rack';
const original=SkillRackActions.prototype.learn;
SkillRackActions.prototype.learn=function(seat,id,slot){
  if(slot===undefined&&seat.meta.items.some(i=>i.uid===id&&i.gem?.skillId==='fireball')&&seat.meta.knownSkills.has('fireball')){
    process.stderr.write('RACK_NEGATIVE_DEFAULT_SLOT\\n');return false;
  }
  return original.call(this,seat,id,slot);
};
`);
  const probe=spawnSync(process.execPath,['--import','tsx','--import',pathToFileURL(fault).href,observer,path.join(scratch,'fault.json')],
    {cwd:loc.game,encoding:'utf8',windowsHide:true,timeout:90000});
  assert(!probe.error&&probe.status===1&&probe.stderr.includes('RACK_NEGATIVE_DEFAULT_SLOT')&&probe.stderr.includes('default-upgrade-uses-known-seat'),
    'The actual game must call the installed rack on a duplicate upgrade');
  const report={passed:true,version:JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,
    corpus:acceptance,resume:resumeProof,exactBytes:true,installedFaultDetected:true,archiveSha256:sha256(fs.readFileSync(loc.archive))};
  writeJSON(path.join(root,'.artifacts/skill-rack-game.json'),report);console.log(report);
}finally{
  for(const [file,bytes] of owned)if(fs.existsSync(file)&&fs.readFileSync(file).equals(bytes))fs.unlinkSync(file);
  assert.equal(path.dirname(fs.realpathSync(scratch)),fs.realpathSync(os.tmpdir()));
  fs.rmSync(scratch,{recursive:true});
}
