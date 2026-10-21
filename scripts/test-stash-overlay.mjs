import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';import {integrateStash} from '../adapters/hollow-wake/integrate-stash.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const source=fs.readFileSync(path.join(reference,'src/engine/stash.ts'),'utf8').replaceAll('\r\n','\n'),receipts=[];
for(const newline of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/stash-overlay-')),file=path.join(game,'src/engine/stash.ts');fs.mkdirSync(path.dirname(file),{recursive:true});
 const bytes=source.replaceAll('\n',newline);fs.writeFileSync(file,bytes+'// independent work'+newline);
 assert.throws(()=>integrateStash(game),/Unreviewed/);assert.equal(fs.readFileSync(file,'utf8'),bytes+'// independent work'+newline);
 fs.writeFileSync(file,bytes);integrateStash(game,false);assert.equal(fs.readFileSync(file,'utf8'),bytes);integrateStash(game);const result=fs.readFileSync(file,'utf8');
 assert(result.includes('stashPolicy.plan'));assert(result.includes('personalStashEntries'));assert.equal(result.includes('\r\n'),newline==='\r\n');
 assert.throws(()=>integrateStash(game),/Unreviewed/);assert.equal(fs.readFileSync(file,'utf8'),result);
 receipts.push({lineEndings:newline==='\n'?'lf':'crlf',preflightBeforeWrites:true,unreviewedWorkRefused:true,reapplicationRejected:true});
}
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/stash-overlay-verification.json'),{receipts});console.log('Storage overlay preserves line endings and refuses unknown work before writes.');
