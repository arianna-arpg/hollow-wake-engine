import {pathToFileURL} from 'node:url';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {characterBuildPack} from './compile-character-builds.mjs';
import {craftingPack} from './compile-crafting-content.mjs';
import {passivePack} from './compile-passive-content.mjs';
import {equipmentPack} from './compile-item-content.mjs';
import {progressionPack} from './compile-progression-content.mjs';
import {readVocationFixture} from './vocation-reference.mjs';
export function characterSessionPack(){
  const vocations=JSON.parse(readVocationFixture('survey')).config;
  assert(Number.isSafeInteger(vocations.maxPerCharacter),'Missing authored vocation limit');
  const data={schemaVersion:1,capability:'character-kit/v1',buildContentId:characterBuildPack().contentId,
    crafting:craftingPack(),passives:passivePack(),equipment:equipmentPack(),experience:progressionPack(),
    maxVocations:vocations.maxPerCharacter,memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}};
  return{...data,contentId:'hollow-wake-character-kit:sha256:'+sha256(JSON.stringify(data))};
}
export function buildCharacterSession(destination){
  assert(!fs.existsSync(destination),'Character kit destination already exists');fs.mkdirSync(destination,{recursive:true});
  const pack=characterSessionPack(),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
  writeJSON(path.join(destination,'characters.json'),pack);
  fs.copyFileSync(path.join(root,'adapters/embedded/character-session.mjs'),path.join(destination,'index.js'));
  fs.copyFileSync(path.join(root,'adapters/embedded/character-session.d.ts'),path.join(destination,'index.d.ts'));
  fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(destination,'LICENSE.md'));
  writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/characters',version:'0.1.0-candidate.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',
    peerDependencies:{'@hollow-wake/engine':version,'@hollow-wake/character-builds':'0.2.0-candidate.0'},files:['index.js','index.d.ts','characters.json','manifest.json','LICENSE.md'],
    exports:{'.':{types:'./index.d.ts',import:'./index.js'},'./characters.json':'./characters.json','./manifest.json':'./manifest.json'}});
  const files=Object.fromEntries(['index.js','index.d.ts','characters.json'].map(name=>{const bytes=fs.readFileSync(path.join(destination,name));return[name,{sha256:sha256(bytes),bytes:bytes.length}];}));
  const manifest={schemaVersion:1,contentId:pack.contentId,sourceCommit:JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))).commit,files};
  writeJSON(path.join(destination,'manifest.json'),manifest);return{pack,manifest};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  assert(process.argv.length===4&&process.argv[2]==='--out','Use --out <new package directory>');
  const directory=path.resolve(process.argv[3]);console.log({directory,...buildCharacterSession(directory).manifest.files});
}
