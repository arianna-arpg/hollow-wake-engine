import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root,verifyReference,sha256,writeJSON} from './reference-utils.mjs';

const game=path.join(root,'.reference'),baseline=path.join(root,'baseline/milestone-thirty');
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const acceptance=JSON.parse(fs.readFileSync(path.join(baseline,'acceptance.json')));
assert.equal(acceptance.source,lock.commit);
verifyReference(game,lock);
const output=fs.mkdtempSync(path.join(root,'.artifacts/admission-reference-')),reports=[];
for(const row of acceptance.fixtures){
 const source=fs.readFileSync(path.join(root,'reference/export-'+row.name+'.ts'));
 const expected=gunzipSync(fs.readFileSync(path.join(baseline,row.name+'.json.gz')));
 assert.equal(sha256(source),row.helperSha256);
 assert.equal(sha256(expected),row.fixtureSha256);
 const helper=path.join(game,'balance','sdk-admission-'+randomUUID()+'.ts');
 const result=path.join(output,row.name+'.json');
 try{
  fs.writeFileSync(helper,source,{flag:'wx'});
  execFileSync(process.execPath,['--import','tsx',helper,result],{cwd:game,stdio:'inherit'});
  assert(fs.readFileSync(result).equals(expected),'Original admission changed: '+row.name);
  reports.push(row);
 }finally{
  if(fs.existsSync(helper)&&fs.readFileSync(helper).equals(source))fs.unlinkSync(helper);
 }
}
verifyReference(game,lock);
writeJSON(path.join(root,'.artifacts/admission-reference-verification.json'),{source:lock.commit,output,fixtures:reports});
console.log('Original skill admission observations reproduced without regenerating accepted fixtures.');
