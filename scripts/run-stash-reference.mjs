import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,verifyReference} from './reference-utils.mjs';
const game=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),out=path.join(root,'.artifacts/stash-reference');
verifyReference(game,lock);const target=path.join(game,'balance/export-engine-stash.ts');fs.copyFileSync(path.join(root,'reference/export-stash.ts'),target);
execFileSync(process.execPath,['--import','tsx',target,out],{cwd:game,stdio:'inherit'});
for(const name of ['stash','stash-edges']){
 const bytes=fs.readFileSync(path.join(out,name+'.json')),accepted=path.join(root,'baseline/milestone-twelve',name+'.json.gz');
 const capture=process.argv.includes('--initial-capture')||(name==='stash-edges'&&process.argv.includes('--initial-edge-capture'));
 if(capture){assert.ok(!fs.existsSync(accepted),'Refusing to overwrite accepted observations');fs.mkdirSync(path.dirname(accepted),{recursive:true});fs.writeFileSync(accepted,gzipSync(bytes,{level:9}),{flag:'wx'});}
 else if(!process.argv.includes('--export-only'))assert.ok(bytes.equals(gunzipSync(fs.readFileSync(accepted))),`Original ${name} observations changed`);
}
verifyReference(game,lock);
