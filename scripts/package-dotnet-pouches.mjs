import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';

const [toolsFile,releaseDir,outputDir]=process.argv.slice(2);
assert(process.platform==='win32'&&process.arch==='x64'&&toolsFile&&releaseDir,'Requires Windows x64, TOOLS.json and verified release directory');
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const release=fs.realpathSync(releaseDir),proof=read(path.join(release,'verification-windows.json'));
const output=outputDir?fs.realpathSync(outputDir):release;
const sdk='hollow-wake-engine-'+proof.version+'.tgz',addon='hollow-wake-addon-windows-x64.zip';
for(const name of [sdk,addon])assert.equal(hash(path.join(release,name)),proof.checksums[name],name);
const scratchParent=fs.realpathSync(path.join(root,'.artifacts')),scratch=fs.mkdtempSync(path.join(scratchParent,'pouch-managed-'));
const env={...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_CLI_DO_NOT_USE_MSBUILD_SERVER:'1',MSBUILDDISABLENODEREUSE:'1',
  DOTNET_NOLOGO:'1',DOTNET_GENERATE_ASPNET_CERTIFICATE:'false',DOTNET_ADD_GLOBAL_TOOLS_TO_PATH:'false',DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE:'true',
  DOTNET_EnableDiagnostics:'0',NUGET_XMLDOC_MODE:'skip'};
const run=(program,args,cwd=scratch)=>execFileSync(program,args,{cwd,env,windowsHide:true,timeout:150000,encoding:'utf8',stdio:['ignore','pipe','pipe']});
const python=read(toolsFile).python,zipTool=path.join(root,'scripts/dotnet-pouch-archive.py');
try{
  for(const name of ['TEMP','TMP','TMPDIR','APPDATA','LOCALAPPDATA','DOTNET_CLI_HOME','NUGET_PACKAGES','npm_config_cache']){
    env[name]=path.join(scratch,name);fs.mkdirSync(env[name]);
  }
  const stock=scratch,stage=path.join(scratch,'stage'),assets=path.join(stage,'HollowWake.Pouches');
  fs.mkdirSync(assets,{recursive:true});
  const copy=(source,dest)=>fs.copyFileSync(path.join(root,source),path.join(stage,dest),fs.constants.COPYFILE_EXCL);
  for(const name of ['MemoryPouches.cs','HollowWake.Pouches.csproj','README.md'])copy('adapters/dotnet/pouches/'+name,name);
  for(const name of ['Embedded.cs','NuGet.Config'])copy('experiments/embedded-js/native/dotnet/'+name,name);
  fs.mkdirSync(path.join(stage,'Sample'));
  for(const name of ['Sample.csproj','Program.cs'])copy('examples/dotnet-pouches/'+name,'Sample/'+name);
  run(python,['-I',zipTool,'assets',path.join(release,addon),stage]);
  writeJSON(path.join(stock,'package.json'),{private:true,type:'module'});
  run(process.execPath,[npmCli(),'install','--offline','--ignore-scripts','--no-audit','--no-fund',path.join(release,sdk)]);
  const entry=path.join(stock,'entry.mjs');fs.copyFileSync(path.join(root,'adapters/embedded/pouch-session.mjs'),entry);
  const compiled=await build({absWorkingDir:stock,entryPoints:[entry],globalName:'HollowWakeSession',format:'iife',platform:'neutral',bundle:true,
    minify:true,target:'es2022',tsconfigRaw:{},metafile:true,write:false});
  const inputs=Object.keys(compiled.metafile.inputs);
  assert(inputs.includes('node_modules/@hollow-wake/engine/dist/pouch-recall.js')&&!inputs.some(n=>/godot|number-wire/.test(n)));
  assert(Object.values(compiled.metafile.outputs).every(o=>!o.imports.length));
  fs.writeFileSync(path.join(assets,'pouch-rules.js'),compiled.outputFiles[0].contents);
  const files=Object.fromEntries(['pouch-rules.js','pouch-data.json','hwe_embedded.dll'].map(n=>[n,hash(path.join(assets,n))]));
  const data=read(path.join(assets,'pouch-data.json'));
  writeJSON(path.join(assets,'manifest.json'),{version:proof.version,platform:'win-x64',contentId:data.id,sdkSha256:proof.checksums[sdk],files});
  const archive='hollow-wake-pouches-dotnet8-windows-x64.zip',zip=path.join(scratch,archive);
  run(python,['-I',zipTool,'pack',stage,zip]);
  const clean=path.join(scratch,'installed');fs.mkdirSync(clean);
  run(python,['-I','-m','zipfile','-e',zip,clean]);
  const installed=run('dotnet',['--list-sdks']).split(/\r?\n/).map(l=>l.split(' ')[0]).filter(n=>/^8\.0\.\d+$/.test(n));
  assert(installed.length,'Requires an installed .NET 8 SDK');
  const sdk8=installed.sort((a,b)=>Number(a.split('.')[2])-Number(b.split('.')[2])).at(-1);
  writeJSON(path.join(clean,'global.json'),{sdk:{version:sdk8,rollForward:'disable'}});
  const buildProject=name=>{
    const project=path.join(clean,name,name+'.csproj');
    run('dotnet',['restore',project,'--configfile',path.join(clean,'NuGet.Config'),'--disable-build-servers'],clean);
    run('dotnet',['build',project,'--no-restore','--disable-build-servers','-c','Release','-p:UseSharedCompilation=false'],clean);
    return path.join(clean,name,'bin/Release/net8.0',name+'.dll');
  };
  const sample=JSON.parse(run('dotnet',[buildProject('Sample')],clean));
  assert.equal(sample.itemUid,2);assert.equal(sample.kind,'skill');
  const published=path.join(scratch,'relocated-game');
  run('dotnet',['publish',path.join(clean,'Sample/Sample.csproj'),'--no-restore','--disable-build-servers','-c','Release',
    '-p:UseAppHost=false','-p:UseSharedCompilation=false','--output',published],clean);
  assert.deepEqual(JSON.parse(run('dotnet',[path.join(published,'Sample.dll')],scratch)),sample);
  for(const [name,digest] of Object.entries(files))assert.equal(hash(path.join(published,'HollowWake.Pouches',name)),digest);
  assert(!fs.existsSync(path.join(published,'HollowWake.Pouches/hwe_godot.dll')));
  const test=path.join(clean,'Replay');fs.mkdirSync(test);
  fs.copyFileSync(path.join(root,'test/dotnet-pouches/Program.cs'),path.join(test,'Program.cs'));
  fs.copyFileSync(path.join(clean,'Sample/Sample.csproj'),path.join(test,'Replay.csproj'));
  const baselineDir=path.join(root,'baseline/pouch-recall');
  const raw=gunzipSync(fs.readFileSync(path.join(baselineDir,'observations.json.gz')));
  assert.equal(sha256(raw),read(path.join(baselineDir,'acceptance.json')).sha256);
  const {defs,actions,cases,profiles}=JSON.parse(raw);
  for(const a of actions)if(a.mode==='threshold')a.beforeLedger={[defs.rules.dropPrefix+'firebolt']:defs.rules.threshold-1};
  const course=path.join(scratch,'course.json');writeJSON(course,{id:data.id,unlockAll:data.unlockAll,actions,cases,profiles});
  const binary=buildProject('Replay'),replay=JSON.parse(run('dotnet',[binary,course],clean));
  assert.equal(replay.actions,15);assert.equal(replay.cuts,2304);assert.equal(replay.releasedBytes,0);
  const damagedAssets=path.join(path.dirname(binary),'HollowWake.Pouches'),damagedFile=path.join(damagedAssets,'pouch-rules.js');
  const original=fs.readFileSync(damagedFile);
  try{
    fs.appendFileSync(damagedFile,' ');
    assert.equal(run('dotnet',[binary,'--damaged',damagedAssets],clean).trim(),'damaged content rejected');
  }finally{fs.writeFileSync(damagedFile,original);}
  const target=path.join(output,archive);
  if(fs.existsSync(target))assert.equal(hash(target),hash(zip));else fs.copyFileSync(zip,target,fs.constants.COPYFILE_EXCL);
  const report={version:proof.version,platform:'windows-x64',dotnetSdk:sdk8,sdkSha256:proof.checksums[sdk],addonSha256:proof.checksums[addon],
    archive,archiveBytes:fs.statSync(zip).size,sha256:hash(zip),files,installedSample:sample,relocatedPublish:true,replay,damagedContentRejected:true};
  writeJSON(path.join(output,'verification-dotnet-windows.json'),report);console.log(report);
}finally{
  assert.equal(path.dirname(fs.realpathSync(scratch)),scratchParent);
  fs.rmSync(scratch,{recursive:true,force:true,maxRetries:6,retryDelay:250});
}
