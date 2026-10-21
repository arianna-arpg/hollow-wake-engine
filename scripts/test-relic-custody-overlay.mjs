import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';import {relicCustodyFiles,relicRuntimeFile,integrateRelicCustody} from '../adapters/hollow-wake/integrate-relic-custody.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);const receipts=[];
for(const newline of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/relic-overlay-')),sources={};
 for(const file of relicCustodyFiles){const target=path.join(game,file);fs.mkdirSync(path.dirname(target),{recursive:true});sources[file]=fs.readFileSync(path.join(reference,file),'utf8').replaceAll('\r\n','\n').replaceAll('\n',newline);fs.writeFileSync(target,sources[file]);}
 const final=relicCustodyFiles.at(-1);fs.appendFileSync(path.join(game,final),'// independent work'+newline);assert.throws(()=>integrateRelicCustody(game),/Unreviewed/);
 for(const file of relicCustodyFiles)assert.equal(fs.readFileSync(path.join(game,file),'utf8'),sources[file]+(file===final?'// independent work'+newline:''));
 assert(!fs.existsSync(path.join(game,relicRuntimeFile)));fs.writeFileSync(path.join(game,final),sources[final]);
 fs.writeFileSync(path.join(game,relicRuntimeFile),'independent host binding');assert.throws(()=>integrateRelicCustody(game),/overwrite/);fs.unlinkSync(path.join(game,relicRuntimeFile));
 integrateRelicCustody(game,false);for(const file of relicCustodyFiles)assert.equal(fs.readFileSync(path.join(game,file),'utf8'),sources[file]);
 integrateRelicCustody(game);for(const file of [...relicCustodyFiles,relicRuntimeFile])assert.equal(fs.readFileSync(path.join(game,file),'utf8').includes('\r\n'),newline==='\r\n');assert.throws(()=>integrateRelicCustody(game),/overwrite/);
 receipts.push({lineEndings:newline==='\n'?'lf':'crlf',allSourcesCheckedBeforeWrites:true,newHostBindingCollisionRefused:true,unknownWorkRefused:true,reapplicationRejected:true});
}
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/relic-custody-overlay-verification.json'),{receipts});console.log('Relic custody overlay preflights both original files and refuses existing host bindings.');
