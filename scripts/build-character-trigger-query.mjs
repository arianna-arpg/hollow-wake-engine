import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {build} from 'esbuild';import ts from 'typescript';
import {root,sha256} from './reference-utils.mjs';
/** Separate compiled read-only rules. Installed consumers need neither a game
 * checkout nor content registration, and results retain authored input identity. */
export async function buildCharacterTriggerQuery(destination){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),sources={};
 const result=await build({absWorkingDir:root,stdin:{contents:"export {instanceTrigger} from 'hollow-wake-source/skills';",resolveDir:root,loader:'js'},
  bundle:true,platform:'neutral',format:'esm',target:'es2022',minify:true,write:false,metafile:true,tsconfigRaw:{},
  alias:{'hollow-wake-source/skills':path.join(root,'.reference/src/engine/skills.ts')}});
 for(const file of Object.keys(result.metafile.inputs))if(file!=='<stdin>'){
  assert(file.startsWith('.reference/'),file);sources[file]=sha256(fs.readFileSync(path.join(root,file)));assert.equal(sources[file],lock.files[file.slice(11)],file);
 }
 for(const row of Object.values(result.metafile.outputs))assert.equal(row.imports.length,0,'Query has a runtime import');
 const code=result.outputFiles[0].text,ast=ts.createSourceFile('query.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const forbidden=new Set(['window','document','fetch','localStorage','performance','Date','process','eval','Function','setTimeout','requestAnimationFrame']);
 const visit=node=>{if(ts.isIdentifier(node))assert(!forbidden.has(node.text),'Host API: '+node.text);if(ts.isPropertyAccessExpression(node))assert.notEqual(node.getText(ast),'Math.random');ts.forEachChild(node,visit);};visit(ast);
 assert(Buffer.byteLength(code)<=64*1024);fs.writeFileSync(destination,code,{flag:'wx'});
 return{schemaVersion:1,sourceCommit:lock.commit,bytes:Buffer.byteLength(code),sha256:sha256(code),runtimeImports:0,sources};
}
