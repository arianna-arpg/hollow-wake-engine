import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,verifyReference,sha256,writeJSON} from './reference-utils.mjs';
const game=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(game,lock);
const output=fs.mkdtempSync(path.join(root,'.artifacts/interactive-casting-reference-')),bytes=fs.readFileSync(path.join(root,'reference/export-interactive-casting.ts')),helper=path.join(game,'balance','sdk-interactive-'+randomUUID()+'.ts'),file=path.join(output,'casting.json');
try{
 fs.writeFileSync(helper,bytes,{flag:'wx'});execFileSync(process.execPath,['--import','tsx',helper,file],{cwd:game,stdio:'inherit'});
 const actual=fs.readFileSync(file),expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-five/interactive-casting.json.gz')));assert(actual.equals(expected),'Original interactive casting observations changed');
 writeJSON(path.join(root,'.artifacts/interactive-casting-reference-verification.json'),{output,source:lock.commit,helperSha256:sha256(bytes),fixtureSha256:sha256(actual),courses:47,transitions:204});
}finally{if(fs.existsSync(helper)&&fs.readFileSync(helper).equals(bytes))fs.unlinkSync(helper);}
verifyReference(game,lock);console.log('Original interactive casting observations reproduced.');
