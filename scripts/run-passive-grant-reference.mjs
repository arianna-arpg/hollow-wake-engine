import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { root, verifyReference } from './reference-utils.mjs';
const reference = path.join(root,'.reference'), lock = JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const output = path.join(root,'.artifacts/passive-grant-reference');
verifyReference(reference,lock);
for(const name of process.argv.includes('--initial-capture-refresh')?['passive-grant-refresh']:['passive-grants','passive-grant-refresh']) {
const target = path.join(reference,`balance/export-engine-${name}.ts`),accepted=path.join(root,`baseline/milestone-nine/${name}.json.gz`);
fs.copyFileSync(path.join(root,`reference/export-${name}.ts`),target);
execFileSync(process.execPath,['--import','tsx',target,output],{cwd:reference,stdio:'inherit'});
const bytes = fs.readFileSync(path.join(output,`${name}.json`));
if(process.argv.includes('--initial-capture')||process.argv.includes('--initial-capture-refresh')) {
  if(fs.existsSync(accepted))throw new Error('Accepted grant fixture exists; refusing overwrite');
  fs.mkdirSync(path.dirname(accepted),{recursive:true});fs.writeFileSync(accepted,gzipSync(bytes,{level:9}),{flag:'wx'});
} else if(!process.argv.includes('--export-only')) assert.deepEqual(JSON.parse(bytes),JSON.parse(gunzipSync(fs.readFileSync(accepted))));
}
verifyReference(reference,lock);
console.log('Passive grant observations verified against immutable source.');
