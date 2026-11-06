import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {cargoReference} from '../dist/cargo-display.js';
import {skillProgressionPack} from './compile-skill-progression.mjs';
import {craftingPack} from './compile-crafting-content.mjs';

export function cargoAtlas(skillContentId,craftingContentId){
  const dir=path.join(root,'baseline/cargo-cards');
  const bytes=gunzipSync(fs.readFileSync(path.join(dir,'faces.json.gz')));
  const accepted=JSON.parse(fs.readFileSync(path.join(dir,'acceptance.json')));
  assert.equal(sha256(bytes),accepted.files['faces.json'].sha256);
  const {skills,supports,monsters,kinds,...words}=JSON.parse(bytes);
  const config={schemaVersion:1,skillContentId,craftingContentId,
    kinds:Object.fromEntries(Object.entries(kinds).map(([id,{base,name,color,facets}])=>[id,{base,name,color,facets}])),...words};
  const pages=Array.from({length:32},()=>({skills:Object.create(null),supports:Object.create(null),monsters:Object.create(null)}));
  for(const [table,rows] of Object.entries({skills,supports,monsters})){
    for(const [id,face] of Object.entries(rows)){
      const {page}=cargoReference(table,id);
      // SkillProgression already owns the live empowerment tree.
      if(table==='skills'){const {empowerable,...display}=face;pages[page][table][id]=display;}
      else pages[page][table][id]=face;
    }
  }
  const chunks=pages.map(page=>Buffer.from(JSON.stringify(page)+'\n'));
  let offset=0;
  const index=chunks.map(chunk=>{
    assert(chunk.length<=32*1024,'Display page exceeds the 32 KiB read budget');
    const entry={offset,length:chunk.length,sha256:sha256(chunk)};offset+=chunk.length;return entry;
  });
  const data=Buffer.concat(chunks);
  return {manifest:{format:'cargo-display-pages/v1',config,bytes:data.length,sha256:sha256(data),pages:index},data};
}
export function writeCargoAtlas(directory,skillId,craftId){
  fs.mkdirSync(directory,{recursive:true});
  const {manifest,data}=cargoAtlas(skillId,craftId);
  writeJSON(path.join(directory,'cargo-index.json'),manifest);
  fs.writeFileSync(path.join(directory,'cargo-pages.txt'),data);
  return manifest;
}
export function buildCargoPackage(directory){
  const manifest=writeCargoAtlas(directory,skillProgressionPack().contentId,craftingPack().contentId);
  writeJSON(path.join(directory,'package.json'),{name:'@hollow-wake/cargo-cards',version:'0.1.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',
    files:['cargo-index.json','cargo-pages.txt','LICENSE.md'],exports:{'./index.json':'./cargo-index.json','./pages.txt':'./cargo-pages.txt'}});
  fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(directory,'LICENSE.md'));
  return manifest;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const manifest=buildCargoPackage(path.join(root,'.artifacts/cargo-card-package'));
  console.log({bytes:manifest.bytes,largestPage:Math.max(...manifest.pages.map(p=>p.length)),pages:manifest.pages.length});
}
