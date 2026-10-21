import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {SkillProgression} from '../dist/skill-progression.js';
import {readCatalogue} from './catalogue-tools.mjs';
export function skillProgressionPack(){
 const observed=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-nineteen/skill-progression.json.gz')))),a=observed.authored,trees=new Map(observed.trees.map(row=>[row.id,row.authored]));
 const actions=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-nineteen/skill-actions.json.gz'))));
 assert.deepEqual(actions.authored.essences,a.essences);assert.deepEqual(actions.authored.font,a.font);assert.deepEqual(actions.authored.empowerment,a.empowerment);
 const authoredSkills=new Map(readCatalogue().tables.skills.map(row=>[row.id,row.value]));
 const data={schemaVersion:1,capability:'skill-progression/v1',tuning:{bands:a.bands,supportMaxLevel:a.supportMaxLevel,cost:a.cost,empowerment:{reward:a.empowerment.reward}},layout:a.layout,services:actions.authored,
  skills:a.skills.map(skill=>{const raw=authoredSkills.get(skill.id),tree=trees.get(skill.id);assert.equal(raw.id,skill.id);assert.equal(raw.name,skill.name);if(tree)assert.deepEqual(raw.tree,tree.tree,'Catalogue/tree observation mismatch: '+skill.id);return {...skill,color:raw.color,delivery:{type:raw.delivery.type},...tree};}),supports:a.supports};
 const pack={...data,contentId:'hollow-wake-skill-progression:sha256:'+sha256(JSON.stringify(data))},compiled=new SkillProgression(pack);
 for(const row of observed.curves){assert.equal(compiled.ability.tierForLevel(row.level),row.tier);assert.equal(compiled.ability.pointsAtLevel(row.level),row.points);assert.deepEqual(compiled.ability.skillLevelCost(row.level),row.skillCost);assert.deepEqual(compiled.ability.supportLevelCost(row.level),row.supportCost);}
 return pack;
}
export function buildSkillProgressionContent(destination){
 const pack=skillProgressionPack(),bytes=JSON.stringify(pack)+'\n';fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'skill-progression.json'),bytes);
 writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/skill-progression',version:'0.1.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',files:['skill-progression.json','manifest.json','LICENSE.md','README.md'],exports:{'./skill-progression.json':'./skill-progression.json','./manifest.json':'./manifest.json'}});
 writeJSON(path.join(destination,'manifest.json'),{schemaVersion:1,contentId:pack.contentId,sha256:sha256(bytes),bytes:Buffer.byteLength(bytes),capability:pack.capability,skills:pack.skills.length,supports:pack.supports.length,trees:pack.skills.filter(s=>s.tree).length});
 fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(destination,'LICENSE.md'));
 fs.writeFileSync(path.join(destination,'README.md'),'# Hollow Wake skill progression\n\nContent compiled from pinned original-game observations: all 954 skill caps, 457 support caps and 132 authored trees, with level bands, essence costs and legendary point budgets. Tree payload data is retained for resolution; carrying a payload does not implement its delivery or combat execution. Use the skill progression and tree grant capabilities of @hollow-wake/engine. The host owns live instances, currency, saves, content revisions and execution of resolved effects. No source strings are evaluated.\n');return pack;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const pack=buildSkillProgressionContent(path.join(root,'.artifacts/skill-progression-package'));console.log(JSON.stringify({skills:pack.skills.length,supports:pack.supports.length,trees:pack.skills.filter(s=>s.tree).length,contentId:pack.contentId}));}
