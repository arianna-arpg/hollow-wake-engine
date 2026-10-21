import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {progressionWorld,progressionClasses,progressionBridge,integrateProgression,renderProgressionWorld,renderProgressionClasses} from '../adapters/hollow-wake/integrate-progression.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);const originals=Object.fromEntries([progressionWorld,progressionClasses].map(file=>[file,fs.readFileSync(path.join(reference,file),'utf8').replaceAll('\r\n','\n')])),receipts=[];
for(const newline of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/progression-overlay-')),sources=Object.fromEntries(Object.entries(originals).map(([file,source])=>[file,source.replaceAll('\n',newline)+newline+'// independent work retained'+newline]));
 const reset=()=>{for(const [file,source] of Object.entries(sources)){fs.mkdirSync(path.dirname(path.join(game,file)),{recursive:true});fs.writeFileSync(path.join(game,file),source);}};
 for(const [file,before,after] of [[progressionWorld,'grantXp(amount: number): void {','grantXp(amount: number): void { /* independent owned change */'],[progressionClasses,'xpForLevel(level: number): number {','xpForLevel(level: number): number { /* independent owned change */']]){
  reset();const unknown=sources[file].replace(before,after);assert.notEqual(unknown,sources[file]);fs.writeFileSync(path.join(game,file),unknown);assert.throws(()=>integrateProgression(game),/Unreviewed/);
  for(const [other,source] of Object.entries(sources))assert.equal(fs.readFileSync(path.join(game,other),'utf8'),other===file?unknown:source);assert(!fs.existsSync(path.join(game,progressionBridge)));
 }
 reset();fs.writeFileSync(path.join(game,progressionBridge),'independent binding');assert.throws(()=>integrateProgression(game),/overwrite/);fs.unlinkSync(path.join(game,progressionBridge));
 integrateProgression(game,false);for(const [file,source] of Object.entries(sources))assert.equal(fs.readFileSync(path.join(game,file),'utf8'),source);
 integrateProgression(game);for(const file of Object.keys(sources)){const source=fs.readFileSync(path.join(game,file),'utf8');assert(source.endsWith(newline+'// independent work retained'+newline));assert.equal(source.includes('\r\n'),newline==='\r\n');}assert.throws(()=>integrateProgression(game),/overwrite/);
 receipts.push({lineEndings:newline==='\n'?'lf':'crlf',twoFilePreflightBeforeWrites:true,unknownOwnedWorkRefused:true,unrelatedWorkPreserved:true,bindingCollisionRefused:true,reapplicationRejected:true});
}
const world=originals[progressionWorld],classes=originals[progressionClasses];
assert.throws(()=>renderProgressionWorld(world.replace('  grantXp(amount: number): void {','  grantXp(): void {}\n  grantXp(amount: number): void {'),world),/Ambiguous/);
assert.throws(()=>renderProgressionWorld(world.replace('  grantXp(amount: number): void {','  private sdkProgressionHost = 1;\n  grantXp(amount: number): void {'),world),/already exists/);
assert.throws(()=>renderProgressionClasses(classes.replace('  xpForLevel(level: number): number {','  xpForLevel(): number { return 1; },\n  xpForLevel(level: number): number {'),classes),/Ambiguous/);
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/progression-overlay-verification.json'),{receipts,duplicateMethodsRefused:true,memberCollisionRefused:true});console.log('Progression overlay checks both source files before writes and preserves unrelated work.');
