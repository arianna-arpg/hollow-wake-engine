import {pathToFileURL} from 'node:url';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {characterBuildPack} from './compile-character-builds.mjs';
import {craftingPack} from './compile-crafting-content.mjs';
import {passivePack} from './compile-passive-content.mjs';
import {equipmentPack} from './compile-item-content.mjs';
import {progressionPack} from './compile-progression-content.mjs';
import {readVocationFixture} from './vocation-reference.mjs';
import {prototypeBuildPack} from './prototype-content.mjs';
import {ItemContent} from '../dist/item-rules.js';
import {revisionInspection} from './compile-revision-inspection.mjs';
export function characterSessionPack(profile){
  const vocations=JSON.parse(readVocationFixture('survey')).config;
  assert(Number.isSafeInteger(vocations.maxPerCharacter),'Missing authored vocation limit');
  const builds=profile?prototypeBuildPack(characterBuildPack(),profile):characterBuildPack();
  const passives=profile?{...profile.runtime.passivePolicy,contentId:'hollow-wake-passives:sha256:'+sha256(JSON.stringify(profile.runtime.passivePolicy))}:passivePack();
  const data={schemaVersion:1,capability:'character-kit/v1',buildContentId:builds.contentId,
    crafting:profile?.previous?craftingPack(new ItemContent(builds.items)):craftingPack(),passives,equipment:equipmentPack(),experience:progressionPack(),
    maxVocations:profile?.runtime.vocationLimit??vocations.maxPerCharacter,memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}};
  return{...data,contentId:'hollow-wake-character-kit:sha256:'+sha256(JSON.stringify(data))};
}
export function buildCharacterSession(destination,profile){
  assert(!fs.existsSync(destination),'Character kit destination already exists');fs.mkdirSync(destination,{recursive:true});
  const pack=characterSessionPack(profile),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
  writeJSON(path.join(destination,'characters.json'),pack);
  fs.copyFileSync(path.join(root,'adapters/embedded/character-session.mjs'),path.join(destination,'index.js'));
  fs.copyFileSync(path.join(root,'adapters/embedded/character-session.d.ts'),path.join(destination,'index.d.ts'));
  fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(destination,'LICENSE.md'));
  writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/characters',version:'0.2.0-candidate.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',
    peerDependencies:{'@hollow-wake/engine':version,'@hollow-wake/character-builds':'0.3.0-candidate.0'},files:['index.js','index.d.ts','characters.json','manifest.json','LICENSE.md'],
    exports:{'.':{types:'./index.d.ts',import:'./index.js'},'./characters.json':'./characters.json','./manifest.json':'./manifest.json'}});
  const names=['index.js','index.d.ts','characters.json'];
  if(profile?.inspection){
    const builds=prototypeBuildPack(characterBuildPack(),profile),data=revisionInspection(builds,profile);
    fs.writeFileSync(path.join(destination,'inspection.json'),JSON.stringify(data)+'\n');
    assert(fs.statSync(path.join(destination,'inspection.json')).size<=3.25*1024*1024,'Inspection text exceeds its separate budget');
    for(const[from,to]of [['inventory-inspection.mjs','inspection.js'],['inventory-inspection.d.ts','inspection.d.ts']])fs.copyFileSync(path.join(root,'adapters/embedded',from),path.join(destination,to));
    const pkg=JSON.parse(fs.readFileSync(path.join(destination,'package.json')));
    pkg.exports['./inspection']={types:'./inspection.d.ts',import:'./inspection.js'};pkg.exports['./inspection.json']='./inspection.json';
    names.push('inspection.js','inspection.d.ts','inspection.json');pkg.files.push('inspection.js','inspection.d.ts','inspection.json');writeJSON(path.join(destination,'package.json'),pkg);
  }
  const files=Object.fromEntries(names.map(name=>{const bytes=fs.readFileSync(path.join(destination,name));return[name,{sha256:sha256(bytes),bytes:bytes.length}];}));
  const manifest={schemaVersion:1,contentId:pack.contentId,sourceCommit:profile?.lock.commit??JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))).commit,files};
  writeJSON(path.join(destination,'manifest.json'),manifest);return{pack,manifest};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  assert(process.argv.length===4&&process.argv[2]==='--out','Use --out <new package directory>');
  const directory=path.resolve(process.argv[3]);console.log({directory,...buildCharacterSession(directory).manifest.files});
}
