import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {gunzipSync} from 'node:zlib';import {randomUUID} from 'node:crypto';
import {root,verifyReference,sha256,writeJSON} from './reference-utils.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const output=fs.mkdtempSync(path.join(root,'.artifacts/support-reference-')),reports=[];
for(const name of ['support-content','support-rules','support-composition','support-actions']){
 const bytes=fs.readFileSync(path.join(root,`reference/export-${name}.ts`)),helper=path.join(reference,`balance/export-sdk-${name}-${randomUUID()}.ts`),file=path.join(output,name+'.json');
 try{fs.writeFileSync(helper,bytes,{flag:'wx'});execFileSync(process.execPath,['--import','tsx',helper,file],{cwd:reference,stdio:'inherit'});verifyReference(reference,lock);
  const actual=fs.readFileSync(file);if(!process.argv.includes('--export-only'))assert(actual.equals(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-one',name+'.json.gz')))),`Original support observations changed: ${name}`);
  reports.push({name,sha256:sha256(actual),bytes:actual.length,helperSha256:sha256(bytes)});
 }finally{if(fs.existsSync(helper)&&fs.readFileSync(helper).equals(bytes))fs.unlinkSync(helper);}
}
writeJSON(path.join(root,'.artifacts/support-reference-location.json'),{output,source:lock.commit,reports});
console.log('Original support capture complete: '+output);
