import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,verifyReference} from './reference-utils.mjs';
const game=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),out=path.join(root,'.artifacts/passive-policy-host-reference');
verifyReference(game,lock);const target=path.join(game,'balance/export-engine-passive-policy-host.ts');fs.copyFileSync(path.join(root,'reference/export-passive-policy-host.ts'),target);
execFileSync(process.execPath,['--import','tsx',target,out],{cwd:game,stdio:'inherit'});
const bytes=fs.readFileSync(path.join(out,'passive-policy-host.json')),accepted=path.join(root,'baseline/milestone-ten/passive-policy-host.json.gz');
if(process.argv.includes('--initial-capture')){assert.ok(!fs.existsSync(accepted),'Refusing to overwrite accepted host observations');fs.mkdirSync(path.dirname(accepted),{recursive:true});fs.writeFileSync(accepted,gzipSync(bytes,{level:9}),{flag:'wx'});}
else if(!process.argv.includes('--export-only'))assert.deepEqual(JSON.parse(bytes),JSON.parse(gunzipSync(fs.readFileSync(accepted))));
verifyReference(game,lock);
