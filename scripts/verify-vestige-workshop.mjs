import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {craftingBundle,workspaceBridges} from './godot-crafting-bundle.mjs';
import {verifySteamImage} from './steamrt-image.mjs';

const [releaseArg,donorsArg,toolsArg,linuxEditor]=process.argv.slice(2);
assert(releaseArg&&donorsArg&&toolsArg,'RELEASE-DIRECTORY 0.57-WORKSHOP TOOLS.json [LINUX-EDITOR]');
const release=fs.realpathSync(releaseArg),donors=fs.realpathSync(donorsArg),platform=linuxEditor?'linux':'windows';
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const verified=read(path.join(release,'verification.json')),sdk=path.join(release,verified.archive);
assert.equal(hash(sdk),verified.archiveSha256);
const tools=read(toolsArg),editor=fs.realpathSync(linuxEditor??tools.editor);
const pin=read(path.join(root,'experiments/godot-native/toolchain-lock.json')).platforms[linuxEditor?'linux':'win32'];
assert.equal(hash(editor),pin.editor.executableSha256);
const donorsProof=read(path.join(root,'evidence/pouch-recall',platform+'.json'));
const parent=fs.realpathSync(path.join(root,'.artifacts')),scratch=fs.mkdtempSync(path.join(parent,'vestige-workshop-'));
const work=path.join(scratch,'run'),dist=path.join(scratch,'release');
const env={...process.env,TEMP:scratch,TMP:scratch,TMPDIR:scratch,npm_config_cache:path.join(scratch,'cache')};
const steam=read(path.join(root,'experiments/steamrt-godot/toolchain-lock.json')).images.platform;
const image=steam.repository+'@'+steam.manifestDigest;
function run(exe,argv,cwd=scratch){
  return execFileSync(exe,argv,{cwd,env,windowsHide:true,encoding:'utf8',timeout:240000,maxBuffer:8<<20});
}
try{
  fs.mkdirSync(work);fs.mkdirSync(dist);
  writeJSON(path.join(scratch,'package.json'),{private:true});
  run(process.execPath,[npmCli(),'install','--offline','--ignore-scripts','--no-fund','--no-audit','--no-package-lock',sdk]);
  const installed={name:'verified-sdk',setup(b){b.onResolve({filter:/^@hollow-wake\/engine\//},a=>{
    const url=run(process.execPath,['--input-type=module','-e','console.log(import.meta.resolve('+JSON.stringify(a.path)+'))']).trim();
    return {path:fileURLToPath(url)};
  });}};
  const {bytes}=await craftingBundle(path.join(root,'adapters/godot/crafting'),'vestiges',[...workspaceBridges(root),installed]);
  const bundle=path.join(scratch,'bundle.txt');fs.writeFileSync(bundle,bytes);
  const projectName='hollow-wake-workshop-'+platform+'-x64.zip',addonName='hollow-wake-addon-'+platform+'-x64.zip';
  const playerName='hollow-wake-inventory-'+platform+'-x64.zip';
  const py=(args)=>run(tools.python,['-I','-B',...args]);
  const archive=path.join(root,'scripts/vestige-workshop-archive.py');
  py([archive,'project',path.join(donors,projectName),donorsProof.checksums[projectName],path.join(dist,projectName),
    path.join(dist,addonName),bundle,verified.archiveSha256]);
  py(['-m','zipfile','-e',path.join(dist,projectName),work]);
  const project=path.join(work,'inventory-workshop');
  // The exact shipped player pack runs the same opt-in scene course as the editor.
  const playerDir=path.join(work,'player'),pck=path.join(work,'Inventory.pck');
  if(linuxEditor)verifySteamImage(steam,JSON.parse(run('docker',['image','inspect',image]))[0]);
  const translated=p=>linuxEditor?'/qa/'+path.relative(work,p).split(path.sep).join('/'):p;
  function godot(label,exe,args,saves,working=project){
    fs.mkdirSync(saves,{recursive:true});
    fs.writeFileSync(path.join(saves,'.vestige-test-owner'),'isolated fixture');
    const childEnv={...env,APPDATA:saves,LOCALAPPDATA:saves,HWE_VESTIGE_TEST_ROOT:saves};
    const cmd=linuxEditor?'docker':exe;
    const argv=linuxEditor?['run','--pull=never','--rm','--network=none','--cap-drop=ALL','--security-opt=no-new-privileges',
      '--read-only','--user','1000:1000','--tmpfs','/tmp:rw,nosuid,nodev','-e','HOME='+translated(saves),'-e','XDG_DATA_HOME='+translated(saves),
      '-e','XDG_CONFIG_HOME='+translated(saves),'-e','XDG_CACHE_HOME='+translated(saves),'-e','HWE_VESTIGE_TEST_ROOT='+translated(saves),'--mount','type=bind,source='+work+',target=/qa',
      '--mount','type=bind,source='+editor+',target=/tools/editor,readonly','-w',translated(working),image,
      exe===editor?'/tools/editor':translated(exe),'--headless',...args]:['--headless',...args];
    const child=spawnSync(cmd,argv,{cwd:working,env:linuxEditor?process.env:childEnv,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8<<20});
    const log=String(child.stdout??'')+'\n'+String(child.stderr??'');
    const errors=log.split(/\r?\n/).filter(l=>/SCRIPT ERROR|Parse Error|ERROR:|HWE_VESTIGE_FAILED/.test(l)&&!l.includes('Failed to read the root certificate store.'));
    assert(!child.error&&child.status===0&&!errors.length,label+': '+(child.error??'')+'\n'+errors.join('\n')+'\n'+log.slice(-2200));
    return log;
  }
  const editorSave=path.join(work,'editor-save'),playerSave=path.join(work,'release-save');
  godot('import',editor,['--path',translated(project),'--editor','--import'],editorSave);
  function course(label,exe,saves,cwd,args){
    const rows=[];
    for(const resumed of [false,true]){
      const log=godot(label,exe,[...args,'--','--verify-inlays','--vestige-sample',...(resumed?['--resume-inlay']:[])],saves,cwd);
      const line=log.split(/\r?\n/).find(l=>l.startsWith('HWE_VESTIGE_OK '));assert(line,label+' missing verification result');
      const row=JSON.parse(line.slice(15));assert.equal(row.revision,5);assert.equal(row.resumed,resumed);
      assert.deepEqual(row.wallet,{morren:1,sylph:1,thal:1});assert.deepEqual(row.sockets,['thal','sylph']);rows.push(row);
    }
    const dbpath=linuxEditor?path.resolve(work,path.posix.relative('/qa',rows[1].database)):path.resolve(rows[1].database);
    assert(dbpath.startsWith(saves+path.sep));
    const db=new DatabaseSync(dbpath,{readOnly:true});
    try{
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
      const row=db.prepare('SELECT revision,crafting,stash FROM slots WHERE slot=1').get(),save=JSON.parse(row.crafting);
      assert.equal(row.revision,5);assert.equal(save.schemaVersion,3);assert.equal(save.capability,'crafting-session/v3');
      assert.deepEqual(save.state.vestiges,rows[1].wallet);
      const [item]=Object.values(save.state.equipped);assert.equal(item.uid,rows[1].uid);assert.deepEqual(item.sockets,rows[1].sockets);
      assert.deepEqual(JSON.parse(row.stash),[]);
      return {revision:row.revision,wallet:save.state.vestiges,sockets:item.sockets,saveSha256:sha256(row.crafting)};
    }finally{db.close();}
  }
  const inEditor=course('editor',editor,editorSave,project,['--path',translated(project)]);
  godot('export',editor,['--path',translated(project),'--export-pack',linuxEditor?'Linux':'Windows Desktop',translated(pck)],editorSave);
  py([archive,'player',path.join(donors,playerName),donorsProof.checksums[playerName],path.join(dist,playerName),pck]);
  fs.mkdirSync(playerDir);py(['-m','zipfile','-e',path.join(dist,playerName),playerDir]);
  const playerRoot=path.join(playerDir,'inventory-workshop'),exe=path.join(playerRoot,linuxEditor?'Inventory.x86_64':'Inventory.exe');
  const inPlayer=course('relocated player',exe,playerSave,playerRoot,[]);assert.deepEqual(inPlayer,inEditor);
  const timing=godot('saved inlay workload',exe,['--','--measure-vestiges'],playerSave,playerRoot);
  const line=timing.split(/\r?\n/).find(l=>l.startsWith('HWE_INLAY_MEASURE '));assert(line,'Missing inlay measurement');
  const measurement=JSON.parse(line.slice('HWE_INLAY_MEASURE '.length));
  assert(measurement.ok && measurement.measured===32 && measurement.reopened);
  for(const series of [measurement.previewUs,measurement.commitUs])assert(series.length===32 && series.every(n=>Number.isFinite(n)&&n>=0));
  const names=[projectName,addonName,playerName],checksums=Object.fromEntries(names.map(n=>[n,hash(path.join(dist,n))]));
  const report={platform,version:verified.version,sdkSha256:verified.archiveSha256,editorSha256:hash(editor),bundleBytes:bytes.length,
    bundleSha256:sha256(bytes),editor:inEditor,relocatedPlayer:inPlayer,measurement,checksums,...(linuxEditor?{steamRuntime:image}:{})};
  writeJSON(path.join(dist,'godot-'+platform+'.json'),report);
  const target=path.join(release,platform);
  try{fs.renameSync(dist,target);}
  catch(error){
    if(!fs.existsSync(target))throw error;
    const prior=read(path.join(target,'godot-'+platform+'.json'));
    assert.equal(prior.sdkSha256,report.sdkSha256);assert.deepEqual(prior.checksums,checksums,'A different release already exists');
    for(const name of names)assert.equal(hash(path.join(target,name)),checksums[name]);
  }
  console.log(report);
}finally{assert.equal(path.dirname(fs.realpathSync(scratch)),parent);fs.rmSync(scratch,{recursive:true,force:true,maxRetries:4,retryDelay:200});}
