import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import ts from 'typescript';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {readCatalogue} from './catalogue-tools.mjs';
import {itemPack,equipmentPack} from './compile-item-content.mjs';
import {grantPack} from './compile-passive-grants.mjs';
import {containerPack} from './compile-container-content.mjs';
import {skillProgressionPack} from './compile-skill-progression.mjs';

export function characterBuildPack(){
  const catalogue=readCatalogue(),table=name=>Object.fromEntries(catalogue.tables[name].map(row=>[row.id,row.value]));
  const ordered=name=>{const rows=table(name);return catalogue.registryOrder[name].map(id=>rows[id]);};
  const rules=table('rules');
  const frozen=gunzipSync(fs.readFileSync(path.join(root,'baseline/workshop-supports/observations.json.gz')));
  assert.equal(sha256(frozen),JSON.parse(fs.readFileSync(path.join(root,'baseline/workshop-supports/acceptance.json'))).sha256);
  const data={schemaVersion:1,capability:'hollow-wake-character-builds/v1',definitions:{
    stats:table('stats'),trades:rules.statTrades,classes:ordered('classes'),slots:equipmentPack().slots,
    skills:table('skills'),supports:table('supports'),monsters:JSON.parse(frozen).monsters,
    progression:{lifePerLevel:rules.progression.lifePerLevel,manaPerLevel:rules.progression.manaPerLevel}},
    items:itemPack(),passives:grantPack(),containers:containerPack(),progression:skillProgressionPack()};
  const body=JSON.stringify(data);assert(!body.includes('"$sourceRule"'),'Build pack contains uncompiled executable content');
  return {...data,contentId:'hollow-wake-character-builds:sha256:'+sha256(body)};
}
/** Produces a separately loadable authored package. No game checkout is needed
 * by the installed consumer. The core package remains free of content loading. */
export async function buildCharacterBuilds(destination){
  const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),sources={};
  const result=await build({absWorkingDir:root,entryPoints:['adapters/embedded/character-builds.mjs'],bundle:true,platform:'neutral',format:'esm',target:'es2022',
    minify:true,write:false,metafile:true,external:['@hollow-wake/engine','@hollow-wake/engine/*'],tsconfigRaw:{},
    alias:{'hollow-wake-source/skills':path.join(root,'.reference/src/engine/skills.ts'),'hollow-wake-source/minion-families':path.join(root,'.reference/src/data/minionFamilies.ts')}});
  for(const file of Object.keys(result.metafile.inputs)){
    const hash=sha256(fs.readFileSync(path.join(root,file)));sources[file]=hash;
    if(file.startsWith('.reference/'))assert.equal(hash,lock.files[file.slice('.reference/'.length)],file);
    else assert(['adapters/embedded/character-builds.mjs','adapters/embedded/character-build-helpers.mjs'].includes(file),file);
  }
  for(const row of Object.values(result.metafile.outputs))for(const imp of row.imports)assert(imp.external&&imp.path.startsWith('@hollow-wake/engine'),imp.path);
  const code=result.outputFiles[0].text,ast=ts.createSourceFile('character-builds.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const forbidden=new Set(['window','document','fetch','localStorage','performance','Date','process','eval','Function','setTimeout','requestAnimationFrame']);
  function check(node){
    if(ts.isIdentifier(node))assert(!forbidden.has(node.text),'Host API in build factory: '+node.text);
    if(ts.isPropertyAccessExpression(node))assert(node.getText(ast)!=='Math.random','Ambient RNG in build factory');
    ts.forEachChild(node,check);
  }
  check(ast);assert(Buffer.byteLength(code)<=128*1024,'Build factory exceeds 128 KiB');
  const pack=characterBuildPack(),bytes=JSON.stringify(pack)+'\n';assert(Buffer.byteLength(bytes)<=8*1024*1024,'Build content exceeds 8 MiB');
  const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
  fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'index.js'),code);fs.writeFileSync(path.join(destination,'builds.json'),bytes);
  fs.writeFileSync(path.join(destination,'index.d.ts'),"import type {CharacterBuildService} from '@hollow-wake/engine/character/builds';\nexport declare function createCharacterBuilds(pack:unknown):CharacterBuildService;\n");
  writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/character-builds',version:'0.1.0-candidate.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',
    peerDependencies:{'@hollow-wake/engine':version},files:['index.js','index.d.ts','builds.json','manifest.json','LICENSE.md','README.md'],
    exports:{'.':{types:'./index.d.ts',import:'./index.js'},'./builds.json':'./builds.json','./manifest.json':'./manifest.json'}});
  const manifest={schemaVersion:1,contentId:pack.contentId,sourceCommit:lock.commit,capability:pack.capability,
    files:{'index.js':{sha256:sha256(code),bytes:Buffer.byteLength(code)},'builds.json':{sha256:sha256(bytes),bytes:Buffer.byteLength(bytes)}},sources};
  writeJSON(path.join(destination,'manifest.json'),manifest);fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(destination,'LICENSE.md'));
  fs.writeFileSync(path.join(destination,'README.md'),'# Hollow Wake character builds\n\nLoad builds.json once and call createCharacterBuilds(pack). The separate @hollow-wake/engine peer owns the durable composition. Complete authored stats, class/passive grants, items, containers, skill investment and support-fit rules are included. Reads are detached and private forks retain logical skill continuity. Inputs must already be admitted by the character/item/account boundary. This is not a live actor snapshot or persistence authority. Do not assign a prepared skill graph to a running actor; current combat state and ordered live effects belong to acknowledgement. No physical-device performance or native integration qualification is implied.\n');
  return {pack,manifest};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  assert(process.argv.length===4&&process.argv[2]==='--out','Use --out <new package directory>');
  const target=path.resolve(process.argv[3]);assert(!fs.existsSync(target),'Refusing to overwrite an existing directory');
  const result=await buildCharacterBuilds(target);console.log(JSON.stringify({directory:target,...result.manifest.files}));
}
