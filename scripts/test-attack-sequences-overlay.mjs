import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {attackSequenceFiles,renderAttackSequenceFile,integrateAttackSequences} from '../adapters/hollow-wake/integrate-attack-sequences.mjs';import {renderSequenceRecovery} from '../adapters/hollow-wake/integrate-sequence-recovery.mjs';
export function verifyAttackSequencesOverlay(game){
 const sources=Object.fromEntries(attackSequenceFiles.map(file=>[file,fs.readFileSync(path.join(game,file),'utf8')])),directory=fs.mkdtempSync(path.join(root,'.artifacts/attack-sequences-source-')),faults=[];
 for(const[file,source]of Object.entries(sources)){
  const output=renderAttackSequenceFile(file,source);assert.throws(()=>renderAttackSequenceFile(file,output));faults.push(file+':repeat');
  assert.throws(()=>renderAttackSequenceFile(file,source+'\n// unreviewed change\n'));faults.push(file+':changed');
  for(const newline of ['\n','\r\n'])assert.equal(renderAttackSequenceFile(file,source.replaceAll('\r\n','\n').replaceAll('\n',newline)).replaceAll('\r\n','\n'),output.replaceAll('\r\n','\n'));
  const destination=path.join(directory,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,source,{flag:'wx'});
 }
 const changed=attackSequenceFiles[1];fs.appendFileSync(path.join(directory,changed),'\n// rejected\n');const originalFirst=fs.readFileSync(path.join(directory,attackSequenceFiles[0]));assert.throws(()=>integrateAttackSequences(directory));assert(fs.readFileSync(path.join(directory,attackSequenceFiles[0])).equals(originalFirst));faults.push('second-input-rejection-leaves-first-unchanged');
 for(const[file,source]of Object.entries(sources))assert.equal(fs.readFileSync(path.join(game,file),'utf8'),source);
 const report={passed:true,directory,game,rejectedFaults:faults.length,faults,inputUnchanged:true,newlineStyles:2,sourceHashes:Object.fromEntries(Object.entries(sources).map(([file,s])=>[file,sha256(s)]))};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/attack-sequences-overlay.json'),report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);assert(args.length===0||(args.length===2&&args[0]==='--game'));let game=args[1];
 if(!game){game=fs.mkdtempSync(path.join(root,'.artifacts/attack-sequences-source-input-'));for(const file of attackSequenceFiles){let source=fs.readFileSync(path.join(root,'.reference',file),'utf8');if(file.endsWith('/attackSequences.ts'))source=renderSequenceRecovery(source);const to=path.join(game,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,source);}}
 const report=verifyAttackSequencesOverlay(path.resolve(game));console.log({passed:true,faults:report.rejectedFaults,directory:report.directory});
}
