import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
export async function buildNodeGodot(destination){
 assert(!fs.existsSync(destination),'Refusing to overwrite Node/Godot adapter');
 const result=await build({absWorkingDir:root,entryPoints:['adapters/node-godot/index.mjs'],bundle:true,platform:'node',format:'esm',target:'node22',write:false,metafile:true,external:['@hollow-wake/*']});
 const sources={};for(const file of Object.keys(result.metafile.inputs)){assert(file.startsWith('adapters/node-godot/'));sources[file]=sha256(fs.readFileSync(path.join(root,file)));}
 fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'index.js'),result.outputFiles[0].contents);
 fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(destination,'LICENSE.md'));
 writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/node-godot',version:'0.1.0-candidate.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',engines:{node:'>=22'},
  exports:{'.':{types:'./index.d.ts',import:'./index.js'}},files:['index.js','index.d.ts','manifest.json','LICENSE.md'],peerDependencies:{'@hollow-wake/engine':'0.62.0-candidate.0','@hollow-wake/combat':'0.2.0-candidate.0','@hollow-wake/characters':'0.1.0-candidate.0'}});
 fs.copyFileSync(path.join(root,'adapters/node-godot/index.d.ts'),path.join(destination,'index.d.ts'));
 const manifest={schemaVersion:1,capability:'node-godot-host/v1',sources,files:Object.fromEntries(['index.js','index.d.ts'].map(f=>[f,sha256(fs.readFileSync(path.join(destination,f)))]))};
 writeJSON(path.join(destination,'manifest.json'),manifest);return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){assert(process.argv.length===4&&process.argv[2]==='--out');console.log(await buildNodeGodot(path.resolve(process.argv[3])));}
