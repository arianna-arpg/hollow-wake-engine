import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {readCatalogue} from './catalogue-tools.mjs';import {CharacterProgression} from '../dist/character-progression.js';
export function progressionPack(){
 const observations=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-eighteen/character-progression.json.gz')))),a=observations.authored;
 const rules=Object.fromEntries(readCatalogue().sourceRules.map(row=>[row.path,row.source]));
 assert.equal(rules['rules/progression/xpForLevel'],'xpForLevel(level){return Math.floor(45*Math.pow(level,1.55))}','Recompile changed XP source explicitly; never evaluate source text');
 assert.equal(rules['rules/progression/passivePointsAtLevel'],'passivePointsAtLevel(level){return this.startingPassivePoints+Math.max(0,level-1)*this.passivePointsPerLevel}','Recompile changed point policy explicitly');
 const {startingPassivePoints,passivePointsPerLevel,lifePerLevel,manaPerLevel}=a;
 const tuning={startingPassivePoints,passivePointsPerLevel,lifePerLevel,manaPerLevel,accuracyPerLevel:4,experience:{scale:45,exponent:1.55}};
 const milestones=[5,100,10,20,30,40,50,60,70,80,90,...a.catalogMilestones].map(level=>({level,key:`reached_level_${level}`}));
 const classes=a.classes.map(row=>({id:row.id,milestones:[...new Set([...a.classMilestones,...row.milestones])].map(level=>({level,key:`class_${row.id}_level_${level}`}))}));
 const data={schemaVersion:1,capability:'character-progression/v1',tuning,milestones,classes},pack={...data,contentId:'hollow-wake-progression:sha256:'+sha256(JSON.stringify(data))},policy=new CharacterProgression(pack);
 for(const row of observations.curves){assert.equal(policy.experienceForLevel(row.level),row.xp);assert.equal(policy.passivePointsAtLevel(row.level),row.points);}
 for(const s of observations.scenarios.filter(s=>s.name.startsWith('class-')))for(const row of s.rows)for(const event of row.events.filter(e=>e.name==='recalcSeat'&&e.phase==='after')){
  const hero=event.state.seats[0];assert.deepEqual(policy.levelModifiers(hero.level),hero.levelMods,'Authored level source changed');
 }
 return pack;
}
export function buildProgressionContent(destination){
 const pack=progressionPack(),bytes=JSON.stringify(pack)+'\n';fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'progression.json'),bytes);
 writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/progression',version:'0.1.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',files:['progression.json','manifest.json','LICENSE.md','README.md'],exports:{'./progression.json':'./progression.json','./manifest.json':'./manifest.json'}});
 writeJSON(path.join(destination,'manifest.json'),{schemaVersion:1,contentId:pack.contentId,sha256:sha256(bytes),bytes:Buffer.byteLength(bytes),capability:pack.capability});fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(destination,'LICENSE.md'));
 fs.writeFileSync(path.join(destination,'README.md'),'# Hollow Wake character progression\n\nValidated XP curve, passive point budget, level stat growth and ordered milestone keys for @hollow-wake/engine/character/progression. Two original executable rules are translated into explicit data and verified across 4096 levels; source strings are never evaluated. Includes all 39 class milestone lists. The host retains identity, multiplayer authority, derived-stat rebuilding, resource pools, presentation and durable saves. Skill/support essence progression and account unlock purchase logic are separate systems.\n');return pack;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const pack=buildProgressionContent(path.join(root,'.artifacts/progression-package'));console.log(JSON.stringify({classes:pack.classes.length,contentId:pack.contentId}));}
