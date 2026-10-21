import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {root,verifyReference,writeJSON} from './reference-utils.mjs';import {supportFiles,supportBridges,renderSupports,integrateSupports} from '../adapters/hollow-wake/integrate-supports.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const originals=Object.fromEntries(supportFiles.map(file=>[file,fs.readFileSync(path.join(reference,file),'utf8').replaceAll('\r\n','\n')])),anchors=['function hostSockets','function rollVein','socketSupport(uid: number'],receipts=[];
for(const newline of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/support-overlay-')),sources=Object.fromEntries(Object.entries(originals).map(([file,s])=>[file,(s+'\n// independent work retained\n').replaceAll('\n',newline)]));
 const reset=()=>{for(const [file,source] of Object.entries(sources)){fs.mkdirSync(path.dirname(path.join(game,file)),{recursive:true});fs.writeFileSync(path.join(game,file),source);}};
 for(let i=0;i<supportFiles.length;i++){
  reset();const file=supportFiles[i],at=sources[file].indexOf(anchors[i]);assert(at>=0);const brace=sources[file].indexOf('{',at),changed=sources[file].slice(0,brace+1)+' /* independently owned edit */ '+sources[file].slice(brace+1);fs.writeFileSync(path.join(game,file),changed);
  const before=Object.fromEntries(supportFiles.map(f=>[f,fs.readFileSync(path.join(game,f),'utf8')]));assert.throws(()=>integrateSupports(game),/Unreviewed/);for(const f of supportFiles)assert.equal(fs.readFileSync(path.join(game,f),'utf8'),before[f]);for(const f of supportBridges)assert(!fs.existsSync(path.join(game,f)));
 }
 reset();for(const f of supportBridges){fs.writeFileSync(path.join(game,f),'independent binding');assert.throws(()=>integrateSupports(game),/overwrite/);fs.unlinkSync(path.join(game,f));}
 integrateSupports(game,false);for(const [f,s] of Object.entries(sources))assert.equal(fs.readFileSync(path.join(game,f),'utf8'),s);
 integrateSupports(game);for(const f of supportFiles){const s=fs.readFileSync(path.join(game,f),'utf8');assert(s.endsWith(newline+'// independent work retained'+newline));assert.equal(s.includes('\r\n'),newline==='\r\n');}assert.throws(()=>integrateSupports(game),/overwrite/);
 receipts.push({lineEndings:newline==='\n'?'lf':'crlf',threeFilePreflightBeforeWrites:true,unknownOwnedWorkRefused:true,unrelatedWorkPreserved:true,twoBindingCollisionsRefused:true,reapplicationRejected:true});
}
const world=originals['src/engine/world.ts'];assert.throws(()=>renderSupports('src/engine/world.ts',world.replace('  socketSupport(uid:','  private sdkSupportActions = 1;\n  socketSupport(uid:'),world),/already exists/);
const skills=originals['src/engine/skills.ts'];assert.throws(()=>renderSupports('src/engine/skills.ts',skills+'\nexport function hostSockets() { return []; }',skills),/Ambiguous/);
const independent='\nexport function independentRead(inst: SkillInstance) { return attackSequenceOf(inst); }\n',retained=renderSupports('src/engine/skills.ts',skills+independent,skills);assert(/import\s*\{[^}]*\battackSequenceOf\b/.test(retained));assert(retained.endsWith(independent));
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/support-overlay-verification.json'),{receipts,duplicateFunctionsRefused:true,memberCollisionRefused:true,independentImportRetained:true});console.log('Support overlay preflights three files and two bindings, and preserves unrelated edits.');
