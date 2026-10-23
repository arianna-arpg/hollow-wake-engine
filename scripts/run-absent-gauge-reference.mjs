import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {root,verifyReference,sha256,writeJSON} from './reference-utils.mjs';
const game=path.join(root,'.reference'),baseline=path.join(root,'baseline/milestone-thirty-six'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),acceptance=JSON.parse(fs.readFileSync(path.join(baseline,'absent-counts-acceptance.json'))),row=acceptance.fixture;
assert.equal(acceptance.source,lock.commit);verifyReference(game,lock);
const source=fs.readFileSync(path.join(root,row.helper)),compressed=fs.readFileSync(path.join(baseline,row.name+'.json.gz')),expected=gunzipSync(compressed);
assert.equal(sha256(source),row.helperSha256);assert.equal(sha256(compressed),row.compressedSha256);assert.equal(sha256(expected),row.fixtureSha256);
const output=fs.mkdtempSync(path.join(root,'.artifacts/absent-gauge-reference-')),temporary=path.join(game,'balance','sdk-absent-gauge-'+randomUUID()+'.ts'),file=path.join(output,'observations.json');
try{fs.writeFileSync(temporary,source,{flag:'wx'});execFileSync(process.execPath,['--import','tsx',temporary,file],{cwd:game,stdio:'inherit'});assert(fs.readFileSync(file).equals(expected),'Original absent-count observations changed');}
finally{if(fs.existsSync(temporary)&&fs.readFileSync(temporary).equals(source))fs.unlinkSync(temporary);verifyReference(game,lock);}
writeJSON(path.join(root,'.artifacts/absent-gauge-reference-verification.json'),{source:lock.commit,output,fixture:row});console.log('Original sparse status/reserve count observations reproduced.');
