import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {renderDamageFile,integrateDamagePipeline} from '../adapters/hollow-wake/integrate-damage-pipeline.mjs';
const boundary=JSON.parse(fs.readFileSync(path.join(root,'adapters/hollow-wake/damage-boundary.json'))),directory=fs.mkdtempSync(path.join(root,'.artifacts/damage-overlay-')),results=[];
for(const file of Object.keys(boundary.files)){
  const input=fs.readFileSync(path.join(root,'.reference',file),'utf8').replaceAll('\r\n','\n');
  const lf=renderDamageFile(file,input),crlf=renderDamageFile(file,input.replaceAll('\n','\r\n'));
  assert.equal(crlf.replaceAll('\r\n','\n'),lf);assert.throws(()=>renderDamageFile(file,input+'\n// unreviewed\n'),/Unreviewed/);results.push({file,newlines:true,staleRejected:true});
}
for(const broken of [...Object.keys(boundary.files),...Object.keys(boundary.configuration)]){
  const game=fs.mkdtempSync(path.join(directory,'preflight-'));
  const files=[...Object.keys(boundary.files),...Object.keys(boundary.configuration)];
  for(const file of files){fs.mkdirSync(path.dirname(path.join(game,file)),{recursive:true});fs.copyFileSync(path.join(root,'.reference',file),path.join(game,file));}
  fs.appendFileSync(path.join(game,broken),'\n// source changed\n');
  const before=Object.fromEntries(files.map(f=>[f,sha256(fs.readFileSync(path.join(game,f)))]));
  assert.throws(()=>integrateDamagePipeline(game),/Unreviewed/);
  for(const[file,hash]of Object.entries(before))assert.equal(sha256(fs.readFileSync(path.join(game,file))),hash);
  assert(!fs.existsSync(path.join(game,'src/engine/damagePipeline.ts')));results.push({broken,atomicPreflight:true});
}
const report={passed:true,directory,checks:results.length,results};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/damage-overlay-verification.json'),report);console.log(report);
