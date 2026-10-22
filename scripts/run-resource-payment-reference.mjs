import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {root,verifyReference,sha256,writeJSON} from './reference-utils.mjs';
const game=path.join(root,'.reference'),base=path.join(root,'baseline/milestone-twenty-nine');
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),acceptance=JSON.parse(fs.readFileSync(path.join(base,'acceptance.json')));
verifyReference(game,lock);const output=fs.mkdtempSync(path.join(root,'.artifacts/resource-payment-reference-')),reports=[];
for(const row of acceptance.fixtures){
 const bytes=fs.readFileSync(path.join(root,'reference/export-'+row.name+'.ts'));
 const expected=gunzipSync(fs.readFileSync(path.join(base,row.name+'.json.gz')));
 assert.equal(sha256(bytes),row.helperSha256);assert.equal(sha256(expected),row.fixtureSha256);
 const helper=path.join(game,'balance','sdk-payment-'+randomUUID()+'.ts'),file=path.join(output,row.name+'.json');
 try{fs.writeFileSync(helper,bytes,{flag:'wx'});execFileSync(process.execPath,['--import','tsx',helper,file],{cwd:game,stdio:'inherit'});
  assert(fs.readFileSync(file).equals(expected),'Original payment changed: '+row.name);reports.push(row);
 }finally{if(fs.existsSync(helper)&&fs.readFileSync(helper).equals(bytes))fs.unlinkSync(helper);}
}
verifyReference(game,lock);writeJSON(path.join(root,'.artifacts/resource-payment-reference-verification.json'),{source:lock.commit,output,fixtures:reports});
console.log('Original resource payment observations reproduced.');
