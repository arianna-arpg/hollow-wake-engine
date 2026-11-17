import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {buildCombatSession} from './compile-combat-session.mjs';import {buildCharacterBuilds} from './compile-character-builds.mjs';
import {buildCharacterSession} from './compile-character-session.mjs';import {buildNodeGodot} from './compile-node-godot.mjs';
import {prepareParityReference} from './prototype-parity-tools.mjs';import {readPrototypeContent} from './prototype-content.mjs';

export async function buildNodeGodotExample(destination,profile){
 assert(!fs.existsSync(destination),'Refusing to overwrite reference integration');
 const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'m4-distribution-owned-'));
 let complete=false,created=false;
 try{
  const modules=[['combat',await buildCombatSession(path.join(work,'combat'),profile)],['builds',await buildCharacterBuilds(path.join(work,'builds'),profile)],
   ['characters',buildCharacterSession(path.join(work,'characters'),profile)],['node-godot',await buildNodeGodot(path.join(work,'node-godot'))]];
  fs.mkdirSync(destination,{recursive:true});created=true;const packages=path.join(destination,'packages');fs.mkdirSync(packages);
  const dependencies={},archives={};
  for(const directory of [root,...modules.map(([name])=>path.join(work,name))]){
   const result=spawnSync(process.execPath,[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',packages],{cwd:directory,windowsHide:true,encoding:'utf8',timeout:300000,
    env:{...process.env,NPM_CONFIG_CACHE:path.join(work,'npm-cache'),NPM_CONFIG_OFFLINE:'true',NPM_CONFIG_UPDATE_NOTIFIER:'false'},maxBuffer:8*1024*1024});
   assert(!result.error&&result.status===0,result.stderr??String(result.error));const [row]=JSON.parse(result.stdout);
   dependencies[row.name]='file:packages/'+row.filename;archives[row.filename]=sha256(fs.readFileSync(path.join(packages,row.filename)));
  }
  fs.cpSync(path.join(root,'examples/node-godot/host'),path.join(destination,'host'),{recursive:true});
  if(fs.existsSync(path.join(root,'examples/node-godot/client')))fs.cpSync(path.join(root,'examples/node-godot/client'),path.join(destination,'client'),{recursive:true,filter:file=>!file.split(path.sep).includes('.godot')});
  for(const file of ['README.md','Play.ps1'])if(fs.existsSync(path.join(root,'examples/node-godot',file)))fs.copyFileSync(path.join(root,'examples/node-godot',file),path.join(destination,file));
  fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(destination,'LICENSE.md'));
  writeJSON(path.join(destination,'package.json'),{name:'hollow-wake-node-godot-reference',private:true,type:'module',scripts:{start:'node host/serve.mjs'},dependencies});
  const manifest={schemaVersion:1,capability:'node-godot-reference/v1',archives,...(profile?{sourceCommit:profile.lock.commit}:{}),optionalQuests:false,persistenceRequired:false,deviceQualified:false};
  writeJSON(path.join(destination,'manifest.json'),manifest);complete=true;return manifest;
 }finally{
  assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,maxRetries:3});
  if(created&&!complete){const resolved=fs.realpathSync(destination);assert.equal(resolved,path.resolve(destination));assert(!fs.existsSync(path.join(resolved,'.git')));fs.rmSync(resolved,{recursive:true,maxRetries:3});}
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),prototype=args.includes('--prototype'),rest=args.filter(a=>a!=='--prototype');
 assert.equal(args.length,prototype?3:2);assert(rest[0]==='--out'&&rest[1]);if(prototype)prepareParityReference();
 console.log(await buildNodeGodotExample(path.resolve(rest[1]),prototype?readPrototypeContent():undefined));
}
