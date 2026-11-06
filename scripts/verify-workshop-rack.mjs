import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {workshopBundles,workspaceBridges} from './godot-crafting-bundle.mjs';

// Build from the installed candidate's actual published JS in memory. The
// previous native project supplies immutable libraries, templates and data.
const [toolsFile,donorFile,output,steamEditor]=process.argv.slice(2);
assert(toolsFile&&donorFile&&output,'Usage: node scripts/verify-workshop-rack.mjs TOOLS.json PREVIOUS_PROJECT.zip OUTPUT [STEAM_LINUX_EDITOR]');
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const config=read(toolsFile),win=!steamEditor&&process.platform==='win32',platform=win?'windows':'linux';
const pin=read(path.join(root,'experiments/godot-native/toolchain-lock.json')).platforms[win?'win32':'linux'];
assert.equal(hash(steamEditor??config.editor),pin.editor.executableSha256);
const steam=read(path.join(root,'experiments/steamrt-godot/toolchain-lock.json')).images.platform;
const image=steam.repository+'@'+steam.manifestDigest;
const expected=win?'3db1d983d285c6e678b85dd1b69ee8ec7eb6ea43e3aa9f548bd2bd3cc7046a81':'3e0bd9e71c3aa7f0f1c7203620b59bcb3b488c4f2de043e483a994ef38b6010f';
assert.equal(hash(donorFile),expected,'Requires the verified v0.53 project for this platform');
const parent=fs.realpathSync(path.join(root,'.artifacts')),scratch=fs.mkdtempSync(path.join(parent,'owned-rack-'));
const dest=path.resolve(output),pkg=read(path.join(root,'package.json'));
const run=(exe,args,env,cwd=scratch)=>execFileSync(exe,args,{cwd,env,windowsHide:true,timeout:180000,maxBuffer:16*1024*1024,encoding:'utf8',stdio:['ignore','pipe','pipe']});
try{
  const env={...process.env};
  for(const key of ['TEMP','TMP','npm_config_cache',...(win?['APPDATA','LOCALAPPDATA']:['XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME'])]){
    env[key]=path.join(scratch,key);fs.mkdirSync(env[key],{recursive:true});
  }
  const [packed]=JSON.parse(run(process.execPath,[npmCli(),'pack','--ignore-scripts','--json','--offline','--pack-destination',scratch],env,root));
  const sdk=path.join(scratch,packed.filename);
  const embedded=JSON.parse(run(config.python,['-I','-c',[
    'import sys,json,tarfile',
    'with tarfile.open(sys.argv[1]) as t:',
    ' print(json.dumps({m.name[8:]:t.extractfile(m).read().decode() for m in t if m.name=="package/package.json" or (m.name.startswith("package/dist/") and m.name.endswith(".js"))}))'
  ].join('\n'),sdk],env));
  const exports=JSON.parse(embedded['package.json']).exports;
  const plugins=[...workspaceBridges(root),{name:'packed-workshop',setup(builder){
    builder.onResolve({filter:/^@hollow-wake\/engine\//},arg=>({namespace:'sdk',path:exports[arg.path.replace('@hollow-wake/engine','.')].import.slice(2)}));
    builder.onResolve({filter:/^\./,namespace:'sdk'},arg=>({namespace:'sdk',path:path.posix.join(path.posix.dirname(arg.importer),arg.path)}));
    builder.onLoad({filter:/.*/,namespace:'sdk'},arg=>({contents:embedded[arg.path],loader:'js'}));
  }}];
  const {base,rack}=await workshopBundles(path.join(root,'adapters/godot/crafting'),plugins);
  const bundle=path.join(scratch,'bundle.txt');fs.writeFileSync(bundle,rack.bytes);
  const projectZip=path.join(scratch,'hollow-wake-workshop-'+platform+'-x64.zip');
  const addonZip=path.join(scratch,'hollow-wake-addon-'+platform+'-x64.zip');
  run(config.python,['-I',path.join(root,'scripts/workshop-rack-project.py'),path.resolve(donorFile),expected,hash(sdk),bundle,projectZip,addonZip],env);
  // All members were checked before writing this archive.
  run(config.python,['-I','-m','zipfile','-e',projectZip,scratch],env);
  const project=path.join(scratch,'inventory-workshop');
  const saves=path.join(scratch,'game-data');fs.mkdirSync(saves);
  const proof=read(path.join(root,'evidence/content-tables/windows.json')),raw=fs.readFileSync(path.join(root,proof.raw.file));
  assert.equal(sha256(raw),proof.raw.sha256);
  const {course}=JSON.parse(gunzipSync(raw));
  assert.equal(sha256(JSON.stringify(course,null,2)+'\n'),proof.native.courseSha256);
  const gearDir=path.join(root,'baseline/loadout-cards');
  const gearBytes=gunzipSync(fs.readFileSync(path.join(gearDir,'observations.json.gz')));
  assert.equal(sha256(gearBytes),read(path.join(gearDir,'acceptance.json')).sha256);
  const gear=JSON.parse(gearBytes).filter(row=>row.expected);
  fs.writeFileSync(path.join(project,'gear-cases.json'),JSON.stringify(gear.map(row=>row.input)));
  fs.writeFileSync(path.join(project,'legacy-course.txt'),course.rows.flatMap(row=>[JSON.stringify(row.request),JSON.stringify(row.expected)]).join('\n')+'\n');
  fs.copyFileSync(path.join(root,'test/godot-inventory/workshop-rack.gd'),path.join(project,'rack-test.gd'));
  function godot(args){
    const command=steamEditor?'docker':config.editor;
    const mount=(source,target,ro=false)=>'type=bind,source='+path.resolve(source)+',target='+target+(ro?',readonly':'');
    const cli=steamEditor?['run','--rm','--pull=never','--network=none','--read-only','--cap-drop=ALL',
      '--security-opt=no-new-privileges','--user','1000:1000','--tmpfs','/tmp:rw,nosuid,size=96m',
      '--mount',mount(steamEditor,'/godot',true),'--mount',mount(project,'/project'),'--mount',mount(saves,'/saves'),
      '-e','HOME=/tmp','-e','XDG_DATA_HOME=/saves','--entrypoint','/godot',image,'--headless','--path','/project',...args]
      :['--headless','--path',project,...args];
    // Docker Desktop reads the user's existing context outside the game.
    const child=spawnSync(command,cli,{cwd:scratch,env:steamEditor?process.env:env,windowsHide:true,encoding:'utf8',timeout:120000});
    if(child.error)throw child.error;
    const log=(child.stdout+'\n'+child.stderr).replace(/\r+/g,'');
    const errors=log.split(/\r?\n/).filter(s=>/ERROR:|Parse Error:|WARNING:.*(?:leak|ObjectDB)/i.test(s)&&!(win&&s==='ERROR: Failed to read the root certificate store.'));
    assert(child.status===0&&!errors.length,log.slice(-4000));
    return log;
  }
  godot(['--import']);
  const log=godot(['--script','res://rack-test.gd','--quit-after','300','--','--cargo-sample']);
  const line=log.split(/\r?\n/).find(row=>row.startsWith('HWE_RACK '));
  assert(line,'Missing Godot completion marker: '+log.slice(-2000));
  const result=JSON.parse(line.slice(9));
  if(steamEditor)assert.equal(result.db,'/saves/hollow-wake-inventory-workshop/inventory-cargo-sample.sqlite3');
  const database=steamEditor?path.join(saves,'hollow-wake-inventory-workshop/inventory-cargo-sample.sqlite3'):result.db;
  const replies=name=>fs.readFileSync(path.join(path.dirname(database),name),'utf8').trimEnd().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(replies('rack-replies.jsonl'),course.rows.map(row=>row.expected));
  const cards=replies('gear-replies.jsonl');assert.equal(cards.length,gear.length);
  for(const [index,card] of cards.entries()){
    const {label,expected}=gear[index];assert.deepEqual(card.targets,expected.targets,label);
    assert.equal('<span style="color:'+card.color+'">'+card.title+'</span>',expected.title,label);
    assert.equal('<span style="color:'+(card.levelMet?'#6fc06f':'#d05050')+'">'+card.requirement+'</span> · '+card.rarityLabel,expected.fullMeta,label);
  }
  const db=new DatabaseSync(database,{readOnly:true});
  try{
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    const row=db.prepare('SELECT revision,crafting,stash FROM slots WHERE slot=1').get();
    const save=JSON.parse(row.crafting);assert.equal(row.revision,result.revision);assert.equal(save.nextUid,result.nextUid);
    assert.equal(save.schemaVersion,2);assert.equal(save.state.rack.length,8);assert(save.state.rack.every(i=>i===null));
    assert.equal(save.state.items.at(-1).uid,result.minted);assert.deepEqual(JSON.parse(row.stash),[]);
    const sample=read(path.join(project,'cargo-sample.json')).find(item=>item.gem?.kind==='skill');
    assert.deepEqual(save.state.items.at(-1).gem,sample.gem);
  }finally{db.close();}
  const files=[sdk,projectZip,addonZip],checksums=Object.fromEntries(files.map(f=>[path.basename(f),hash(f)]));
  const report={version:pkg.version,platform,donorSha256:expected,legacyCommands:course.rows.length,originalGearCards:gear.length,
    baseBytes:base.bytes.length,rackBytes:rack.bytes.length-base.bytes.length,nativeHeapPeakBytes:result.peak,
    ...(steamEditor?{steamRuntime:image}:{}),
    tested:'Headless Godot scene controls, two SQLite connections, reopened save and independent database reader',checksums};
  fs.mkdirSync(dest,{recursive:true});
  for(const file of files){
    const target=path.join(dest,path.basename(file));
    if(fs.existsSync(target))assert.equal(hash(target),hash(file),'Existing release differs: '+target);
  }
  for(const file of files){
    const target=path.join(dest,path.basename(file));
    if(!fs.existsSync(target))fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);
  }
  writeJSON(path.join(dest,'verification-'+platform+'.json'),report);console.log(report);
}finally{
  const owned=fs.realpathSync(scratch);
  assert(path.dirname(owned)===parent&&path.basename(owned).startsWith('owned-rack-'));
  fs.rmSync(owned,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
