import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {build} from 'esbuild';import {root} from '../scripts/reference-utils.mjs';
import {encodeContentTable} from '../dist/content-table-compiler.js';import {packs} from './shared-account/fixtures.mjs';
import {skillBookCourse} from './shared-account/skill-book-course.mjs';
const alias={};
for(const[key,value]of Object.entries(JSON.parse(fs.readFileSync(path.join(root,'package.json'))).exports)){
 const file=typeof value==='string'?value:value.import;if(file?.endsWith('.js'))alias['@hollow-wake/engine'+key.slice(1)]=path.join(root,file);
}
const built=await build({entryPoints:[path.join(root,'adapters/embedded/skill-book-session.mjs')],bundle:true,format:'iife',globalName:'HollowWakeSession',platform:'neutral',target:'es2022',write:false,metafile:true,tsconfigRaw:{},alias});
assert(Object.values(built.metafile.outputs).every(row=>!row.imports.length));
test('the opt-in native entry preserves off-bar ownership through text saves and private two-workshop publication',()=>{
 const context=vm.createContext({input:JSON.stringify(encodeContentTable(packs))});
 vm.runInContext("Math.random=()=>{throw Error('ambient random')};globalThis.fetch=()=>{throw Error('network')};",context);
 vm.runInContext(built.outputFiles[0].text,context,{timeout:30000});vm.runInContext('var owner=HollowWakeSession.create(JSON.parse(input));',context,{timeout:30000});
 const request=new vm.Script('JSON.stringify(HollowWakeSession.dispatch(owner,JSON.parse(input)))');
 const course=skillBookCourse(value=>{context.input=JSON.stringify(value);return JSON.parse(request.runInContext(context,{timeout:30000}));});
 assert(course.rows.length>=30);
});
