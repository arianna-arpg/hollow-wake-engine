import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,verifyReference} from './reference-utils.mjs';
const game=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),out=path.join(root,'.artifacts/inventory-host-reference');
verifyReference(game,lock);const target=path.join(game,'balance/export-engine-inventory-host.ts');fs.copyFileSync(path.join(root,'reference/export-inventory-host.ts'),target);
execFileSync(process.execPath,['--import','tsx',target,out],{cwd:game,stdio:'inherit'});
const bytes=fs.readFileSync(path.join(out,'inventory-host.json')),accepted=path.join(root,'baseline/milestone-eleven/inventory-host.json.gz');
if(process.argv.includes('--initial-capture')){assert.ok(!fs.existsSync(accepted),'Refusing to overwrite accepted observations');fs.mkdirSync(path.dirname(accepted),{recursive:true});fs.writeFileSync(accepted,gzipSync(bytes,{level:9}),{flag:'wx'});}
else if(!process.argv.includes('--export-only')){
 const expected=JSON.parse(gunzipSync(fs.readFileSync(accepted))),actual=JSON.parse(bytes);
 const difference=(a,b,p='root')=>{if(Object.is(a,b))return;if(!a||!b||typeof a!=='object'||typeof b!=='object')return `${p}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;for(const k of new Set([...Object.keys(a),...Object.keys(b)])){const d=difference(a[k],b[k],p+'.'+k);if(d)return d;}};
 assert.equal(difference(actual,expected),undefined,'Original inventory observations changed');
}
verifyReference(game,lock);
