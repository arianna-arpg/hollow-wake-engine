import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
import {renderCharacterSource} from '../adapters/hollow-wake/integrate-character-rules.mjs';
import {renderCharacterContinuity} from '../adapters/hollow-wake/integrate-character-continuity.mjs';
import {integrateUnlockLifecycle,renderUnlockLifecycle} from '../adapters/hollow-wake/integrate-unlock-lifecycle.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync('baseline/source-lock.json'));verifyReference(reference,lock);
const original=fs.readFileSync(path.join(reference,'src/meta/unlocks.ts'),'utf8').replaceAll('\r\n','\n');
const memory=fs.readFileSync(path.join(reference,'src/meta/memoryUnlocks.ts'),'utf8').replaceAll('\r\n','\n');
const directory=fs.mkdtempSync(path.join(root,'.artifacts/unlock-overlay-')),results=[];
const success=['original','classes','continuity','both','crlf','private-helper','prior-port','local-import','retry'];
for(const scenario of [...success,'changed-unlock','changed-memory','collision','second-rename','second-editor','installer-lock']){
 const game=path.join(directory,scenario),files=['src/meta/unlocks.ts','src/meta/memoryUnlocks.ts'].map(file=>path.join(game,file));
 fs.mkdirSync(path.dirname(files[0]),{recursive:true});
 let source=original,second=memory;
 if(['classes','both','prior-port'].includes(scenario))source=renderCharacterSource('meta/unlocks.ts',source);
 if(['continuity','both'].includes(scenario))source=renderCharacterContinuity('meta/unlocks.ts',source);
 source+='\n// Independent host note.\n';
 if(scenario==='private-helper')source+='\nexport const localGate = structuralPrereqsMet;\n';
 if(scenario==='prior-port')source+='\nexport const localClaims = engineClaimPorts;\n';
 if(scenario==='local-import')source+='\nexport const localGateRead = gateRowMet;\nimport {newLocalThing} from "./local-host-extension";\n';
 if(scenario==='changed-unlock')source=source.replace('function availableUnlocks(a: Account): Unlockable[] {','function availableUnlocks(a: Account): Unlockable[] { void 1;');
 if(scenario==='changed-memory')second=second.replace('roll >= 1','roll > 1');
 if(scenario==='collision')source+='\nconst engineUnlocks = {};\n';
 if(scenario==='crlf'){source=source.replaceAll('\n','\r\n');second=second.replaceAll('\n','\r\n');}
 fs.writeFileSync(files[0],source);fs.writeFileSync(files[1],second);
 const before=files.map(file=>fs.readFileSync(file)),scratch=path.join(game,'.hollow-wake-character-install');
 const read=()=>files.map(file=>fs.readFileSync(file));
 if(scenario==='installer-lock'){fs.mkdirSync(scratch);fs.writeFileSync(path.join(scratch,'other-installer'),'retain');}
 if(['changed-unlock','changed-memory','collision'].includes(scenario))assert.throws(()=>integrateUnlockLifecycle(game,false));
 else assert.equal(integrateUnlockLifecycle(game,false).files.length,2);
 assert.deepEqual(read(),before);
 const rename=fs.renameSync,write=fs.writeFileSync;
 if(['second-rename','retry'].includes(scenario))fs.renameSync=(from,...args)=>{if(String(from).endsWith('1.candidate'))throw new Error('Injected second destination lock');return rename(from,...args);};
 if(scenario==='second-editor')fs.writeFileSync=(file,...args)=>{const result=write(file,...args);if(String(file).endsWith('1.candidate'))write(files[1],'Independent concurrent edit');return result;};
 try{if(success.includes(scenario)&&scenario!=='retry')integrateUnlockLifecycle(game);else assert.throws(()=>integrateUnlockLifecycle(game));}
 finally{fs.renameSync=rename;fs.writeFileSync=write;}
 if(scenario==='retry'){assert.deepEqual(read(),before);integrateUnlockLifecycle(game);}
 if(success.includes(scenario)){
  const after=read(),text=after[0].toString();assert(after.every((bytes,i)=>!bytes.equals(before[i])));
  assert(text.includes('// Independent host note.'));assert(text.includes('@hollow-wake/engine/progression/unlocks'));
  assert.equal(text.includes('function structuralPrereqsMet'),scenario==='private-helper');
  assert.equal(text.includes('const engineClaimPorts'),['classes','both','prior-port'].includes(scenario));
  if(['classes','both','prior-port'].includes(scenario))assert(text.includes('return engineClaims.pendingClassClaims('));
  if(['continuity','both'].includes(scenario))assert(text.includes('engineClassRewards.reconcileClassRewards(')&&text.includes('engineClassRewards.isSelectableClassSkill('));
  if(scenario==='prior-port')assert(text.includes('function grantUnlock'));
  if(scenario==='local-import')assert(text.includes('newLocalThing')&&text.includes('gateRowMet'));
  if(scenario==='crlf')assert(after.every(bytes=>!/(?<!\r)\n/.test(bytes.toString())));
  assert.throws(()=>integrateUnlockLifecycle(game));assert.deepEqual(read(),after);
 }else if(scenario==='second-editor'){
  assert(fs.readFileSync(files[0]).equals(before[0]));assert.equal(fs.readFileSync(files[1],'utf8'),'Independent concurrent edit');
 }else assert.deepEqual(read(),before);
 if(scenario==='installer-lock')assert.equal(fs.readFileSync(path.join(scratch,'other-installer'),'utf8'),'retain');else assert(!fs.existsSync(scratch));
 results.push(scenario);
}
const names=JSON.parse(fs.readFileSync('baseline/unlock-lifecycle/adapter-source-guards.json')).names,ast=ts.createSourceFile('unlocks.ts',original,ts.ScriptTarget.Latest,true);
for(const name of names){
 const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(node);
 const index=node.body.getStart(ast)+1,changed=original.slice(0,index)+' void 1;'+original.slice(index);
 assert.throws(()=>renderUnlockLifecycle(changed),/Unreviewed unlock method/);
}
verifyReference(reference,lock);
const report={passed:true,directory,scenarios:results,guardedMethods:names.length,adapterSha256:sha256(fs.readFileSync('adapters/hollow-wake/integrate-unlock-lifecycle.mjs'))};
writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/unlock-overlay-latest.json',report);console.log(report);
