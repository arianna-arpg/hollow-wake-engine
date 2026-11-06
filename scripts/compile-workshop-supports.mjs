import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {build} from 'esbuild';
import ts from 'typescript';
import {root,sha256} from './reference-utils.mjs';
import {readCatalogue} from './catalogue-tools.mjs';
import {skillProgressionPack} from './compile-skill-progression.mjs';

export async function supportGateAssets(){
  const ref=path.join(root,'.reference/src'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
  const config={absWorkingDir:root,bundle:true,platform:'neutral',minify:true,target:'es2022',write:false,metafile:true,tsconfigRaw:{},
    alias:{'hollow-wake-source/skills':path.join(ref,'engine/skills.ts'),'hollow-wake-source/minion-families':path.join(ref,'data/minionFamilies.ts')}};
  async function compile(entry,format){
    const result=await build({...config,entryPoints:['adapters/embedded/'+entry],format,...(format==='iife'?{globalName:'HollowWakeSession'}:{})});
    for(const name of Object.keys(result.metafile.inputs)){
      if(name.startsWith('.reference/')){
        const rel=name.slice('.reference/'.length);
        assert.equal(sha256(fs.readFileSync(path.join(root,name))),lock.files[rel],name);
      }else assert(name.startsWith('adapters/embedded/support-fit')||name==='adapters/godot/shared/number-wire.mjs',name);
    }
    assert(Object.values(result.metafile.outputs).every(o=>!o.imports.length));
    const code=result.outputFiles[0].text,ast=ts.createSourceFile(entry,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const forbidden=new Set(['window','document','fetch','localStorage','performance','Date','process','eval','Function','setTimeout','requestAnimationFrame']);
    function check(node){
      if(ts.isIdentifier(node))assert(!forbidden.has(node.text),'Host API in fit bundle: '+node.text);
      if(ts.isPropertyAccessExpression(node))assert(node.getText(ast)!=='Math.random','Ambient RNG in fit bundle');
      ts.forEachChild(node,check);
    }
    check(ast);return code;
  }
  const core=await compile('support-fit.mjs','esm'),bundle=await compile('support-fit-pages.mjs','iife');
  assert(Buffer.byteLength(bundle)<=80*1024);
  const api=await import('data:text/javascript;base64,'+Buffer.from(core).toString('base64'));
  const frozen=gunzipSync(fs.readFileSync(path.join(root,'baseline/workshop-supports/observations.json.gz')));
  assert.equal(sha256(frozen),JSON.parse(fs.readFileSync(path.join(root,'baseline/workshop-supports/acceptance.json'))).sha256);
  const {monsters}=JSON.parse(frozen),c=readCatalogue().tables;
  const records={skills:Object.fromEntries(c.skills.map(r=>[r.id,r.value])),supports:Object.fromEntries(c.supports.map(r=>[r.id,r.value])),monsters};
  const pages=Array.from({length:128},()=>({skills:Object.create(null),supports:Object.create(null),monsters:Object.create(null)}));
  for(const [table,rows] of Object.entries(records))for(const [id,row] of Object.entries(rows))pages[api.fitPage(id,pages.length)][table][id]=row;
  const parts=pages.map(p=>Buffer.from(JSON.stringify(p)+'\n'));let offset=0;
  const ranges=parts.map(bytes=>{assert(bytes.length<=48*1024,'Support page exceeds 48 KiB');const row={offset,length:bytes.length,sha256:sha256(bytes)};offset+=bytes.length;return row;});
  const data=Buffer.concat(parts),index={format:'workshop-support-pages/v1',sourceCommit:lock.commit,skillContentId:skillProgressionPack().contentId,bytes:data.length,sha256:sha256(data),pages:ranges};
  assert(data.length<=2*1024*1024);
  return {api,records,core,bundle,data,index};
}

export async function writeSupportGate(dir){
  const result=await supportGateAssets();
  fs.writeFileSync(path.join(dir,'support-fit.txt'),result.bundle);
  fs.writeFileSync(path.join(dir,'support-index.json'),JSON.stringify(result.index)+'\n');
  fs.writeFileSync(path.join(dir,'support-pages.txt'),result.data);
  return result;
}
