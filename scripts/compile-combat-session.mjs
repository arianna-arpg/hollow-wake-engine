import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import ts from 'typescript';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {buildCombatContent} from './compile-combat-content.mjs';
import {readScope} from './combat-inventory-scope-tools.mjs';

/** Separately loadable authored combat composition. The public core retains
 * reusable rules; this package owns the game's compiled, immutable catalogue. */
export async function buildCombatSession(destination) {
  assert(!fs.existsSync(destination),'Refusing to overwrite combat package');
  const banned = new Set(readScope().extensionRoots);
  const result = await build({absWorkingDir:root,entryPoints:['adapters/embedded/combat-session.mjs'],bundle:true,
    platform:'neutral',format:'esm',target:'es2022',minify:true,write:false,metafile:true,
    external:['@hollow-wake/engine','@hollow-wake/engine/*'],tsconfigRaw:{}});
  const sources={};
  for(const file of Object.keys(result.metafile.inputs)) {
    assert(file.startsWith('adapters/embedded/combat-')||file.startsWith('dist/'),'Unexpected combat dependency: '+file);
    assert(!banned.has(path.basename(file,'.js')),'Combat imports optional extension: '+file);
    sources[file]=sha256(fs.readFileSync(path.join(root,file)));
  }
  for(const output of Object.values(result.metafile.outputs))for(const imp of output.imports)
    assert(imp.external&&imp.path.startsWith('@hollow-wake/engine'),'Foreign combat runtime import');
  const code=result.outputFiles[0].text,ast=ts.createSourceFile('combat.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const forbidden=new Set(['globalThis','global','require','window','document','fetch','localStorage','performance','Date','process','eval','Function','setTimeout','requestAnimationFrame']);
  const check=node=>{if(ts.isIdentifier(node)) {
    const p=node.parent,key=(ts.isPropertyAssignment(p)||ts.isPropertyAccessExpression(p))&&p.name===node;
    if(!key)assert(!forbidden.has(node.text),'Ambient API in combat: '+node.text);
  }
    if(ts.isPropertyAccessExpression(node))assert(node.getText(ast)!=='Math.random','Ambient combat random');ts.forEachChild(node,check);};check(ast);
  await buildCombatContent(destination);
  const contentManifest=JSON.parse(fs.readFileSync(path.join(destination,'manifest.json')));
  fs.writeFileSync(path.join(destination,'index.js'),code);
  for(const [from,to] of [['adapters/embedded/combat-session.d.ts','index.d.ts'],['LICENSE.md','LICENSE.md']])fs.copyFileSync(path.join(root,from),path.join(destination,to));
  fs.writeFileSync(path.join(destination,'content.d.ts'),"export declare const combatContent: import('./index.js').CombatContent;\n");
  const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
  writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/combat',version:'0.1.0-candidate.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',
    peerDependencies:{'@hollow-wake/engine':version},files:['index.js','index.d.ts','content.mjs','content.d.ts','manifest.json','LICENSE.md'],
    exports:{'.':{types:'./index.d.ts',import:'./index.js'},'./content':{types:'./content.d.ts',import:'./content.mjs'},'./manifest.json':'./manifest.json'}});
  const files=Object.fromEntries(['index.js','index.d.ts','content.mjs','content.d.ts'].map(name=>{const bytes=fs.readFileSync(path.join(destination,name));return[name,{sha256:sha256(bytes),bytes:bytes.length}];}));
  const manifest={schemaVersion:1,capability:'combat-session/v1',sources,content:contentManifest,files};
  writeJSON(path.join(destination,'manifest.json'),manifest);return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  assert(process.argv.length===4&&process.argv[2]==='--out');console.log((await buildCombatSession(path.resolve(process.argv[3]))).files);
}
