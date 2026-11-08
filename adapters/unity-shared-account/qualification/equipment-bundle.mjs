import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256,listFiles} from '../../../scripts/reference-utils.mjs';
const output=fs.realpathSync(process.argv[2]);assert(path.dirname(output)===fs.realpathSync(path.join(root,'.artifacts')));
const names=['package.json','package-lock.json','tsconfig.json','adapters/unity-shared-account/qualification/equipment-bundle.mjs',
 'adapters/embedded/account-workshop-session.mjs','test/shared-account/fixtures.mjs',
 ...listFiles(path.join(root,'src')).map(file=>'src/'+file),
 ...listFiles(path.join(root,'scripts')).filter(file=>/^compile-.*\.mjs$/.test(file)).map(file=>'scripts/'+file)];
const sources=Object.fromEntries(names.map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))]));
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(root,'tsconfig.json')],{cwd:root,windowsHide:true,stdio:'pipe',timeout:120000});
const {packs}=await import('../../../test/shared-account/fixtures.mjs');
const {encodeContentTable}=await import('../../../dist/content-table-compiler.js');
const alias={},manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
for(const[key,value]of Object.entries(manifest.exports)){const file=typeof value==='string'?value:value.import;if(file?.endsWith('.js'))alias['@hollow-wake/engine'+key.slice(1)]=path.join(root,file);}
const compiled=await build({entryPoints:[path.join(root,'adapters/embedded/account-workshop-session.mjs')],bundle:true,format:'iife',globalName:'HollowWakeSession',platform:'neutral',target:'es2022',minify:true,write:false,metafile:true,tsconfigRaw:{},alias});
assert(Object.values(compiled.metafile.outputs).every(row=>!row.imports.length));
const files={'SharedAccountRules.bytes':compiled.outputFiles[0].contents,'SharedAccountContent.bytes':Buffer.from(JSON.stringify(encodeContentTable(packs)))};
for(const[name,bytes]of Object.entries(files))fs.writeFileSync(path.join(output,name),bytes,{flag:'wx'});
for(const[file,hash]of Object.entries(sources))assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
fs.writeFileSync(path.join(output,'bundle.json'),JSON.stringify({sources,files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,sha256(bytes)]))},null,2)+'\n',{flag:'wx'});
