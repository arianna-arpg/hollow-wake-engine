import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';import {containerFiles,integrateContainers} from '../adapters/hollow-wake/integrate-containers.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);const receipts=[];
for(const newline of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/container-overlay-')),sources={};
 for(const file of containerFiles){const target=path.join(game,file);fs.mkdirSync(path.dirname(target),{recursive:true});sources[file]=fs.readFileSync(path.join(reference,file),'utf8').replaceAll('\r\n','\n').replaceAll('\n',newline);fs.writeFileSync(target,sources[file]);}
 const final=containerFiles.at(-1);fs.appendFileSync(path.join(game,final),'// independent work'+newline);assert.throws(()=>integrateContainers(game),/Unreviewed/);
 for(const file of containerFiles)assert.equal(fs.readFileSync(path.join(game,file),'utf8'),sources[file]+(file===final?'// independent work'+newline:''));
 fs.writeFileSync(path.join(game,final),sources[final]);integrateContainers(game,false);for(const file of containerFiles)assert.equal(fs.readFileSync(path.join(game,file),'utf8'),sources[file]);
 integrateContainers(game);for(const file of containerFiles)assert.equal(fs.readFileSync(path.join(game,file),'utf8').includes('\r\n'),newline==='\r\n');assert.throws(()=>integrateContainers(game),/Unreviewed/);
 receipts.push({lineEndings:newline==='\n'?'lf':'crlf',allFourSourcesCheckedBeforeWrites:true,unknownWorkRefused:true,reapplicationRejected:true});
}
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/container-overlay-verification.json'),{receipts});console.log('Four-file container overlay preserves line endings and preflights all sources before writes.');
