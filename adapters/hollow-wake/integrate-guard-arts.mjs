import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';
const files=['src/engine/guardArts.ts','src/engine/guardArtsSpec.ts'];
/** Replace only the reviewed original modules; append-only host extensions and
 * native newlines survive. Both inputs are checked before any file is written. */
export function renderGuardArts(source,original,binding){
 const input=source.replaceAll('\r\n','\n'),clean=original.replaceAll('\r\n','\n');
 assert(!input.includes('@hollow-wake/engine/guard/arts'),'Guard arts adapter already installed');
 assert(input.startsWith(clean),'Unreviewed guard arts module');
 const output=binding.replaceAll('\r\n','\n').trimEnd()+'\n'+input.slice(clean.length);
 return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function guardArtsBindings(){return new Map(files.map(file=>[file,fs.readFileSync(path.join(root,'adapters/hollow-wake',path.basename(file)),'utf8')]));}
export function integrateGuardArts(game,install=true){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),bindings=guardArtsBindings();
 const changes=files.map(file=>{
  const pinned=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(pinned),lock.files[file]);
  const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderGuardArts(before.toString(),pinned.toString(),bindings.get(file)));
  return{file,before,after};
 });
 if(install)installCharacterSources(game,changes);
 return{files,decision:'Guard disciplines, authored patch resolution and value formulas use the optional SDK. The host retains actor graphs, damage application, shared absorb spending, projectile execution, rendering and time/random services.'};
}
