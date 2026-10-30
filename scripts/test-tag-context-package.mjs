import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const directory=fs.mkdtempSync(path.join(root,'.artifacts/tag-context-package-')),consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-tag-context-')),npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const[packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',directory,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd:root,encoding:'utf8'}));
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});execFileSync(process.execPath,[npm,'install',path.join(directory,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
const source=fs.readFileSync(path.join(root,'test/tag-context-cache.test.mjs'),'utf8').replace("'../dist/tag-context-cache.js'","'@hollow-wake/engine/stats/context-cache'").replace("'../dist/index.js'","'@hollow-wake/engine'");assert(!source.includes('../dist/'));
fs.writeFileSync(path.join(consumer,'test.mjs'),"Math.random=()=>{throw Error('Ambient random');};globalThis.fetch=()=>{throw Error('Network');};\n"+source);
const tests=execFileSync(process.execPath,['--test','test.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,HWE_TAG_CONTEXT_MODULE:'',HWE_STAT_MODULE:''}});assert.match(tests,/pass 18/);fs.writeFileSync(path.join(directory,'tests.txt'),tests);
fs.writeFileSync(path.join(consumer,'types.ts'),`import {TagContextCache} from '@hollow-wake/engine/stats/context-cache';
import {StatSheet,StatRules} from '@hollow-wake/engine';
const cache=new TagContextCache(tags=>{const owned:readonly string[]=tags;
 // @ts-expect-error Encoder input is an immutable snapshot.
 tags.push('bad');return owned.join(',');},8);
const key:string=cache.get(new Set(['fire']));const size:number=cache.size;cache.clear();
// @ts-expect-error Context membership consists of string ids.
cache.get(new Set([1]));
const numbers=new TagContextCache(tags=>tags.length);const count:number=numbers.get();
// @ts-expect-error Encoder result types remain distinct.
const wrong:string=numbers.get();
const sheet=new StatSheet(new StatRules({power:{base:1}}),64,8);const contexts:number=sheet.contextCacheEntries;
// @ts-expect-error The context-cache budget is numeric.
new StatSheet(new StatRules({}),64,true);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,noEmit:true,types:[]},include:['types.ts']});
const types=execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:consumer,encoding:'utf8'});fs.writeFileSync(path.join(directory,'types.txt'),types);
fs.writeFileSync(path.join(consumer,'browser.mjs'),"export {TagContextCache} from '@hollow-wake/engine/stats/context-cache';\n");const browser=await build({absWorkingDir:consumer,tsconfigRaw:{},entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true});
assert(Object.keys(browser.metafile.inputs).every(file=>!file.includes('.reference')));fs.writeFileSync(path.join(directory,'browser.mjs'),browser.outputFiles[0].contents);
const report={passed:true,directory,consumer,tests:18,typesPassed:true,browserBytes:browser.outputFiles[0].contents.length,archiveSha256:sha256(fs.readFileSync(path.join(directory,packed.filename))),independentInstallation:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/tag-context-package-verification.json'),report);console.log(report);
