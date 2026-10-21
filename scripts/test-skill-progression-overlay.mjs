import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {root,verifyReference,writeJSON} from './reference-utils.mjs';import {skillProgressionFiles,skillProgressionBridges,renderSkillProgression,integrateSkillProgression} from '../adapters/hollow-wake/integrate-skill-progression.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const originals=Object.fromEntries(skillProgressionFiles.map(file=>[file,fs.readFileSync(path.join(reference,file),'utf8').replaceAll('\r\n','\n')])),anchors=['function treeGraph','function treeNodeRefusal','function empowermentRank','function skillMergePlan','function skillLevelAbilityCost','levelUpSkill(skillId: string'],receipts=[];
for(const newline of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/skill-overlay-')),sources=Object.fromEntries(Object.entries(originals).map(([file,s])=>[file,(s+'\n// independent work retained\n').replaceAll('\n',newline)]));
 const reset=()=>{for(const [file,source] of Object.entries(sources)){fs.mkdirSync(path.dirname(path.join(game,file)),{recursive:true});fs.writeFileSync(path.join(game,file),source);}};
 for(let i=0;i<skillProgressionFiles.length;i++){
  reset();const file=skillProgressionFiles[i],at=sources[file].indexOf(anchors[i]);assert(at>=0);const brace=sources[file].indexOf('{',at),changed=sources[file].slice(0,brace+1)+' /* independently owned edit */ '+sources[file].slice(brace+1);fs.writeFileSync(path.join(game,file),changed);
  // treeGraph itself remains a compatibility wrapper; its compiler is the
  // guarded replacement. Alter that owned function for this first case.
  if(i===0){fs.writeFileSync(path.join(game,file),sources[file].replace('function buildGraph(spec: SkillTreeSpec): TreeGraph {','function buildGraph(spec: SkillTreeSpec): TreeGraph { /* independent */'));}
  const before=Object.fromEntries(skillProgressionFiles.map(f=>[f,fs.readFileSync(path.join(game,f),'utf8')]));assert.throws(()=>integrateSkillProgression(game),/Unreviewed/);for(const f of skillProgressionFiles)assert.equal(fs.readFileSync(path.join(game,f),'utf8'),before[f]);for(const f of skillProgressionBridges)assert(!fs.existsSync(path.join(game,f)));
 }
 reset();for(const f of skillProgressionBridges){fs.writeFileSync(path.join(game,f),'independent binding');assert.throws(()=>integrateSkillProgression(game),/overwrite/);fs.unlinkSync(path.join(game,f));}
 integrateSkillProgression(game,false);for(const [f,s] of Object.entries(sources))assert.equal(fs.readFileSync(path.join(game,f),'utf8'),s);
 integrateSkillProgression(game);for(const f of skillProgressionFiles){const s=fs.readFileSync(path.join(game,f),'utf8');assert(s.endsWith(newline+'// independent work retained'+newline));assert.equal(s.includes('\r\n'),newline==='\r\n');}assert.throws(()=>integrateSkillProgression(game),/overwrite/);
 receipts.push({lineEndings:newline==='\n'?'lf':'crlf',sixFilePreflightBeforeWrites:true,unknownOwnedWorkRefused:true,unrelatedWorkPreserved:true,twoBindingCollisionsRefused:true,reapplicationRejected:true});
}
assert.throws(()=>renderSkillProgression('src/engine/world.ts',originals['src/engine/world.ts'].replace('  levelUpSkill(skillId:','  private sdkSkillActions = 1;\n  levelUpSkill(skillId:'),originals['src/engine/world.ts']),/already exists/);
const skillSource=originals['src/engine/skills.ts'];assert.throws(()=>renderSkillProgression('src/engine/skills.ts',skillSource+'\nexport function treeNodeRefusal() { return null; }',skillSource),/Ambiguous/);
const withConsumer=skillSource+'\nexport function independentBudgetRead(inst: SkillInstance) { return treePointBudget(inst); }\n',retained=renderSkillProgression('src/engine/skills.ts',withConsumer,skillSource);
assert(retained.includes('import { treePointBudget }'));assert(retained.endsWith('export function independentBudgetRead(inst: SkillInstance) { return treePointBudget(inst); }\n'));
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/skill-overlay-verification.json'),{receipts,duplicateFunctionsRefused:true,memberCollisionRefused:true});console.log('Skill overlay preserves unrelated edits and preflights all six files and both bindings before writes.');
