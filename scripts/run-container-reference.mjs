import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,verifyReference} from './reference-utils.mjs';
const game=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),out=path.join(root,'.artifacts/container-reference');
verifyReference(game,lock);
for(const name of ['containers','container-refresh']){
 const target=path.join(game,`balance/export-engine-${name}.ts`);fs.copyFileSync(path.join(root,`reference/export-${name}.ts`),target);
 execFileSync(process.execPath,['--import','tsx',target,out],{cwd:game,stdio:'inherit'});
 const bytes=fs.readFileSync(path.join(out,name+'.json')),accepted=path.join(root,'baseline/milestone-thirteen',name+'.json.gz');
 if(process.argv.includes('--initial-capture')||(name==='container-refresh'&&process.argv.includes('--initial-refresh-capture'))){assert.ok(!fs.existsSync(accepted),'Refusing to overwrite accepted observations');fs.mkdirSync(path.dirname(accepted),{recursive:true});fs.writeFileSync(accepted,gzipSync(bytes,{level:9}),{flag:'wx'});}
 else if(!process.argv.includes('--export-only'))assert.ok(bytes.equals(gunzipSync(fs.readFileSync(accepted))),`Original ${name} observations changed`);
}
verifyReference(game,lock);
