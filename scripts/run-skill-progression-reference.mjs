import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {gunzipSync} from 'node:zlib';
import {root,verifyReference} from './reference-utils.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const output=path.join(root,'.artifacts/skill-progression-reference');
for(const name of ['skill-progression','skill-actions']){
 const helper=path.join(reference,`balance/export-engine-${name}.ts`);fs.copyFileSync(path.join(root,`reference/export-${name}.ts`),helper);
 execFileSync(process.execPath,['--import','tsx',helper,output],{cwd:reference,stdio:'inherit',maxBuffer:64*1024*1024});verifyReference(reference,lock);
 if(!process.argv.includes('--export-only'))assert(fs.readFileSync(path.join(output,name+'.json')).equals(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-nineteen',name+'.json.gz')))),'Original skill observations changed: '+name);
}
