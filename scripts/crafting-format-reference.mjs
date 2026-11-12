import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gunzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {itemPack} from './compile-item-content.mjs';import {craftingPack} from './compile-crafting-content.mjs';import {skillProgressionPack} from './compile-skill-progression.mjs';import {ItemContent} from '../dist/item-rules.js';

/** Reproduce published SDK saves from the retained pre-refactor implementation.
 * The caller owns output acceptance. This helper never replaces expected data. */
export async function captureCraftingFormats(){
 const artifacts=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(artifacts,'crafting-formats-reference-owned-'));
 const sources={};
 try{
  const directory=path.join(root,'baseline/crafting-session-formats'),accepted=JSON.parse(fs.readFileSync(path.join(directory,'acceptance.json'))),capsule=fs.readFileSync(path.join(directory,'published-session.ts.gz')),source=gunzipSync(capsule);
  for(const file of ['scripts/crafting-format-reference.mjs','scripts/test-crafting-session-formats-reference.mjs','baseline/crafting-session-formats/observe.mjs','baseline/crafting-session-formats/acceptance.json','baseline/crafting-session-formats/published-session.ts.gz'])sources[file]=sha256(fs.readFileSync(path.join(root,file)));
  assert.equal(sha256(capsule),accepted.capsuleSha256);assert.equal(sha256(source),accepted.sourceSha256);
  const items=itemPack(),packs={items,crafting:craftingPack(new ItemContent(items)),skills:skillProgressionPack()},entry=path.join(work,'observe.cjs');
  const result=await build({stdin:{contents:fs.readFileSync(path.join(directory,'observe.mjs'),'utf8'),loader:'js',resolveDir:directory},outfile:entry,bundle:true,platform:'node',format:'cjs',target:'es2022',metafile:true,logLevel:'silent',plugins:[{name:'published-session',setup(b){
   b.onResolve({filter:/^published-session$/},()=>({path:'published',namespace:'published'}));b.onLoad({filter:/.*/,namespace:'published'},()=>({contents:source.toString(),loader:'ts',resolveDir:path.join(root,'dist')}));
   b.onResolve({filter:/^format-content$/},()=>({path:'content',namespace:'content'}));b.onLoad({filter:/.*/,namespace:'content'},()=>({contents:'export default '+JSON.stringify(packs),loader:'js'}));
  }}]});
  for(const f of Object.keys(result.metafile.inputs))if(f!=='<stdin>'&&!f.startsWith('published:')&&!f.startsWith('content:'))sources[f]=sha256(fs.readFileSync(path.resolve(root,f)));
  const runs=[];let bytes;
  for(let n=0;n<2;n++){const child=spawnSync(process.execPath,[entry],{cwd:work,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'cache')}});assert(!child.error&&!child.signal&&child.status===0,child.stderr||String(child.error));const output=Buffer.from(child.stdout);if(bytes)assert(output.equals(bytes));else bytes=output;runs.push({sha256:sha256(output)});}
  assert(Object.entries(sources).every(([f,h])=>sha256(fs.readFileSync(path.resolve(root,f)))===h));return{bytes,runs,sources};
 }finally{assert.equal(path.dirname(fs.realpathSync(work)),artifacts);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});}
}
