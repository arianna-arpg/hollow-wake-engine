import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {integrateInventoryHost} from '../adapters/hollow-wake/integrate-inventory-host.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const source=fs.readFileSync(path.join(reference,'src/engine/inventory.ts'),'utf8').replaceAll('\r\n','\n'),receipts=[];
for(const newline of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/inventory-overlay-')),file=path.join(game,'src/engine/inventory.ts');fs.mkdirSync(path.dirname(file),{recursive:true});
 const bytes=source.replaceAll('\n',newline);fs.writeFileSync(file,bytes+'// independent work'+newline);
 assert.throws(()=>integrateInventoryHost(game),/Unreviewed/);assert.equal(fs.readFileSync(file,'utf8'),bytes+'// independent work'+newline);
 fs.writeFileSync(file,bytes);integrateInventoryHost(game,false);assert.equal(fs.readFileSync(file,'utf8'),bytes);integrateInventoryHost(game);const result=fs.readFileSync(file,'utf8');
 assert(result.includes('inventoryHost.autoPlace'));assert(result.includes('setBagBoardSource'));assert.equal(result.includes('\r\n'),newline==='\r\n');
 assert.throws(()=>integrateInventoryHost(game),/Unreviewed/);assert.equal(fs.readFileSync(file,'utf8'),result);
 receipts.push({lineEndings:newline==='\n'?'lf':'crlf',preflightBeforeWrites:true,unreviewedWorkRefused:true,reapplicationRejected:true});
}
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/inventory-host-overlay-verification.json'),{receipts});console.log('Inventory host overlay preserves line endings and refuses unreviewed inputs before writing.');
