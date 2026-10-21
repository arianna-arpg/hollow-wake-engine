import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {gunzipSync} from 'node:zlib';import {root,verifyReference} from './reference-utils.mjs';
const game=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),out=path.join(root,'.artifacts/progression-reference');verifyReference(game,lock);
for(const [helper,result] of [['export-character-progression.ts','character-progression.json'],['export-progression-refresh.ts','progression-refresh.json']]){
 const target=path.join(game,'balance',helper.replace('export-','export-engine-'));fs.copyFileSync(path.join(root,'reference',helper),target);execFileSync(process.execPath,['--import','tsx',target,out],{cwd:game,stdio:'inherit'});
 if(!process.argv.includes('--export-only'))assert(fs.readFileSync(path.join(out,result)).equals(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-eighteen',result+'.gz')))),'Original progression observations changed: '+result);
}verifyReference(game,lock);
