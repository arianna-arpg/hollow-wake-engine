import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {itemPack} from './compile-item-content.mjs';
import {passivePack} from './compile-passive-content.mjs';

const [releaseDir,outputDir,python]=process.argv.slice(2);
assert(releaseDir&&outputDir&&python,'RELEASE_DIRECTORY OUTPUT_DIRECTORY PYTHON');
const release=fs.realpathSync(releaseDir),out=path.resolve(outputDir),read=f=>JSON.parse(fs.readFileSync(f));
const accepted=read(path.join(root,'evidence/pouch-recall/dotnet-windows.json'));
const sdk=path.join(release,'hollow-wake-engine-'+accepted.version+'.tgz'),pouches=path.join(release,accepted.archive);
assert.equal(sha256(fs.readFileSync(sdk)),accepted.sdkSha256);assert.equal(sha256(fs.readFileSync(pouches)),accepted.sha256);
const parent=fs.realpathSync(path.join(root,'.artifacts')),scratch=fs.mkdtempSync(path.join(parent,'unity-pack-'));
const stage=path.join(scratch,'stage'),src=path.join(root,'adapters/unity'),asset=path.join(stage,'Runtime/Resources/HollowWake');
try{
  fs.mkdirSync(asset,{recursive:true});
  const env={...process.env,TEMP:scratch,TMP:scratch,TMPDIR:scratch,npm_config_cache:path.join(scratch,'cache')};
  const run=(exe,args)=>execFileSync(exe,args,{cwd:scratch,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  writeJSON(path.join(scratch,'package.json'),{private:true,type:'module'});
  run(process.execPath,[npmCli(),'install','--offline','--ignore-scripts','--no-audit','--no-fund',sdk]);
  const installed=path.join(scratch,'node_modules/@hollow-wake/engine'),manifest=read(path.join(installed,'package.json'));
  const resolve=id=>{
    const entry=manifest.exports[id.replace('@hollow-wake/engine','.')];
    assert(entry,'Missing installed export '+id);
    return path.join(installed,typeof entry==='string'?entry:entry.import);
  };
  for(const name of ['Runtime','Samples~','package.json','README.md'])fs.cpSync(path.join(src,name),path.join(stage,name),{recursive:true});
  const pythonTool=path.join(root,'scripts/unity-gameplay-archive.py');
  run(python,['-I',pythonTool,'assets',pouches,stage]);
  assert.equal(sha256(fs.readFileSync(path.join(stage,'Runtime/Native/Windows/hwe_embedded.dll'))),accepted.files['hwe_embedded.dll']);
  const pinned=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'evidence/embedded-js/windows-persistent-session-raw.json.gz')))).session;
  const config=JSON.parse(pinned['requests.jsonl'].split('\n')[0]).config;
  // The sample uses a short encounter. The accepted replay keeps the original target.
  config.target.life=180;
  writeJSON(path.join(stage,'Samples~/Casting and Burning/Resources/HollowWakeSample/Magician.json'),config);
  const core=read(resolve('@hollow-wake/engine/content/milestone-one.json'));
  const contents={core,items:itemPack(),passives:passivePack()};
  const {encodeContentTable}=await import(pathToFileURL(resolve('@hollow-wake/engine/content/table/compiler')).href);
  const table=encodeContentTable(contents);
  const provenance=read(path.join(root,'evidence/embedded-js/windows-persistent-session.json')).session;
  assert.equal(sha256(JSON.stringify(contents,null,2)+'\n'),provenance.inputSha256,'Combat content differs from accepted session');
  const session=path.join(root,'experiments/embedded-js/session.mjs');
  assert.equal(sha256(fs.readFileSync(session)),provenance.sourceHashes['experiments/embedded-js/session.mjs']);
  const exports={'../../dist/index.js':'@hollow-wake/engine','../../dist/item-rules.js':'@hollow-wake/engine/items',
    '../../dist/passive-policy.js':'@hollow-wake/engine/passives'};
  const compile=entry=>build({entryPoints:[path.join(src,entry)],bundle:true,format:'iife',globalName:'HollowWakeSession',
    target:'es2022',platform:'neutral',write:false,minify:true,metafile:true,tsconfigRaw:{},
    plugins:[{name:'packed-sdk',setup(b){
      b.onResolve({filter:/^\.\.\/\.\.\/dist\//},a=>{assert.equal(path.resolve(a.importer),session);assert(exports[a.path]);return {path:resolve(exports[a.path])};});
      b.onResolve({filter:/^@hollow-wake\/engine/},a=>({path:resolve(a.path)}));
    }}]});
  const compiled=await compile('combat-entry.mjs'),pouch=await compile('pouch-entry.mjs');
  assert([...Object.values(compiled.metafile.outputs),...Object.values(pouch.metafile.outputs)].every(o=>!o.imports.length));
  fs.writeFileSync(path.join(asset,'PouchesRules.bytes'),pouch.outputFiles[0].contents);
  fs.writeFileSync(path.join(asset,'CombatRules.bytes'),compiled.outputFiles[0].contents);
  fs.writeFileSync(path.join(asset,'CombatContent.bytes'),JSON.stringify(table));
  const hashes=Object.fromEntries(['CombatRules','CombatContent','PouchesRules','PouchesContent'].map(n=>[n,sha256(fs.readFileSync(path.join(asset,n+'.bytes')))]));
  assert.equal(hashes.PouchesContent,accepted.files['pouch-data.json']);
  const constants=Object.entries(hashes).map(([n,v])=>'        internal const string '+n.replace('Pouches','Pouch')+' = "'+v+'";');
  constants.push('        internal const string PouchId = '+JSON.stringify(read(path.join(asset,'PouchesContent.bytes')).id)+';');
  fs.writeFileSync(path.join(stage,'Runtime/PackHashes.cs'),'namespace HollowWake.Gameplay\n{\n    internal static class PackHashes\n    {\n'+constants.join('\n')+'\n    }\n}\n');
  const {name,version}=read(path.join(stage,'package.json')),file=name+'-'+version+'.tgz';
  const packed=path.join(scratch,file);run(python,['-I',pythonTool,'pack',stage,packed]);
  const bytes=fs.readFileSync(packed);
  fs.mkdirSync(out,{recursive:true});
  const receipt={name,version,file,bytes:bytes.length,sha256:sha256(bytes),sdkSha256:accepted.sdkSha256,
    nativeSha256:accepted.files['hwe_embedded.dll'],hashes,plainContentBytes:Buffer.byteLength(JSON.stringify(contents)),tableContentBytes:fs.statSync(path.join(asset,'CombatContent.bytes')).size};
  const existing=path.join(out,'package-receipt.json');
  if(fs.existsSync(existing))assert.deepEqual(read(existing),receipt,'Output belongs to a different package');
  if(fs.existsSync(path.join(out,file)))assert.equal(sha256(fs.readFileSync(path.join(out,file))),receipt.sha256);
  else fs.writeFileSync(path.join(out,file),bytes,{flag:'wx'});
  if(!fs.existsSync(existing))fs.writeFileSync(existing,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  console.log(receipt);
}finally{
  assert.equal(path.dirname(fs.realpathSync(scratch)),parent);fs.rmSync(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
