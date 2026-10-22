import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root,verifyReference,sha256,writeJSON} from './reference-utils.mjs';

const game=path.join(root,'.reference'),baseline=path.join(root,'baseline/milestone-thirty-six');
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const acceptance=JSON.parse(fs.readFileSync(path.join(baseline,'acceptance.json')));
assert.equal(acceptance.source,lock.commit);verifyReference(game,lock);
const output=fs.mkdtempSync(path.join(root,'.artifacts/channel-bank-reference-')),reports=[];
for(const row of acceptance.fixtures){
 const source=fs.readFileSync(path.join(root,'reference/export-'+row.name+'.ts'));
 const compressed=fs.readFileSync(path.join(baseline,row.name+'.json.gz')),expected=gunzipSync(compressed);
 assert.equal(sha256(source),row.helperSha256);assert.equal(sha256(compressed),row.compressedSha256);assert.equal(sha256(expected),row.fixtureSha256);
 const temporary=path.join(game,'balance','sdk-channel-bank-'+randomUUID()+'.ts'),file=path.join(output,row.name+'.json');
 try{
  fs.writeFileSync(temporary,source,{flag:'wx'});
  execFileSync(process.execPath,['--import','tsx',temporary,file],{cwd:game,stdio:'inherit'});
  assert(fs.readFileSync(file).equals(expected),'Original observations changed: '+row.name);reports.push(row);
 }finally{
  if(fs.existsSync(temporary)&&fs.readFileSync(temporary).equals(source))fs.unlinkSync(temporary);
  verifyReference(game,lock);
 }
}
writeJSON(path.join(root,'.artifacts/channel-bank-reference-verification.json'),{source:lock.commit,output,fixtures:reports});
console.log('Original bank/gauge observations reproduced; historical defect traces remain unchanged.');
