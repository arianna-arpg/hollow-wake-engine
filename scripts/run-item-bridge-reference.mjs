import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {root,verifyReference} from './reference-utils.mjs';
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),reference=path.join(root,'.reference');
verifyReference(reference,lock);
const script=path.join(reference,'balance/export-engine-item-bridge.ts'),output=path.join(root,'.artifacts/item-bridge-reference');
fs.copyFileSync(path.join(root,'reference/export-item-bridge.ts'),script);
execFileSync(process.execPath,['--import','tsx',script,output],{cwd:reference,stdio:'inherit'});
const actual=fs.readFileSync(path.join(output,'item-bridge.json'));
const accepted=path.join(root,'baseline/milestone-five/item-bridge.json.gz');
if(process.argv.includes('--initial-capture')) {
  assert.ok(!fs.existsSync(accepted),'Refusing to replace accepted item bridge observations');
  fs.mkdirSync(path.dirname(accepted),{recursive:true});fs.writeFileSync(accepted,gzipSync(actual,{level:9}));
} else assert.deepEqual(JSON.parse(actual),JSON.parse(gunzipSync(fs.readFileSync(accepted))));
verifyReference(reference,lock);
console.log('Original interleaving, save migration and content refresh match accepted observations.');
