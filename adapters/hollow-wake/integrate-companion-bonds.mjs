import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';
const files=['src/engine/companionBonds.ts','src/engine/companionSpec.ts','src/engine/minionInheritance.ts','src/engine/bequests.ts'];
/** All four reviewed inputs must match before any module is installed. */
export function renderCompanionBonds(source,original,binding){
 const input=source.replaceAll('\r\n','\n'),clean=original.replaceAll('\r\n','\n');
 assert(!input.includes('@hollow-wake/engine/companions/bonds')&&!input.includes('@hollow-wake/engine/minions/'),'Companion bonds adapter already installed');
 assert(input.startsWith(clean),'Unreviewed companion bonds module');
 const output=binding.replaceAll('\r\n','\n').trimEnd()+'\n'+input.slice(clean.length);
 return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function companionBondsBindings(){return new Map(files.map(file=>[file,fs.readFileSync(path.join(root,'adapters/hollow-wake',path.basename(file)),'utf8')]));}
export function integrateCompanionBonds(game,install=true){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),bindings=companionBondsBindings();
 const changes=files.map(file=>{
  const pinned=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(pinned),lock.files[file]);
  const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderCompanionBonds(before.toString(),pinned.toString(),bindings.get(file)));
  return{file,before,after};
 });
 if(install)installCharacterSources(game,changes);
 return{files,decision:'Bond lifecycles, rule resolution, minion inheritance and attribute bequests use optional SDK modules. Host body execution, AI conduct, cues, queues, stats and world services remain explicit adapter responsibilities.'};
}
