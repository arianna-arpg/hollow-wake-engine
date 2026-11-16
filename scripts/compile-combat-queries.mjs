import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';import ts from 'typescript';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {combatRegistryData, registryInitialization} from './combat-registry-data.mjs';
/** A build-time source dependency only. The final query module has no imports,
 * ambient host services, registration API or original-source requirement. */
export async function buildCombatQueries(destination){
  const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),sources={};
  const files={skills:'engine/skills',invocation:'engine/invocation',invocations:'data/invocations',replenishment:'engine/replenishment','minion-families':'data/minionFamilies',charges:'engine/charges',defense:'engine/defense',gauge:'engine/gauge',recency:'engine/recency',stats:'engine/stats',reception:'engine/reception'};
  const alias=Object.fromEntries(Object.entries(files).map(([key,file])=>['hollow-wake-source/'+key,path.join(root,'.reference/src/'+file+'.ts')]));
  const registry= combatRegistryData();
  const original=fs.readFileSync(path.join(root,'adapters/embedded/combat-queries.mjs'),'utf8');
  const initialization=`import {MONSTERS} from './.reference/src/data/monsters.ts';\nimport {SKILLS} from './.reference/src/data/skills.ts';\nimport {SUPPORTS} from './.reference/src/data/supports.ts';\nimport {STAT_DEFS} from './.reference/src/engine/stats.ts';\nconst registryData = ${JSON.stringify(registry.registries)};\n${registryInitialization(['MONSTERS','SKILLS','SUPPORTS','STAT_DEFS','STATUS_RELAY_IDS'])}\n`;
  const source=original.replace('export const combatActorRules=',initialization+'\nexport const combatActorRules=');
  assert.notEqual(source,original);
  const result=await build({absWorkingDir:root,stdin:{contents:source,loader:'js',resolveDir:root},bundle:true,platform:'neutral',format:'esm',target:'es2022',minify:true,write:false,metafile:true,tsconfigRaw:{},alias});
  for(const file of Object.keys(result.metafile.inputs)){
    if(file==='<stdin>')continue;
    const hash=sha256(fs.readFileSync(path.join(root,file)));sources[file]=hash;
    if(file.startsWith('.reference/'))assert.equal(hash,lock.files[file.slice(11)],file);else assert.equal(file,'adapters/embedded/combat-queries.mjs');
  }
  for(const output of Object.values(result.metafile.outputs))assert.equal(output.imports.length,0,'Combat queries must be standalone');
  const code=result.outputFiles[0].text,ast=ts.createSourceFile('queries.mjs',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const forbidden=new Set(['globalThis','global','require','window','document','fetch','localStorage','performance','Date','process','eval','Function','setTimeout','requestAnimationFrame']);
  function check(n){
    if(ts.isIdentifier(n)){
      const parent=n.parent,key=(ts.isPropertyAssignment(parent)||ts.isPropertyAccessExpression(parent))&&parent.name===n;
      // A recency rule's `window` data key is not a browser global. Shorthand
      // properties still read a binding and must pass the reference check.
      if(!key)assert(!forbidden.has(n.text),'Host API in combat queries: '+n.text);
    }
    if(ts.isPropertyAccessExpression(n))assert.notEqual(n.getText(ast),'Math.random','Ambient RNG in combat queries');
    ts.forEachChild(n,check);
  }check(ast);
  sources['adapters/embedded/combat-queries.mjs']=sha256(original);
  const manifest={schemaVersion:1,sourceCommit:lock.commit,sourceLockSha256:sha256(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),registrySha256:registry.sha256,sources,files:{'queries.mjs':{sha256:sha256(code),bytes:Buffer.byteLength(code)}}};
  fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'queries.mjs'),code);writeJSON(path.join(destination,'manifest.json'),manifest);return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){assert(process.argv.length===4&&process.argv[2]==='--out','Use --out <new directory>');const destination=path.resolve(process.argv[3]);assert(!fs.existsSync(destination),'Refusing to overwrite existing query output');const result=await buildCombatQueries(destination);console.log({directory:destination,...result.files});}
